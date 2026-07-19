import { supabase } from '../lib/supabase';

// Colunas seguras (NUNCA inclui senha/senha_hash — o RLS revoga o SELECT
// dessas colunas). Todo select da tabela usa esta lista.
const COLS = 'id, nome, email, tipo, chave_api_id, as_rede_id, permissoes, status, is_master, nivel_admin, empresas_permitidas, ultimo_acesso, observacoes, criado_por, created_at, updated_at';

// ========== Hierarquia de níveis de admin (1..3) ==========
// N3 gere N2/N1/clientes (não N3); N2 gere N1/clientes; N1 não gere ninguém.
// Só N3 define/altera o nível. Espelha a matriz do banco (cci_pode_gerir_usuario)
// só para habilitar/ocultar controles na UI — o enforcement real é no DB.
export const NIVEIS_ADMIN = [
  { v: 1, label: 'Nível 1', desc: 'Sem acesso à gestão de usuários' },
  { v: 2, label: 'Nível 2', desc: 'Gerencia N1 e clientes' },
  { v: 3, label: 'Nível 3', desc: 'Gerencia N2, N1 e clientes' },
];

export function nivelAdmin(usuario) {
  if (!usuario || usuario.tipo !== 'admin') return null;
  return usuario.nivel_admin ?? (usuario.is_master ? 3 : 1);
}

// O ator (sessão) pode gerir a área de usuários? (N2+)
export function podeGerirUsuarios(ator) {
  return nivelAdmin(ator) >= 2;
}

// O ator pode definir/alterar níveis? (só N3)
export function podeDefinirNivel(ator) {
  return nivelAdmin(ator) === 3;
}

// O ator pode gerir (editar/excluir) este alvo? Espelha cci_pode_gerir_usuario.
export function podeGerirUsuario(ator, alvo) {
  if (!ator || !alvo) return false;
  if (ator.tipo === 'admin') {
    const n = nivelAdmin(ator);
    if (n < 2) return false;
    if (alvo.tipo === 'cliente') return true;
    const na = nivelAdmin(alvo);           // alvo admin
    if (na === 3) return false;            // ninguém gere N3 (nem self)
    if (n === 3) return true;              // N3 gere N1/N2
    if (n === 2) return na === 1;          // N2 só gere N1
    return false;
  }
  // ator cliente-gerente: só clientes da própria rede
  return alvo.tipo === 'cliente'
    && ((ator.chave_api_id && alvo.chave_api_id === ator.chave_api_id)
     || (ator.as_rede_id && alvo.as_rede_id === ator.as_rede_id))
    && (ator.permissoes || []).includes('gerenciar_usuarios');
}

// ========== Catalogo de permissoes ==========
// Usado pela UI pra renderizar os checkboxes. Cada chave deve
// bater com a string armazenada em cci_usuarios_sistema.permissoes.

export const PERMISSOES_ADMIN = [
  { key: 'dashboard', label: 'Dashboard', grupo: 'Principal' },
  { key: 'clientes', label: 'Clientes', grupo: 'Cadastros' },
  { key: 'colaboradores', label: 'Colaboradores', grupo: 'Cadastros' },
  { key: 'usuarios', label: 'Usuários do Sistema', grupo: 'Cadastros' },
  { key: 'fornecedores', label: 'Fornecedores', grupo: 'Cadastros' },
  { key: 'plano_contas', label: 'Plano de Contas', grupo: 'Cadastros' },
  { key: 'motivos', label: 'Motivos de Movimentação', grupo: 'Cadastros' },
  { key: 'contas_pagar', label: 'Contas a Pagar', grupo: 'Financeiro' },
  { key: 'contas_receber', label: 'Contas a Receber', grupo: 'Financeiro' },
  { key: 'fiscal', label: 'Notas Fiscais e Agendamento', grupo: 'Fiscal' },
  { key: 'notas_fiscais', label: 'Manifestação de Notas (validar e lançar)', grupo: 'Fiscal' },
  { key: 'outras_contas', label: 'Outras contas a pagar (BPO)', grupo: 'BPO' },
  { key: 'parametros', label: 'Parâmetros', grupo: 'Consultoria' },
  { key: 'relatorios_cliente', label: 'Relatórios por Cliente', grupo: 'Consultoria' },
  { key: 'relatorios_bi', label: 'Relatórios de BI (Power BI)', grupo: 'Consultoria' },
  { key: 'analise_ia', label: 'Análise com IA (Claude)', grupo: 'Consultoria' },
  { key: 'conciliacao_bancaria', label: 'Conciliação Bancária', grupo: 'BPO' },
  { key: 'conciliacao_caixas', label: 'Conciliação de Caixas', grupo: 'BPO' },
  { key: 'caixa_administrativo', label: 'Caixa Administrativo', grupo: 'BPO' },
  { key: 'notificacoes', label: 'Notificações (enviar)', grupo: 'Comunicação' },
  { key: 'mensagens_iniciais', label: 'Mensagens Iniciais (modal cliente)', grupo: 'Comunicação' },
  { key: 'melhorias', label: 'Melhorias de Sistema (sugestões clientes)', grupo: 'Comunicação' },
  { key: 'uso_portal', label: 'Uso do Portal (analytics)', grupo: 'Comunicação' },
  { key: 'suporte_admin', label: 'Chat de Suporte (responder)', grupo: 'Comunicação' },
  { key: 'webposto_sync', label: 'Webposto · Sincronia de vendas (cache)', grupo: 'Configurações' },
];

