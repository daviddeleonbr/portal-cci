// Modelos de layout de arquivos de vendas de cartão (BPO › Diagnosticar).
// Ver migration 204. Só admin (RLS).
import { supabase } from '../lib/supabase';

const TABELA = 'bpo_layout_arquivo_cartao';

export async function listarModelos() {
  const { data, error } = await supabase.from(TABELA).select('*').order('nome');
  if (error) throw error;
  return data || [];
}

// { id?, nome, adquirente, mapeamento: {campo: nomeColuna}, colunas: [cabeçalho] }
export async function salvarModelo(modelo) {
  const campos = {
    nome: String(modelo.nome || '').trim(),
    adquirente: modelo.adquirente || null,
    mapeamento: modelo.mapeamento || {},
    colunas: modelo.colunas || [],
    updated_at: new Date().toISOString(),
  };
  const q = modelo.id
    ? supabase.from(TABELA).update(campos).eq('id', modelo.id).select().single()
    : supabase.from(TABELA).insert(campos).select().single();
  const { data, error } = await q;
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) throw new Error('Já existe um modelo com esse nome.');
    throw error;
  }
  return data;
}

export async function excluirModelo(id) {
  const { error } = await supabase.from(TABELA).delete().eq('id', id);
  if (error) throw error;
}
