import { supabase } from '../lib/supabase';

// ========== Catalogo de permissoes ==========
// Usado pela UI pra renderizar os checkboxes. Cada chave deve
// bater com a string armazenada em cci_usuarios_sistema.permissoes.

export const PERMISSOES_ADMIN = [
  { key: 'dashboard', label: 'Dashboard', grupo: 'Principal' },
  { key: 'clientes', label: 'Clientes', grupo: 'Cadastros' },
  { key: 'colaboradores', label: 'Colaboradores', grupo: 'Cadastros' },
  { key: 'usuarios', label: 'Usuarios do Sistema', grupo: 'Cadastros' },
  { key: 'fornecedores', label: 'Fornecedores', grupo: 'Cadastros' },
  { key: 'plano_contas', label: 'Plano de Contas', grupo: 'Cadastros' },
  { key: 'motivos', label: 'Motivos de Movimentacao', grupo: 'Cadastros' },
  { key: 'contas_pagar', label: 'Contas a Pagar', grupo: 'Financeiro' },
  { key: 'contas_receber', label: 'Contas a Receber', grupo: 'Financeiro' },
  { key: 'fiscal', label: 'Notas Fiscais e Agendamento', grupo: 'Fiscal' },
  { key: 'parametros', label: 'Parametros', grupo: 'Consultoria' },
  { key: 'relatorios_cliente', label: 'Relatorios por Cliente', grupo: 'Consultoria' },
  { key: 'conciliacao_bancaria', label: 'Conciliacao Bancaria', grupo: 'BPO' },
  { key: 'conciliacao_caixas', label: 'Conciliacao de Caixas', grupo: 'BPO' },
  { key: 'caixa_administrativo', label: 'Caixa Administrativo', grupo: 'BPO' },
];

export const PERMISSOES_CLIENTE = [
  { key: 'dashboard', label: 'Visao Geral', grupo: 'Principal' },
  { key: 'dre', label: 'DRE', grupo: 'Relatorios' },
  { key: 'fluxo_caixa', label: 'Fluxo de Caixa', grupo: 'Relatorios' },
  { key: 'sangrias', label: 'Sangrias', grupo: 'Operacional' },
  { key: 'bpo', label: 'Servicos BPO', grupo: 'Operacional' },
  { key: 'documentos', label: 'Documentos', grupo: 'Operacional' },
  { key: 'financeiro', label: 'Financeiro', grupo: 'Operacional' },
  { key: 'tarefas', label: 'Gestor de Tarefas', grupo: 'Operacional' },
  { key: 'suporte', label: 'Suporte', grupo: 'Atendimento' },
  { key: 'trocar_empresa', label: 'Alternar entre empresas da rede', grupo: 'Administracao da Rede' },
  { key: 'gerenciar_usuarios', label: 'Gerenciar usuarios da rede', grupo: 'Administracao da Rede' },
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
    .select('*, chaves_api(id, nome, provedor)')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Lista somente usuarios de uma rede especifica (usado pelo admin da rede)
export async function listarUsuariosDaRede(chaveApiId) {
  if (!chaveApiId) return [];
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select('*')
    .eq('tipo', 'cliente')
    .eq('chave_api_id', chaveApiId)
    .order('nome', { ascending: true });
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
  if (!payload.senha) throw new Error('Informe uma senha inicial para o usuario.');
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
  if (p.tipo === 'admin') {
    p.chave_api_id = null;
    p.empresas_permitidas = null;
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
