// FECHAMENTO DE CAIXA do cliente — fechamento geral do dia (ou de um turno):
// vendas × formas de recebimento, acréscimos/descontos, devoluções (Autosystem)
// ou vendas canceladas (Webposto) e aferições. Direto do sistema do cliente,
// para qualquer dia. Mesmas regras da Conciliação de caixas do admin
// (BpoConciliacaoCaixas) e do antigo Resumo de caixa:
//   Webposto  — VENDA(A/C), VENDA_ITEM, CARTAO, CAIXA, CAIXA_APRESENTADO,
//               VENDA_FORMA_PAGAMENTO, ABASTECIMENTO (afericao=true), PRODUTO/GRUPO/BICO
//   Autosystem — autosystem-vendas (lancto V/DC), autosystem-recebimentos (movto),
//               autosystem-bombas (aferições: lancto operacao 'A', só litros)
//
// carregar(...) busca os dados brutos do dia; montar(bruto, turno) calcula —
// trocar de turno não busca de novo.
import * as qualityApi from './qualityApiService';
import * as mapService from './mapeamentoService';
import * as autosystemService from './autosystemService';
import { classificarItem } from './mapeamentoVendasService';

export const CATEGORIAS = [
  ['combustivel', 'Combustíveis'],
  ['automotivos', 'Automotivos (pista)'],
  ['conveniencia', 'Conveniência'],
  ['outros', 'Outros'],
];

const num = (v) => Number(v || 0);
const soma = (lista, f = x => x) => lista.reduce((s, x) => s + num(f(x)), 0);

// Formas do fechamento do Webposto (CAIXA_APRESENTADO). Cartão vem do CARTAO
// (por administradora); dinheiro usa o APRESENTADO (o que foi entregue).
const CAMPOS_CAIXA = [
  ['dinheiro', 'Dinheiro', 'dinheiro', 'dinheiroApresentado'],
  ['notaPrazo', 'Nota a prazo', 'a_prazo'],
  ['cheque', 'Cheque', 'cheque'],
  ['chequePre', 'Cheque pré', 'cheque'],
  ['cartaFrete', 'Carta frete', 'outros'],
  ['valeCliente', 'Vale cliente', 'outros'],
  ['prePag', 'Pré-pago', 'outros'],
  ['transfBanc', 'Transferência bancária', 'outros'],
  ['transfDeb', 'Transferência (débito)', 'outros'],
  ['emprestimo', 'Empréstimo', 'outros'],
  ['valeFun', 'Vale funcionário', 'outros'],
  ['despesa', 'Despesas do caixa', 'outros'],
  ['chequePagar', 'Cheque a pagar', 'outros'],
  ['fundoCxDeb', 'Fundo de caixa', 'outros'],
];
const ORDEM_TIPO = { dinheiro: 0, cartao: 1, a_prazo: 2, cheque: 3, outros: 4 };

function classificarForma(nome) {
  const n = String(nome || '').toUpperCase();
  if (/DINHEIRO|ESPECIE|ESPÉCIE/.test(n)) return 'dinheiro';
  if (/CARTAO|CARTÃO|CREDITO|CRÉDITO|DEBITO|DÉBITO|PIX/.test(n)) return 'cartao';
  if (/CHEQUE/.test(n)) return 'cheque';
  if (/PRAZO/.test(n)) return 'a_prazo';
  return 'outros';
}

function ordenarFormas(lista) {
  return lista.filter(f => Math.abs(f.valor) > 0.004)
    .sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9) || b.valor - a.valor);
}

const horaDe = (s) => {
  if (!s) return '';
  const m = String(s).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
};

// ─── Carregar (dados brutos do dia) ──────────────────────────
export async function carregar(cliente, data, tipoCliente, { forcar = false } = {}) {
  if (forcar) qualityApi.limparCacheTransacional();
  return tipoCliente === 'autosystem' ? carregarAutosystem(cliente, data) : carregarWebposto(cliente, data);
}

