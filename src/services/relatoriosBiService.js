// CRUD de relatorios de BI (Power BI) cadastrados pela CCI por rede.
// Cada relatório pertence a UMA rede (Webposto via chave_api_id OU
// Autosystem via as_rede_id) e tem controle de acesso granular por
// usuário (cci_usuarios_sistema) via tabela ponte.
//
// Regra de visibilidade:
//   - Se o relatório NÃO tem usuários associados → visível a todos os
//     usuários daquela rede.
//   - Se tem 1+ usuários associados → visível só pra esses usuários.

import { supabase } from '../lib/supabase';

// ────────────────────────────────────────────────────────────────
// Listagens
// ────────────────────────────────────────────────────────────────

// Lista relatórios visíveis para um usuário cliente específico, dado
// sua rede (webposto OU autosystem) e seu id de usuário.
export async function listarParaCliente({ chave_api_id = null, as_rede_id = null, usuario_id = null }) {
  if (!chave_api_id && !as_rede_id) return [];

  let query = supabase
    .from('cliente_relatorios_bi')
    .select('*')
    .eq('ativo', true);
  if (chave_api_id) query = query.eq('chave_api_id', chave_api_id);
  if (as_rede_id)   query = query.eq('as_rede_id', as_rede_id);

  const { data: relatorios, error } = await query
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  if (!relatorios || relatorios.length === 0) return [];

  // Carrega o conjunto de (relatorio_id, usuario_id) pra essa lista
  const ids = relatorios.map(r => r.id);
  const { data: acessos, error: errAcesso } = await supabase
    .from('cliente_relatorios_bi_usuario')
    .select('relatorio_id, usuario_id')
    .in('relatorio_id', ids);
  if (errAcesso) throw errAcesso;

  // Mapa: relatorio_id → Set de usuario_ids permitidos
  const acessoPorRel = new Map();
  for (const a of acessos || []) {
    if (!acessoPorRel.has(a.relatorio_id)) acessoPorRel.set(a.relatorio_id, new Set());
    acessoPorRel.get(a.relatorio_id).add(a.usuario_id);
  }

  return relatorios.filter(r => {
    const permitidos = acessoPorRel.get(r.id);
    if (!permitidos || permitidos.size === 0) return true; // sem restrição
    return usuario_id && permitidos.has(usuario_id);
  });
}

// Lista TODOS os relatórios de uma rede (admin) — inclui inativos.
// Aceita chave_api_id OU as_rede_id.
export async function listarPorRede({ chave_api_id = null, as_rede_id = null }) {
  if (!chave_api_id && !as_rede_id) return [];
  let query = supabase.from('cliente_relatorios_bi').select('*');
  if (chave_api_id) query = query.eq('chave_api_id', chave_api_id);
  if (as_rede_id)   query = query.eq('as_rede_id', as_rede_id);
  const { data, error } = await query
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Lista todos os relatórios cadastrados (admin global). Faz JOIN com
// chaves_api e as_rede pra trazer o nome da rede de origem.
export async function listarTodos() {
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .select('*, chaves_api(id, nome), as_rede(id, nome)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ────────────────────────────────────────────────────────────────
// CRUD do relatório
// ────────────────────────────────────────────────────────────────

export async function criar({
  chave_api_id = null,
  as_rede_id = null,
  cliente_id = null,
  nome,
  descricao,
  link_publico,
  ordem = 0,
  ativo = true,
}) {
  if (!chave_api_id && !as_rede_id) {
    throw new Error('Selecione uma rede (Webposto ou Autosystem).');
  }
  if (chave_api_id && as_rede_id) {
    throw new Error('Relatório pertence a apenas uma rede.');
  }
  if (!nome) throw new Error('Nome do relatório é obrigatório.');
  if (!link_publico) throw new Error('Link público do BI é obrigatório.');

  const payload = {
    chave_api_id: chave_api_id || null,
    as_rede_id:   as_rede_id   || null,
    cliente_id:   cliente_id   || null,
    nome: nome.trim(),
    descricao: (descricao || '').trim() || null,
    link_publico: link_publico.trim(),
    ordem: Number(ordem) || 0,
    ativo: !!ativo,
  };
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function atualizar(id, campos) {
  if (!id) throw new Error('id obrigatório');
  const patch = {};
  if (campos.nome != null)            patch.nome = String(campos.nome).trim();
  if (campos.descricao !== undefined) patch.descricao = (campos.descricao || '').trim() || null;
  if (campos.link_publico != null)    patch.link_publico = String(campos.link_publico).trim();
  if (campos.ordem != null)           patch.ordem = Number(campos.ordem) || 0;
  if (campos.ativo != null)           patch.ativo = !!campos.ativo;
  if (campos.cliente_id !== undefined)   patch.cliente_id   = campos.cliente_id   || null;
  if (campos.chave_api_id !== undefined) patch.chave_api_id = campos.chave_api_id || null;
  if (campos.as_rede_id !== undefined)   patch.as_rede_id   = campos.as_rede_id   || null;
  const { data, error } = await supabase
    .from('cliente_relatorios_bi')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function excluir(id) {
  if (!id) throw new Error('id obrigatório');
  const { error } = await supabase.from('cliente_relatorios_bi').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// Acesso por usuário (cci_usuarios_sistema, tipo='cliente')
// ────────────────────────────────────────────────────────────────

// Retorna a lista de usuário_ids com acesso a um relatório específico.
export async function listarUsuariosDoRelatorio(relatorioId) {
  if (!relatorioId) return [];
  const { data, error } = await supabase
    .from('cliente_relatorios_bi_usuario')
    .select('usuario_id')
    .eq('relatorio_id', relatorioId);
  if (error) throw error;
  return (data || []).map(r => r.usuario_id);
}

// Define o conjunto de usuários com acesso (replace all). Array vazio
// remove todas as restrições → relatório vira público pra rede.
export async function definirUsuariosDoRelatorio(relatorioId, usuarioIds) {
  if (!relatorioId) throw new Error('relatorio_id obrigatório');
  const ids = Array.from(new Set((usuarioIds || []).filter(Boolean)));

  // Apaga existentes
  const { error: errDel } = await supabase
    .from('cliente_relatorios_bi_usuario')
    .delete()
    .eq('relatorio_id', relatorioId);
  if (errDel) throw errDel;

  if (ids.length === 0) return;

  const payload = ids.map(usuario_id => ({ relatorio_id: relatorioId, usuario_id }));
  const { error: errIns } = await supabase
    .from('cliente_relatorios_bi_usuario')
    .insert(payload);
  if (errIns) throw errIns;
}

// Lista usuários cliente de uma rede (Webposto ou Autosystem) — pra
// popular o multi-select de acesso no admin. O campo é `status`
// (valores 'ativo' / 'inativo'), não `ativo`.
export async function listarUsuariosDaRede({ chave_api_id = null, as_rede_id = null }) {
  if (!chave_api_id && !as_rede_id) return [];
  let query = supabase
    .from('cci_usuarios_sistema')
    .select('id, nome, email, status, tipo')
    .eq('tipo', 'cliente');
  if (chave_api_id) query = query.eq('chave_api_id', chave_api_id);
  if (as_rede_id)   query = query.eq('as_rede_id', as_rede_id);
  const { data, error } = await query.order('nome', { ascending: true });
  if (error) throw error;
  // Normaliza pra compat com o componente (ativo bool derivado de status)
  return (data || []).map(u => ({ ...u, ativo: u.status !== 'inativo' }));
}
