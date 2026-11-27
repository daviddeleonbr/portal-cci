// Consultoria > Análise de cartões — modelos puros (sem rede nem tela).
// Webposto e Autosystem saem no mesmo formato:
//   dias:     [{ data, cartao, bruto, taxa, liquido, ajuste }]  (pela data da BAIXA)
//   cartoes:  [{ chave, nome, bruto, taxa, liquido, ajuste, taxaEfetiva, taxaCadastrada,
//                acimaCadastrada, vendido, custo, taxaVendas, margemBruta, margemLiquida,
//                combustivel: { valor, custo, taxa, margem, consumo } }]
//   totais, avisos
// Taxa efetiva = taxa ÷ (taxa + líquido): o que a adquirente realmente descontou.
// Margem = vendido − custo; margem líquida = margem − taxa. "Consumo" = quanto da
// margem do combustível a taxa levou (taxa ÷ margem).

const num = (v) => Number(v) || 0;
const CENTAVO = 0.005;
// Tolerância para dizer que cobraram acima do cadastrado (arredondamentos da adquirente)
export const TOLERANCIA_TAXA_PP = 0.1;

const novoCartao = (chave, nome) => ({
  chave, nome, bruto: 0, taxa: 0, liquido: 0, ajuste: 0, baixas: 0,
  cadValor: 0, cadTaxa: 0, // base da taxa cadastrada (Σ valor, Σ valor × %)
  vendido: 0, custo: 0, taxaVendas: 0,
  combustivel: { valor: 0, custo: 0, taxa: 0 },
});

function fechar(mapa, dias, avisos) {
  const cartoes = [...mapa.values()].map(c => {
    const base = c.taxa + c.liquido;
    const taxaEfetiva = base > CENTAVO ? (100 * c.taxa) / base : null;
    const taxaCadastrada = c.cadValor > CENTAVO ? (100 * c.cadTaxa) / c.cadValor : null;
    const margemBruta = c.vendido - c.custo;
    const comb = c.combustivel;
    const margemComb = comb.valor - comb.custo;
    return {
      chave: c.chave, nome: c.nome, bruto: c.bruto, taxa: c.taxa, liquido: c.liquido, ajuste: c.ajuste, baixas: c.baixas,
      taxaEfetiva, taxaCadastrada,
      acimaCadastrada: taxaEfetiva != null && taxaCadastrada != null && taxaEfetiva - taxaCadastrada > TOLERANCIA_TAXA_PP,
      vendido: c.vendido, custo: c.custo, taxaVendas: c.taxaVendas,
      margemBruta, margemLiquida: margemBruta - c.taxaVendas,
      margemLiquidaPct: c.vendido > CENTAVO ? (100 * (margemBruta - c.taxaVendas)) / c.vendido : null,
      combustivel: {
        valor: comb.valor, custo: comb.custo, taxa: comb.taxa, margem: margemComb,
        consumo: margemComb > CENTAVO ? (100 * comb.taxa) / margemComb : null,
      },
    };
  }).filter(c => [c.bruto, c.vendido].some(v => Math.abs(v) > CENTAVO))
    .sort((a, b) => b.bruto - a.bruto || a.nome.localeCompare(b.nome));

  const soma = (k) => cartoes.reduce((s, c) => s + c[k], 0);
  const somaComb = (k) => cartoes.reduce((s, c) => s + c.combustivel[k], 0);
  const taxa = soma('taxa'), liquido = soma('liquido');
  const comb = { valor: somaComb('valor'), custo: somaComb('custo'), taxa: somaComb('taxa') };
  comb.margem = comb.valor - comb.custo;
  comb.consumo = comb.margem > CENTAVO ? (100 * comb.taxa) / comb.margem : null;
  return {
    dias: dias.filter(d => Math.abs(d.bruto) > CENTAVO).sort((a, b) => a.data.localeCompare(b.data) || a.cartao.localeCompare(b.cartao)),
    cartoes,
    totais: {
      bruto: soma('bruto'), taxa, liquido, ajuste: soma('ajuste'),
      taxaEfetiva: taxa + liquido > CENTAVO ? (100 * taxa) / (taxa + liquido) : null,
      vendido: soma('vendido'), custo: soma('custo'), taxaVendas: soma('taxaVendas'),
      margemBruta: soma('margemBruta'), margemLiquida: soma('margemLiquida'),
      combustivel: comb,
      acimaCadastrada: cartoes.filter(c => c.acimaCadastrada).length,
    },
    avisos: avisos.filter(Boolean),
  };
}

// Série diária para os gráficos (todos os cartões ou um só).
export function serieDiaria(dias = [], cartao = '') {
  const m = new Map();
  dias.filter(d => !cartao || d.cartao === cartao).forEach(d => {
    const g = m.get(d.data) || { data: d.data, bruto: 0, taxa: 0, liquido: 0 };
    g.bruto += d.bruto; g.taxa += d.taxa; g.liquido += d.liquido;
    m.set(d.data, g);
  });
  return [...m.values()].sort((a, b) => a.data.localeCompare(b.data)).map(g => ({
    ...g, taxaEfetiva: g.taxa + g.liquido > CENTAVO ? (100 * g.taxa) / (g.taxa + g.liquido) : null,
  }));
}

