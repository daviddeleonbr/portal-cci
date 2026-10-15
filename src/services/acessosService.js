// Acessos (login/senha/contrassenha) de adquirentes e outras plataformas do
// cliente — por empresa (cliente_id) ou para a rede toda (cliente_id null).
// O RLS (migration 197) limita o cliente à própria rede; excluir é só da CCI.

import { supabase } from '../lib/supabase';

export const CATEGORIAS_ACESSO = [
  { k: 'adquirente', rot: 'Adquirente' },
  { k: 'banco',      rot: 'Banco' },
  { k: 'sistema',    rot: 'Sistema / Plataforma' },
  { k: 'fornecedor', rot: 'Fornecedor' },
  { k: 'governo',    rot: 'Governo / Prefeitura' },
  { k: 'outro',      rot: 'Outro' },
];

const COLS = `id, cliente_id, chave_api_id, as_rede_id, plataforma, categoria, url, login, senha, contrassenha,
  observacao, atualizado_por_nome, created_at, updated_at, cliente:clientes(id, nome, razao_social)`;

export async function listarAcessos({ clienteIds } = {}) {
  let q = supabase.from('cci_acesso').select(COLS).order('plataforma');
  if (clienteIds?.length) q = q.in('cliente_id', clienteIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// `rede`: { chave_api_id, as_rede_id } — usado quando o acesso vale para a rede toda.
export async function salvarAcesso(acesso) {
  const { id, cliente: _c, created_at: _ca, updated_at: _u, atualizado_por_nome: _a, ...campos } = acesso;
  ['url', 'login', 'senha', 'contrassenha', 'observacao'].forEach(k => { if (!campos[k]?.trim?.()) campos[k] = null; });
  if (campos.cliente_id) { campos.chave_api_id = null; campos.as_rede_id = null; } // a rede vem da empresa (gatilho)
  else campos.cliente_id = null;
  const q = id ? supabase.from('cci_acesso').update(campos).eq('id', id)
               : supabase.from('cci_acesso').insert(campos);
  const { error } = await q;
  if (error) throw error;
}

export async function excluirAcesso(id) {
  const { error } = await supabase.from('cci_acesso').delete().eq('id', id);
  if (error) throw error;
}
