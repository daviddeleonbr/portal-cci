import { supabase } from '../lib/supabase';

// Lista contas manuais de um cliente em uma mascara
export async function listarContas(clienteId, mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas')
    .select('*, grupos_dre(id, nome, tipo, parent_id)')
    .eq('cliente_id', clienteId)
    .eq('mascara_id', mascaraId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Lista todas as contas manuais de um cliente (todas as mascaras)
export async function listarContasDoCliente(clienteId) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas')
    .select('*, grupos_dre(id, nome, tipo, mascara_id)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criarConta({ cliente_id, mascara_id, grupo_dre_id, conta_codigo, conta_descricao, conta_natureza, observacoes }) {
  const { data, error } = await supabase
    .from('mapeamento_manual_contas')
    .insert({
      cliente_id, mascara_id, grupo_dre_id,
      conta_codigo: conta_codigo || null,
      conta_descricao, conta_natureza, observacoes,
    })
    .select('*, grupos_dre(id, nome, tipo)')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarConta(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.grupos_dre;

  const { data, error } = await supabase
    .from('mapeamento_manual_contas')
    .update(payload)
    .eq('id', id)
    .select('*, grupos_dre(id, nome, tipo)')
    .single();
  if (error) throw error;
  return data;
}

export async function excluirConta(id) {
  const { error } = await supabase.from('mapeamento_manual_contas').delete().eq('id', id);
  if (error) throw error;
}
