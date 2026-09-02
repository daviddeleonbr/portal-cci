import { supabase } from '../lib/supabase';

export async function listarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, chaves_api(id, nome, provedor)')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buscarCliente(id) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, chaves_api(id, nome, provedor), empresas_api(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarCliente(campos) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(campos)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function criarClientesBatch(clientes) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(clientes)
    .select();
  if (error) throw error;
  return data;
}

export async function atualizarCliente(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.chaves_api;
  delete payload.empresas_api;

  const { data, error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirCliente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

// Apelido (nome curto) por empresa — self-service do cliente. Grava via RPC
// SECURITY DEFINER (a escrita direta em `clientes` é admin-only por RLS).
// Passe '' para limpar o apelido.
export async function salvarApelidoEmpresa(clienteId, apelido) {
  if (!clienteId) throw new Error('clienteId é obrigatório');
  const { error } = await supabase.rpc('cliente_apelido_salvar', {
    p_cliente_id: clienteId,
    p_apelido: apelido ?? '',
  });
  if (error) throw error;
}

// Grava/limpa a numeração (ordem de exibição) de UMA empresa. Passe null/''
// para limpar. Usada pra ordenar a DRE "Por Empresa" por número.
export async function salvarOrdemEmpresa(clienteId, ordem) {
  if (!clienteId) throw new Error('clienteId é obrigatório');
  const n = ordem === '' || ordem == null ? null : Number(ordem);
  const { error } = await supabase.rpc('cliente_ordem_salvar', {
    p_cliente_id: clienteId,
    p_ordem: Number.isFinite(n) ? n : null,
  });
  if (error) throw error;
}

// ─── Máscaras permitidas por REDE (mascara_dre_rede / mascara_fluxo_rede) ───
// Aplica-se a todas as empresas da rede (Webposto = chave_api_id, Autosystem =
// as_rede_id). Rede sem nenhuma máscara marcada = todas liberadas.
function _colRede({ chaveApiId, asRedeId }) {
  if (chaveApiId) return ['chave_api_id', chaveApiId];
  if (asRedeId)   return ['as_rede_id', asRedeId];
  throw new Error('Informe chaveApiId ou asRedeId');
}

export async function listarMascarasDaRede(rede) {
  const [col, val] = _colRede(rede);
  const [dre, fluxo] = await Promise.all([
    supabase.from('mascara_dre_rede').select('mascara_id').eq(col, val),
    supabase.from('mascara_fluxo_rede').select('mascara_id').eq(col, val),
  ]);
  if (dre.error) throw dre.error;
  if (fluxo.error) throw fluxo.error;
  return {
    dre:   (dre.data   || []).map(r => r.mascara_id),
    fluxo: (fluxo.data || []).map(r => r.mascara_id),
  };
}

async function _definirMascarasRede(tabela, rede, mascaraIds) {
  const [col, val] = _colRede(rede);
  const { error: delErr } = await supabase.from(tabela).delete().eq(col, val);
  if (delErr) throw delErr;
  const rows = [...new Set(mascaraIds || [])].map(id => ({ mascara_id: id, [col]: val }));
  if (rows.length > 0) {
    const { error } = await supabase.from(tabela).insert(rows);
    if (error) throw error;
  }
}
// Replace-all. Lista vazia = todas as máscaras liberadas para a rede.
export async function definirMascarasRedeDre(rede, mascaraIds) {
  return _definirMascarasRede('mascara_dre_rede', rede, mascaraIds);
}
export async function definirMascarasRedeFluxo(rede, mascaraIds) {
  return _definirMascarasRede('mascara_fluxo_rede', rede, mascaraIds);
}
