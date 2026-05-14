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
  emitSessionChange();
}

function emitSessionChange() {
  try { window.dispatchEvent(new Event('cci:session-change')); } catch { /* noop */ }
}

// ==================== Login ====================

export async function loginAdmin(email, senha) {
  const { usuario } = await autenticar(email, senha, 'admin');
  const session = { usuario, loggedAt: new Date().toISOString() };
  setAdminSession(session);
  return session;
}

// Login do cliente: detecta automaticamente se é portal Webposto ou
// Autosystem baseado em qual coluna do usuário está preenchida.
// A sessão inclui `tipoCliente` que governa o prefixo de URLs.
export async function loginCliente(email, senha) {
  const { usuario, chaveApi, asRede, clientesRede, tipoCliente } =
    await autenticar(email, senha, 'cliente');

  if (!tipoCliente) {
    throw new Error('Este usuário não está vinculado a nenhuma rede.');
  }

  const rede = tipoCliente === 'autosystem' ? asRede : chaveApi;
  if (!clientesRede || clientesRede.length === 0) {
    throw new Error(`A rede "${rede?.nome || ''}" ainda não tem empresas cadastradas. Contate o administrador.`);
  }
  // Cliente ativo = primeira empresa da rede. O usuario podera trocar no portal.
  const cliente = clientesRede[0];
  const session = {
    usuario,
    cliente,
    tipoCliente,
    chaveApi,
    asRede,
    clientesRede,
    loggedAt: new Date().toISOString(),
  };
  setClienteSession(session);
  return session;
}

async function autenticar(email, senha, tipoEsperado) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !senha) throw new Error('Informe e-mail e senha.');

  const { data: usuario, error } = await supabase
    .from('cci_usuarios_sistema')
    .select('*, chaves_api(*), as_rede(*)')
    .eq('email', emailNorm)
    .maybeSingle();
  if (error) throw new Error('Falha ao validar credenciais: ' + error.message);
  if (!usuario) throw new Error('E-mail ou senha invalidos.');

  if (usuario.status !== 'ativo') throw new Error('Usuário inativo. Contate o administrador.');
  if (usuario.tipo !== tipoEsperado) {
    throw new Error(
      tipoEsperado === 'admin'
        ? 'Este acesso e exclusivo para administradores. Use o Portal do Cliente.'
        : 'Este acesso e exclusivo para clientes. Use o Portal Admin.'
    );
  }
  if (usuario.senha !== senha) throw new Error('E-mail ou senha invalidos.');

  // Atualiza ultimo acesso (best-effort, nao bloqueia login em caso de erro)
  supabase
    .from('cci_usuarios_sistema')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', usuario.id)
    .then(() => {}, () => {});

  const chaveApi = usuario.chaves_api || null;
  const asRede = usuario.as_rede || null;
  const usuarioSemSenha = { ...usuario };
  delete usuarioSemSenha.senha;
  delete usuarioSemSenha.chaves_api;
  delete usuarioSemSenha.as_rede;

  // Determina tipo do portal cliente pelo vínculo (constraint XOR no schema garante exclusividade)
  let tipoCliente = null;
  if (tipoEsperado === 'cliente') {
    if (asRede?.id) tipoCliente = 'autosystem';
    else if (chaveApi?.id) tipoCliente = 'webposto';
  }

  // Para usuario cliente, carrega empresas da rede respeitando empresas_permitidas
  let clientesRede = null;
  if (tipoCliente === 'webposto') {
    const { data: emps, error: errEmps } = await supabase
      .from('clientes')
      .select('*')
      .eq('chave_api_id', chaveApi.id)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    if (errEmps) throw new Error('Falha ao carregar empresas da rede: ' + errEmps.message);

    const permitidas = Array.isArray(usuarioSemSenha.empresas_permitidas) ? usuarioSemSenha.empresas_permitidas : null;
    clientesRede = permitidas && permitidas.length > 0
      ? (emps || []).filter(c => permitidas.includes(c.id))
      : (emps || []);
  } else if (tipoCliente === 'autosystem') {
    const { data: emps, error: errEmps } = await supabase
      .from('clientes')
      .select('*')
      .eq('as_rede_id', asRede.id)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    if (errEmps) throw new Error('Falha ao carregar empresas da rede: ' + errEmps.message);

    const permitidas = Array.isArray(usuarioSemSenha.empresas_permitidas) ? usuarioSemSenha.empresas_permitidas : null;
    clientesRede = permitidas && permitidas.length > 0
      ? (emps || []).filter(c => permitidas.includes(c.id))
      : (emps || []);
  }

  return { usuario: usuarioSemSenha, chaveApi, asRede, clientesRede, tipoCliente };
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
