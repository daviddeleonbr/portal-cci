// Cruzamento DRE × Fluxo de Caixa (determinístico, sem IA). Compara dois períodos
// (anterior × atual) e devolve DIAGNÓSTICOS com números e grau de evidência:
//   comprovado   — os próprios números mostram (ex.: recebimentos caíram junto com vendas)
//   provavel     — há evidência de apoio (ex.: contas a receber subiram)
//   hipotese     — possível, mas falta dado para confirmar (diz qual)
//   insuficiente — não dá para concluir
// Competência (DRE) ≠ caixa (fluxo): o texto nunca trata lucro como dinheiro.
//
// Período: {
//   dre:   { receitaBruta, cmv, lucroBruto, resultadoOperacional, resultadoLiquido },
//   fluxo: { recebimentosOperacionais, pagamentosFornecedores, caixaOperacional,
//            caixaInvestimento, caixaFinanciamento, variacaoCaixa,
//            transferenciasInternasRecebidas? },
//   giro:  { contasReceber?, contasPagar?, estoque? }  (saldos no fim do período)
//   dias
// }
import { comparar, relevante, r2 } from './variacao';

const brl = (v) => `R$ ${Number(Math.abs(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctTxt = (c) => (c.pct == null ? 'sem base de comparação' : `${c.pct > 0 ? '+' : ''}${c.pct.toLocaleString('pt-BR')}%`);
const tem = (v) => v != null && Number.isFinite(Number(v));

export function cruzarDreCaixa(anterior, atual, { limiar = { pct: 5, valor: 1000 } } = {}) {
  const diag = [];
  const add = (d) => diag.push(d);
  const A = anterior || {};
  const B = atual || {};
  const c = (f) => (tem(f(A)) && tem(f(B)) ? comparar(f(A), f(B)) : null);

  const receita = c(p => p.dre?.receitaBruta);
  const receb = c(p => p.fluxo?.recebimentosOperacionais);
  const cmv = c(p => p.dre?.cmv);
  const pagForn = c(p => p.fluxo?.pagamentosFornecedores);
  const cr = c(p => p.giro?.contasReceber);
  const cp = c(p => p.giro?.contasPagar);
  const est = c(p => p.giro?.estoque);
  const lucroBrutoPct = (p) => (p.dre?.receitaBruta > 0 && tem(p.dre?.lucroBruto) ? (p.dre.lucroBruto / p.dre.receitaBruta) * 100 : null);
  const subiu = (x) => x && relevante(x, limiar) && x.diferenca > 0;
  const caiu = (x) => x && relevante(x, limiar) && x.diferenca < 0;
  const estavel = (x) => x && !relevante(x, limiar);

  // ─── 4.1 Receita × recebimentos ──────────────────────────────
  if (receita && receb) {
    const conversao = (p) => (p.dre?.receitaBruta > 0 ? (p.fluxo.recebimentosOperacionais / p.dre.receitaBruta) * 100 : null);
    const conv = { anterior: conversao(A), atual: conversao(B) };
    const base = { receita, recebimentos: receb, conversaoPct: conv };
    if (caiu(receb) && caiu(receita) && receb.pct != null && receita.pct != null && Math.abs(receb.pct - receita.pct) <= 5) {
      add({ id: 'receb-acompanha-vendas', tema: 'receita_recebimentos', grau: 'comprovado', efeito: 'negativo',
        titulo: 'Recebimentos caíram junto com as vendas',
        texto: `As vendas caíram ${pctTxt(receita)} e os recebimentos ${pctTxt(receb)}: a queda de caixa vem de vender menos, não de receber mais tarde.`,
        numeros: base });
    } else if (caiu(receb) && (estavel(receita) || subiu(receita))) {
      const crSubiu = subiu(cr);
      add({ id: 'receb-sem-vendas', tema: 'receita_recebimentos', grau: crSubiu ? 'provavel' : 'hipotese', efeito: 'negativo',
        titulo: 'Recebimentos caíram sem queda nas vendas',
        texto: `Vendas ${pctTxt(receita)}, recebimentos ${pctTxt(receb)} (${brl(receb.diferenca)} a menos no caixa). `
          + (crSubiu ? `As contas a receber subiram ${brl(cr.diferenca)}: o dinheiro das vendas está ficando a receber (prazo maior, inadimplência ou menos antecipação de cartões).`
            : cr ? 'As contas a receber não explicam a diferença; confira antecipações de cartão do mês anterior, inadimplência e lançamentos de recebimento.'
              : 'Sem o saldo de contas a receber não dá para confirmar se é prazo, inadimplência ou fim de antecipação de cartões.'),
        numeros: { ...base, contasReceber: cr }, falta: cr ? [] : ['contas a receber em aberto'] });
    } else if (subiu(receb) && (estavel(receita) || caiu(receita))) {
      add({ id: 'receb-acima-vendas', tema: 'receita_recebimentos', grau: caiu(cr) ? 'provavel' : 'hipotese', efeito: 'atencao',
        titulo: 'Recebimentos subiram mais que as vendas',
        texto: `Vendas ${pctTxt(receita)}, recebimentos ${pctTxt(receb)}. ` + (caiu(cr)
          ? `As contas a receber caíram ${brl(cr.diferenca)}: entrou dinheiro de vendas de meses anteriores.`
          : 'Pode ser antecipação de cartões ou recebimento de vendas anteriores — não é, necessariamente, melhora da operação.'),
        numeros: { ...base, contasReceber: cr }, falta: cr ? [] : ['contas a receber em aberto'] });
    } else if (subiu(receita) && !subiu(receb)) {
      add({ id: 'vendas-sem-caixa', tema: 'receita_recebimentos', grau: subiu(cr) ? 'provavel' : 'hipotese', efeito: 'atencao',
        titulo: 'Vendas cresceram sem gerar caixa na mesma proporção',
        texto: `Vendas ${pctTxt(receita)}, recebimentos ${pctTxt(receb)}.` + (subiu(cr) ? ` O crescimento ficou nas contas a receber (+${brl(cr.diferenca)}).` : ''),
        numeros: { ...base, contasReceber: cr } });
    }
  }

  // ─── 4.2 Custos × pagamentos a fornecedores ─────────────────
  if (cmv && pagForn) {
    if (caiu(pagForn) && (estavel(cmv) || subiu(cmv))) {
      const consumiuEstoque = caiu(est);
      const adiou = subiu(cp);
      const grau = consumiuEstoque || adiou ? 'provavel' : 'hipotese';
      const causas = [
        consumiuEstoque && `o estoque caiu ${brl(est.diferenca)} — vendeu o que já tinha comprado (consumo de estoque)`,
        adiou && `as contas a pagar subiram ${brl(cp.diferenca)} — parte das compras ficou para pagar depois`,
      ].filter(Boolean);
      add({ id: 'pagou-menos-sem-custo-menor', tema: 'custos_pagamentos', grau, efeito: 'atencao',
        titulo: 'Pagou menos a fornecedores sem custo menor',
        texto: `CMV ${pctTxt(cmv)}, pagamentos a fornecedores ${pctTxt(pagForn)}. Não é economia: `
          + (causas.length ? `${causas.join('; ')}.` : 'falta estoque e contas a pagar para separar consumo de estoque de pagamento adiado.'),
        numeros: { cmv, pagamentosFornecedores: pagForn, estoque: est, contasPagar: cp },
        falta: [!est && 'estoque', !cp && 'contas a pagar'].filter(Boolean) });
    } else if (subiu(pagForn) && (estavel(cmv) || caiu(cmv))) {
      add({ id: 'pagou-mais-que-custo', tema: 'custos_pagamentos', grau: subiu(est) || caiu(cp) ? 'provavel' : 'hipotese', efeito: 'atencao',
        titulo: 'Pagamentos a fornecedores subiram acima do custo',
        texto: `CMV ${pctTxt(cmv)}, pagamentos ${pctTxt(pagForn)}. ` + (subiu(est) ? `Estoque +${brl(est.diferenca)}: comprou para estocar.` : caiu(cp) ? `Contas a pagar −${brl(cp.diferenca)}: quitou compras de meses anteriores.` : 'Confira compra para estoque ou quitação de atrasados.'),
        numeros: { cmv, pagamentosFornecedores: pagForn, estoque: est, contasPagar: cp } });
    }
  }
  // Contas a pagar crescendo sem compras crescendo = acúmulo de obrigações
  if (cp && subiu(cp)) {
    const compras = (p) => (tem(p.dre?.cmv) && tem(p.giro?.estoque) && tem(p.giro?.estoqueInicial) ? p.dre.cmv + p.giro.estoque - p.giro.estoqueInicial : null);
    const comp = tem(compras(A)) && tem(compras(B)) ? comparar(compras(A), compras(B)) : null;
    if (comp && !subiu(comp) && (cp.pct == null || cp.pct > (comp.pct ?? 0) + 10)) {
      add({ id: 'cp-sem-compras', tema: 'capital_giro', grau: 'provavel', efeito: 'negativo',
        titulo: 'Contas a pagar crescendo sem aumento de compras',
        texto: `Contas a pagar ${pctTxt(cp)} (${brl(cp.diferenca)}) com compras ${pctTxt(comp)}: obrigações estão se acumulando (pagamentos adiados).`,
        numeros: { contasPagar: cp, compras: comp } });
    }
  }

  // ─── 4.3 Resultado × geração de caixa ───────────────────────
  const res = B.dre?.resultadoOperacional;
  const fco = B.fluxo?.caixaOperacional;
  if (tem(res) && tem(fco)) {
    const gap = r2(fco - res);
    if (res > 0 && fco < 0) {
      add({ id: 'lucro-sem-caixa', tema: 'resultado_caixa', grau: (subiu(cr) || subiu(est) || caiu(cp)) ? 'provavel' : 'comprovado', efeito: 'negativo',
        titulo: 'Lucro que não virou caixa',
        texto: `A DRE mostra resultado operacional de ${brl(res)} (competência), mas a operação consumiu ${brl(fco)} de caixa. `
          + [subiu(cr) && `contas a receber +${brl(cr.diferenca)}`, subiu(est) && `estoque +${brl(est.diferenca)}`, caiu(cp) && `fornecedores pagos além do custo (contas a pagar −${brl(cp.diferenca)})`].filter(Boolean).join('; ')
          + (subiu(cr) || subiu(est) || caiu(cp) ? ' — é onde o lucro ficou preso.' : 'Lucro contábil e caixa não são a mesma coisa: confira prazos e estoque.'),
        numeros: { resultadoOperacional: r2(res), caixaOperacional: r2(fco), diferenca: gap } });
    } else if (res < 0 && fco > 0) {
      add({ id: 'prejuizo-com-caixa', tema: 'resultado_caixa', grau: (subiu(cp) || caiu(est) || caiu(cr)) ? 'provavel' : 'hipotese', efeito: 'atencao',
        titulo: 'Caixa operacional positivo apesar de prejuízo',
        texto: `Resultado operacional de −${brl(res)}, mas a operação gerou ${brl(fco)} de caixa — `
          + ([subiu(cp) && 'pagamentos adiados (contas a pagar subiram)', caiu(est) && 'consumo de estoque', caiu(cr) && 'recebimento de vendas anteriores'].filter(Boolean).join(', ') || 'possível adiamento de pagamentos ou antecipação de recebíveis')
          + '. Não é sustentável se o prejuízo continuar.',
        numeros: { resultadoOperacional: r2(res), caixaOperacional: r2(fco), diferenca: gap } });
    }
    // Lucro subiu e caixa piorou
    const resC = c(p => p.dre?.resultadoOperacional);
    const fcoC = c(p => p.fluxo?.caixaOperacional);
    if (resC && fcoC && subiu(resC) && caiu(fcoC)) {
      add({ id: 'lucro-sobe-caixa-cai', tema: 'resultado_caixa', grau: 'comprovado', efeito: 'atencao',
        titulo: 'Lucro subiu, caixa da operação caiu',
        texto: `Resultado operacional +${brl(resC.diferenca)}; caixa operacional −${brl(fcoC.diferenca)}. A melhora do resultado não chegou ao caixa no período.`,
        numeros: { resultadoOperacional: resC, caixaOperacional: fcoC } });
    }
  }

  // ─── Déficit operacional compensado por financiamento ───────
  const fcf = B.fluxo?.caixaFinanciamento;
  if (tem(fco) && tem(fcf) && fco < 0 && fcf > 0) {
    const interno = Number(B.fluxo?.transferenciasInternasRecebidas || 0);
    add({ id: 'deficit-financiado', tema: 'financiamento', grau: 'comprovado', efeito: 'negativo',
      titulo: interno > 0 ? 'Operação sustentada por transferências do grupo' : 'Operação sustentada por financiamento',
      texto: `A operação consumiu ${brl(fco)} e o financiamento trouxe ${brl(fcf)}`
        + (interno > 0 ? `, sendo ${brl(interno)} de outras empresas do grupo. A empresa depende de financiamento interno.` : '. O caixa depende de recursos de terceiros ou dos sócios.'),
      numeros: { caixaOperacional: r2(fco), caixaFinanciamento: r2(fcf), transferenciasInternasRecebidas: r2(interno) } });
  }

  // ─── Vendas crescendo com margem menor ──────────────────────
  if (receita && subiu(receita)) {
    const mA = lucroBrutoPct(A);
    const mB = lucroBrutoPct(B);
    if (mA != null && mB != null && mB < mA - 0.5) {
      add({ id: 'vendas-sobem-margem-cai', tema: 'margem', grau: 'comprovado', efeito: 'atencao',
        titulo: 'Vendas cresceram com margem menor',
        texto: `Vendas ${pctTxt(receita)}, mas a margem bruta caiu de ${mA.toFixed(1).replace('.', ',')}% para ${mB.toFixed(1).replace('.', ',')}% (${(mB - mA).toFixed(1).replace('.', ',')} p.p.): crescer assim pode não melhorar o resultado.`,
        numeros: { receita, margemBrutaPct: { anterior: Math.round(mA * 10) / 10, atual: Math.round(mB * 10) / 10 } } });
    }
  }

  return diag;
}
