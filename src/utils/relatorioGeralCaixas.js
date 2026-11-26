// Relatório geral dos caixas (admin) — modelos puros, sem rede nem tela.
// Mesmas fórmulas da aba Conciliação de caixas (BpoConciliacaoCaixas); mudou uma
// regra lá, mude aqui também. Alterações de Webposto e Autosystem saem num formato
// único (uma linha por alteração).
import { classificarItem } from '../services/mapeamentoVendasService';
import { formatCurrency } from './format';
import { camposAlterados, ehTabelaCaixa, fmtDataHora } from '../services/alteracoesCaixasWebpostoService';
import {
  CAMPOS_RELEVANTES, equivalente, formatDataBR, formatTimestamp, montarLancamentosAlterados, rotuloTipo, vazio,
} from './alteracoesCaixasAutosystem';

const num = (v) => Number(v) || 0;
const CENTAVO = 0.005;
const ROTULO_CATEGORIA = { combustivel: 'Combustíveis', automotivos: 'Produtos automotivos', conveniencia: 'Conveniência', outros: 'Outros / não classificados' };
const linhasCategoria = (t) => Object.entries(ROTULO_CATEGORIA)
  .map(([k, rotulo]) => ({ rotulo, valor: t[k] || 0 }))
  .filter(l => Math.abs(l.valor) > CENTAVO);

// Funcionários: uma linha por pessoa, sem as que não têm nada.
function fecharFuncionarios(mapa) {
  const tem = f => ['vendas', 'acrescimos', 'descontos', 'sobra', 'falta'].some(k => Math.abs(f[k]) > CENTAVO);
  return [...mapa.values()].filter(tem).sort((a, b) => b.vendas - a.vendas || a.nome.localeCompare(b.nome));
}
const novoFuncionario = (nome) => ({ nome, vendas: 0, acrescimos: 0, descontos: 0, sobra: 0, falta: 0 });
const somar = (lista, k) => lista.reduce((s, x) => s + num(x[k]), 0);

// ─── Webposto ───────────────────────────────────────────────────
const FORMAS_APRESENTADO = [
  ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão / PIX'], ['cheque', 'Cheque'], ['chequePre', 'Cheque pré'],
  ['notaPrazo', 'Nota a prazo'], ['cartaFrete', 'Carta frete'], ['valeCliente', 'Vale cliente'], ['valeFun', 'Vale funcionário'],
  ['emprestimo', 'Empréstimo'], ['prePag', 'Pré-pago'], ['chequePagar', 'Cheque a pagar'], ['transfBanc', 'Transferência bancária'],
  ['transfDeb', 'Transferência débito'], ['fundoCxDeb', 'Fundo de caixa'], ['despesa', 'Despesas'],
];
function formaDaVenda(nome) {
  const n = (nome || '').toUpperCase();
  if (/DINHEIRO|ESPECIE/.test(n)) return 'dinheiro';
  if (/CARTAO|CARTÃO|CREDITO|DEBITO|DÉBITO|CRÉDITO|PIX/.test(n)) return 'cartao';
  if (/CHEQUE/.test(n)) return 'cheque';
  return 'aberto';
}

const MEIO_TOLERANCIA = 0.02; // arredondamento entre as fontes
const somaDif = (l) => (l || []).reduce((s, d) => s + d.dif, 0);
// Caixas individuais do Webposto → Map(caixa → [{ func, dif }])
function difPorFuncionario(individuais = []) {
  const m = new Map();
  individuais.forEach(c => {
    const k = Number(c.caixaCodigo);
    m.set(k, [...(m.get(k) || []), { func: c.funcionarioCodigo, dif: num(c.diferenca) }]);
  });
  return m;
}

