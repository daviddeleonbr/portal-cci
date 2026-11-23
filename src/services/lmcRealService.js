// LMC REAL (gerencial) — ajustes de escritural e motivo por empresa/dia/combustível.
// Tabela lmc_real (migração 212). O LMC oficial vem do Webposto e não é alterado;
// sem linha aqui, o real usa o escritural oficial.
import { supabase } from '../lib/supabase';

const COLS = 'id, cliente_id, data, produto_chave, escritural_tanques, escritural_produto, motivo, atualizado_por_nome, updated_at';

// Ajustes do período → Map "data|produto_chave" → linha
export async function listarAjustes(clienteId, { de, ate }) {
  if (!clienteId) return new Map();
  const { data, error } = await supabase
    .from('lmc_real')
    .select(COLS)
    .eq('cliente_id', clienteId)
    .gte('data', de)
    .lte('data', ate);
  if (error) throw error;
  return new Map((data || []).map(r => [`${r.data}|${r.produto_chave}`, r]));
}

// Cria/atualiza o ajuste do dia. `escritural_tanques`: { tanqueCodigo: litros }.
// Quem alterou (id) e quando são carimbados pelo banco; o nome vai para exibição.
export async function salvarAjuste({ clienteId, data, produtoChave, escrituralTanques = {}, escrituralProduto = null, motivo = '', usuarioNome = '' }) {
  const { data: linha, error } = await supabase
    .from('lmc_real')
    .upsert({
      cliente_id: clienteId,
      data,
      produto_chave: produtoChave,
      escritural_tanques: escrituralTanques,
      escritural_produto: escrituralProduto,
      motivo: motivo?.trim() || null,
      atualizado_por_nome: usuarioNome || null,
    }, { onConflict: 'cliente_id,data,produto_chave' })
    .select(COLS)
    .single();
  if (error) throw error;
  return linha;
}

// Volta o dia para o escritural oficial (apaga o ajuste)
export async function removerAjuste({ clienteId, data, produtoChave }) {
  const { error } = await supabase
    .from('lmc_real')
    .delete()
    .eq('cliente_id', clienteId)
    .eq('data', data)
    .eq('produto_chave', produtoChave);
  if (error) throw error;
}
