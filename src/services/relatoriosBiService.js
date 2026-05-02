// CRUD de relatorios de BI (Power BI) cadastrados pela CCI por rede/cliente.
// Tabela: cliente_relatorios_bi (migration 026)

import { supabase } from '../lib/supabase';

// Lista relatorios visiveis para uma rede + (opcional) uma empresa especifica.
// Retorna os globais da rede (cliente_id null) + os especificos do cliente,
// ordenados por `ordem` asc e nome asc. Apenas ativos.
export async function listarParaCliente({ chave_api_id, cliente_id }) {
  if (!chave_api_id) return [];
  let query = supabase
    .from('cliente_relatorios_bi')
    .select('*')
    .eq('chave_api_id', chave_api_id)
    .eq('ativo', true);
  if (cliente_id) {
    query = query.or(`cliente_id.is.null,cliente_id.eq.${cliente_id}`);
  } else {
    query = query.is('cliente_id', null);
  }
  const { data, error } = await query.order('ordem', { ascending: true }).order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Lista TODOS os relatorios de uma rede (admin) — inclui inativos para gestao
export async function listarPorRede(chave_api_id) {
  if (!chave_api_id) return [];
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .select('*')
    .eq('chave_api_id', chave_api_id)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Lista todos os relatorios cadastrados (admin global). Junta nome da rede
// e do cliente para exibicao na grade.
export async function listarTodos() {
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .select('*, chaves_api(id, nome), clientes(id, nome)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function criar({ chave_api_id, cliente_id = null, nome, descricao, link_publico, ordem = 0, ativo = true }) {
  if (!chave_api_id) throw new Error('Rede (chave API) e obrigatoria.');
  if (!nome) throw new Error('Nome do relatório e obrigatorio.');
  if (!link_publico) throw new Error('Link público do BI e obrigatorio.');
  const payload = {
    chave_api_id,
    cliente_id: cliente_id || null,
    nome: nome.trim(),
    descricao: (descricao || '').trim() || null,
    link_publico: link_publico.trim(),
    ordem: Number(ordem) || 0,
    ativo: !!ativo,
  };
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  if (!id) throw new Error('id obrigatorio');
  const patch = {};
  if (campos.nome != null)         patch.nome = String(campos.nome).trim();
  if (campos.descricao !== undefined) patch.descricao = (campos.descricao || '').trim() || null;
  if (campos.link_publico != null) patch.link_publico = String(campos.link_publico).trim();
  if (campos.ordem != null)        patch.ordem = Number(campos.ordem) || 0;
  if (campos.ativo != null)        patch.ativo = !!campos.ativo;
  if (campos.cliente_id !== undefined) patch.cliente_id = campos.cliente_id || null;
  if (campos.chave_api_id != null) patch.chave_api_id = campos.chave_api_id;
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  if (!id) throw new Error('id obrigatorio');
  const { error } = await supabase.from('cliente_relatorios_bi').delete().eq('id', id);
  if (error) throw error;
}
