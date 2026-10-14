// Tarefas — rotinas de trabalho dos funcionários dos clientes (migration 192).
// GESTOR = CCI (admin): rotinas, tarefas avulsas, edição, cancelamento e
// VALIDAÇÃO da conclusão. FUNCIONÁRIO (portal do cliente, permissão 'tarefas'):
// vê e executa só as próprias tarefas. As regras ficam no banco (RLS + gatilhos);
// aqui é só acesso a dados.

import { supabase } from '../lib/supabase';
import * as usuariosService from './usuariosSistemaService';

const BUCKET = 'tarefas-evidencias';
const COLS_TAREFA = `id, cliente_id, chave_api_id, as_rede_id, setor_id, rotina_id, responsavel_id, titulo, descricao,
  status, prioridade, vence_em, dia_rotina, exige_evidencia, documentos, iniciada_em, enviada_em, concluida_em,
  referencia_tipo, referencia_data,
  validada_por_nome, created_at,
  cliente:clientes(id, nome, razao_social),
  setor:cci_tarefa_setor(id, nome),
  responsavel:cci_usuarios_sistema(id, nome),
  checklist:cci_tarefa_checklist(id, feito),
  evidencias:cci_tarefa_evidencia(id, tipo, documento),
  pedidos:cci_tarefa_pedido(id, tipo, status)`;

