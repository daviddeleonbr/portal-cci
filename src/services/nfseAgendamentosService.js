// CRUD de agendamentos recorrentes de NFS-e (tabela nfse_agendamentos).
// A execucao real (chamar Asaas no dia certo) deve ser feita por uma
// Edge Function / cron externo lendo proxima_emissao = current_date.

import { supabase } from '../lib/supabase';

export async function listar(configId) {
  if (!configId) return [];
  const { data, error } = await supabase
    .from('nfse_agendamentos')
    .select('*, clientes(id, nome, cnpj)')
    .eq('asaas_config_id', configId)
    .order('ativo', { ascending: false })
    .order('proxima_emissao', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function criar(payload) {
  const proxima = calcularProxima(payload.dia_do_mes, payload.data_inicio);
  const { data, error } = await supabase
    .from('nfse_agendamentos')
    .insert({ ...payload, proxima_emissao: proxima })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  const patch = { ...campos };
  // Se mudou dia_do_mes ou data_inicio, recalcula proxima_emissao
  if (campos.dia_do_mes != null || campos.data_inicio != null) {
    patch.proxima_emissao = calcularProxima(
      campos.dia_do_mes ?? null,
      campos.data_inicio ?? null,
    );
  }
  const { data, error } = await supabase
    .from('nfse_agendamentos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  const { error } = await supabase.from('nfse_agendamentos').delete().eq('id', id);
  if (error) throw error;
}

export async function alternarAtivo(id, ativo) {
  return atualizar(id, { ativo });
}

// Calcula a proxima data efetiva a partir do dia_do_mes (1-31) e da data_inicio.
// Se o dia ja passou no mes corrente, agenda para o mes seguinte. Se a data_inicio
// e futura, usa-a como base.
export function calcularProxima(diaDoMes, dataInicio) {
  if (!diaDoMes) return null;
  const hoje = new Date();
  const baseStr = dataInicio || formatIso(hoje);
  const base = new Date(baseStr + 'T00:00:00');
  const ref = base > hoje ? base : hoje;

  // Tenta o mes corrente
  const tentativa = new Date(ref.getFullYear(), ref.getMonth(),
    Math.min(diaDoMes, ultimoDiaDoMes(ref.getFullYear(), ref.getMonth())));
  if (tentativa >= stripTime(ref)) return formatIso(tentativa);

  // Senao, mes seguinte
  const proximo = new Date(ref.getFullYear(), ref.getMonth() + 1,
    Math.min(diaDoMes, ultimoDiaDoMes(ref.getFullYear(), ref.getMonth() + 1)));
  return formatIso(proximo);
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function formatIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
