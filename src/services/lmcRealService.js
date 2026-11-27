// LMC GERENCIAL — escritural real (e motivo) lançados manualmente por empresa/dia/combustível.
// Tabela lmc_real (migrações 212 e 213); dia fechado + histórico (239).
// Sem lançamento no dia, o gerencial NÃO calcula nada (fica em branco).
import { supabase } from '../lib/supabase';

const COLS = 'id, cliente_id, data, produto_chave, escritural_tanques, motivos_tanques, escritural_produto, motivo, atualizado_por_nome, updated_at';
const chave = (r) => `${r.data}|${r.produto_chave}`;

// Lançamentos do período → Map "data|produto_chave" → linha
export async function listarAjustes(clienteId, { de, ate }) {
  if (!clienteId) return new Map();
  const { data, error } = await supabase
    .from('lmc_real')
    .select(COLS)
    .eq('cliente_id', clienteId)
    .gte('data', de)
    .lte('data', ate);
  if (error) throw error;
  return new Map((data || []).map(r => [chave(r), r]));
}

// Dias FECHADOS do período (medições salvas = dia travado; migração 239)
// → Map "data" → { fechado_por_nome, fechado_em }
export async function listarDiasFechados(clienteId, { de, ate }) {
  if (!clienteId) return new Map();
  const { data, error } = await supabase
    .from('lmc_real_dia')
    .select('data, fechado_por_nome, fechado_em')
    .eq('cliente_id', clienteId)
    .gte('data', de)
    .lte('data', ate);
  if (error) throw error;
  return new Map((data || []).map(r => [r.data, r]));
}

// Salva as medições de UM dia ("Lançar medições"), todos os combustíveis de
// uma vez, e FECHA o dia (RPC lmc_real_salvar_dia — numa transação só). Depois
// disso o dia só muda se a CCI reabrir. itens: [{ produtoChave,
// escrituralTanques: {tq: litros}, motivosTanques: {tq: texto},
// escrituralProduto, motivo }]. Combustível sem nada preenchido tem o
// lançamento removido. Quem salvou e quando: banco (JWT) + histórico.
export async function salvarLancamentosDia({ clienteId, data, itens }) {
  const p_itens = itens.map(i => ({
    produto_chave: i.produtoChave,
    escritural_tanques: i.escrituralTanques || {},
    motivos_tanques: Object.fromEntries(Object.entries(i.motivosTanques || {})
      .filter(([, t]) => t?.trim()).map(([k, t]) => [k, t.trim().slice(0, 500)])),
    escritural_produto: i.escrituralProduto ?? null,
    motivo: i.motivo?.trim() || null,
  }));
  const { error } = await supabase.rpc('lmc_real_salvar_dia', { p_cliente_id: clienteId, p_data: data, p_itens });
  if (error) throw error;
  const [{ data: linhas, error: e1 }, fechados] = await Promise.all([
    supabase.from('lmc_real').select(COLS).eq('cliente_id', clienteId).eq('data', data),
    listarDiasFechados(clienteId, { de: data, ate: data }),
  ]);
  if (e1) throw e1;
  return { linhas: linhas || [], fechamento: fechados.get(data) || null };
}

// Reabre um dia fechado (só a CCI; motivo obrigatório, mín. 5 caracteres).
export async function reabrirDia({ clienteId, data, motivo }) {
  const { error } = await supabase.rpc('lmc_real_reabrir_dia', { p_cliente_id: clienteId, p_data: data, p_motivo: motivo });
  if (error) throw error;
}

// Histórico de lançamentos, alterações, fechamentos e reaberturas
// (mais recente primeiro). Filtra por período ou por um dia (data).
export async function listarHistorico(clienteId, { de, ate, data } = {}) {
  if (!clienteId) return [];
  let q = supabase
    .from('lmc_real_historico')
    .select('id, data, acao, produto_chave, antes, depois, motivo, usuario_nome, em')
    .eq('cliente_id', clienteId)
    .order('em', { ascending: false })
    .limit(1000);
  if (data) q = q.eq('data', data);
  else { if (de) q = q.gte('data', de); if (ate) q = q.lte('data', ate); }
  const { data: linhas, error } = await q;
  if (error) throw error;
  return linhas || [];
}