export function modeloWebposto({ vendas = [], canceladas = [], itens = [], produtos = [], grupos = [], formas = [], caixas = [], apresentados = [], funcionarios = [], individuais = [] }) {
  const difPorCaixa = difPorFuncionario(individuais);
  const validas = vendas.filter(v => v.cancelada !== 'S');
  const porVenda = new Map(validas.map(v => [v.vendaCodigo || v.codigo, v]));
  const prods = new Map(produtos.map(p => [p.produtoCodigo || p.codigo, p]));
  const grps = new Map(grupos.map(g => [g.grupoCodigo || g.codigo, g]));
  const nomes = new Map(funcionarios.map(f => [f.funcionarioCodigo || f.codigo, f.nome]));
  const mapa = new Map();
  let caixasSemDetalhe = 0;
  const func = (cod) => {
    if (!mapa.has(cod)) mapa.set(cod, novoFuncionario(nomes.get(cod) || (cod ? `Funcionário #${cod}` : 'Sem funcionário')));
    return mapa.get(cod);
  };

  // Vendas, acréscimos e descontos: pelos itens, de quem vendeu
  const cat = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
  itens.forEach(i => {
    const venda = porVenda.get(i.vendaCodigo);
    if (!venda) return;
    const valor = num(i.totalVenda) + num(i.totalAcrescimo);
    cat[classificarItem(i, prods, grps)] += valor;
    const f = func(venda.funcionarioCodigo);
    f.vendas += valor;
    if (num(i.totalAcrescimo) > 0) f.acrescimos += num(i.totalAcrescimo);
    if (num(i.totalDesconto) > 0) f.descontos += num(i.totalDesconto);
  });

  // Recebimentos. Caixa FECHADO → fechamento (apurado × apresentado), que reflete as
  // correções da conferência; caixa ABERTO → forma original da venda (só apurado).
  const fechados = new Map(caixas.filter(c => c.fechado).map(c => [c.caixaCodigo, c]));
  const formasMap = new Map(FORMAS_APRESENTADO.map(([k, rotulo]) => [k, { rotulo, apurado: 0, apresentado: 0, diferenca: 0 }]));
  formasMap.set('aberto', { rotulo: 'Outras formas', apurado: 0, apresentado: 0, diferenca: 0 });
  const comFechamento = new Set();
  apresentados.forEach(ca => {
    const caixa = fechados.get(ca.caixaCodigo);
    if (!caixa) return;
    comFechamento.add(ca.caixaCodigo);
    let dif = 0;
    FORMAS_APRESENTADO.forEach(([k]) => {
      const apur = num(ca[`${k}Apurado`]), apres = num(ca[`${k}Apresentado`]);
      const f = formasMap.get(k);
      f.apurado += apur; f.apresentado += apres; f.diferenca += apres - apur;
      dif += apres - apur;
    });
    // Sobra e falta de CADA funcionário do caixa (caixas individuais; uma não compensa a
    // outra). O que não fechar com a diferença do caixa fica com o responsável, com aviso.
    const lancar = (cod, v) => {
      if (v > CENTAVO) func(cod).sobra += v;
      else if (v < -CENTAVO) func(cod).falta += -v;
    };
    const detalhe = difPorCaixa.get(Number(ca.caixaCodigo));
    (detalhe || []).forEach(d => lancar(d.func, d.dif));
    const resto = dif - somaDif(detalhe);
    if (Math.abs(resto) > MEIO_TOLERANCIA) { lancar(caixa.funcionarioCodigo, resto); caixasSemDetalhe += 1; }
  });
  const caixaDaVenda = new Map(validas.map(v => [v.vendaCodigo || v.codigo, v.caixaCodigo]));
  formas.forEach(fp => {
    if (!caixaDaVenda.has(fp.vendaCodigo) || comFechamento.has(caixaDaVenda.get(fp.vendaCodigo))) return;
    formasMap.get(formaDaVenda(fp.nomeFormaPagamento)).apurado += num(fp.valorPagamento);
  });

  const lista = fecharFuncionarios(mapa);
  const listaFormas = [...formasMap.values()].filter(f => [f.apurado, f.apresentado].some(v => Math.abs(v) > CENTAVO));
  const total = Object.values(cat).reduce((s, v) => s + v, 0);
  return {
    sistema: 'webposto',
    categorias: linhasCategoria(cat), totalVendas: total, outrasEntradas: null,
    formas: listaFormas, totalRecebido: somar(listaFormas, 'apurado'), temApresentado: comFechamento.size > 0,
    funcionarios: lista,
    acrescimos: somar(lista, 'acrescimos'), descontos: somar(lista, 'descontos'), sobras: somar(lista, 'sobra'), faltas: somar(lista, 'falta'),
    qtdVendas: validas.length, canceladas: { qtd: canceladas.length, valor: somar(canceladas, 'totalVenda') },
    caixas: caixas.length, caixasSemFechamento: caixas.length - comFechamento.size, caixasSemDetalhe, avisos: [],
  };
}

