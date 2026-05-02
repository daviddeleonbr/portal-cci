import { supabase } from '../lib/supabase';

export const STATUS = [
  { key: 'pendente',     label: 'Pendente',     cor: 'amber' },
  { key: 'em_andamento', label: 'Em andamento', cor: 'blue' },
  { key: 'concluida',    label: 'Concluída',    cor: 'emerald' },
  { key: 'cancelada',    label: 'Cancelada',    cor: 'gray' },
];

export const PRIORIDADES = [
  { key: 'baixa',   label: 'Baixa',   cor: 'gray' },
  { key: 'normal',  label: 'Normal',  cor: 'blue' },
  { key: 'alta',    label: 'Alta',    cor: 'amber' },
  { key: 'urgente', label: 'Urgente', cor: 'red' },
];

export async function listar(chaveApiId, { status, clienteId } = {}) {
  if (!chaveApiId) return [];
  let q = supabase
    .from('cliente_tarefas')
    .select('*, clientes(id, nome)')
    .eq('chave_api_id', chaveApiId);
  if (status) q = q.eq('status', status);
  if (clienteId) q = q.eq('cliente_id', clienteId);
  q = q.order('prazo', { ascending: true, nullsFirst: false })
       .order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function criar({ chave_api_id, cliente_id, titulo, descricao, responsavel, prazo, status = 'pendente', prioridade = 'normal', criado_por }) {
  if (!chave_api_id) throw new Error('Rede e obrigatoria.');
  if (!titulo?.trim()) throw new Error('Título e obrigatorio.');
  const payload = {
    chave_api_id,
    cliente_id: cliente_id || null,
    titulo: titulo.trim(),
    descricao: descricao || null,
    responsavel: responsavel || null,
    prazo: prazo || null,
    status,
    prioridade,
    criado_por: criado_por || null,
  };
  const { data, error } = await supabase
    .from('cliente_tarefas')
    .insert(payload)
    .select('*, clientes(id, nome)')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.chave_api_id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.clientes;
  if (payload.status === 'concluida' && !payload.concluida_em) {
    payload.concluida_em = new Date().toISOString();
  }
  if (payload.status && payload.status !== 'concluida') {
    payload.concluida_em = null;
  }
  const { data, error } = await supabase
    .from('cliente_tarefas')
    .update(payload)
    .eq('id', id)
    .select('*, clientes(id, nome)')
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  const { error } = await supabase.from('cliente_tarefas').delete().eq('id', id);
  if (error) throw error;
}

export function isAtrasada(tarefa) {
  if (!tarefa?.prazo) return false;
  if (['concluida', 'cancelada'].includes(tarefa.status)) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(tarefa.prazo + 'T00:00:00');
  return prazo < hoje;
}

export async function contarPendentes(chaveApiId) {
  if (!chaveApiId) return 0;
  const { count, error } = await supabase
    .from('cliente_tarefas')
    .select('id', { count: 'exact', head: true })
    .eq('chave_api_id', chaveApiId)
    .in('status', ['pendente', 'em_andamento']);
  if (error) return 0;
  return count || 0;
}
