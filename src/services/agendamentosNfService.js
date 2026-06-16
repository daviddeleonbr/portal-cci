import { supabase } from '../lib/supabase';

// ───────────────────────────────────────────────────────────────
// CRUD de agendamentos recorrentes de NFS-e.
// A trigger no banco recalcula `proxima_emissao` em todo INSERT/UPDATE
// que mude a recorrência ou a `ultima_emissao` — então o front nunca
// precisa setar esse campo manualmente.
// ───────────────────────────────────────────────────────────────

export async function listarAgendamentos(configId) {
  const { data, error } = await supabase
    .from('agendamentos_nf')
    .select('*')
    .eq('config_id', configId)
    .order('proxima_emissao', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function salvarAgendamento(agendamento) {
  const { id, created_at, updated_at, proxima_emissao, notas_emitidas, ...payload } = agendamento;
  if (id) {
    const { data, error } = await supabase
      .from('agendamentos_nf')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('agendamentos_nf')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function alternarAtivo(id, ativo) {
  const { data, error } = await supabase
    .from('agendamentos_nf')
    .update({ ativo })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirAgendamento(id) {
  const { error } = await supabase.from('agendamentos_nf').delete().eq('id', id);
  if (error) throw error;
}

// Atualiza o estado pós-emissão (chamado pelo worker/cron, mas
// expomos aqui pra permitir "emitir agora" manual no front).
export async function registrarEmissao(id, { sucesso, mensagemErro = null }) {
  const update = sucesso
    ? { ultima_emissao: new Date().toISOString().slice(0, 10),
        notas_emitidas: undefined, // gerenciado abaixo via RPC numa próxima iter
        ultimo_erro: null }
    : { ultimo_erro: mensagemErro };

  const { data, error } = await supabase
    .from('agendamentos_nf')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Helpers de exibição ───────────────────────────────────────
export function formatarRecorrencia({ periodicidade, dia_emissao }) {
  if (periodicidade !== 'mensal') return periodicidade;
  if (dia_emissao === 'ultimo') return 'Mensal — último dia do mês';
  return `Mensal — dia ${dia_emissao}`;
}