// ─── Autosystem ─────────────────────────────────────────────────
const FORMAS_AS = [['dinheiro', 'Dinheiro'], ['cartao_pix', 'Cartão / PIX'], ['cheque', 'Cheque'], ['a_prazo', 'A prazo'], ['outros', 'Outros / não classificados']];

// `categoriaGrupo`: Map(grid do grupo → categoria). `categoriaConta`: Map(código → categoria).
export function modeloAutosystem({ vendas = [], recebimentos = [], outrasEntradas = [], categoriaGrupo = new Map(), categoriaConta = new Map() }) {
  const mapa = new Map();
  const func = (pessoaId, nomeBruto) => {
    const nome = String(nomeBruto || '').trim();
    const k = pessoaId != null && pessoaId !== '' ? `p:${pessoaId}` : nome ? `n:${nome.toLowerCase()}` : 'sem-id';
    if (!mapa.has(k)) mapa.set(k, novoFuncionario(nome || 'Sem identificação'));
    else if (mapa.get(k).nome === 'Sem identificação' && nome) mapa.get(k).nome = nome;
    return mapa.get(k);
  };
  const nomeDe = (a, b) => (a && String(a).trim()) || String(b || '').trim();

  const cat = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
  let semGrupo = 0;
  vendas.forEach(v => {
    const c = v.grupo_produto_codigo != null ? categoriaGrupo.get(Number(v.grupo_produto_codigo)) : null;
    const valor = num(v.valor);
    if (!c) semGrupo += 1;
    cat[c in cat ? c : 'outros'] += valor;
    const f = func(v.vendedor_pessoa_id, nomeDe(v.vendedor_nome, v.vendedor));
    f.vendas += valor;
    // valor_desconto > 0 = acréscimo, < 0 = desconto; devolução vem com sinal trocado e estorna
    const vd = num(v.valor_desconto);
    const orig = v.devolucao ? -vd : vd;
    if (orig > 0) f.acrescimos += vd;
    else if (orig < 0) f.descontos -= vd;
  });

  const formas = Object.fromEntries(FORMAS_AS.map(([k]) => [k, 0]));
  let semConta = 0;
  recebimentos.forEach(r => {
    const valor = num(r.valor);
    const credito = r.conta_creditar ? categoriaConta.get(String(r.conta_creditar)) : null;
    const debito = r.modo_recebimento ? categoriaConta.get(String(r.modo_recebimento)) : null;
    // Sobra/falta: vai para o RESPONSÁVEL do PDV/turno (como no relatório do Autosystem),
    // não para quem lançou (muitas vezes a CCI). Sem responsável (Edge antiga), quem lançou.
    // Pelo lado do lançamento: conta de sobra/falta creditada = sobra (PDV debitado);
    // debitada = falta (PDV creditado) — vale para conta única 'sobra e falta' e separadas.
    const ehSF = (c) => c === 'sobra_caixa' || c === 'falta_caixa';
    if (ehSF(credito) || ehSF(debito)) {
      const f = r.responsavel_pessoa_id != null || r.responsavel_nome
        ? func(r.responsavel_pessoa_id, r.responsavel_nome)
        : func(r.usuario_pessoa_id, nomeDe(r.usuario_nome, r.usuario));
      if (ehSF(credito)) f.sobra += valor; else f.falta += valor;
      return;
    }
    if (!debito) semConta += 1;
    formas[debito in formas ? debito : 'outros'] += valor;
  });

  const lista = fecharFuncionarios(mapa);
  const listaFormas = FORMAS_AS.map(([k, rotulo]) => ({ rotulo, apurado: formas[k], apresentado: 0, diferenca: 0 })).filter(f => Math.abs(f.apurado) > CENTAVO);
  return {
    sistema: 'autosystem',
    categorias: linhasCategoria(cat), totalVendas: Object.values(cat).reduce((s, v) => s + v, 0),
    outrasEntradas: somar(outrasEntradas, 'valor'),
    formas: listaFormas, totalRecebido: somar(listaFormas, 'apurado'), temApresentado: false,
    funcionarios: lista,
    acrescimos: somar(lista, 'acrescimos'), descontos: somar(lista, 'descontos'), sobras: somar(lista, 'sobra'), faltas: somar(lista, 'falta'),
    qtdVendas: null, canceladas: null, caixas: null, caixasSemFechamento: 0, caixasSemDetalhe: 0,
    avisos: [
      semGrupo > 0 && `${semGrupo} item(ns) de venda sem categoria de produto, somados em Outros.`,
      semConta > 0 && `${semConta} recebimento(s) em conta não classificada, somados em Outros.`,
    ].filter(Boolean),
  };
}

