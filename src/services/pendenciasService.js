// CRUD de pendências CCI ↔ cliente.
//
// Pendência = assunto criado pelo admin que o cliente precisa responder
// ou tomar ciência. Aparece como notificação no portal do cliente dentro
// de uma janela de tempo configurada. Fica aberta até o admin marcar como
// resolvida.

import { supabase } from '../lib/supabase';

export const PRIORIDADES = [
  { key: 'alta',  label: 'Alta',  cor: 'rose'    },
  { key: 'media', label: 'Média', cor: 'amber'   },
  { key: 'baixa', label: 'Baixa', cor: 'emerald' },
];

// ─── Admin: CRUD ─────────────────────────────────────────────

export async function listarPendencias({ status = null, chaveApiId = null, clienteId = null } = {}) {
  let q = supabase
    .from('cci_pendencias')
    .select(`
      *,
      chave_api:chaves_api!cci_pendencias_chave_api_id_fkey ( id, nome ),
      cliente:clientes!cci_pendencias_cliente_id_fkey       ( id, nome ),
      criada_por_usuario:cci_usuarios_sistema!cci_pendencias_criada_por_fkey   ( id, nome ),
      resolvida_por_usuario:cci_usuarios_sistema!cci_pendencias_resolvida_por_fkey ( id, nome )
    `)
    .order('criada_em', { ascending: false });
  if (status)     q = q.eq('status', status);
  if (chaveApiId) q = q.eq('chave_api_id', chaveApiId);
  if (clienteId)  q = q.eq('cliente_id', clienteId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function criarPendencia(payload) {
  const { titulo, descricao, prioridade, chaveApiId, clienteId, mostrarApos, mostrarAte, recorrencia, criadaPor } = payload;
  if (!titulo)      throw new Error('Título obrigatório.');
  if (!chaveApiId && !clienteId) throw new Error('Selecione uma rede OU um cliente.');
  if (!['alta', 'media', 'baixa'].includes(prioridade)) throw new Error('Prioridade inválida.');

  const { data, error } = await supabase
    .from('cci_pendencias')
    .insert({
      titulo,
      descricao:    descricao || null,
      prioridade,
      chave_api_id: chaveApiId || null,
      cliente_id:   clienteId  || null,
      mostrar_apos: mostrarApos || null,
      mostrar_ate:  mostrarAte  || null,
      recorrencia:  recorrencia || null,
      criada_por:   criadaPor   || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarPendencia(id, payload) {
  const update = {};
  if (payload.titulo      !== undefined) update.titulo       = payload.titulo;
  if (payload.descricao   !== undefined) update.descricao    = payload.descricao;
  if (payload.prioridade  !== undefined) update.prioridade   = payload.prioridade;
  if (payload.mostrarApos !== undefined) update.mostrar_apos = payload.mostrarApos || null;
  if (payload.mostrarAte  !== undefined) update.mostrar_ate  = payload.mostrarAte  || null;
  if (payload.recorrencia !== undefined) update.recorrencia  = payload.recorrencia || null;
  const { data, error } = await supabase
    .from('cci_pendencias')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function resolverPendencia(id, usuarioId) {
  const { data, error } = await supabase
    .from('cci_pendencias')
    .update({
      status:        'resolvida',
      resolvida_em:  new Date().toISOString(),
      resolvida_por: usuarioId || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reabrirPendencia(id) {
  const { data, error } = await supabase
    .from('cci_pendencias')
    .update({
      status: 'aberta',
      resolvida_em:  null,
      resolvida_por: null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirPendencia(id) {
  const { error } = await supabase
    .from('cci_pendencias')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Respostas ────────────────────────────────────────────────

export async function listarRespostas(pendenciaId) {
  const { data, error } = await supabase
    .from('cci_pendencia_resposta')
    .select('*')
    .eq('pendencia_id', pendenciaId)
    .order('criada_em', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adicionarResposta({ pendenciaId, autorTipo, autorId, autorNome, texto }) {
  if (!pendenciaId) throw new Error('Pendência obrigatória.');
  if (!texto)       throw new Error('Texto obrigatório.');
  const { data, error } = await supabase
    .from('cci_pendencia_resposta')
    .insert({
      pendencia_id: pendenciaId,
      autor_tipo:   autorTipo,
      autor_id:     autorId   || null,
      autor_nome:   autorNome || null,
      texto,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Helpers de recorrência ──────────────────────────────────

export const RECORRENCIA_OPCOES = [
  { key: 'nenhuma',     label: 'Sem recorrência',     hint: 'Aparece 1x por sessão até ser resolvida' },
  { key: 'diaria',      label: 'Todos os dias',       hint: 'Reaparece todo dia que o cliente logar' },
  { key: 'dias_semana', label: 'Em dias da semana',   hint: 'Escolha quais dias (seg, ter, qua...)' },
  { key: 'intervalo',   label: 'A cada N dias',       hint: 'Reaparece N dias após a última exibição' },
];

export const DIAS_SEMANA = [
  { v: 0, label: 'Dom' }, { v: 1, label: 'Seg' }, { v: 2, label: 'Ter' },
  { v: 3, label: 'Qua' }, { v: 4, label: 'Qui' }, { v: 5, label: 'Sex' },
  { v: 6, label: 'Sáb' },
];

// Decide se a pendência DEVE aparecer agora dado seu padrão de recorrência
// e a data da última exibição pra esse cliente. `agora` = Date opcional.
function deveMostrar(pendencia, ultimaVisualizacaoIso, agora = new Date()) {
  const rec = pendencia.recorrencia;
  if (!rec || rec.tipo === 'nenhuma') {
    // Sem recorrência: aparece se nunca foi visualizada nessa sessão
    // (controle é via sessionStorage no front, não via BD)
    return true;
  }
  const ultima = ultimaVisualizacaoIso ? new Date(ultimaVisualizacaoIso) : null;
  const mesmaDataDia = (a, b) => a && b && a.toDateString() === b.toDateString();

  if (rec.tipo === 'diaria') {
    return !ultima || !mesmaDataDia(ultima, agora);
  }
  if (rec.tipo === 'dias_semana') {
    const dias = Array.isArray(rec.dias) ? rec.dias : [];
    if (!dias.includes(agora.getDay())) return false;
    return !ultima || !mesmaDataDia(ultima, agora);
  }
  if (rec.tipo === 'intervalo') {
    const dias = Math.max(1, Number(rec.dias) || 1);
    if (!ultima) return true; // 1ª vez
    const diff = (agora.getTime() - ultima.getTime()) / (24 * 60 * 60 * 1000);
    return diff >= dias;
  }
  return true;
}

// Resume a recorrência em texto curto pra UI
export function resumirRecorrencia(rec) {
  if (!rec || rec.tipo === 'nenhuma') return null;
  if (rec.tipo === 'diaria') return 'todos os dias';
  if (rec.tipo === 'dias_semana') {
    const dias = (rec.dias || []).map(v => DIAS_SEMANA.find(d => d.v === v)?.label).filter(Boolean);
    return dias.length ? dias.join(', ') : '—';
  }
  if (rec.tipo === 'intervalo') {
    const n = Number(rec.dias) || 1;
    return n === 1 ? 'todo dia' : `a cada ${n} dias`;
  }
  return null;
}

// ─── Cliente: lista pendências ATIVAS pra ele agora ─────────
//
// Critérios:
//   - status = 'aberta'
//   - escopo: chave_api_id = rede do cliente OU cliente_id = cliente
//   - mostrar_apos é null OU <= agora
//   - mostrar_ate  é null OU >= agora
//   - se recorrencia definida, aplica regra de "deve mostrar" baseada
//     na última visualização daquele cliente

// `clientesIds` é a LISTA COMPLETA de empresas vinculadas ao usuário
// cliente (= session.clientesRede.map(c => c.id)). Aceita também `clienteId`
// único (legado) — convertido pra array internamente.
export async function pendenciasAtivasParaCliente({ clienteId, clientesIds, chaveApiId }) {
  // Normaliza pra array (compat com chamadas antigas usando clienteId único)
  const idsClientes = Array.isArray(clientesIds) && clientesIds.length > 0
    ? clientesIds
    : (clienteId ? [clienteId] : []);
  if (idsClientes.length === 0 && !chaveApiId) return [];

  const agora = new Date().toISOString();
  const condEscopo = [];
  if (chaveApiId)            condEscopo.push(`chave_api_id.eq.${chaveApiId}`);
  if (idsClientes.length > 0) condEscopo.push(`cliente_id.in.(${idsClientes.join(',')})`);

  const { data, error } = await supabase
    .from('cci_pendencias')
    .select('*')
    .eq('status', 'aberta')
    .or(condEscopo.join(','))
    .or(`mostrar_apos.is.null,mostrar_apos.lte.${agora}`)
    .or(`mostrar_ate.is.null,mostrar_ate.gte.${agora}`);
  if (error) throw error;
  let lista = data || [];

  // Filtra por recorrência (precisa da última visualização)
  // Usa o PRIMEIRO cliente da lista como "identidade" pra rastreamento —
  // representa o usuário cliente logado. Pendências direcionadas a outras
  // empresas da mesma rede compartilham esse rastreio (1 view/cliente).
  const clienteIdRastreio = idsClientes[0] || null;
  if (clienteIdRastreio && lista.length > 0) {
    const ids = lista.map(p => p.id);
    const { data: visualizacoes } = await supabase
      .from('cci_pendencia_visualizacao')
      .select('pendencia_id, visualizada_em')
      .eq('cliente_id', clienteIdRastreio)
      .in('pendencia_id', ids);
    const mapaUltima = new Map((visualizacoes || []).map(v => [v.pendencia_id, v.visualizada_em]));
    lista = lista.filter(p => deveMostrar(p, mapaUltima.get(p.id)));
  } else {
    lista = lista.filter(p => deveMostrar(p, null));
  }

  const ord = { alta: 0, media: 1, baixa: 2 };
  return lista.sort((a, b) => (ord[a.prioridade] || 99) - (ord[b.prioridade] || 99));
}

// Marca pendência como visualizada pelo cliente AGORA. Usado quando o
// cliente abre/fecha o modal de pendências.
export async function registrarVisualizacao({ pendenciaId, clienteId }) {
  if (!pendenciaId || !clienteId) return;
  await supabase
    .from('cci_pendencia_visualizacao')
    .upsert({
      pendencia_id: pendenciaId,
      cliente_id:   clienteId,
      visualizada_em: new Date().toISOString(),
    }, { onConflict: 'pendencia_id,cliente_id' });
}
