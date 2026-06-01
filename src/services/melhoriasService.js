// Sugestões de melhorias e relatos de falha enviados pelos clientes.
// Cliente envia/acompanha em /cliente/<tipo>/melhorias.
// Admin acompanha/responde em /admin/melhorias.

import { supabase } from '../lib/supabase';

export const STATUS = [
  { key: 'em_analise',    label: 'Em análise',    cor: 'amber'   },
  { key: 'aprovada',      label: 'Aprovada',      cor: 'blue'    },
  { key: 'nao_aprovada',  label: 'Não aprovada',  cor: 'rose'    },
  { key: 'em_andamento',  label: 'Em andamento',  cor: 'indigo'  },
  { key: 'concluida',     label: 'Concluída',     cor: 'emerald' },
];

export const TIPOS = [
  { key: 'melhoria', label: 'Sugestão de melhoria' },
  { key: 'falha',    label: 'Relato de falha' },
];

// ─── Cliente ────────────────────────────────────────────────────

export async function listarMinhas(usuarioId) {
  if (!usuarioId) return [];
  const { data, error } = await supabase
    .from('cci_melhorias')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function criar({ usuario, tipo, titulo, descricao, contexto = {} }) {
  if (!usuario?.id) throw new Error('Sessão inválida.');
  if (!['melhoria', 'falha'].includes(tipo)) throw new Error('Tipo inválido.');
  if (!(titulo || '').trim()) throw new Error('Informe um título.');
  if (!(descricao || '').trim()) throw new Error('Descreva a sugestão ou falha.');

  const payload = {
    usuario_id: usuario.id,
    tipo,
    titulo: titulo.trim(),
    descricao: descricao.trim(),
    status: 'em_analise',
    chave_api_id: contexto.chave_api_id || null,
    as_rede_id:   contexto.as_rede_id   || null,
    empresa_id:   contexto.empresa_id   || null,
  };
  const { data, error } = await supabase
    .from('cci_melhorias')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Admin ──────────────────────────────────────────────────────

// Lista TODAS as solicitações, com info do remetente e rede.
export async function listarTodas() {
  const { data, error } = await supabase
    .from('cci_melhorias')
    .select(`
      *,
      usuario:cci_usuarios_sistema(id, nome, email),
      chaves_api(id, nome),
      as_rede(id, nome),
      empresa:clientes(id, nome, cnpj)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Muda o status e registra um comentário do admin no mesmo passo
// (mantém timeline coerente com cada mudança).
export async function atualizarStatus({ melhoriaId, novoStatus, statusAnterior, autor, comentario }) {
  if (!melhoriaId || !novoStatus) throw new Error('Parâmetros inválidos.');

  const { error: errUpd } = await supabase
    .from('cci_melhorias')
    .update({ status: novoStatus })
    .eq('id', melhoriaId);
  if (errUpd) throw errUpd;

  // Entrada na timeline (sempre que houver mudança de status).
  // Texto é opcional — quando o admin não escreve nada, registra só
  // a mudança de status sem mensagem.
  if (autor) {
    const { error: errIns } = await supabase
      .from('cci_melhorias_comentarios')
      .insert({
        melhoria_id: melhoriaId,
        autor_id: autor.id,
        autor_nome: autor.nome || null,
        autor_tipo: 'admin',
        texto: (comentario || '').trim(),
        status_anterior: statusAnterior || null,
        status_novo: novoStatus,
      });
    if (errIns) throw errIns;
  }
}

// ─── Comentários (ambos) ────────────────────────────────────────

export async function listarComentarios(melhoriaId) {
  if (!melhoriaId) return [];
  const { data, error } = await supabase
    .from('cci_melhorias_comentarios')
    .select('*')
    .eq('melhoria_id', melhoriaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adicionarComentario({ melhoriaId, autor, autorTipo, texto }) {
  if (!melhoriaId || !autor?.id) throw new Error('Parâmetros inválidos.');
  if (!(texto || '').trim()) throw new Error('Comentário vazio.');
  const { data, error } = await supabase
    .from('cci_melhorias_comentarios')
    .insert({
      melhoria_id: melhoriaId,
      autor_id: autor.id,
      autor_nome: autor.nome || null,
      autor_tipo: autorTipo === 'admin' ? 'admin' : 'cliente',
      texto: texto.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Helpers de UI
export function metaStatus(key) {
  return STATUS.find(s => s.key === key) || STATUS[0];
}
export function metaTipo(key) {
  return TIPOS.find(t => t.key === key) || TIPOS[0];
}
