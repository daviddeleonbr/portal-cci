import { supabase } from '../lib/supabase';

// 10 tipos de mapeamento (agrupados visualmente em secoes)
export const TIPOS_VENDA = [
  // Receitas separadas por categoria de produto
  { id: 'receita_combustivel', label: 'Receita - Combustiveis',     desc: 'Itens com tipoProduto = C',                       sinal: 1, secao: 'Receitas' },
  { id: 'receita_automotivos',  label: 'Receita - Automotivos',      desc: 'Pista, exceto combustiveis (lubrificantes etc)',  sinal: 1, secao: 'Receitas' },
  { id: 'receita_conveniencia', label: 'Receita - Conveniencia',     desc: 'Grupos com tipoGrupo = Conveniencia',             sinal: 1, secao: 'Receitas' },

  // CMV separado por categoria
  { id: 'cmv_combustivel', label: 'CMV - Combustiveis',  desc: 'Custo dos itens de combustivel',         sinal: -1, secao: 'CMV' },
  { id: 'cmv_automotivos',  label: 'CMV - Automotivos',   desc: 'Custo dos itens de pista nao-combustivel', sinal: -1, secao: 'CMV' },
  { id: 'cmv_conveniencia', label: 'CMV - Conveniencia',  desc: 'Custo dos itens de conveniencia',         sinal: -1, secao: 'CMV' },

  // Outros aplicaveis a todas as vendas
  { id: 'impostos',          label: 'Impostos sobre Vendas',     desc: 'ICMS + PIS + COFINS + CBS + IBS',     sinal: -1, secao: 'Outros' },
  { id: 'descontos',         label: 'Descontos sobre Vendas',    desc: 'Soma de totalDesconto dos itens',     sinal: -1, secao: 'Outros' },
  { id: 'acrescimos',        label: 'Acrescimos sobre Vendas',   desc: 'Soma de totalAcrescimo dos itens',    sinal: 1,  secao: 'Outros' },
  { id: 'vendas_canceladas', label: 'Vendas Canceladas',         desc: 'Total de vendas com cancelada = S',   sinal: -1, secao: 'Outros' },
];

export async function listarMapeamentoVendas(mascaraId) {
  const { data, error } = await supabase
    .from('mapeamento_vendas_dre')
    .select('*, grupos_dre(id, nome, tipo)')
    .eq('mascara_id', mascaraId);
  if (error) throw error;
  return data || [];
}

export async function salvarMapeamentoVenda({ mascara_id, tipo, grupo_dre_id }) {
  const { data, error } = await supabase
    .from('mapeamento_vendas_dre')
    .upsert(
      { mascara_id, tipo, grupo_dre_id: grupo_dre_id || null },
      { onConflict: 'mascara_id,tipo' }
    )
    .select('*, grupos_dre(id, nome, tipo)')
    .single();
  if (error) throw error;
  return data;
}

export async function excluirMapeamentoVenda(id) {
  const { error } = await supabase.from('mapeamento_vendas_dre').delete().eq('id', id);
  if (error) throw error;
}

// ─── Classifica um item em: 'combustivel' | 'automotivos' | 'conveniencia' | 'outros' ──
export function classificarItem(item, produtosMap, gruposMap) {
  const produto = produtosMap.get(item.produtoCodigo);
  if (!produto) return 'outros';

  // Combustivel: flag dedicada OU tipoProduto = "C" (fallback)
  if (produto.combustivel === true || produto.combustivel === 'S' || produto.combustivel === 1) return 'combustivel';
  if (produto.tipoProduto === 'C') return 'combustivel';

  const grupo = gruposMap.get(produto.grupoCodigo);
  const tipoGrupo = grupo?.tipoGrupo;

  if (tipoGrupo === 'Conveniência' || tipoGrupo === 'Conveniencia') return 'conveniencia';
  if (tipoGrupo === 'Pista') return 'automotivos';

  return 'outros';
}

// ─── Agrega VENDA_ITEM totais por tipo (com classificacao) ──
// Retorna: { receita_combustivel, receita_automotivos, receita_conveniencia,
//            cmv_combustivel, cmv_automotivos, cmv_conveniencia,
//            impostos, descontos, acrescimos, vendas_canceladas }
export function agregarVendasItens(itens, vendasMap, produtosMap, gruposMap) {
  const totais = {
    receita_combustivel: 0, receita_automotivos: 0, receita_conveniencia: 0,
    cmv_combustivel: 0, cmv_automotivos: 0, cmv_conveniencia: 0,
    impostos: 0, descontos: 0, acrescimos: 0, vendas_canceladas: 0,
  };

  (itens || []).forEach(item => {
    const venda = vendasMap?.get(item.vendaCodigo);

    const totalVenda = Number(item.totalVenda || 0);
    const totalCusto = Number(item.totalCusto || 0);
    const totalDesconto = Number(item.totalDesconto || 0);
    const totalAcrescimo = Number(item.totalAcrescimo || 0);
    const impostos = Number(item.icmsValor || 0)
      + Number(item.valorPis || 0)
      + Number(item.valorCofins || 0)
      + Number(item.valorCbs || 0)
      + Number(item.valorIbs || 0);

    if (venda?.cancelada === 'S') {
      // Vendas canceladas vao para um bucket separado (somente o totalVenda)
      totais.vendas_canceladas += totalVenda;
      return;
    }

    // Filtro estrito (equivalente a DAX fVendas[cancelada] = "N"):
    // itens sem venda correspondente ou com cancelada != 'N' ficam fora da receita.
    if (venda?.cancelada !== 'N') return;

    const categoria = classificarItem(item, produtosMap, gruposMap);

    if (categoria === 'combustivel') {
      totais.receita_combustivel += totalVenda;
      totais.cmv_combustivel += totalCusto;
    } else if (categoria === 'automotivos') {
      totais.receita_automotivos += totalVenda;
      totais.cmv_automotivos += totalCusto;
    } else if (categoria === 'conveniencia') {
      totais.receita_conveniencia += totalVenda;
      totais.cmv_conveniencia += totalCusto;
    } else {
      // 'outros' fallback - vai para automotivos
      totais.receita_automotivos += totalVenda;
      totais.cmv_automotivos += totalCusto;
    }

    totais.impostos += impostos;
    totais.descontos += totalDesconto;
    totais.acrescimos += totalAcrescimo;
  });

  return totais;
}

// Classifica um item para gerar lancamento granular (com label da categoria)
export function categoriaItem(item, vendasMap, produtosMap, gruposMap) {
  const venda = vendasMap?.get(item.vendaCodigo);
  if (venda?.cancelada === 'S') return 'cancelada';
  return classificarItem(item, produtosMap, gruposMap);
}