async function carregarWebposto(cliente, data) {
  const chaves = await mapService.listarChavesApi();
  const chave = chaves.find(c => c.id === cliente.chave_api_id)?.chave;
  if (!chave) throw new Error('Integração Webposto não configurada para esta empresa.');
  const f = { dataInicial: data, dataFinal: data, empresaCodigo: cliente.empresa_codigo };
  const [vendas, canceladas, itens, cartoes, caixas, apresentados, formas, abastecimentos, produtos, grupos, bicos, adms] = await Promise.all([
    qualityApi.buscarVendas(chave, { ...f, situacao: 'A' }),
    qualityApi.buscarVendas(chave, { ...f, situacao: 'C' }).catch(() => []),
    qualityApi.buscarVendaItens(chave, { ...f, situacao: 'A' }).catch(() => []),
    qualityApi.buscarCartoes(chave, f).catch(() => []),
    qualityApi.buscarCaixas(chave, f).catch(() => []),
    qualityApi.buscarCaixasApresentados(chave, f).catch(() => []),
    qualityApi.buscarVendaFormaPagamento(chave, f).catch(() => []),
    qualityApi.buscarAbastecimentos(chave, f).catch(() => []),
    qualityApi.buscarProdutos(chave).catch(() => []),
    qualityApi.buscarGrupos(chave).catch(() => []),
    qualityApi.buscarBicos(chave).catch(() => []),
    qualityApi.buscarAdministradoras(chave).catch(() => []),
  ]);
  return {
    tipo: 'webposto', data, vendas: vendas || [], canceladas: canceladas || [], itens: itens || [],
    cartoes: cartoes || [], caixas: (caixas || []).filter(c => String(c.empresaCodigo ?? cliente.empresa_codigo) === String(cliente.empresa_codigo)),
    // a API ignora empresaCodigo no CAIXA_APRESENTADO
    apresentados: (apresentados || []).filter(a => String(a.empresaCodigo) === String(cliente.empresa_codigo)),
    formas: formas || [], abastecimentos: abastecimentos || [], produtos: produtos || [], grupos: grupos || [],
    bicos: bicos || [], adms: adms || [],
  };
}

async function carregarAutosystem(cliente, data) {
  const redeId = cliente.as_rede_id;
  const emp = [cliente.empresa_codigo];
  const categorias = await autosystemService.listarContasCategorizadasRede(redeId).catch(() => []);
  const sobras = categorias.filter(c => c.categoria === 'sobra_caixa').map(c => String(c.codigo));
  const cartoes = categorias.filter(c => c.categoria === 'cartao_pix').map(c => String(c.codigo));
  const [vendas, receb, grupos, contas, bombas] = await Promise.all([
    autosystemService.buscarVendasAutosystem(redeId, emp, { data_de: data, data_ate: data }),
    autosystemService.buscarRecebimentosAutosystem(redeId, emp,
      { data_de: data, data_ate: data, contas_creditar_extras: sobras, contas_debitar_todas: cartoes }),
    autosystemService.listarGruposProdutoRede(redeId).catch(() => []),
    autosystemService.buscarContasAutosystem(redeId).catch(() => []),
    autosystemService.buscarBombasAutosystem(redeId, emp, { data_de: data, data_ate: data }).catch(() => null),
  ]);
  return {
    tipo: 'autosystem', data, vendas: vendas || [], receb: receb || [], categorias,
    grupos: grupos || [], contas: contas || [], afericoes: bombas?.afericoes || [],
  };
}

// ─── Montar (cálculo para o dia ou um turno) ─────────────────
export function montar(bruto, turno = null) {
  if (!bruto) return null;
  return bruto.tipo === 'autosystem' ? montarAutosystem(bruto, turno) : montarWebposto(bruto, turno);
}