// ─── Sangrias por funcionário ───────────────────────────────────
// Apurado = sangria no sistema quando o cliente confirmou a contagem (fica gravada);
// apresentado = contado pelo cliente; alterações = valor de AGORA no sistema − apurado
// (a confirmação trava a contagem, mas a sangria ainda pode ser mexida no sistema);
// diferença = apresentado − (apurado + alterações).
// Retiradas antes do depósito (combustível p/ ir ao banco etc.) saem do dinheiro contado:
//   • com funcionário (lançada dizendo de quem saiu): o apresentado dele já vem sem ela
//     (bate com o "Din. Apres." do sistema quando a sangria foi acertada lá) e a retirada
//     aparece logo abaixo, só para informar (detalhe: fora dos totais);
//   • sem funcionário (retiradas antigas): linha própria no fim do dia, com apresentado
//     negativo. Nos dois casos o total apresentado = valor a depositar.
// Dia sem confirmação: só o apurado atual; o resto fica null ("–").
//   fechamentos: cliente_sangrias_fechamento do período
//   atuais: [{ dia, func, caixa, nome, turno, ordem, valor }] | null (não deu para consultar)
const centavos = (v) => Math.round(v * 100) / 100;
export function modeloSangrias({ fechamentos = [], atuais = null }) {
  const linhas = [];
  const porDia = new Map();
  (atuais || []).forEach(a => porDia.set(a.dia, [...(porDia.get(a.dia) || []), { ...a, livre: true }]));
  const conferidos = new Map(fechamentos.map(f => [String(f.data).slice(0, 10), f]));

  conferidos.forEach((f, dia) => {
    const doDia = porDia.get(dia) || [];
    // Com caixa primeiro: o que sobra do funcionário vai p/ o registro sem caixa (manual/Autosystem)
    const regs = [...(f.registros || [])].sort((x, y) => (x.caixaCodigo == null) - (y.caixaCodigo == null));
    const retiradas = (f.retiradas || []).map(r => ({ ...r, valor: centavos(num(r.valor)), livre: true })).filter(r => r.valor);
    regs.forEach(r => {
      const achados = doDia.filter(a => a.livre && String(a.func) === String(r.funcionarioCodigo)
        && (r.caixaCodigo == null || String(a.caixa ?? '') === String(r.caixaCodigo)));
      achados.forEach(a => { a.livre = false; });
      const dele = retiradas.filter(x => x.livre && x.funcionario_codigo != null && String(x.funcionario_codigo) === String(r.funcionarioCodigo)
        && (x.caixa_codigo == null || r.caixaCodigo == null || String(x.caixa_codigo) === String(r.caixaCodigo)));
      dele.forEach(x => { x.livre = false; });
      const apurado = num(r.dinheiroApurado), apresentado = centavos(num(r.dinheiroApresentado) - somar(dele, 'valor'));
      const alteracoes = atuais ? centavos(somar(achados, 'valor') - apurado) : null;
      const base = { dia, turno: r.turno || achados[0]?.turno || '', ordem: r.turnoOrdem ?? achados[0]?.ordem ?? 99, ordNome: r.nome || 'Sem funcionário' };
      linhas.push({ ...base, nome: base.ordNome, apurado, apresentado, alteracoes, diferenca: centavos(apresentado - apurado - (alteracoes || 0)) });
      dele.forEach(x => linhas.push({ ...base, sub: 1, detalhe: true, retirada: true, nome: x.descricao || 'Retirada',
        apurado: null, apresentado: -x.valor, alteracoes: null, diferenca: null }));
    });
    retiradas.filter(x => x.livre).forEach(x => {
      linhas.push({ dia, nome: x.descricao || 'Retirada', turno: '', ordem: 1000, retirada: true,
        apurado: 0, apresentado: -x.valor, alteracoes: atuais ? 0 : null, diferenca: -x.valor });
    });
    // Entrou no sistema depois da confirmação, de quem não estava na contagem
    doDia.filter(a => a.livre).forEach(a => {
      a.livre = false;
      linhas.push({ dia, nome: a.nome, turno: a.turno, ordem: a.ordem, apurado: 0, apresentado: 0, alteracoes: a.valor, diferenca: centavos(-a.valor) });
    });
  });
  porDia.forEach((lista, dia) => {
    if (conferidos.has(dia)) return;
    lista.forEach(a => linhas.push({ dia, nome: a.nome, turno: a.turno, ordem: a.ordem, apurado: a.valor, apresentado: null, alteracoes: null, diferenca: null }));
  });
  // retirada com funcionário (sub) logo abaixo dele; detalhe não entra nos totais
  const ordNome = (l) => l.ordNome || l.nome;
  linhas.sort((x, y) => x.dia.localeCompare(y.dia) || x.ordem - y.ordem || x.turno.localeCompare(y.turno)
    || ordNome(x).localeCompare(ordNome(y)) || (x.sub || 0) - (y.sub || 0));
  const contam = linhas.filter(l => !l.detalhe);
  const total = (k) => (contam.some(l => l[k] != null) ? centavos(somar(contam, k)) : null);
  return {
    linhas,
    totais: { apurado: total('apurado'), apresentado: total('apresentado'), alteracoes: total('alteracoes'), diferenca: total('diferenca') },
    conferencias: [...conferidos.entries()].sort().map(([dia, f]) => ({ dia, por: f.confirmado_por || '', em: f.confirmado_em })),
    semConferencia: [...porDia.keys()].filter(d => !conferidos.has(d)).sort(),
    atualIndisponivel: !atuais && conferidos.size > 0,
  };
}

