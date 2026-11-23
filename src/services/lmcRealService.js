// LMC GERENCIAL — escritural real (e motivo) lançados manualmente por empresa/dia/combustível.
// Tabela lmc_real (migrações 212 e 213). O LMC do Webposto não é alterado.
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

// Salva as medições de UM dia ("Lançar medições"), todos os combustíveis de
// uma vez. itens: [{ produtoChave, escrituralTanques: {tq: litros},
// motivosTanques: {tq: texto}, escrituralProduto, motivo }]. Combustível sem
// nada preenchido tem o lançamento removido. Quem alterou e quando: banco (JWT).
// Devolve { salvas: [linhas], removidas: [produtoChave] }.
export async function salvarLancamentosDia({ clienteId, data, itens, usuarioNome = '' }) {
  const vazio = (i) => !Object.keys(i.escrituralTanques || {}).length && i.escrituralProduto == null
    && !Object.values(i.motivosTanques || {}).some(t => t?.trim()) && !i.motivo?.trim();
  const paraSalvar = itens.filter(i => !vazio(i));
  const paraRemover = itens.filter(vazio).map(i => i.produtoChave);

  let salvas = [];
  if (paraSalvar.length) {
    const { data: linhas, error } = await supabase
      .from('lmc_real')
      .upsert(paraSalvar.map(i => ({
        cliente_id: clienteId,
        data,
        produto_chave: i.produtoChave,
        escritural_tanques: i.escrituralTanques || {},
        motivos_tanques: Object.fromEntries(Object.entries(i.motivosTanques || {}).filter(([, t]) => t?.trim()).map(([k, t]) => [k, t.trim().slice(0, 500)])),
        escritural_produto: i.escrituralProduto ?? null,
        motivo: i.motivo?.trim() || null,
        atualizado_por_nome: usuarioNome || null,
      })), { onConflict: 'cliente_id,data,produto_chave' })
      .select(COLS);
    if (error) throw error;
    salvas = linhas || [];
  }
  if (paraRemover.length) {
    const { error } = await supabase
      .from('lmc_real')
      .delete()
      .eq('cliente_id', clienteId)
      .eq('data', data)
      .in('produto_chave', paraRemover);
    if (error) throw error;
  }
  return { salvas, removidas: paraRemover };
}
