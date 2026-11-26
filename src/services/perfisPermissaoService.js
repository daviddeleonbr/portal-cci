import { supabase } from '../lib/supabase';

// Modelos de permissão (migration 235). Só pré-marcam a tela; quem concede é
// o cci_gerir_*_usuario, que limita ao que o ator tem.
const COLS = 'id, tipo, nome, descricao, permissoes, ordem, ativo, updated_at';

export async function listarPerfis(tipo, { incluirInativos = false } = {}) {
  let q = supabase.from('cci_perfis_permissao').select(COLS).order('ordem').order('nome');
  if (tipo) q = q.eq('tipo', tipo);
  if (!incluirInativos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function limpar(p) {
  return {
    tipo: p.tipo,
    nome: (p.nome || '').trim(),
    descricao: (p.descricao || '').trim() || null,
    permissoes: [...new Set(p.permissoes || [])],
    ordem: Number(p.ordem) || 0,
    ativo: p.ativo !== false,
  };
}

export async function criarPerfil(p) {
  const { data, error } = await supabase.from('cci_perfis_permissao').insert(limpar(p)).select(COLS).single();
  if (error) throw error;
  return data;
}

export async function atualizarPerfil(id, p) {
  const { data, error } = await supabase.from('cci_perfis_permissao')
    .update({ ...limpar(p), updated_at: new Date().toISOString() }).eq('id', id).select(COLS).single();
  if (error) throw error;
  return data;
}

export async function excluirPerfil(id) {
  const { error } = await supabase.from('cci_perfis_permissao').delete().eq('id', id);
  if (error) throw error;
}