export const PERMISSOES_CLIENTE = [
  { key: 'dashboard', label: 'Visão Geral', grupo: 'Principal' },
  { key: 'dre', label: 'DRE', grupo: 'Relatórios' },
  { key: 'fluxo_caixa', label: 'Fluxo de Caixa', grupo: 'Relatórios' },
  { key: 'relatorios_bi', label: 'Relatórios de BI (Power BI)', grupo: 'Relatórios' },
  { key: 'comercial_vendas', label: 'Comercial · Vendas', grupo: 'Comercial' },
  { key: 'comercial_operacao', label: 'Comercial · Operação', grupo: 'Comercial' },
  { key: 'comercial_produtividade', label: 'Comercial · Produtividade', grupo: 'Comercial',
    // Abas da página de Produtividade (controle por aba). `tipo` filtra por ERP:
    // autosystem tem Rank; webposto tem Pista; Conveniência existe nos dois.
    abas: [
      { key: 'produtividade_rank',         label: 'Rank',         tipo: 'autosystem' },
      { key: 'produtividade_pista',        label: 'Pista',        tipo: 'webposto' },
      { key: 'produtividade_conveniencia', label: 'Conveniência' },
    ] },
  { key: 'comercial_estoques', label: 'Comercial · Análise de Estoques', grupo: 'Comercial' },
  { key: 'compras',           label: 'Compras · Criar pedidos',         grupo: 'Comercial' },
  { key: 'compras_liberar',   label: 'Compras · Liberar pedidos',       grupo: 'Comercial' },
  { key: 'sangrias', label: 'Sangrias', grupo: 'Operacional' },
  { key: 'bpo', label: 'Serviços BPO', grupo: 'Operacional' },
  { key: 'documentos', label: 'Documentos', grupo: 'Operacional' },
  { key: 'financeiro', label: 'Financeiro', grupo: 'Operacional' },
  { key: 'notas_fiscais', label: 'Notas Fiscais (manifestação)', grupo: 'Operacional' },
  { key: 'outras_contas', label: 'Outras contas a pagar', grupo: 'Operacional' },
  { key: 'suporte', label: 'Suporte', grupo: 'Atendimento' },
  { key: 'pendencias', label: 'Pendências', grupo: 'Atendimento' },
  { key: 'melhorias', label: 'Melhorias do Sistema', grupo: 'Atendimento' },
  { key: 'trocar_empresa', label: 'Alternar entre empresas da rede', grupo: 'Administração da Rede' },
  { key: 'gerenciar_usuarios', label: 'Gerenciar usuários da rede', grupo: 'Administração da Rede' },
  { key: 'configuracoes', label: 'Configurações de rede', grupo: 'Administração da Rede' },
];

export function permissoesPorTipo(tipo) {
  return tipo === 'cliente' ? PERMISSOES_CLIENTE : PERMISSOES_ADMIN;
}

export function todasPermissoes(tipo) {
  // Inclui as chaves de página E as chaves de aba (sub-permissões).
  return permissoesPorTipo(tipo).flatMap(p => [p.key, ...(p.abas || []).map(a => a.key)]);
}

// ========== Hierarquia por permissões ==========
// Regra: admin só vê/atribui as permissões que ele próprio tem.
// Master tem TODAS automaticamente (independente do array).

// Retorna o conjunto efetivo de permissões — master => todas.
export function permissoesEfetivas(usuario) {
  if (!usuario) return [];
  if (usuario.is_master) return todasPermissoes(usuario.tipo || 'admin');
  return Array.isArray(usuario.permissoes) ? usuario.permissoes : [];
}

// Filtra o catálogo pra mostrar só o que `usuarioLogado` pode delegar.
export function permissoesQuePodeDelegar(usuarioLogado, tipoAlvo = 'admin') {
  const efetivas = new Set(permissoesEfetivas(usuarioLogado));
  return permissoesPorTipo(tipoAlvo).filter(p => efetivas.has(p.key));
}

export function podeDelegarPermissao(usuarioLogado, permissaoKey) {
  if (!usuarioLogado) return false;
  if (usuarioLogado.is_master) return true;
  return (usuarioLogado.permissoes || []).includes(permissaoKey);
}

