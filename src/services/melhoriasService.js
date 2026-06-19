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
// Conta melhorias que requerem ação do admin — exclui já concluídas
// e não-aprovadas (que estão "fechadas" na visão do admin).
export async function contarAbertasAdmin() {
  const { count, error } = await supabase
    .from('cci_melhorias')
    .select('*', { count: 'exact', head: true })
    .not('status', 'in', '(concluida,nao_aprovada)');
  if (error) throw error;
  return count || 0;
}

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

// ─── Anexos (imagens, PDFs etc) ────────────────────────────────
export const MAX_ANEXO_BYTES = 5 * 1024 * 1024;       // 5 MB
export const MAX_ANEXOS_POR_MELHORIA = 3;
const BUCKET = 'melhorias';

function sanitizarNomeArquivo(nome) {
  return (nome || 'arquivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sem acentos
    .replace(/[^a-zA-Z0-9._-]/g, '-')                   // só ASCII seguro
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export async function listarAnexos(melhoriaId) {
  if (!melhoriaId) return [];
  const { data, error } = await supabase
    .from('cci_melhorias_anexos')
    .select('*')
    .eq('melhoria_id', melhoriaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function uploadAnexo({ melhoriaId, file, autor, autorTipo }) {
  if (!melhoriaId) throw new Error('melhoria_id obrigatório.');
  if (!file)       throw new Error('Arquivo inválido.');
  if (file.size > MAX_ANEXO_BYTES) {
    throw new Error(`Arquivo "${file.name}" passa de 5MB.`);
  }

  // Limite de 3 por melhoria — confere no banco antes.
  const atuais = await listarAnexos(melhoriaId);
  if (atuais.length >= MAX_ANEXOS_POR_MELHORIA) {
    throw new Error(`Limite de ${MAX_ANEXOS_POR_MELHORIA} anexos por solicitação atingido.`);
  }

  const path = `${melhoriaId}/${crypto.randomUUID()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (errUp) throw errUp;

  const payload = {
    melhoria_id:   melhoriaId,
    storage_path:  path,
    nome_original: file.name,
    tamanho_bytes: file.size,
    tipo_mime:     file.type || null,
    autor_id:      autor?.id   || null,
    autor_nome:    autor?.nome || null,
    autor_tipo:    autorTipo === 'admin' ? 'admin' : 'cliente',
  };
  const { data, error } = await supabase
    .from('cci_melhorias_anexos')
    .insert(payload)
    .select()
    .single();
  if (error) {
    // rollback do storage se inserção falhar
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

// URL temporária pra download/preview (1 hora).
export async function obterUrlAnexo(storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function excluirAnexo(anexo) {
  if (!anexo?.id) throw new Error('anexo inválido.');
  await supabase.storage.from(BUCKET).remove([anexo.storage_path]).catch(() => {});
  const { error } = await supabase
    .from('cci_melhorias_anexos')
    .delete()
    .eq('id', anexo.id);
  if (error) throw error;
}

export function formatarTamanho(bytes) {
  if (bytes == null) return '';
  const KB = 1024, MB = KB * 1024;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${bytes} B`;
}
