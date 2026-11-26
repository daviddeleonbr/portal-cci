// Indicadores de posto de combustível e conveniência, a partir das vendas por item
// (Webposto VENDA_ITEM / Autosystem vendas por produto) já normalizadas:
//   itens: [{ categoria: 'combustivel'|'conveniencia'|'automotivos'|..., produto, quantidade, valor, custo }]
// valor = venda bruta; custo = custo da venda; quantidade em litros (combustível).
import { comparar, r2 } from './variacao';

const div = (a, b) => (b > 0 ? a / b : null);
const r4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);

// Por produto e por categoria: volume, preço médio, custo médio, margem/L e margem %
export function indicadoresPosto(itens = []) {
  const porProduto = new Map();
  const porCategoria = new Map();
  (itens || []).forEach(i => {
    const add = (map, k, extra) => {
      const c = map.get(k) || { ...extra, quantidade: 0, valor: 0, custo: 0 };
      c.quantidade += Number(i.quantidade || 0);
      c.valor += Number(i.valor || 0);
      c.custo += Number(i.custo || 0);
      map.set(k, c);
    };
    add(porProduto, `${i.categoria}|${i.produto}`, { categoria: i.categoria, produto: i.produto });
    add(porCategoria, i.categoria, { categoria: i.categoria });
  });
  const fechar = (c) => ({
    ...c,
    quantidade: r2(c.quantidade), valor: r2(c.valor), custo: r2(c.custo),
    margemBruta: r2(c.valor - c.custo),
    margemPct: c.valor > 0 ? Math.round(((c.valor - c.custo) / c.valor) * 1000) / 10 : null,
    // por litro/unidade (combustível em litros)
    precoMedio: r4(div(c.valor, c.quantidade)),
    custoMedio: r4(div(c.custo, c.quantidade)),
    margemPorUnidade: r4(div(c.valor - c.custo, c.quantidade)),
  });
  const categorias = [...porCategoria.values()].map(fechar);
  const total = categorias.reduce((s, c) => s + c.valor, 0);
  return {
    produtos: [...porProduto.values()].map(fechar),
    categorias: categorias.map(c => ({ ...c, participacaoPct: total > 0 ? Math.round((c.valor / total) * 1000) / 10 : null })),
    faturamento: r2(total),
  };
}

// Decompõe a variação de um total (receita ou custo) em efeito VOLUME e efeito
// PREÇO: Δ = (q1 − q0)·p0 + (p1 − p0)·q1. Responde "paguei menos porque comprei
// menos ou porque o litro ficou mais barato?".
export function decomporVolumePreco({ q0, v0, q1, v1 }) {
  const p0 = div(v0, q0);
  const p1 = div(v1, q1);
  if (p0 == null || p1 == null) return null;
  const efeitoVolume = (q1 - q0) * p0;
  const efeitoPreco = (p1 - p0) * q1;
  return {
    total: r2(v1 - v0), efeitoVolume: r2(efeitoVolume), efeitoPreco: r2(efeitoPreco),
    volume: comparar(q0, q1), precoMedio: comparar(p0, p1),
  };
}

// Compara dois períodos de indicadoresPosto por produto: volume, preço, custo e margem/L,
// com a decomposição da receita e do custo.
export function compararPosto(anterior, atual) {
  const chave = (p) => `${p.categoria}|${p.produto}`;
  const antMap = new Map((anterior?.produtos || []).map(p => [chave(p), p]));
  return (atual?.produtos || []).map(p => {
    const a = antMap.get(chave(p));
    if (!a) return { categoria: p.categoria, produto: p.produto, novo: true, atual: p };
    return {
      categoria: p.categoria,
      produto: p.produto,
      volume: comparar(a.quantidade, p.quantidade),
      precoMedio: comparar(a.precoMedio, p.precoMedio),
      custoMedio: comparar(a.custoMedio, p.custoMedio),
      margemPorUnidade: comparar(a.margemPorUnidade, p.margemPorUnidade),
      margemBruta: comparar(a.margemBruta, p.margemBruta),
      receita: decomporVolumePreco({ q0: a.quantidade, v0: a.valor, q1: p.quantidade, v1: p.valor }),
      custo: decomporVolumePreco({ q0: a.quantidade, v0: a.custo, q1: p.quantidade, v1: p.custo }),
    };
  });
}
