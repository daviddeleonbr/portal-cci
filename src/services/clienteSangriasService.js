import { supabase } from '../lib/supabase';

// Verifica se ja existe fechamento para aquele cliente+data
export async function buscarFechamento(clienteId, data) {
  if (!clienteId || !data) return null;
  const { data: row, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('data', data)
    .maybeSingle();
  if (error) throw error;
  return row;
}

// Lista historico de fechamentos de um cliente (ordem desc)
export async function listarHistorico(clienteId, { limite = 60 } = {}) {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .select('id, data, total_apurado, total_apresentado, total_diferenca, confirmado_em, confirmado_por, registros')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

export async function salvarFechamento({ cliente_id, empresa_codigo, data, registros, confirmado_por, observacoes }) {
  const total_apurado = registros.reduce((s, r) => s + Number(r.dinheiroApurado || 0), 0);
  const total_apresentado = registros.reduce((s, r) => s + Number(r.dinheiroApresentado || 0), 0);
  const total_diferenca = total_apresentado - total_apurado;

  const payload = {
    cliente_id,
    empresa_codigo,
    data,
    registros,
    total_apurado,
    total_apresentado,
    total_diferenca,
    confirmado_em: new Date().toISOString(),
    confirmado_por: confirmado_por || null,
    observacoes: observacoes || null,
  };

  const { data: row, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return row;
}
