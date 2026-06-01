// Mensagens iniciais para clientes ("What's new").
// Admin posta mensagens via /admin/mensagens-iniciais; cliente vê em
// modal centralizado UMA vez por usuário, no primeiro carregamento do
// ClienteLayout após login.

import { supabase } from '../lib/supabase';

export const CATEGORIAS = [
  { key: 'novidade',    label: 'Novidade' },
  { key: 'atualizacao', label: 'Atualização' },
  { key: 'manutencao',  label: 'Manutenção' },
  { key: 'aviso',       label: 'Aviso' },
];

export const PUBLICOS = [
  { key: 'ambos',      label: 'Ambos os portais' },
  { key: 'webposto',   label: 'Apenas Webposto' },
  { key: 'autosystem', label: 'Apenas Autosystem' },
];

// ─── Admin ────────────────────────────────────────────────────

export async function listar() {
  const { data, error } = await supabase
    .from('cci_mensagens_iniciais')
    .select('*')
    .order('publicada_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Conta quantos usuários visualizaram cada mensagem (admin).
// Retorna Map<mensagem_id, count>.
export async function contarVisualizacoes(mensagemIds) {
  const ids = Array.from(new Set((mensagemIds || []).filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('cci_mensagens_iniciais_views')
    .select('mensagem_id')
    .in('mensagem_id', ids);
  if (error) throw error;
  const m = new Map();
  for (const row of data || []) {
    m.set(row.mensagem_id, (m.get(row.mensagem_id) || 0) + 1);
  }
  return m;
}

export async function criar(campos) {
  const payload = sanitizar(campos);
  const { data, error } = await supabase
    .from('cci_mensagens_iniciais')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  const payload = sanitizar(campos);
  delete payload.created_by; // não muda criador no update
  const { data, error } = await supabase
    .from('cci_mensagens_iniciais')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  const { error } = await supabase
    .from('cci_mensagens_iniciais')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

function sanitizar(c) {
  const p = { ...c };
  delete p.id;
  delete p.created_at;
  delete p.updated_at;
  delete p.publicada_em; // setada pelo banco
  if (p.titulo)   p.titulo = String(p.titulo).trim();
  if (p.conteudo) p.conteudo = String(p.conteudo).trim();
  if (p.expira_em === '') p.expira_em = null;
  return p;
}

// ─── Cliente ─────────────────────────────────────────────────

// Lista mensagens pendentes (não-visualizadas) para o usuário,
// respeitando público-alvo, status ativa e expira_em.
// Retorna ordenado da mais antiga pra mais nova — o modal mostra
// em fila, da primeira não vista pra última.
export async function listarPendentesParaUsuario({ usuarioId, tipoCliente }) {
  if (!usuarioId || !tipoCliente) return [];

  // 1) Mensagens elegíveis: ativas, não expiradas, público compatível
  const agora = new Date().toISOString();
  const { data: msgs, error: errMsg } = await supabase
    .from('cci_mensagens_iniciais')
    .select('*')
    .eq('ativa', true)
    .in('publico_alvo', ['ambos', tipoCliente])
    .or(`expira_em.is.null,expira_em.gt.${agora}`)
    .order('publicada_em', { ascending: true });
  if (errMsg) throw errMsg;
  if (!msgs || msgs.length === 0) return [];

  // 2) Já visualizadas por esse usuário
  const ids = msgs.map(m => m.id);
  const { data: views, error: errView } = await supabase
    .from('cci_mensagens_iniciais_views')
    .select('mensagem_id')
    .eq('usuario_id', usuarioId)
    .in('mensagem_id', ids);
  if (errView) throw errView;
  const vistas = new Set((views || []).map(v => v.mensagem_id));

  return msgs.filter(m => !vistas.has(m.id));
}

export async function marcarComoVisualizada(mensagemId, usuarioId) {
  if (!mensagemId || !usuarioId) return;
  // upsert: se já existir, ignora (constraint PK composta cuida)
  const { error } = await supabase
    .from('cci_mensagens_iniciais_views')
    .upsert({ mensagem_id: mensagemId, usuario_id: usuarioId }, { onConflict: 'mensagem_id,usuario_id' });
  if (error) throw error;
}