// Sangrias atuais do Webposto, por funcionário e caixa (mesma conta da tela Sangrias do
// cliente: soma os meios das contas habilitadas).
const MEIOS_SANGRIA = ['dinheiro', 'cheque', 'cartao', 'nota', 'cartaFrete', 'emprestimo', 'despesa', 'chequePre', 'vale', 'transferencia'];
export function sangriasAtuaisWebposto({ sangrias = [], caixas = [], funcionarios = [], contas = new Set(), de, ate }) {
  const caixaPor = new Map(caixas.map(c => [Number(c.caixaCodigo ?? c.codigo), c]));
  const nomes = new Map(funcionarios.map(f => [String(f.funcionarioCodigo ?? f.codigo), f.nome]));
  const m = new Map();
  sangrias.forEach(s => {
    if (!contas.has(Number(s.contaCodigo))) return;
    const valor = MEIOS_SANGRIA.reduce((t, k) => t + num(s[k]), 0);
    if (!valor) return;
    const caixa = s.caixaCodigo != null ? Number(s.caixaCodigo) : null;
    const cx = caixaPor.get(caixa);
    const dia = de === ate ? de : String(cx?.dataMovimento || s.dataSangria || '').slice(0, 10);
    if (dia < de || dia > ate) return;
    const func = s.funcionarioCodigo || '__sem_funcionario__';
    const k = `${dia}|${func}|${caixa ?? ''}`;
    const g = m.get(k) || {
      dia, func, caixa, nome: nomes.get(String(func)) || (s.funcionarioCodigo ? `Funcionário #${func}` : 'Sem funcionário identificado'),
      turno: cx?.turno || '', ordem: Number(cx?.turnoCodigo) || 99, valor: 0,
    };
    g.valor = centavos(g.valor + valor);
    m.set(k, g);
  });
  return [...m.values()];
}

