import { supabase } from '../lib/supabase';

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
  { key: 'parametros', label: 'Parâmetros', grupo: 'Consultoria' },
  { key: 'relatorios_cliente', label: 'Relatórios por Cliente', grupo: 'Consultoria' },
  { key: 'relatorios_bi', label: 'Relatórios de BI (Power BI)', grupo: 'Consultoria' },
  { key: 'reunioes', label: 'Reunião (KPIs mensais)', grupo: 'Consultoria' },
  { key: 'analise_ia', label: 'Análise com IA (Claude)', grupo: 'Consultoria' },
  { key: 'conciliacao_bancaria', label: 'Conciliação Bancária', grupo: 'BPO' },
  { key: 'conciliacao_caixas', label: 'Conciliação de Caixas', grupo: 'BPO' },
  { key: 'caixa_administrativo', label: 'Caixa Administrativo', grupo: 'BPO' },
  { key: 'notificacoes', label: 'Notificações (enviar)', grupo: 'Comunicação' },
  { key: 'mensagens_iniciais', label: 'Mensagens Iniciais (modal cliente)', grupo: 'Comunicação' },
  { key: 'melhorias', label: 'Melhorias de Sistema (sugestões clientes)', grupo: 'Comunicação' },
];

export const PERMISSOES_CLIENTE = [
  { key: 'dashboard', label: 'Visão Geral', grupo: 'Principal' },
  { key: 'dre', label: 'DRE', grupo: 'Relatórios' },
  { key: 'fluxo_caixa', label: 'Fluxo de Caixa', grupo: 'Relatórios' },
  { key: 'relatorios_bi', label: 'Relatórios de BI (Power BI)', grupo: 'Relatórios' },
  { key: 'comercial_vendas', label: 'Comercial · Vendas', grupo: 'Comercial' },
  { key: 'comercial_operacao', label: 'Comercial · Operação', grupo: 'Comercial' },
  { key: 'comercial_produtividade', label: 'Comercial · Produtividade', grupo: 'Comercial' },
  { key: 'sangrias', label: 'Sangrias', grupo: 'Operacional' },
  { key: 'bpo', label: 'Serviços BPO', grupo: 'Operacional' },
  { key: 'documentos', label: 'Documentos', grupo: 'Operacional' },
  { key: 'financeiro', label: 'Financeiro', grupo: 'Operacional' },
  { key: 'suporte', label: 'Suporte', grupo: 'Atendimento' },
  { key: 'trocar_empresa', label: 'Alternar entre empresas da rede', grupo: 'Administração da Rede' },
  { key: 'gerenciar_usuarios', label: 'Gerenciar usuários da rede', grupo: 'Administração da Rede' },
];

export function permissoesPorTipo(tipo) {
  return tipo === 'cliente' ? PERMISSOES_CLIENTE : PERMISSOES_ADMIN;
}

export function todasPermissoes(tipo) {
  return permissoesPorTipo(tipo).map(p => p.key);
}

// ========== CRUD ==========

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select('*, chaves_api(id, nome, provedor), as_rede(id, nome, slug)')
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
    .select('*')
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
    .select('*, chaves_api(id, nome, provedor)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarUsuario(campos) {
  const payload = sanitizarPayload(campos);
  if (!payload.senha) throw new Error('Informe uma senha inicial para o usuário.');
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarUsuario(id, campos) {
  const payload = sanitizarPayload(campos);
  // Se senha veio vazia no update, mantem a atual
  if (!payload.senha) delete payload.senha;
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirUsuario(id) {
  const { error } = await supabase
    .from('cci_usuarios_sistema')
    .delete()
    .eq('id', id);
  if (error) throw error;
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
