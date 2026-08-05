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

// ─── Máscaras permitidas por empresa (cliente_mascara_dre / _fluxo) ───
// Empresa sem nenhuma máscara marcada = todas liberadas.
export async function listarMascarasDoCliente(clienteId) {
  const [dre, fluxo] = await Promise.all([
    supabase.from('cliente_mascara_dre').select('mascara_id').eq('cliente_id', clienteId),
    supabase.from('cliente_mascara_fluxo').select('mascara_id').eq('cliente_id', clienteId),
  ]);
  if (dre.error) throw dre.error;
  if (fluxo.error) throw fluxo.error;
  return {
    dre:   (dre.data   || []).map(r => r.mascara_id),
    fluxo: (fluxo.data || []).map(r => r.mascara_id),
  };
}

async function _definirMascarasCliente(tabela, clienteId, mascaraIds) {
  const { error: delErr } = await supabase.from(tabela).delete().eq('cliente_id', clienteId);
  if (delErr) throw delErr;
  const rows = [...new Set(mascaraIds || [])].map(id => ({ cliente_id: clienteId, mascara_id: id }));
  if (rows.length > 0) {
    const { error } = await supabase.from(tabela).insert(rows);
    if (error) throw error;
  }
}
// Replace-all. Lista vazia = todas as máscaras liberadas para a empresa.
export async function definirMascarasClienteDre(clienteId, mascaraIds) {
  return _definirMascarasCliente('cliente_mascara_dre', clienteId, mascaraIds);
}
export async function definirMascarasClienteFluxo(clienteId, mascaraIds) {
  return _definirMascarasCliente('cliente_mascara_fluxo', clienteId, mascaraIds);
}