// ─── Alterações: uma linha por alteração ────────────────────────
// { id, chaveUsuario, usuario, quando, ordem, operacao, turno, dataCaixa, pdv, funcionario, lancamento,
//   identificacao, principais: [{campo, antes, depois}], valor }
// Só a mudança principal entra no relatório: o que muda por consequência (ex.: trocar a
// administradora muda a comissão e o bom para) fica de fora, salvo se for a única mudança.
// Inclusão: dados do lançamento em "depois" (antes = —). Exclusão: em "antes" (depois = —).
const SEM_TURNO = 'Sem turno identificado';
const SEM_FUNCIONARIO = 'Sem funcionário';

// "PDV, 001, 2º TURNO, 24/11/2026" (ou sem PDV) → partes do caixa
function partesDoCaixa(caixa) {
  const partes = String(caixa || '').split(',').map(x => x.trim()).filter(Boolean);
  const dataCaixa = partes.find(p => /^\d{2}[/]\d{2}[/]\d{4}$/.test(p)) || '';
  const turno = partes.find(p => /turno/i.test(p)) || '';
  const iPdv = partes.findIndex(p => /^PDV$/i.test(p));
  const pdv = iPdv >= 0 ? (partes[iPdv + 1] || '') : (partes.find(p => /^\d{1,4}$/.test(p)) || '');
  return { turno: turno || SEM_TURNO, dataCaixa, pdv };
}

const OPERACAO_WP = { INCLUIR: 'Inclusão', ALTERAR: 'Alteração', EXCLUIR: 'Exclusão' };
const CAMPOS_VALOR_WP = ['Valor Total', 'Valor', 'Dinheiro'];
const valorTexto = (v) => {
  const s = String(v ?? '').trim();
  const limpo = s.replace(/R\$\s*/i, '');
  if (!limpo || /^\d{1,3}(\.\d{3})+$/.test(limpo)) return s; // "1.607": milhar ou decimal? deixa como veio
  const n = /,\d{1,2}$/.test(limpo) ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo);
  return Number.isFinite(n) ? formatCurrency(n) : s;
};
const ehCampoDinheiro = (campo) => /^(valor|dinheiro)/i.test(campo);
const valorDoCampo = (campo, v) => (ehCampoDinheiro(campo) ? valorTexto(v) : String(v ?? '').trim()) || '—';
const VAZIO = '—';
const emInclusao = (pares) => pares.map(([campo, v]) => ({ campo, antes: VAZIO, depois: v }));
const emExclusao = (pares) => pares.map(([campo, v]) => ({ campo, antes: v, depois: VAZIO }));

const SECUNDARIOS = new Set(['Bom Para', 'Valor Original do Cartão', 'Percentual de Comissão', 'Cartão Remessa']);
// Dados do lançamento que interessam na inclusão/exclusão, na ordem de exibição. Por
// significado (não pelo nome exato): a auditoria varia os nomes conforme a tabela.
const DADOS_LANCAMENTO = [/^administradora/i, /^plano de conta/i, /^conta/i, /^hist[óo]rico/i, /^motivo/i, /^cliente/i, /^pessoa/i, /^emitente/i,
  /^banco/i, /^parcela|^quantidade.*parcela|^qtd.*parcela/i, /^bom para/i, /^vencimento/i, /^placa/i, /^observa/i];
const SEM_INFORMACAO = /^(0|0[.,]0+|n[ãa]o|n|false|null)$/i;
function dadosDoLancamento(ctx) {
  const pares = Object.entries(ctx).filter(([k, v]) => v !== '' && !SEM_INFORMACAO.test(v) && k !== 'Conferido');
  const ja = new Set();
  return DADOS_LANCAMENTO.flatMap(re => pares.filter(([k]) => re.test(k) && !ja.has(k) && ja.add(k)));
}
function mudancasPrincipais(mudancas) {
  const principais = mudancas.filter(c => !SECUNDARIOS.has(c.campo));
  if (principais.length) return principais;
  // "Valor Original" costuma vir só no "antes": não é mudança de verdade
  const outras = mudancas.filter(c => c.campo !== 'Valor Original do Cartão');
  return outras.length ? outras : mudancas;
}
const ROTULO_IDENT = [[/^autoriza/i, 'Aut.'], [/^nsu/i, 'NSU'], [/^n[úu]mero/i, 'Nº'], [/^documento/i, 'Doc.'], [/^venda$/i, 'Venda']];
function identificacaoDe(ctx, fora = new Set()) {
  const ident = [];
  ROTULO_IDENT.forEach(([re, rotulo]) => Object.entries(ctx).forEach(([k, v]) => {
    if (!re.test(k) || fora.has(k) || !v || SEM_INFORMACAO.test(v)) return;
    if (!ident.some(x => x.v === v)) ident.push({ v, texto: `${rotulo} ${v}` }); // NSU igual à autorização não repete
  }));
  return ident;
}

