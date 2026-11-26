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