// Cascata: propaga remoção de permissões pra subordinados via RPC.
// Master nunca perde permissão (já é tudo automático).
export async function cascataRevogarPermissoes(adminId, permissoesRemovidas) {
  if (!adminId || !Array.isArray(permissoesRemovidas) || permissoesRemovidas.length === 0) {
    return 0;
  }
  const { data, error } = await supabase.rpc('cascata_revogar_permissoes', {
    p_admin_id: adminId,
    p_permissoes_removidas: permissoesRemovidas,
  });
  if (error) throw error;
  return data || 0;
}

// ========== CRUD ==========

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select(`${COLS}, chaves_api(id, nome, provedor), as_rede(id, nome, slug)`)
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Lista somente usuarios de uma rede especifica (usado pelo admin da rede).
// Aceita assinatura legada `listarUsuariosDaRede(chaveApiId)` ou objeto
// `{ chave_api_id, as_rede_id }` (autosystem).
export async function listarUsuariosDaRede(arg) {
  const opts = typeof arg === 'string' || arg == null
    ? { chave_api_id: arg }
    : arg;
  const { chave_api_id, as_rede_id } = opts;
  if (!chave_api_id && !as_rede_id) return [];
  let query = supabase
    .from('cci_usuarios_sistema')
    .select(COLS)
    .eq('tipo', 'cliente');
  if (chave_api_id) query = query.eq('chave_api_id', chave_api_id);
  if (as_rede_id)   query = query.eq('as_rede_id',   as_rede_id);
  const { data, error } = await query.order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function buscarUsuario(id) {
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select(`${COLS}, chaves_api(id, nome, provedor)`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarUsuario(campos) {
  const payload = sanitizarPayload(campos);
  const senha = payload.senha;
  delete payload.senha;                 // nunca grava texto puro
  if (!senha) throw new Error('Informe uma senha inicial para o usuário.');
  // Escrita só via RPC SECURITY DEFINER (valida a hierarquia no banco).
  const { data: novoId, error } = await supabase.rpc('cci_gerir_criar_usuario', { p_dados: payload });
  if (error) throw error;
  // Define a senha já com HASH (server-side, via RPC autorizado).
  const { error: errSenha } = await supabase.rpc('cci_admin_definir_senha', { p_usuario_id: novoId, p_senha: senha });
  if (errSenha) throw new Error('Usuário criado, mas falha ao definir a senha: ' + errSenha.message);
  return { id: novoId };
}

export async function atualizarUsuario(id, campos) {
  const payload = sanitizarPayload(campos);
  const senha = payload.senha;
  delete payload.senha;

  // Escrita só via RPC SECURITY DEFINER (valida a matriz + só N3 muda nível).
  const { error } = await supabase.rpc('cci_gerir_atualizar_usuario', { p_id: id, p_dados: payload });
  if (error) throw error;

  // Troca de senha (se informada) — com HASH server-side.
  if (senha) {
    const { error: errSenha } = await supabase.rpc('cci_admin_definir_senha', { p_usuario_id: id, p_senha: senha });
    if (errSenha) throw new Error('Dados salvos, mas falha ao atualizar a senha: ' + errSenha.message);
  }
  return { id };
}

export async function excluirUsuario(id) {
  const { error } = await supabase.rpc('cci_gerir_excluir_usuario', { p_id: id });
  if (error) throw error;
}

// Reseta a senha para um valor padrão (server-side, com hash). Autorização é
// a mesma da edição (cci_admin_definir_senha valida). Retorna a senha definida.
export async function resetarSenha(id, senha = '123456') {
  const { error } = await supabase.rpc('cci_admin_definir_senha', { p_usuario_id: id, p_senha: senha });
  if (error) throw error;
  return senha;
}

function sanitizarPayload(campos) {
  const p = { ...campos };
  delete p.id;
  delete p.created_at;
  delete p.updated_at;
  delete p.chaves_api; // relacao retornada pelo select
  delete p.as_rede;    // idem (autosystem)
  delete p.rede_tipo;  // campo de UI, nao existe na tabela

  if (p.tipo === 'admin') {
    p.chave_api_id = null;
    p.as_rede_id = null;
    p.empresas_permitidas = null;
  } else {
    // tipo=cliente: garante XOR (chave_api OU as_rede, nunca os dois)
    if (p.chave_api_id) p.as_rede_id = null;
    else if (p.as_rede_id) p.chave_api_id = null;
  }
  // Array vazio equivale a null (acesso total na rede)
  if (Array.isArray(p.empresas_permitidas) && p.empresas_permitidas.length === 0) {
    p.empresas_permitidas = null;
  }
  p.email = (p.email || '').trim().toLowerCase();
  p.nome = (p.nome || '').trim();
  p.permissoes = Array.isArray(p.permissoes) ? p.permissoes : [];
  return p;
}