export function alteracoesWebposto(itens = []) {
  return itens.filter(i => ehTabelaCaixa(i.tabela)).map(i => {
    const alteracao = i.operacao === 'ALTERAR';
    const mudancas = alteracao
      ? camposAlterados(i).map(c => ({ campo: c, antes: valorDoCampo(c, i.antes[c]), depois: valorDoCampo(c, i.depois[c]) })) : [];
    const campoValor = CAMPOS_VALOR_WP.find(c => i.ctx[c]);
    const ident = identificacaoDe(i.ctx, new Set(mudancas.map(c => c.campo)));
    const dados = dadosDoLancamento(i.ctx);
    // Bandeira repete a administradora quando é ela que mudou (ou que foi incluída/excluída)
    const bandeira = i.ctx.Bandeira;
    if (bandeira && !SEM_INFORMACAO.test(bandeira) && ![i.antes.Administradora, i.depois.Administradora, i.ctx.Administradora].includes(bandeira)) {
      ident.push({ v: bandeira, texto: bandeira });
    }
    return {
      id: i.id, chaveUsuario: i.usuario, usuario: i.usuario, quando: fmtDataHora(i.dataHora).replace(/:\d{2}$/, ''), ordem: String(i.dataHora || ''),
      operacao: OPERACAO_WP[i.operacao] || i.operacao || 'Outra', ...partesDoCaixa(i.caixa), funcionario: i.funcionario || SEM_FUNCIONARIO,
      lancamento: i.tabela, identificacao: ident.map(x => x.texto).join(' · '),
      principais: alteracao ? mudancasPrincipais(mudancas) : i.operacao === 'EXCLUIR' ? emExclusao(dados) : emInclusao(dados),
      valor: valorTexto(campoValor ? i.ctx[campoValor] : ''),
    };
  });
}

const textoCampo = (v, c, obj) => {
  if (vazio(v)) return '—';
  if (c.type === 'date') return formatDataBR(v);
  if (c.type === 'currency') return formatCurrency(num(v));
  if (c.nomeKey && obj?.[c.nomeKey]) return String(obj[c.nomeKey]);
  return String(v);
};

// Inclusão/exclusão: motivo, documento e valor já têm coluna; a data está no turno.
const COM_COLUNA = new Set(['data', 'motivo', 'documento', 'valor']);
function dadosAutosystem(src) {
  return CAMPOS_RELEVANTES.filter(c => !COM_COLUNA.has(c.key) && !vazio(src[c.key])
    && !(c.key === 'vencto' && formatDataBR(src.vencto) === formatDataBR(src.data))
    && !(c.key === 'motivo_nome' && String(src.motivo_nome).trim() === String(src.motivo_movto_nome || src.motivo_nome).trim()))
    .map(c => [c.label, textoCampo(src[c.key], c, src)]);
}

