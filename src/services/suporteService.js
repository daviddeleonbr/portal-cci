// Chat de suporte CCI — conversas e mensagens.
//
// Modelo:
//   - cci_suporte_conversa: cada "ticket" (assunto + status + categoria)
//   - cci_suporte_mensagem: timeline de mensagens (texto, anexo, evento)
//
// Realtime: o componente assina `cci_suporte_conversa` e
// `cci_suporte_mensagem` via supabase.channel() — não há polling.

import { supabase } from '../lib/supabase';

const BUCKET = 'suporte-anexos';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const CATEGORIAS = [
  { key: 'geral',       label: 'Geral' },
  { key: 'financeiro',  label: 'Financeiro' },
  { key: 'comercial',   label: 'Comercial' },
  { key: 'tecnico',     label: 'Técnico' },
  { key: 'bpo',         label: 'BPO' },
];

export const PRIORIDADES = [
  { key: 'normal',  label: 'Normal',  cor: 'slate' },
  { key: 'alta',    label: 'Alta',    cor: 'amber' },
  { key: 'urgente', label: 'Urgente', cor: 'rose'  },
];

export const STATUS = [
  { key: 'aberta',              label: 'Aberta',          cor: 'blue'    },
  { key: 'em_andamento',        label: 'Em andamento',    cor: 'violet'  },
  { key: 'aguardando_cliente',  label: 'Aguardando você', cor: 'amber'   },
  { key: 'resolvida',           label: 'Resolvida',       cor: 'emerald' },
  { key: 'fechada',             label: 'Fechada',         cor: 'gray'    },
];

// ─── Listagem ─────────────────────────────────────────────

