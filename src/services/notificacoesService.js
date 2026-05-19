// Notificações in-app para usuários do sistema (admin e cliente).
//
// Cada notificação tem um destinatário (usuario_id). Para envios em
// massa, inserimos uma linha por destinatário (simplifica a leitura).

import { supabase } from '../lib/supabase';

export const TIPOS = ['info', 'sucesso', 'aviso', 'erro'];

// Lista as notificações do usuário (mais recentes primeiro).
export async function listarMinhas(usuarioId, { limit = 30 } = {}) {
  if (!usuarioId) return [];
  const { data, error } = await supabase
    .from('notificacoes')
    .select('id, titulo, mensagem, tipo, link, lida_em, created_at')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Conta quantas estão não-lidas (badge no sino).
export async function contarNaoLidas(usuarioId) {
  if (!usuarioId) return 0;
  const { count, error } = await supabase
    .from('notificacoes')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .is('lida_em', null);
  if (error) throw error;
  return count || 0;
}

export async function marcarComoLida(notificacaoId) {
  if (!notificacaoId) return;
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida_em: new Date().toISOString() })
    .eq('id', notificacaoId)
    .is('lida_em', null);
  if (error) throw error;
}

export async function marcarTodasComoLidas(usuarioId) {
  if (!usuarioId) return;
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida_em: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
    .is('lida_em', null);
  if (error) throw error;
}

export async function excluir(notificacaoId) {
  if (!notificacaoId) return;
  const { error } = await supabase.from('notificacoes').delete().eq('id', notificacaoId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// Envio (admin)
// ────────────────────────────────────────────────────────────────

// Cria uma notificação para um conjunto de usuários. Retorna a quantidade
// efetivamente inserida.
export async function enviar({ usuario_ids, titulo, mensagem, tipo = 'info', link = null, remetente_id = null }) {
  const ids = Array.from(new Set((usuario_ids || []).filter(Boolean)));
  if (ids.length === 0) throw new Error('Selecione ao menos um destinatário.');
  if (!titulo || !titulo.trim()) throw new Error('Título é obrigatório.');
  if (!TIPOS.includes(tipo)) throw new Error('Tipo inválido.');

  const payload = ids.map(usuario_id => ({
    usuario_id,
    remetente_id: remetente_id || null,
    titulo: titulo.trim(),
    mensagem: (mensagem || '').trim() || null,
    tipo,
    link: (link || '').trim() || null,
  }));

  const { data, error } = await supabase
    .from('notificacoes')
    .insert(payload)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

// Lista resumo de notificações enviadas — agrupada pelo título (mesma "campanha").
// Útil pra mostrar histórico no admin.
export async function listarEnviadasResumo({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('id, titulo, mensagem, tipo, link, created_at, lida_em, usuario_id, remetente_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Lista usuários (admin + cliente) pra popular o destinatário do envio.
export async function listarUsuariosDestinatarios() {
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select('id, nome, email, tipo, status, chave_api_id, as_rede_id')
    .eq('status', 'ativo')
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}