// ─── Setores ────────────────────────────────────────────────────
export async function listarSetores({ apenasAtivos = false } = {}) {
  let q = supabase.from('cci_tarefa_setor').select('*').order('ordem').order('nome');
  if (apenasAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function salvarSetor(setor) {
  const { id, ...campos } = setor;
  const q = id ? supabase.from('cci_tarefa_setor').update(campos).eq('id', id)
               : supabase.from('cci_tarefa_setor').insert(campos);
  const { error } = await q;
  if (error) throw error;
}

// ─── Responsáveis (funcionários do cliente com a permissão 'tarefas') ──
export async function listarResponsaveis(cliente) {
  if (!cliente) return [];
  const users = await usuariosService.listarUsuariosDaRede({
    chave_api_id: cliente.chave_api_id || null, as_rede_id: cliente.as_rede_id || null,
  });
  return users.filter(u => u.status === 'ativo'
    && (u.permissoes || []).includes('tarefas')
    && (!Array.isArray(u.empresas_permitidas) || u.empresas_permitidas.length === 0
        || u.empresas_permitidas.includes(cliente.id)));
}

// Responsáveis possíveis de várias empresas de uma vez (uma consulta por rede).
// Retorna { clienteId: [usuários] }.
export async function listarResponsaveisPorClientes(clientes) {
  const porRede = new Map();
  clientes.forEach(c => {
    const k = `${c.chave_api_id || ''}|${c.as_rede_id || ''}`;
    if (!porRede.has(k)) porRede.set(k, { chave_api_id: c.chave_api_id || null, as_rede_id: c.as_rede_id || null, clientes: [] });
    porRede.get(k).clientes.push(c);
  });
  const mapa = {};
  await Promise.all([...porRede.values()].map(async g => {
    const users = (await usuariosService.listarUsuariosDaRede({ chave_api_id: g.chave_api_id, as_rede_id: g.as_rede_id }))
      .filter(u => u.status === 'ativo' && (u.permissoes || []).includes('tarefas'));
    g.clientes.forEach(c => {
      mapa[c.id] = users.filter(u => !Array.isArray(u.empresas_permitidas) || u.empresas_permitidas.length === 0
        || u.empresas_permitidas.includes(c.id));
    });
  }));
  return mapa;
}

// Duplicar rotina para outras empresas: cópias SEM responsável; empresas que já
// têm uma rotina com o mesmo nome são ignoradas. Retorna quantas criou.
export async function duplicarRotina(rotina, clienteIds, rotinasExistentes = []) {
  const nome = rotina.nome.trim().toLowerCase();
  const alvo = clienteIds.filter(id => id !== rotina.cliente_id
    && !rotinasExistentes.some(r => r.cliente_id === id && r.nome.trim().toLowerCase() === nome));
  const { id: _id, criado_por: _cp, ...base } = rotina;
  for (const clienteId of alvo) {
    await salvarRotina({ ...base, cliente_id: clienteId, responsavel_id: null, ativa: true, data_inicio: hojeYmdLocal() });
  }
  return alvo.length;
}
const hojeYmdLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Rotinas (só CCI) ───────────────────────────────────────────
export async function listarRotinas({ clienteId } = {}) {
  let q = supabase.from('cci_rotina')
    .select('*, cliente:clientes(id, nome, razao_social), setor:cci_tarefa_setor(id, nome), responsavel:cci_usuarios_sistema(id, nome)')
    .order('nome');
  if (clienteId) q = q.eq('cliente_id', clienteId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function salvarRotina(rotina) {
  const { id, cliente: _c, setor: _s, responsavel: _r, created_at: _ca, updated_at: _u, chave_api_id: _k, as_rede_id: _a, ...campos } = rotina;
  ['setor_id', 'responsavel_id'].forEach(k => { if (!campos[k]) campos[k] = null; });
  const q = id ? supabase.from('cci_rotina').update(campos).eq('id', id)
               : supabase.from('cci_rotina').insert(campos);
  const { error } = await q;
  if (error) throw error;
}
export async function excluirRotina(id) {
  // Tarefas já geradas ficam (rotina_id vira null) — histórico preservado.
  const { error } = await supabase.from('cci_rotina').delete().eq('id', id);
  if (error) throw error;
}

// ─── Tarefas ────────────────────────────────────────────────────
// Admin: todas (filtros). Cliente: o RLS já devolve só as do usuário.
export async function listarTarefas({ clienteId, de, ate, status } = {}) {
  let q = supabase.from('cci_tarefa').select(COLS_TAREFA).order('vence_em', { ascending: true });
  if (clienteId) q = q.eq('cliente_id', clienteId);
  if (de) q = q.gte('vence_em', `${de}T00:00:00-03:00`);
  if (ate) q = q.lte('vence_em', `${ate}T23:59:59-03:00`);
  if (status?.length) q = q.in('status', status);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data || [];
}

// Abertas fora do período (atrasadas antigas / aguardando validação) — o
// funcionário e a CCI precisam vê-las mesmo com o filtro de datas.
export async function listarPendentesAntigas({ clienteId, antesDe } = {}) {
  let q = supabase.from('cci_tarefa').select(COLS_TAREFA)
    .in('status', ['a_fazer', 'em_andamento', 'aguardando_validacao'])
    .lt('vence_em', `${antesDe}T00:00:00-03:00`);
  if (clienteId) q = q.eq('cliente_id', clienteId);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  return data || [];
}

export async function buscarTarefa(id) {
  const { data, error } = await supabase.from('cci_tarefa')
    .select(`*, cliente:clientes(id, nome, razao_social, chave_api_id, as_rede_id),
      setor:cci_tarefa_setor(id, nome), responsavel:cci_usuarios_sistema(id, nome)`)
    .eq('id', id).single();
  if (error) throw error;
  const [ck, ev, hist, ped] = await Promise.all([
    supabase.from('cci_tarefa_checklist').select('*').eq('tarefa_id', id).order('ordem'),
    supabase.from('cci_tarefa_evidencia').select('*').eq('tarefa_id', id).order('criado_em'),
    supabase.from('cci_tarefa_evento').select('*').eq('tarefa_id', id).order('criado_em', { ascending: false }),
    supabase.from('cci_tarefa_pedido').select('*').eq('tarefa_id', id).order('criado_em', { ascending: false }),
  ]);
  for (const r of [ck, ev, hist, ped]) if (r.error) throw r.error;
  return { ...data, checklist: ck.data || [], evidencias: ev.data || [], eventos: hist.data || [], pedidos: ped.data || [] };
}

// Tarefa avulsa (CCI) + itens de checklist.
export async function criarTarefa({ checklist = [], ...campos }) {
  ['setor_id', 'responsavel_id'].forEach(k => { if (!campos[k]) campos[k] = null; });
  const { data, error } = await supabase.from('cci_tarefa').insert(campos).select('id').single();
  if (error) throw error;
  const itens = checklist.map(s => String(s).trim()).filter(Boolean);
  if (itens.length) {
    const { error: e2 } = await supabase.from('cci_tarefa_checklist')
      .insert(itens.map((rotulo, ordem) => ({ tarefa_id: data.id, rotulo, ordem })));
    if (e2) throw e2;
  }
  return data;
}

export async function atualizarTarefa(id, campos) {
  const { error } = await supabase.from('cci_tarefa').update(campos).eq('id', id);
  if (error) throw error;
}
export const alterarStatus = (id, status) => atualizarTarefa(id, { status });

export async function validarTarefa(id, aprovar, motivo = null) {
  const { error } = await supabase.rpc('cci_tarefa_validar', { p_tarefa: id, p_aprovar: aprovar, p_motivo: motivo });
  if (error) throw error;
}

// ─── Checklist ──────────────────────────────────────────────────
export async function marcarChecklist(itemId, feito) {
  const { error } = await supabase.from('cci_tarefa_checklist').update({ feito }).eq('id', itemId);
  if (error) throw error;
}
export async function adicionarChecklist(tarefaId, rotulo, ordem) {
  const { error } = await supabase.from('cci_tarefa_checklist').insert({ tarefa_id: tarefaId, rotulo, ordem });
  if (error) throw error;
}
export async function removerChecklist(itemId) {
  const { error } = await supabase.from('cci_tarefa_checklist').delete().eq('id', itemId);
  if (error) throw error;
}

// ─── Evidências e comentários ──────────────────────────────────
// Fotos são reduzidas (JPEG até 1600px) antes de subir.
async function comprimirImagem(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file;
  try {
    const bmp = await createImageBitmap(file);
    const esc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * esc);
    canvas.height = Math.round(bmp.height * esc);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export async function anexarEvidencia(tarefaId, arquivo, documento = null) {
  const file = await comprimirImagem(arquivo);
  if (file.size > 15 * 1024 * 1024) throw new Error('Arquivo maior que 15 MB.');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${tarefaId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (up.error) throw new Error('Falha no envio do arquivo: ' + up.error.message);
  const { error } = await supabase.from('cci_tarefa_evidencia').insert({
    tarefa_id: tarefaId, tipo: file.type.startsWith('image/') ? 'foto' : 'documento',
    nome: arquivo.name, storage_path: path, tamanho: file.size, documento,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

export async function comentar(tarefaId, texto) {
  const { error } = await supabase.from('cci_tarefa_evidencia').insert({ tarefa_id: tarefaId, tipo: 'comentario', conteudo: texto });
  if (error) throw error;
}

export async function removerEvidencia(ev) {
  const { error } = await supabase.from('cci_tarefa_evidencia').delete().eq('id', ev.id);
  if (error) throw error;
  if (ev.storage_path) await supabase.storage.from(BUCKET).remove([ev.storage_path]).catch(() => {});
}

export async function urlEvidencia(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

// ─── Pedidos de mais prazo / reabertura ───────────────────────────
// Funcionário pede (motivo ≥ 10 caracteres); só a CCI decide.
export async function solicitarPedido(tarefaId, tipo, motivo, prazo = null) {
  const { error } = await supabase.rpc('cci_tarefa_solicitar', {
    p_tarefa: tarefaId, p_tipo: tipo, p_motivo: motivo, p_prazo: prazo,
  });
  if (error) throw error;
}

export async function decidirPedido(pedidoId, aprovar, resposta = null, prazo = null) {
  const { error } = await supabase.rpc('cci_tarefa_decidir_pedido', {
    p_pedido: pedidoId, p_aprovar: aprovar, p_resposta: resposta, p_prazo: prazo,
  });
  if (error) throw error;
}

// Pedidos pendentes (CCI) com a tarefa.
export async function listarPedidosPendentes() {
  const { data, error } = await supabase.from('cci_tarefa_pedido')
    .select('*, tarefa:cci_tarefa(id, titulo, vence_em, cliente:clientes(id, nome, razao_social), responsavel:cci_usuarios_sistema(id, nome))')
    .eq('status', 'pendente').order('criado_em');
  if (error) throw error;
  return data || [];
}