// Conversas do USUÁRIO cliente atual (lista lateral do cliente).
export async function listarConversasCliente(usuarioId) {
  if (!usuarioId) return [];
  const { data, error } = await supabase
    .from('cci_suporte_conversa')
    .select('*')
    .eq('usuario_cliente_id', usuarioId)
    .order('ultima_mensagem_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Conversas no ADMIN: aplica filtros opcionais (status, rede, atribuição).
export async function listarConversasAdmin({ status, asRedeId, chaveApiId, adminAtribuidoId, busca } = {}) {
  let q = supabase
    .from('cci_suporte_conversa')
    .select(`
      *,
      usuario:cci_usuarios_sistema!cci_suporte_conversa_usuario_cliente_id_fkey(id,nome,email,tipo),
      as_rede(id,nome),
      chaves_api(id,nome),
      cliente:clientes(id,nome,cnpj),
      admin:cci_usuarios_sistema!cci_suporte_conversa_admin_atribuido_id_fkey(id,nome)
    `)
    .order('ultima_mensagem_em', { ascending: false });
  if (status)            q = q.eq('status', status);
  if (asRedeId)          q = q.eq('as_rede_id', asRedeId);
  if (chaveApiId)        q = q.eq('chave_api_id', chaveApiId);
  if (adminAtribuidoId)  q = q.eq('admin_atribuido_id', adminAtribuidoId);
  const { data, error } = await q;
  if (error) throw error;
  let lista = data || [];
  if (busca) {
    const k = String(busca).toLowerCase();
    lista = lista.filter(c =>
      (c.assunto || '').toLowerCase().includes(k) ||
      (c.usuario?.nome || '').toLowerCase().includes(k) ||
      (c.cliente?.nome || '').toLowerCase().includes(k) ||
      (c.as_rede?.nome || '').toLowerCase().includes(k),
    );
  }
  return lista;
}

export async function obterConversa(id) {
  const { data, error } = await supabase
    .from('cci_suporte_conversa')
    .select(`
      *,
      usuario:cci_usuarios_sistema!cci_suporte_conversa_usuario_cliente_id_fkey(id,nome,email),
      as_rede(id,nome),
      chaves_api(id,nome),
      cliente:clientes(id,nome,cnpj)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function listarMensagens(conversaId) {
  if (!conversaId) return [];
  const { data, error } = await supabase
    .from('cci_suporte_mensagem')
    .select(`
      *,
      autor:cci_usuarios_sistema(id,nome,email,tipo)
    `)
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ─── Criação / mutação ────────────────────────────────────

export async function criarConversa({
  usuarioClienteId, asRedeId, chaveApiId, clienteId,
  assunto, categoria = 'geral', prioridade = 'normal',
  textoInicial,
}) {
  if (!usuarioClienteId) throw new Error('usuário cliente é obrigatório');
  if (!assunto?.trim())  throw new Error('Informe um assunto');
  if (!textoInicial?.trim()) throw new Error('Escreva a primeira mensagem');

  const { data: conversa, error: e1 } = await supabase
    .from('cci_suporte_conversa')
    .insert({
      usuario_cliente_id: usuarioClienteId,
      as_rede_id:   asRedeId   ?? null,
      chave_api_id: chaveApiId ?? null,
      cliente_id:   clienteId  ?? null,
      assunto: assunto.trim(),
      categoria, prioridade,
      status: 'aberta',
    })
    .select()
    .single();
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('cci_suporte_mensagem')
    .insert({
      conversa_id: conversa.id,
      autor_id: usuarioClienteId,
      autor_tipo: 'cliente',
      texto: textoInicial.trim(),
    });
  if (e2) throw e2;

  return conversa;
}

export async function enviarMensagem({ conversaId, autorId, autorTipo, texto, arquivo }) {
  if (!conversaId) throw new Error('conversaId obrigatório');
  if (!autorId)    throw new Error('autorId obrigatório');
  if (!texto?.trim() && !arquivo) throw new Error('Mensagem vazia');

  // Claim do atendimento: quando admin responde, ele "trava" a conversa
  // pra si. Outros admins não conseguem mais responder. Cliente é sempre
  // dono natural da conversa (não precisa claim).
  if (autorTipo === 'admin') {
    const { data: conv, error: errConv } = await supabase
      .from('cci_suporte_conversa')
      .select('admin_atribuido_id, status')
      .eq('id', conversaId)
      .single();
    if (errConv) throw errConv;
    if (conv.admin_atribuido_id && conv.admin_atribuido_id !== autorId) {
      throw new Error('Esta conversa já está sendo atendida por outro admin.');
    }
    if (!conv.admin_atribuido_id) {
      // Primeiro admin a responder claima a conversa + muda status pra em_andamento.
      const patch = { admin_atribuido_id: autorId, atualizada_em: new Date().toISOString() };
      if (conv.status === 'aberta') patch.status = 'em_andamento';
      await supabase
        .from('cci_suporte_conversa')
        .update(patch)
        .eq('id', conversaId)
        .is('admin_atribuido_id', null); // race-safe: só atualiza se ainda null
    }
  }

  let arquivoPath, arquivoNome, arquivoTipo, arquivoTamanho;
  if (arquivo) {
    if (arquivo.size > MAX_BYTES) throw new Error('Anexo maior que 10 MB');
    const safe = String(arquivo.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${conversaId}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
    if (upErr) throw upErr;
    arquivoPath = path;
    arquivoNome = arquivo.name;
    arquivoTipo = arquivo.type || null;
    arquivoTamanho = arquivo.size;
  }

  const { data, error } = await supabase
    .from('cci_suporte_mensagem')
    .insert({
      conversa_id: conversaId,
      autor_id: autorId,
      autor_tipo: autorTipo, // 'cliente' | 'admin'
      texto: texto?.trim() || null,
      arquivo_path: arquivoPath, arquivo_nome: arquivoNome,
      arquivo_tipo: arquivoTipo, arquivo_tamanho: arquivoTamanho,
    })
    .select()
    .single();
  if (error) {
    // rollback do storage
    if (arquivoPath) supabase.storage.from(BUCKET).remove([arquivoPath]).catch(() => {});
    throw error;
  }

  // Se a conversa estava "aguardando cliente" e o cliente respondeu,
  // volta pra "em_andamento". Mesmo pra "resolvida"/"fechada" se o
  // cliente responder → reabre como "em_andamento".
  if (autorTipo === 'cliente') {
    await supabase
      .from('cci_suporte_conversa')
      .update({ status: 'em_andamento', atualizada_em: new Date().toISOString() })
      .eq('id', conversaId)
      .in('status', ['aguardando_cliente', 'resolvida']);
  }

  return data;
}

// Edita o texto de uma mensagem já enviada. Janela de 5 minutos após o
// envio. Mensagens-evento de sistema e anexos sem texto não podem ser
// editados. Marca `editada_em` pra a UI mostrar o badge.
export const JANELA_EDICAO_SEG = 5 * 60;

export async function editarMensagem({ mensagemId, autorId, novoTexto }) {
  if (!mensagemId) throw new Error('mensagemId obrigatório');
  if (!autorId)    throw new Error('autorId obrigatório');
  const txt = String(novoTexto || '').trim();
  if (!txt) throw new Error('Mensagem vazia');

  const { data: msg, error: errLer } = await supabase
    .from('cci_suporte_mensagem')
    .select('id, autor_id, autor_tipo, texto, created_at')
    .eq('id', mensagemId)
    .single();
  if (errLer) throw errLer;
  if (msg.autor_id !== autorId) throw new Error('Você só pode editar suas próprias mensagens.');
  if (msg.autor_tipo === 'sistema') throw new Error('Mensagens de sistema não podem ser editadas.');
  const idadeSeg = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
  if (idadeSeg > JANELA_EDICAO_SEG) {
    throw new Error('O prazo de 5 minutos pra editar esta mensagem expirou.');
  }
  if (msg.texto === txt) return msg; // no-op

  const { data: atualizada, error } = await supabase
    .from('cci_suporte_mensagem')
    .update({ texto: txt, editada_em: new Date().toISOString() })
    .eq('id', mensagemId)
    .eq('autor_id', autorId)
    .select(`*, autor:cci_usuarios_sistema(id,nome,email,tipo)`)
    .single();
  if (error) throw error;
  return atualizada;
}

export async function urlAssinada(arquivoPath, expiresSec = 300) {
  if (!arquivoPath) return null;
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(arquivoPath, expiresSec);
  if (error) throw error;
  return data?.signedUrl || null;
}

// ─── Status / ações admin ────────────────────────────────

export async function alterarStatus({ conversaId, novoStatus, adminId, adminNome }) {
  if (!['em_andamento','aguardando_cliente','resolvida','fechada','aberta'].includes(novoStatus)) {
    throw new Error('Status inválido');
  }
  // Só o admin atribuído pode alterar (ou claima se ainda não atribuída).
  const { data: conv } = await supabase
    .from('cci_suporte_conversa')
    .select('admin_atribuido_id')
    .eq('id', conversaId)
    .single();
  if (conv?.admin_atribuido_id && conv.admin_atribuido_id !== adminId) {
    throw new Error('Esta conversa está atribuída a outro admin.');
  }
  const patch = { status: novoStatus, atualizada_em: new Date().toISOString() };
  if (!conv?.admin_atribuido_id) patch.admin_atribuido_id = adminId;
  if (novoStatus === 'resolvida') {
    patch.resolvida_em = new Date().toISOString();
    patch.resolvida_por_id = adminId || null;
  }
  if (novoStatus === 'fechada') patch.fechada_em = new Date().toISOString();
  const { error } = await supabase
    .from('cci_suporte_conversa')
    .update(patch)
    .eq('id', conversaId);
  if (error) throw error;
  // Mensagem-evento na timeline (transparente no histórico).
  await supabase.from('cci_suporte_mensagem').insert({
    conversa_id: conversaId,
    autor_id: adminId,
    autor_tipo: 'sistema',
    evento: `status:${novoStatus}`,
    texto: `${adminNome || 'Admin'} alterou o status para "${STATUS.find(s => s.key === novoStatus)?.label || novoStatus}".`,
  });
}

export async function alterarPrioridade({ conversaId, prioridade, adminId }) {
  if (adminId) {
    const { data: conv } = await supabase
      .from('cci_suporte_conversa')
      .select('admin_atribuido_id')
      .eq('id', conversaId)
      .single();
    if (conv?.admin_atribuido_id && conv.admin_atribuido_id !== adminId) {
      throw new Error('Esta conversa está atribuída a outro admin.');
    }
  }
  const { error } = await supabase
    .from('cci_suporte_conversa')
    .update({ prioridade, atualizada_em: new Date().toISOString() })
    .eq('id', conversaId);
  if (error) throw error;
}

export async function atribuirAdmin({ conversaId, adminId }) {
  const { error } = await supabase
    .from('cci_suporte_conversa')
    .update({ admin_atribuido_id: adminId || null, atualizada_em: new Date().toISOString() })
    .eq('id', conversaId);
  if (error) throw error;
}

// Zera contador do lado especificado e marca lidas as mensagens.
export async function marcarComoLido({ conversaId, lado }) {
  if (!conversaId || !['cliente', 'admin'].includes(lado)) return;
  const campo = lado === 'cliente' ? 'nao_lidas_cliente' : 'nao_lidas_admin';
  await supabase
    .from('cci_suporte_conversa')
    .update({ [campo]: 0 })
    .eq('id', conversaId);
  // Marca como lidas as mensagens que o OUTRO lado enviou.
  const tipoOposto = lado === 'cliente' ? 'admin' : 'cliente';
  await supabase
    .from('cci_suporte_mensagem')
    .update({ lida_em: new Date().toISOString() })
    .eq('conversa_id', conversaId)
    .eq('autor_tipo', tipoOposto)
    .is('lida_em', null);
}

// ─── Realtime helpers ────────────────────────────────────

// Assina mudanças em UMA conversa: novas mensagens + atualizações
// da própria conversa (status, atribuição, prioridade). Retorna o
// channel pra o componente fazer unsubscribe no cleanup.
export function escutarConversa({ conversaId, onMensagem, onConversa, onMensagemAtualizada }) {
  if (!conversaId) return null;
  const ch = supabase.channel(`suporte:conversa:${conversaId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'cci_suporte_mensagem',
      filter: `conversa_id=eq.${conversaId}`,
    }, async (payload) => {
      // Re-busca a mensagem com o join do autor pra ter nome
      const { data } = await supabase
        .from('cci_suporte_mensagem')
        .select(`*, autor:cci_usuarios_sistema(id,nome,email,tipo)`)
        .eq('id', payload.new.id)
        .single();
      if (data && onMensagem) onMensagem(data);
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'cci_suporte_mensagem',
      filter: `conversa_id=eq.${conversaId}`,
    }, async (payload) => {
      // Edição ou marcação de lida — atualiza in-place
      if (onMensagemAtualizada) onMensagemAtualizada(payload.new);
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'cci_suporte_conversa',
      filter: `id=eq.${conversaId}`,
    }, (payload) => {
      if (onConversa) onConversa(payload.new);
    })
    .subscribe();
  return ch;
}

// Assina TODAS as conversas de um usuário (sidebar do cliente) ou
// mudanças globais (sidebar do admin). Aplica o filtro do lado do front.
export function escutarLista({ usuarioClienteId, onChange }) {
  const ch = supabase.channel(usuarioClienteId
    ? `suporte:lista:cliente:${usuarioClienteId}`
    : 'suporte:lista:admin')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cci_suporte_conversa',
    }, (payload) => {
      const row = payload.new || payload.old;
      if (usuarioClienteId && row?.usuario_cliente_id !== usuarioClienteId) return;
      onChange?.(payload);
    })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'cci_suporte_mensagem',
    }, (payload) => {
      onChange?.(payload);
    })
    .subscribe();
  return ch;
}

export function desescutar(channel) {
  if (channel) supabase.removeChannel(channel);
}
