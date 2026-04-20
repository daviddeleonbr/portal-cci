import { supabase } from '../lib/supabase';

export async function buscarStatus(clienteId, data) {
  if (!clienteId || !data) return null;
  const { data: row, error } = await supabase
    .from('bpo_conciliacoes_caixas')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('data', data)
    .maybeSingle();
  if (error) throw error;
  return row || null;
}

export async function marcarConcluida(clienteId, data, { por, observacoes } = {}) {
  if (!clienteId || !data) throw new Error('cliente e data sao obrigatorios');
  const payload = {
    cliente_id: clienteId,
    data,
    concluida: true,
    concluida_em: new Date().toISOString(),
    concluida_por: por || null,
    observacoes: observacoes || null,
    updated_at: new Date().toISOString(),
  };
  const { data: row, error } = await supabase
    .from('bpo_conciliacoes_caixas')
    .upsert(payload, { onConflict: 'cliente_id,data' })
    .select()
    .single();
  if (error) throw error;
  return row;
}

// Lista as conciliacoes CONCLUIDAS de um cliente dentro de um periodo.
// Ordenadas da mais recente para a mais antiga.
export async function listarConcluidas(clienteId, { dataInicial, dataFinal } = {}) {
  if (!clienteId) return [];
  let q = supabase
    .from('bpo_conciliacoes_caixas')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('concluida', true)
    .order('data', { ascending: false });
  if (dataInicial) q = q.gte('data', dataInicial);
  if (dataFinal) q = q.lte('data', dataFinal);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function reabrir(clienteId, data) {
  if (!clienteId || !data) throw new Error('cliente e data sao obrigatorios');
  const { data: row, error } = await supabase
    .from('bpo_conciliacoes_caixas')
    .upsert({
      cliente_id: clienteId,
      data,
      concluida: false,
      concluida_em: null,
      concluida_por: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cliente_id,data' })
    .select()
    .single();
  if (error) throw error;
  return row;
}
