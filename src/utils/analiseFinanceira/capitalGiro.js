// Capital de giro e prazos médios — só calcula o que os dados permitem; o que
// falta vai em `faltando`, com o motivo (nunca chuta).
//
// Entradas (valores positivos, do período analisado):
//   dias          — dias do período
//   receita       — receita bruta (vendas) do período (DRE)
//   cmv           — custo das mercadorias vendidas (DRE)
//   compras       — compras do período; sem elas, estima-se cmv + Δestoque
//   contasReceber — saldo em aberto no fim do período (clientes/cartões/duplicatas)
//   contasPagar   — saldo em aberto a fornecedores no fim do período
//   estoque       — estoque a custo no fim; estoqueInicial (opcional) para Δestoque
import { r2 } from './variacao';

export function indicadoresCapitalGiro({ dias, receita, cmv, compras = null, contasReceber = null, contasPagar = null, estoque = null, estoqueInicial = null }) {
  const faltando = [];
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const temDias = dias > 0;
  if (!temDias) faltando.push('duração do período');
  const receitaDia = temDias && receita > 0 ? receita / dias : null;
  const cmvDia = temDias && cmv > 0 ? cmv / dias : null;
  let comprasPeriodo = compras;
  let comprasEstimadas = false;
  if (comprasPeriodo == null && cmv > 0 && estoque != null && estoqueInicial != null) {
    comprasPeriodo = cmv + (estoque - estoqueInicial); // compras = CMV + Δestoque
    comprasEstimadas = true;
  }
  const comprasDia = temDias && comprasPeriodo > 0 ? comprasPeriodo / dias : null;

  const pmr = contasReceber != null && receitaDia ? contasReceber / receitaDia : null;
  if (contasReceber == null) faltando.push('contas a receber em aberto (prazo médio de recebimento)');
  else if (!receitaDia) faltando.push('receita do período (prazo médio de recebimento)');

  const pme = estoque != null && cmvDia ? estoque / cmvDia : null;
  if (estoque == null) faltando.push('estoque a custo (prazo médio de estoque)');
  else if (!cmvDia) faltando.push('CMV do período (prazo médio de estoque)');

  const pmp = contasPagar != null && comprasDia ? contasPagar / comprasDia : null;
  if (contasPagar == null) faltando.push('contas a pagar a fornecedores em aberto (prazo médio de pagamento)');
  else if (!comprasDia) faltando.push('compras do período (ou CMV + estoque inicial e final)');

  const cicloOperacional = pme != null && pmr != null ? pme + pmr : null;
  const cicloFinanceiro = cicloOperacional != null && pmp != null ? cicloOperacional - pmp : null;
  // Necessidade de capital de giro (operacional): o que a operação "prende" de caixa
  const ncg = contasReceber != null && estoque != null && contasPagar != null ? contasReceber + estoque - contasPagar : null;

  return {
    pmr: r1(pmr), pme: r1(pme), pmp: r1(pmp),
    cicloOperacional: r1(cicloOperacional), cicloFinanceiro: r1(cicloFinanceiro),
    ncg: ncg == null ? null : r2(ncg),
    comprasPeriodo: comprasPeriodo == null ? null : r2(comprasPeriodo),
    comprasEstimadas,
    faltando,
  };
}

// Variação da NCG entre dois momentos: quanto do caixa a operação prendeu (+) ou
// liberou (−) via clientes, estoque e fornecedores.
export function variacaoCapitalGiro(ant, atu) {
  const d = (k) => (ant?.[k] != null && atu?.[k] != null ? r2(atu[k] - ant[k]) : null);
  const deltaCR = d('contasReceber');
  const deltaEstoque = d('estoque');
  const deltaCP = d('contasPagar');
  const completo = deltaCR != null && deltaEstoque != null && deltaCP != null;
  return {
    deltaContasReceber: deltaCR, deltaEstoque, deltaContasPagar: deltaCP,
    // efeito no caixa: CR e estoque que sobem consomem caixa; CP que sobe financia
    efeitoNoCaixa: completo ? r2(-deltaCR - deltaEstoque + deltaCP) : null,
  };
}
