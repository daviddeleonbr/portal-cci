import { supabase } from '../lib/supabase';

// ===================== MASCARAS =====================

export async function listarMascaras() {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .select('*, grupos_dre(count)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function buscarMascara(id) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function criarMascara({ nome, descricao }) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .insert({ nome, descricao })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarMascara(id, campos) {
  const { data, error } = await supabase
    .from('mascaras_dre')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirMascara(id) {
  const { error } = await supabase
    .from('mascaras_dre')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ===================== GRUPOS =====================

export async function listarGrupos(mascaraId) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .select('*, mapeamento_contas(count)')
    .eq('mascara_id', mascaraId)
    .order('ordem', { ascending: true });

  if (error) throw error;
  return data;
}

export async function criarGrupo({ mascara_id, nome, tipo, sinal, ordem, parent_id, formula }) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .insert({ mascara_id, nome, tipo, sinal, ordem, parent_id: parent_id || null, formula: formula || null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarGrupo(id, campos) {
  const { data, error } = await supabase
    .from('grupos_dre')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirGrupo(id) {
  const { error } = await supabase
    .from('grupos_dre')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reordenarGrupos(grupos) {
  // grupos = [{ id, ordem }]
  const promises = grupos.map(({ id, ordem }) =>
    supabase.from('grupos_dre').update({ ordem }).eq('id', id)
  );
  const results = await Promise.all(promises);
  const err = results.find(r => r.error);
  if (err?.error) throw err.error;
}

// ===================== MAPEAMENTO =====================

export async function listarMapeamentos(grupoDreId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .select('*')
    .eq('grupo_dre_id', grupoDreId)
    .order('conta_nome', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listarTodosMapeamentos(mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .select('*, grupos_dre!inner(mascara_id, nome)')
    .eq('grupos_dre.mascara_id', mascaraId);

  if (error) throw error;
  return data;
}

export async function criarMapeamento({ grupo_dre_id, conta_codigo, conta_nome }) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .insert({ grupo_dre_id, conta_codigo, conta_nome })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function criarMapeamentosBatch(mapeamentos) {
  // mapeamentos = [{ grupo_dre_id, conta_codigo, conta_nome }]
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .upsert(mapeamentos, { onConflict: 'grupo_dre_id,conta_codigo' })
    .select();

  if (error) throw error;
  return data;
}

export async function excluirMapeamento(id) {
  const { error } = await supabase
    .from('mapeamento_contas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function moverMapeamento(id, novoGrupoDreId) {
  const { data, error } = await supabase
    .from('mapeamento_contas')
    .update({ grupo_dre_id: novoGrupoDreId })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