// ─── Webposto ───────────────────────────────────────────────────
// remessas: CARTAO_REMESSA (baixas, por administradora: valorRemessa, taxasDespesas, valorLiquido)
// cartoes:  CARTAO (cada venda no cartão: vendaCodigo, valor, taxaPercentual cadastrada)
// itens:    VENDA_ITEM (totalVenda, totalCusto) | ehCombustivel(item) → bool
// A remessa não aponta para as vendas: a taxa das vendas é a efetiva da administradora
// no período (cai para a cadastrada se ela não teve baixa no período).
export function modeloWebposto({ remessas = [], cartoes = [], itens = [], ehCombustivel = () => false, de, ate }) {
  const mapa = new Map();
  const cartao = (cod, nome) => {
    const k = String(cod ?? nome ?? '?');
    if (!mapa.has(k)) mapa.set(k, novoCartao(k, String(nome || `Administradora ${k}`).trim()));
    return mapa.get(k);
  };
  const dias = [];
  remessas.forEach(r => {
    const data = String(r.dataPagamento || r.dataRemessa || '').slice(0, 10);
    if (!data || (de && data < de) || (ate && data > ate)) return;
    const c = cartao(r.administradoraCodigo, r.administradora);
    const bruto = num(r.valorRemessa), taxa = num(r.taxasDespesas), liquido = num(r.valorLiquido);
    c.bruto += bruto; c.taxa += taxa; c.liquido += liquido; c.baixas += 1;
    dias.push({ data, cartao: c.chave, bruto, taxa, liquido, ajuste: 0 });
  });

  // Taxa efetiva por administradora (para aplicar nas vendas)
  const efetiva = new Map([...mapa.values()].map(c => [c.chave, c.taxa + c.liquido > CENTAVO ? c.taxa / (c.taxa + c.liquido) : null]));

  const itensPorVenda = new Map();
  itens.forEach(i => {
    const k = i.vendaCodigo;
    if (!itensPorVenda.has(k)) itensPorVenda.set(k, []);
    itensPorVenda.get(k).push(i);
  });
  let semTaxaEfetiva = 0, semItens = 0;
  cartoes.forEach(cv => {
    const valor = num(cv.valor);
    const c = cartao(cv.administradoraCodigo, cv.adiministradoraDescricao ?? cv.administradoraDescricao);
    c.cadValor += valor; c.cadTaxa += (valor * num(cv.taxaPercentual)) / 100;
    const lista = itensPorVenda.get(cv.vendaCodigo);
    const total = (lista || []).reduce((s, i) => s + num(i.totalVenda), 0);
    if (!lista || total <= CENTAVO) { semItens += 1; return; } // venda cancelada ou fora do período
    let pct = efetiva.get(c.chave);
    if (pct == null) { pct = num(cv.taxaPercentual) / 100; semTaxaEfetiva += 1; }
    const fracao = valor / total; // o cartão pode ter pago só parte da venda
    lista.forEach(i => {
      const v = num(i.totalVenda) * fracao, custo = num(i.totalCusto) * fracao, tx = v * pct;
      c.vendido += v; c.custo += custo; c.taxaVendas += tx;
      if (ehCombustivel(i)) { c.combustivel.valor += v; c.combustivel.custo += custo; c.combustivel.taxa += tx; }
    });
  });
  return fechar(mapa, dias, [
    semTaxaEfetiva > 0 && `${semTaxaEfetiva} venda(s) em cartões sem baixa no período: a margem usa a taxa cadastrada.`,
    semItens > 0 && `${semItens} venda(s) no cartão sem itens no período (canceladas ou de outro período) ficaram fora da margem.`,
  ]);
}

// ─── Autosystem ─────────────────────────────────────────────────
// Linhas da Edge autosystem-cartoes-baixas. `categoriaGrupo`: Map(grid do grupo → categoria).
// A taxa das vendas já vem rateada da própria baixa (não precisa de taxa média).
export function modeloAutosystem({ dias: linhasDia = [], produtos = [], categoriaGrupo = new Map() }) {
  const mapa = new Map();
  const cartao = (conta, nome) => {
    const k = String(conta);
    if (!mapa.has(k)) mapa.set(k, novoCartao(k, String(nome || k).trim()));
    else if (nome && mapa.get(k).nome === k) mapa.get(k).nome = String(nome).trim();
    return mapa.get(k);
  };
  const dias = [];
  linhasDia.forEach(r => {
    const c = cartao(r.conta, r.conta_nome);
    const bruto = num(r.bruto), taxa = num(r.taxa), liquido = num(r.liquido), ajuste = num(r.ajuste);
    c.bruto += bruto; c.taxa += taxa; c.liquido += liquido; c.ajuste += ajuste; c.baixas += num(r.baixas);
    dias.push({ data: String(r.data).slice(0, 10), cartao: c.chave, bruto, taxa, liquido, ajuste });
  });
  let semCusto = 0;
  produtos.forEach(p => {
    const c = cartao(p.conta);
    const valor = num(p.valor), custo = num(p.custo), taxa = num(p.taxa);
    c.vendido += valor; c.custo += custo; c.taxaVendas += taxa;
    semCusto += num(p.itens_sem_custo);
    if (categoriaGrupo.get(Number(p.grupo_produto_codigo)) === 'combustivel') {
      c.combustivel.valor += valor; c.combustivel.custo += custo; c.combustivel.taxa += taxa;
    }
  });
  const temAjuste = [...mapa.values()].some(c => Math.abs(c.ajuste) > CENTAVO);
  return fechar(mapa, dias, [
    semCusto > 0 && `${semCusto} item(ns) vendido(s) sem custo no estoque: a margem deles fica maior do que a real.`,
    temAjuste && 'Há baixas com ajuste (conta que não é banco nem taxa, ex.: ajuste de conciliação): o valor aparece à parte e não entra na taxa.',
  ]);
}
