import { supabase } from '../lib/supabase';

// Mapeamento de vendas/custo Autosystem por CATEGORIA de grupo de produto.
// Categorias: 'combustivel', 'automotivos', 'conveniencia' — herdadas
// da parametrização em /cliente/autosystem/configuracoes (as_rede_grupo_produto).
// Cada linha vincula (categoria, tipo) a um grupo da máscara DRE ou Fluxo.

const TABLE = 'mapeamento_vendas_autosystem';

export const CATEGORIAS_VENDA = [
  { key: 'combustivel',  label: 'Combustível'  },
  { key: 'automotivos',  label: 'Automotivos'  },
  { key: 'conveniencia', label: 'Conveniência' },
];

// Lista mapeamentos de uma (rede, máscara).
export async function listarMapeamentos(asRedeId, mascaraId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`
      *,
      grupos_dre(id, nome, tipo, parent_id, mascara_id),
      grupos_fluxo_caixa(id, nome, tipo, parent_id, mascara_id)
    `)
    .eq('as_rede_id', asRedeId)
    .eq('mascara_id', mascaraId);
  if (error) throw error;
  return data || [];
}

// Upsert por (as_rede_id, mascara_id, categoria, tipo).
// `grupoIdField` é 'grupo_dre_id' ou 'grupo_fluxo_id'.
// Se `grupoDestinoId` é null/vazio, REMOVE o mapeamento.
export async function salvarMapeamento({
  as_rede_id, mascara_id, categoria, tipo,
  grupoIdField, grupoDestinoId,
}) {
  if (!grupoDestinoId) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('as_rede_id', as_rede_id)
      .eq('mascara_id', mascara_id)
      .eq('categoria', categoria)
      .eq('tipo', tipo);
    if (error) throw error;
    return null;
  }

  const payload = {
    as_rede_id, mascara_id, categoria, tipo,
    grupo_dre_id: null,
    grupo_fluxo_id: null,
    [grupoIdField]: grupoDestinoId,
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'as_rede_id,mascara_id,categoria,tipo' })
    .select(`
      *,
      grupos_dre(id, nome, tipo, parent_id, mascara_id),
      grupos_fluxo_caixa(id, nome, tipo, parent_id, mascara_id)
    `)
    .single();
  if (error) throw error;
  return data;
}

export async function excluirMapeamento(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
