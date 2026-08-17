// Catálogo de cláusulas contratuais (cci_clausulas) — admin-only por RLS.
// Fonte da verdade em runtime. Semeado a partir de src/data/clausulasSeed.js
// na primeira vez (seedSeVazio) e restaurável pela tela admin.

import { supabase } from '../lib/supabase';
import { CLAUSULAS_SEED } from '../data/clausulasSeed';

const COLS = `id, chave, titulo, corpo, tipo, obrigatoria, condicao, ordem, ativo,
  variaveis, revisar_juridico, versao, updated_at`;

export const TIPOS_CLAUSULA = [
  { key: 'objeto',      label: 'Objeto' },
  { key: 'servico',     label: 'Serviço' },
  { key: 'pagamento',   label: 'Pagamento' },
  { key: 'geral',       label: 'Geral' },
  { key: 'juridica',    label: 'Jurídica' },
  { key: 'lgpd',        label: 'LGPD' },
  { key: 'encerramento', label: 'Encerramento' },
];

export const MODOS_CONDICAO = [
  { key: 'sempre',    label: 'Sempre (obrigatória/geral)' },
  { key: 'categoria', label: 'Quando categoria = …' },
  { key: 'servico',   label: 'Quando o serviço estiver contratado' },
  { key: 'flag',      label: 'Quando uma flag estiver ativa (ex.: dados pessoais)' },
];

// Converte um item da semente (.js) numa linha de banco.
function seedParaRow(c) {
  return {
    chave: c.chave,
    titulo: c.titulo,
    corpo: c.corpo || [],
    tipo: c.tipo || 'geral',
    obrigatoria: !!c.obrigatoria,
    condicao: c.condicao || { modo: 'sempre' },
    ordem: c.ordem ?? 100,
    ativo: c.ativo !== false,
    variaveis: c.variaveis || [],
    revisar_juridico: !!c.revisar_juridico,
    versao: c.versao || 1,
  };
}

// Lista as cláusulas (ordenadas). Se a tabela estiver vazia, semeia e relista.
export async function listarClausulas({ apenasAtivas = false } = {}) {
  let q = supabase.from('cci_clausulas').select(COLS).order('ordem').order('titulo');
  if (apenasAtivas) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) {
    await seedSeVazio();
    const { data: d2, error: e2 } = await q;
    if (e2) throw e2;
    return d2 || [];
  }
  return data;
}

// Insere as cláusulas padrão que ainda não existirem (por `chave`).
export async function seedSeVazio() {
  const { data: existentes, error } = await supabase.from('cci_clausulas').select('chave');
  if (error) throw error;
  const jaTem = new Set((existentes || []).map(r => r.chave));
  const novas = CLAUSULAS_SEED.filter(c => !jaTem.has(c.chave)).map(seedParaRow);
  if (novas.length === 0) return { inseridas: 0 };
  const { error: e2 } = await supabase.from('cci_clausulas').insert(novas);
  if (e2) throw e2;
  return { inseridas: novas.length };
}

// Restaura (upsert) TODAS as cláusulas padrão pela chave — usado no botão
// "restaurar padrões". Não remove cláusulas customizadas criadas pelo admin.
export async function restaurarPadroes() {
  const rows = CLAUSULAS_SEED.map(seedParaRow);
  const { error } = await supabase.from('cci_clausulas').upsert(rows, { onConflict: 'chave' });
  if (error) throw error;
  return { restauradas: rows.length };
}

export async function salvarClausula(clausula) {
  // eslint-disable-next-line no-unused-vars
  const { id, created_at, updated_at, ...payload } = clausula;
  if (id) {
    const { data, error } = await supabase.from('cci_clausulas').update(payload).eq('id', id).select(COLS).single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('cci_clausulas').insert(payload).select(COLS).single();
  if (error) throw error;
  return data;
}

export async function alternarAtivoClausula(id, ativo) {
  const { data, error } = await supabase.from('cci_clausulas').update({ ativo }).eq('id', id).select(COLS).single();
  if (error) throw error;
  return data;
}

export async function excluirClausula(id) {
  const { error } = await supabase.from('cci_clausulas').delete().eq('id', id);
  if (error) throw error;
}