export function alteracoesAutosystem(linhas = []) {
  const saida = [];
  montarLancamentosAlterados(linhas).forEach(no => no.eventos.forEach((ev, k) => {
    const src = ev.depois || ev.antes || {};
    const login = String(src.pgd_username || '').trim();
    const usuario = String(src.usuario_nome || '').trim() || login || 'Sem usuário';
    const par = !!(ev.antes && ev.depois);
    const texto = (x) => (vazio(x) ? '' : String(x).trim());
    saida.push({
      id: `${no.movtoKey}:${ev.timestamp}:${k}`, chaveUsuario: login || usuario, usuario,
      quando: formatTimestamp(ev.timestamp), ordem: String(ev.timestamp || ''),
      operacao: rotuloTipo(ev.tipo),
      turno: vazio(src.turno) ? SEM_TURNO : `Turno ${src.turno}`, dataCaixa: vazio(src.data) ? '' : formatDataBR(src.data), pdv: '',
      funcionario: texto(src.usuario_original_nome) || texto(src.responsavel_nome) || SEM_FUNCIONARIO,
      lancamento: texto(src.motivo_movto_nome) || texto(src.motivo_nome), identificacao: texto(src.documento) && `Doc. ${texto(src.documento)}`,
      principais: par ? CAMPOS_RELEVANTES.filter(c => !equivalente(ev.antes[c.key], ev.depois[c.key], c.type))
        .map(c => ({ campo: c.label, antes: textoCampo(ev.antes[c.key], c, ev.antes), depois: textoCampo(ev.depois[c.key], c, ev.depois) }))
        : (ev.tipo === 'EXCLUSAO' ? emExclusao : emInclusao)(dadosAutosystem(src)),
      valor: num(src.valor) ? formatCurrency(num(src.valor)) : '',
    });
  }));
  return saida;
}

// Usuários que alteraram algo, com a quantidade (para escolher no relatório).
export function usuariosDasAlteracoes(alteracoes = []) {
  const m = new Map();
  alteracoes.forEach(a => {
    const u = m.get(a.chaveUsuario) || { chave: a.chaveUsuario, nome: a.usuario, qtd: 0 };
    u.qtd += 1;
    m.set(a.chaveUsuario, u);
  });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

// Alterações dos usuários escolhidos: turno (data e número) → funcionário → alteração
// (inclusão, alteração, ajuste, exclusão; depois lançamento e horário).
const ORDEM_OPERACAO = ['Inclusão', 'Alteração', 'Ajuste', 'Exclusão'];
const posOperacao = (o) => { const i = ORDEM_OPERACAO.indexOf(o); return i < 0 ? ORDEM_OPERACAO.length : i; };
const iso = (br) => String(br || '').split('/').reverse().join('-');
const numeroTurno = (t) => parseInt(String(t).match(/\d+/)?.[0] ?? '999', 10);

export function alteracoesPorTurno(alteracoes = [], selecionados = new Set()) {
  const turnos = new Map();
  alteracoes.filter(a => selecionados.has(a.chaveUsuario)).forEach(a => {
    const k = `${a.dataCaixa}|${a.turno}`;
    if (!turnos.has(k)) turnos.set(k, { chave: k, turno: a.turno, dataCaixa: a.dataCaixa, qtd: 0, funcs: new Map() });
    const t = turnos.get(k);
    t.qtd += 1;
    if (!t.funcs.has(a.funcionario)) t.funcs.set(a.funcionario, { nome: a.funcionario, pdvs: new Set(), linhas: [] });
    const f = t.funcs.get(a.funcionario);
    if (a.pdv) f.pdvs.add(a.pdv);
    f.linhas.push(a);
  });
  return [...turnos.values()]
    .sort((x, y) => (x.turno === SEM_TURNO) - (y.turno === SEM_TURNO) || iso(x.dataCaixa).localeCompare(iso(y.dataCaixa))
      || numeroTurno(x.turno) - numeroTurno(y.turno) || x.turno.localeCompare(y.turno))
    .map(({ funcs, ...t }) => ({
      ...t,
      funcionarios: [...funcs.values()]
        .sort((x, y) => (x.nome === SEM_FUNCIONARIO) - (y.nome === SEM_FUNCIONARIO) || x.nome.localeCompare(y.nome))
        .map(f => {
          const linhas = f.linhas.sort((x, y) => posOperacao(x.operacao) - posOperacao(y.operacao)
            || x.lancamento.localeCompare(y.lancamento) || x.ordem.localeCompare(y.ordem));
          const ops = new Map();
          linhas.forEach(l => ops.set(l.operacao, (ops.get(l.operacao) || 0) + 1));
          return { nome: f.nome, pdvs: [...f.pdvs].sort(), linhas, operacoes: [...ops.entries()] };
        }),
    }));
}
