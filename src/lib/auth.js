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

export async function loginCliente(email, senha) {
  const { usuario, chaveApi, clientesRede } = await autenticar(email, senha, 'cliente');
  if (!chaveApi) throw new Error('Este usuário não esta vinculado a nenhuma rede.');
  if (!clientesRede || clientesRede.length === 0) {
    throw new Error(`A rede "${chaveApi.nome}" ainda não tem empresas cadastradas. Contate o administrador.`);
  }
  // Cliente ativo = primeira empresa da rede. O usuario podera trocar no portal.
  const cliente = clientesRede[0];
  const session = {
    usuario,
    cliente,
    chaveApi,
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
    .select('*, chaves_api(*)')
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
  const usuarioSemSenha = { ...usuario };
  delete usuarioSemSenha.senha;
  delete usuarioSemSenha.chaves_api;

  // Para usuario cliente, carrega empresas da rede respeitando empresas_permitidas
  let clientesRede = null;
  if (tipoEsperado === 'cliente' && chaveApi?.id) {
    const { data: emps, error: errEmps } = await supabase
      .from('clientes')
      .select('*')
      .eq('chave_api_id', chaveApi.id)
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    if (errEmps) throw new Error('Falha ao carregar empresas da rede: ' + errEmps.message);

    const permitidas = Array.isArray(usuarioSemSenha.empresas_permitidas) ? usuarioSemSenha.empresas_permitidas : null;
    // NULL/vazio = acesso total; preenchido = filtra
    clientesRede = permitidas && permitidas.length > 0
      ? (emps || []).filter(c => permitidas.includes(c.id))
      : (emps || []);
  }

  return { usuario: usuarioSemSenha, chaveApi, clientesRede };
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