function montarWebposto(b, turno) {
  const caixaId = (x) => (x == null ? null : Number(x));
  const turnos = [...b.caixas]
    .sort((x, y) => String(x.abertura || '').localeCompare(String(y.abertura || '')))
    .map(c => ({ codigo: String(c.caixaCodigo), rotulo: c.turno || `Caixa ${c.caixaCodigo}`, aberto: !c.fechado,
      abertura: c.abertura, fechamento: c.fechamento }));
  const t = turno ? turnos.find(x => x.codigo === String(turno)) : null;
  const noTurno = (cx) => !t || caixaId(cx) === Number(t.codigo);

  const vendas = b.vendas.filter(v => v.cancelada !== 'S' && noTurno(v.caixaCodigo));
  const vendaIds = new Set(vendas.map(v => v.vendaCodigo ?? v.codigo));
  const caixaDaVenda = new Map(b.vendas.map(v => [v.vendaCodigo ?? v.codigo, caixaId(v.caixaCodigo)]));

  // Vendas por categoria e produto (totalVenda já é líquido de desconto; + acréscimo)
  const prodMap = new Map(b.produtos.map(p => [p.produtoCodigo ?? p.codigo, p]));
  const grpMap = new Map(b.grupos.map(g => [g.grupoCodigo ?? g.codigo, g]));
  const cats = new Map(CATEGORIAS.map(([k, l]) => [k, { chave: k, rotulo: l, valor: 0, qtd: 0, produtos: new Map() }]));
  let acrescimos = 0, descontos = 0;
  b.itens.forEach(it => {
    if (!vendaIds.has(it.vendaCodigo)) return;
    const cat = cats.get(classificarItem(it, prodMap, grpMap)) || cats.get('outros');
    const valor = num(it.totalVenda) + num(it.totalAcrescimo);
    acrescimos += num(it.totalAcrescimo);
    descontos += num(it.totalDesconto);
    cat.valor += valor;
    cat.qtd += num(it.quantidade);
    const p = prodMap.get(it.produtoCodigo);
    const pr = cat.produtos.get(it.produtoCodigo) || { nome: p?.nome || `Produto ${it.produtoCodigo}`, qtd: 0, valor: 0, unidade: p?.unidadeVenda || '' };
    pr.qtd += num(it.quantidade); pr.valor += valor;
    cat.produtos.set(it.produtoCodigo, pr);
  });
  const categorias = [...cats.values()].filter(c => Math.abs(c.valor) > 0.004)
    .map(c => ({ ...c, produtos: [...c.produtos.values()].sort((x, y) => y.valor - x.valor) }));

  // Formas de recebimento
  const formas = new Map();
  const somar = (chave, rotulo, tipo, valor) => {
    const g = formas.get(chave) || { chave, rotulo, tipo, valor: 0 };
    g.valor += num(valor);
    formas.set(chave, g);
  };
  const nomeAdm = new Map(b.adms.map(a => [Number(a.administradoraCodigo ?? a.codigo), a.descricao || a.nome]));
  b.cartoes.forEach(c => {
    // por turno: o cartão vai para o caixa da venda; lançado à mão (sem venda) só no dia todo
    if (t) { const cx = caixaDaVenda.get(c.vendaCodigo); if (cx == null || cx !== Number(t.codigo)) return; }
    const adm = Number(c.administradoraCodigo);
    somar(`adm:${adm}`, c.adiministradoraDescricao || c.administradoraDescricao || nomeAdm.get(adm) || `Administradora ${adm}`, 'cartao', c.valor);
  });
  const fechados = new Set(b.caixas.filter(c => c.fechado).map(c => caixaId(c.caixaCodigo)));
  const comApurado = new Set();
  b.apresentados.forEach(a => {
    const cx = caixaId(a.caixaCodigo);
    if (!fechados.has(cx) || !noTurno(cx)) return;
    comApurado.add(cx);
    CAMPOS_CAIXA.forEach(([campo, rotulo, tipo, lido]) => {
      const v = num(a[lido || `${campo}Apurado`]);
      if (v) somar(`caixa:${campo}`, rotulo, tipo, v);
    });
  });
  // caixa ainda aberto: formas da venda (sem as de administradora, que vêm do CARTAO)
  b.formas.forEach(fp => {
    if (!vendaIds.has(fp.vendaCodigo)) return;
    if (comApurado.has(caixaDaVenda.get(fp.vendaCodigo))) return;
    if (fp.administradoraCodigo != null) return;
    const tipo = classificarForma(fp.nomeFormaPagamento);
    const nome = String(fp.nomeFormaPagamento || 'Outros');
    if (tipo === 'dinheiro') somar('caixa:dinheiro', 'Dinheiro', 'dinheiro', fp.valorPagamento);
    else if (tipo === 'a_prazo') somar('caixa:notaPrazo', 'Nota a prazo', 'a_prazo', fp.valorPagamento);
    else somar(`forma:${nome.toUpperCase()}`, nome, tipo, fp.valorPagamento);
  });

  // Vendas canceladas (Webposto não tem devolução)
  const canceladas = b.canceladas.filter(v => noTurno(v.caixaCodigo))
    .map(v => ({ descricao: v.notaNumero ? `Venda nº ${v.notaNumero}` : `Venda ${v.vendaCodigo ?? v.codigo}`,
      hora: horaDe(v.dataHora || v.dataVenda), valor: num(v.totalVenda) }))
    .sort((x, y) => x.hora.localeCompare(y.hora));

  // Aferições: sem caixa no registro → turno pela janela abertura–fechamento
  const bicoMap = new Map(b.bicos.map(x => [x.bicoCodigo ?? x.codigo, x]));
  const dentro = (dh) => {
    if (!t) return true;
    const ts = Date.parse(dh); if (Number.isNaN(ts)) return false;
    const ini = Date.parse(t.abertura); const fim = t.fechamento ? Date.parse(t.fechamento) : Infinity;
    return (Number.isNaN(ini) || ts >= ini) && ts <= fim;
  };
  const afericoes = b.abastecimentos.filter(a => a?.afericao === true && dentro(a.dataHoraAbastecimento))
    .map(a => {
      const bico = bicoMap.get(a.codigoBico);
      const prod = prodMap.get(a.codigoProduto ?? bico?.codigoProduto ?? bico?.produtoCodigo);
      return { produto: prod?.nome || 'Combustível', bico: bico?.numero ?? bico?.bicoNumero ?? bico?.bico ?? a.codigoBico,
        litros: num(a.quantidade ?? a.litros), valor: num(a.valorTotal ?? a.valor), hora: horaDe(a.dataHoraAbastecimento) };
    })
    .sort((x, y) => x.hora.localeCompare(y.hora));

  const totalVendas = soma(categorias, c => c.valor);
  const recebimentos = ordenarFormas([...formas.values()]);
  return {
    tipo: 'webposto', turnos, turno: t, porTurnoParcial: false,
    vendas: { categorias, total: totalVendas },
    acrescimos, descontos,
    recebimentos, totalRecebido: soma(recebimentos, f => f.valor),
    devolucoes: { titulo: 'Vendas canceladas', itens: canceladas, total: soma(canceladas, c => c.valor), qtd: canceladas.length },
    afericoes: { itens: afericoes, litros: soma(afericoes, a => a.litros), valor: soma(afericoes, a => a.valor), temValor: true },
    avisos: [
      ...(t?.aberto || (!t && turnos.some(x => x.aberto)) ? ['Há caixa ainda aberto: os valores podem mudar até o fechamento.'] : []),
      ...(t ? ['Cartões lançados manualmente (sem venda) aparecem só no dia todo.'] : []),
    ],
  };
}

