import { supabase } from '../lib/supabase';

// ─── Gera slug a partir do nome ──────────────────────────────
export function gerarSlug(nome) {
  return (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')      // so letras, numeros, espacos e hifens
    .replace(/\s+/g, '-')              // espacos viram hifens
    .replace(/-+/g, '-');              // colapsa hifens duplicados
}

// ─── as_rede CRUD ────────────────────────────────────────────

export async function listarRedes() {
  const { data, error } = await supabase
    .from('as_rede')
    .select('*')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function buscarRede(id) {
  const { data, error } = await supabase
    .from('as_rede')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarRede({ nome, slug, ativo = true }) {
  const { data, error } = await supabase
    .from('as_rede')
    .insert({
      nome,
      slug: slug || gerarSlug(nome),
      ativo,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarRede(id, campos) {
  const { data, error } = await supabase
    .from('as_rede')
    .update(campos)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirRede(id) {
  const { error } = await supabase.from('as_rede').delete().eq('id', id);
  if (error) throw error;
}
