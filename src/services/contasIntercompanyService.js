// Contas de transferência entre filiais de uma rede (tabela rede_contas_intercompany,
// migration 231). Só admin. rede: { tipo: 'webposto' | 'autosystem', id }.
import { supabase } from '../lib/supabase';

const colunaDa = (rede) => (rede?.tipo === 'autosystem' ? 'as_rede_id' : 'chave_api_id');

export async function listar(rede) {
  if (!rede?.id) return [];
  const { data, error } = await supabase.from('rede_contas_intercompany')
    .select('id, codigo, descricao').eq(colunaDa(rede), rede.id).order('codigo');
  if (error) throw error;
  return data || [];
}

// Substitui a lista da rede pela informada: [{ codigo, descricao }]
export async function salvar(rede, contas, criadoPor = null) {
  if (!rede?.id) throw new Error('Rede não informada.');
  const col = colunaDa(rede);
  const novas = [...new Map((contas || [])
    .map(c => ({ codigo: String(c.codigo || '').trim(), descricao: c.descricao || null }))
    .filter(c => c.codigo)
    .map(c => [c.codigo, c])).values()];
  const { error: errDel } = await supabase.from('rede_contas_intercompany').delete().eq(col, rede.id);
  if (errDel) throw errDel;
  if (!novas.length) return [];
  const { data, error } = await supabase.from('rede_contas_intercompany')
    .insert(novas.map(c => ({ [col]: rede.id, codigo: c.codigo, descricao: c.descricao, criado_por: criadoPor })))
    .select('id, codigo, descricao');
  if (error) throw error;
  return data || [];
}