function montarAutosystem(b, turno) {
  const catGrupo = new Map(b.grupos.filter(g => g.grid != null).map(g => [Number(g.grid), g.categoria]));
  const catConta = new Map(b.categorias.map(c => [String(c.codigo), c]));
  const nomeConta = new Map(b.contas.map(c => [String(c.codigo), c.nome || c.descricao]));

  const turnos = [...new Set(b.receb.map(r => r.turno).filter(x => x != null && x !== ''))]
    .sort((x, y) => String(x).localeCompare(String(y), 'pt-BR', { numeric: true }))
    .map(x => ({ codigo: String(x), rotulo: /^\d+$/.test(String(x)) ? `${x}º turno` : String(x), aberto: false }));
  const t = turno ? turnos.find(x => x.codigo === String(turno)) : null;

  // Vendas (o Autosystem não separa vendas por turno → sempre o dia todo)
  const cats = new Map(CATEGORIAS.map(([k, l]) => [k, { chave: k, rotulo: l, valor: 0, qtd: 0, produtos: new Map() }]));
  let acrescimos = 0, descontos = 0, semCategoria = 0;
  const devol = new Map();
  b.vendas.forEach(v => {
    const valor = num(v.valor);
    const gc = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
    const cat0 = gc != null ? catGrupo.get(gc) : null;
    if (!cat0) semCategoria += 1;
    const cat = cats.get(cat0) || cats.get('outros');
    cat.valor += valor;
    cat.qtd += num(v.quantidade);
    const pr = cat.produtos.get(v.produto_codigo) || { nome: v.produto_nome || `Produto ${v.produto_codigo}`, qtd: 0, valor: 0, unidade: '' };
    pr.qtd += num(v.quantidade); pr.valor += valor;
    cat.produtos.set(v.produto_codigo, pr);
    // ajuste: valor_desconto > 0 acréscimo, < 0 desconto (devolução estorna)
    const vd = num(v.valor_desconto);
    const orig = v.devolucao ? -vd : vd;
    if (orig > 0) acrescimos += vd; else if (orig < 0) descontos -= vd;
    if (v.devolucao) {
      const d = devol.get(v.produto_codigo) || { descricao: v.produto_nome || `Produto ${v.produto_codigo}`, hora: horaDe(v.hora), qtd: 0, valor: 0 };
      d.qtd += Math.abs(num(v.quantidade)); d.valor += Math.abs(valor);
      devol.set(v.produto_codigo, d);
    }
  });
  const categorias = [...cats.values()].filter(c => Math.abs(c.valor) > 0.004)
    .map(c => ({ ...c, produtos: [...c.produtos.values()].sort((x, y) => y.valor - x.valor) }));

  // Recebimentos por conta (por turno quando escolhido); sobra/falta à parte
  const formas = new Map();
  let sobra = 0, falta = 0;
  b.receb.forEach(r => {
    if (t && String(r.turno) !== t.codigo) return;
    const valor = num(r.valor);
    if (catConta.get(String(r.conta_creditar))?.categoria === 'sobra_caixa') { sobra += valor; return; }
    const cod = String(r.modo_recebimento || 'sem-conta');
    const cat = catConta.get(cod);
    if (cat?.categoria === 'sobra_caixa') { sobra += valor; return; }
    if (cat?.categoria === 'falta_caixa') { falta += valor; return; }
    const tipo = cat?.categoria === 'cartao_pix' ? 'cartao' : (cat?.categoria || 'outros');
    const g = formas.get(cod) || { chave: `conta:${cod}`, rotulo: cat?.nome || nomeConta.get(cod) || `Conta ${cod}`, tipo, valor: 0 };
    g.valor += valor;
    formas.set(cod, g);
  });

  const afericoes = b.afericoes
    .map(a => ({ produto: a.produto_nome || `Produto ${a.produto_codigo}`, bico: a.bico, litros: num(a.quantidade), valor: 0, hora: horaDe(a.hora) }))
    .sort((x, y) => x.hora.localeCompare(y.hora));
  const devolucoes = [...devol.values()].sort((x, y) => y.valor - x.valor);
  const recebimentos = ordenarFormas([...formas.values()]);

  return {
    tipo: 'autosystem', turnos, turno: t, porTurnoParcial: !!t,
    vendas: { categorias, total: soma(categorias, c => c.valor) },
    acrescimos, descontos,
    recebimentos, totalRecebido: soma(recebimentos, f => f.valor),
    sobra, falta,
    devolucoes: { titulo: 'Devoluções', itens: devolucoes, total: soma(devolucoes, d => d.valor), qtd: devolucoes.length },
    afericoes: { itens: afericoes, litros: soma(afericoes, a => a.litros), valor: 0, temValor: false },
    avisos: [
      ...(t ? ['No Autosystem as vendas não são separadas por turno: elas mostram o dia todo; só os recebimentos são do turno.'] : []),
      ...(semCategoria > 0 ? [`${semCategoria} item(ns) de produtos sem categoria definida entraram em "Outros".`] : []),
    ],
  };
}
