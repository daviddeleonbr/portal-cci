import { supabase } from './supabase';

// Chaves de sessao no localStorage (portais independentes)
const ADMIN_KEY = 'cci_session_admin';
const CLIENTE_KEY = 'cci_session_cliente';

// ==================== Sessao ====================

export function getAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getClienteSession() {
  try {
    const raw = localStorage.getItem(CLIENTE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setAdminSession(session) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(session));
  emitSessionChange();
}

function setClienteSession(session) {
  localStorage.setItem(CLIENTE_KEY, JSON.stringify(session));
  emitSessionChange();
}

export function logoutAdmin() {
  localStorage.removeItem(ADMIN_KEY);
  emitSessionChange();
}

export function logoutCliente() {
  localStorage.removeItem(CLIENTE_KEY);
  // Limpa cache de páginas Webposto pra evitar vazamento entre sessões
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('webposto-cache-v1:'))
      .forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('webposto-paginas-visitadas-v1');
  } catch { /* noop */ }
  emitSessionChange();
}

function emitSessionChange() {
  try { window.dispatchEvent(new Event('cci:session-change')); } catch { /* noop */ }
}

// ==================== Login ====================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifica credenciais SERVER-SIDE (hash) e obtém tokens via Edge Function
// `auth-login`. A comparação de senha não roda mais no navegador.
// Retorna { access_token, refresh_token, expires_in, usuario } — onde
// usuario traz chaves_api/as_rede embutidos (mas nunca a senha/hash).
async function chamarAuthLogin(email, senha, portal) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !senha) throw new Error('Informe e-mail e senha.');
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: emailNorm, senha, portal }),
    });
  } catch {
    throw new Error('Falha de conexão ao validar credenciais.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'E-mail ou senha invalidos.');
  return data;
}

function expiraEmSeg(expiresIn) {
  return Math.floor(Date.now() / 1000) + (Number(expiresIn) || 3600);
}

export async function loginAdmin(email, senha) {
  const { access_token, refresh_token, expires_in, usuario } =
    await chamarAuthLogin(email, senha, 'admin');
  const session = {
    usuario,
    access_token,
    refresh_token,
    access_exp: expiraEmSeg(expires_in),
    loggedAt: new Date().toISOString(),
  };
  setAdminSession(session);
  return session;
}

// Login do cliente: o auth-login já validou senha/status/portal e devolve o
// usuario com chaves_api/as_rede embutidos. Derivamos o tipoCliente e
// carregamos as empresas da rede (via client já autenticado).
export async function loginCliente(email, senha) {
  const { access_token, refresh_token, expires_in, usuario } =
    await chamarAuthLogin(email, senha, 'cliente');

  const chaveApi = usuario.chaves_api || null;
  const asRede = usuario.as_rede || null;
  let tipoCliente = null;
  if (asRede?.id) tipoCliente = 'autosystem';
  else if (chaveApi?.id) tipoCliente = 'webposto';
  if (!tipoCliente) {
    throw new Error('Este usuário não está vinculado a nenhuma rede.');
  }

  const usuarioLimpo = { ...usuario };
  delete usuarioLimpo.chaves_api;
  delete usuarioLimpo.as_rede;

  // Grava a sessão parcial já com o token pra que a leitura das empresas
  // abaixo use o client autenticado (getAccessTokenAtivo lê daqui).
  const base = {
    usuario: usuarioLimpo,
    tipoCliente,
    chaveApi,
    asRede,
    access_token,
    refresh_token,
    access_exp: expiraEmSeg(expires_in),
    loggedAt: new Date().toISOString(),
  };
  setClienteSession(base);

  // Carrega empresas da rede respeitando empresas_permitidas.
  const col = tipoCliente === 'autosystem' ? 'as_rede_id' : 'chave_api_id';
  const val = tipoCliente === 'autosystem' ? asRede.id : chaveApi.id;
  const { data: emps, error: errEmps } = await supabase
    .from('clientes')
    .select('*')
    .eq(col, val)
    .eq('status', 'ativo')
    .order('nome', { ascending: true });
  if (errEmps) {
    logoutCliente();
    throw new Error('Falha ao carregar empresas da rede: ' + errEmps.message);
  }

  const permitidas = Array.isArray(usuarioLimpo.empresas_permitidas)
    ? usuarioLimpo.empresas_permitidas
    : null;
  const clientesRede = permitidas && permitidas.length > 0
    ? (emps || []).filter(c => permitidas.includes(c.id))
    : (emps || []);
  if (!clientesRede.length) {
    const nomeRede = (asRede || chaveApi)?.nome || '';
    logoutCliente();
    throw new Error(`A rede "${nomeRede}" ainda não tem empresas cadastradas. Contate o administrador.`);
  }

  // Cliente ativo = primeira empresa da rede. O usuario podera trocar no portal.
  const session = { ...base, cliente: clientesRede[0], clientesRede };
  setClienteSession(session);
  return session;
}

// ─── Acesso DEMO: admin vê o portal cliente com nomes fictícios ─────
//
// Cria uma sessão CLIENTE marcada com `_demo: true`, baseada nos dados
// reais de uma chave_api (rede webposto). Nomes reais (rede, empresas,
// vendedores, fornecedores) são substituídos por fictícios via
// utils/demoMascarar.js. Valores numéricos (vendas, totais) são REAIS.
//
// Salva também `_adminOriginal` pra permitir voltar ao admin sem
// re-fazer login.
export async function acessarPortalDemo({ chaveApiId }) {
  const sessaoAdmin = getAdminSession();
  if (!sessaoAdmin?.usuario) throw new Error('Você precisa estar logado como admin pra usar o modo demo.');

  // Importa lazy pra evitar ciclo
  const { mascararRede, mascararEmpresa } = await import('../utils/demoMascarar');

  // 1) Carrega a chave_api real
  const { data: chaveApi, error: errCh } = await supabase
    .from('chaves_api')
    .select('*')
    .eq('id', chaveApiId)
    .single();
  if (errCh || !chaveApi) throw new Error('Rede não encontrada: ' + (errCh?.message || ''));

  // 2) Carrega empresas (clientes) reais dessa rede
  const { data: emps, error: errEmps } = await supabase
    .from('clientes')
    .select('*')
    .eq('chave_api_id', chaveApiId)
    .eq('status', 'ativo')
    .order('nome', { ascending: true });
  if (errEmps) throw new Error('Falha ao carregar empresas: ' + errEmps.message);
  if (!emps || emps.length === 0) {
    throw new Error('Essa rede não tem empresas cadastradas.');
  }

  // 3) Mascara nomes
  const chaveApiMasc   = mascararRede(chaveApi);
  const empresasMasc   = emps.map(mascararEmpresa);
  const clienteAtivo   = empresasMasc[0];

  // 4) Monta usuario "cliente fictício" com todas as permissões
  // pra ele ver todas as páginas. Mantém ID do admin pra logs.
  const usuarioCliente = {
    id: `demo-${sessaoAdmin.usuario.id}`,
    nome: sessaoAdmin.usuario.nome || 'Demo',
    email: sessaoAdmin.usuario.email,
    tipo: 'cliente',
    status: 'ativo',
    permissoes: [
      'dashboard', 'comercial_vendas', 'comercial_operacao',
      'comercial_produtividade', 'comercial_estoques', 'financeiro',
      'documentos', 'notas_fiscais',
    ],
    empresas_permitidas: null,
  };

  const sessionDemo = {
    usuario: usuarioCliente,
    cliente: clienteAtivo,
    tipoCliente: 'webposto',
    chaveApi: chaveApiMasc,
    asRede: null,
    clientesRede: empresasMasc,
    loggedAt: new Date().toISOString(),
    _demo: true,
    _adminOriginal: {
      usuarioId: sessaoAdmin.usuario.id,
      nome:      sessaoAdmin.usuario.nome,
      email:     sessaoAdmin.usuario.email,
    },
  };
  setClienteSession(sessionDemo);
  return sessionDemo;
}

// Volta da demo pro admin: limpa sessão cliente, mantém admin original.
export function sairModoDemo() {
  const session = getClienteSession();
  if (!session?._demo) return;
  localStorage.removeItem(CLIENTE_KEY);
  // Limpa cache webposto pra evitar vazar dados entre redes demo
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('webposto-v2:') || k.startsWith('webposto-v3:') || k.startsWith('webposto-cache-v1:'))
      .forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('webposto-paginas-visitadas-v1');
    sessionStorage.removeItem('webposto-prefetched-v1');
  } catch { /* noop */ }
  emitSessionChange();
}

// Troca a empresa ativa na sessao (usado pelo seletor no header do cliente)
export function trocarEmpresaAtiva(empresaId) {
  const session = getClienteSession();
  if (!session) return null;
  const nova = (session.clientesRede || []).find(c => c.id === empresaId);
  if (!nova) return null;
  setClienteSession({ ...session, cliente: nova });
  return nova;
}

// ==================== Permissoes ====================

export function hasPermissaoAdmin(chave) {
  const session = getAdminSession();
  return !!session?.usuario?.permissoes?.includes(chave);
}

export function hasPermissaoCliente(chave) {
  const session = getClienteSession();
  return !!session?.usuario?.permissoes?.includes(chave);
}
