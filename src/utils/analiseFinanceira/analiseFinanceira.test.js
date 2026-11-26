// Cenários simulados do pedido (critérios de aceitação da inteligência analítica).
import { describe, expect, it } from 'vitest';
import { comparar } from './variacao';
import { cruzarDreCaixa } from './cruzamentoDreCaixa';
import { indicadoresCapitalGiro, variacaoCapitalGiro } from './capitalGiro';
import { compararPosto, decomporVolumePreco, indicadoresPosto } from './posto';
import { resumirAtividades } from './atividadesFluxo';

const periodo = ({ receita = 1_000_000, cmv = 900_000, lucroBruto, resOp = 30_000, receb = 980_000, pagForn = 880_000,
  fco = 20_000, fcf = 0, interno = 0, cr = null, cp = null, est = null, estIni = null } = {}) => ({
  dias: 30,
  dre: { receitaBruta: receita, cmv, lucroBruto: lucroBruto ?? receita - cmv, resultadoOperacional: resOp },
  fluxo: { recebimentosOperacionais: receb, pagamentosFornecedores: pagForn, caixaOperacional: fco, caixaFinanciamento: fcf, transferenciasInternasRecebidas: interno },
  giro: { contasReceber: cr, contasPagar: cp, estoque: est, estoqueInicial: estIni },
});
const ids = (d) => d.map(x => x.id);

describe('variação', () => {
  it('não inventa % sem base nem com troca de sinal; saída maior = +% em tamanho', () => {
    expect(comparar(0, 500).pct).toBeNull();
    expect(comparar(-100, 50).pct).toBeNull();
    expect(comparar(-100, -120)).toMatchObject({ diferenca: -20, pct: 20 });
  });
});

describe('cenários: DRE × caixa', () => {
  it('1. queda de recebimentos com redução proporcional de vendas', () => {
    const d = cruzarDreCaixa(periodo(), periodo({ receita: 850_000, cmv: 765_000, receb: 835_000 }));
    expect(d.find(x => x.id === 'receb-acompanha-vendas')).toMatchObject({ grau: 'comprovado' });
  });

  it('2. queda de recebimentos sem queda de faturamento (contas a receber explicam)', () => {
    const d = cruzarDreCaixa(periodo({ cr: 100_000 }), periodo({ receb: 850_000, cr: 230_000 }));
    expect(d.find(x => x.id === 'receb-sem-vendas')).toMatchObject({ grau: 'provavel' });
    // sem contas a receber: só hipótese, dizendo o que falta
    const h = cruzarDreCaixa(periodo(), periodo({ receb: 850_000 })).find(x => x.id === 'receb-sem-vendas');
    expect(h.grau).toBe('hipotese');
    expect(h.falta).toContain('contas a receber em aberto');
  });

  it('3. redução de pagamentos provocada por consumo de estoque', () => {
    const d = cruzarDreCaixa(periodo({ est: 300_000 }), periodo({ pagForn: 700_000, est: 120_000 }));
    const x = d.find(y => y.id === 'pagou-menos-sem-custo-menor');
    expect(x.grau).toBe('provavel');
    expect(x.texto).toMatch(/consumo de estoque/);
  });

  it('4. aumento de lucro acompanhado de piora no caixa', () => {
    const d = cruzarDreCaixa(periodo({ resOp: 20_000, fco: 40_000 }), periodo({ resOp: 60_000, fco: -15_000, cr: 200_000 }));
    expect(ids(d)).toEqual(expect.arrayContaining(['lucro-sem-caixa', 'lucro-sobe-caixa-cai']));
  });

  it('5. melhora de caixa provocada por transferências entre empresas', () => {
    const d = cruzarDreCaixa(periodo(), periodo({ fco: -40_000, fcf: 60_000, interno: 60_000 }));
    expect(d.find(x => x.id === 'deficit-financiado').titulo).toMatch(/transferências do grupo/);
  });

  it('6. déficit operacional compensado por financiamento', () => {
    const d = cruzarDreCaixa(periodo(), periodo({ fco: -25_000, fcf: 30_000 }));
    expect(d.find(x => x.id === 'deficit-financiado')).toMatchObject({ grau: 'comprovado', efeito: 'negativo' });
  });

  it('7. crescimento das vendas acompanhado de redução da margem', () => {
    const d = cruzarDreCaixa(periodo({ receita: 1_000_000, cmv: 900_000 }), periodo({ receita: 1_200_000, cmv: 1_110_000, receb: 1_180_000 }));
    expect(ids(d)).toContain('vendas-sobem-margem-cai');
  });

  it('8. aumento do contas a pagar sem aumento proporcional das compras', () => {
    const ant = periodo({ cp: 200_000, est: 300_000, estIni: 300_000 });
    const atu = periodo({ cp: 320_000, est: 300_000, estIni: 300_000 });
    expect(cruzarDreCaixa(ant, atu).find(x => x.id === 'cp-sem-compras')).toMatchObject({ grau: 'provavel' });
  });

  it('nada relevante → nenhum diagnóstico (não força conclusão)', () => {
    expect(cruzarDreCaixa(periodo(), periodo({ receita: 1_005_000, receb: 984_000 }))).toEqual([]);
  });
});

describe('capital de giro', () => {
  it('calcula prazos e ciclo quando há dados', () => {
    const g = indicadoresCapitalGiro({ dias: 30, receita: 900_000, cmv: 810_000, compras: 810_000, contasReceber: 150_000, contasPagar: 270_000, estoque: 135_000 });
    expect(g).toMatchObject({ pmr: 5, pme: 5, pmp: 10, cicloOperacional: 10, cicloFinanceiro: 0, ncg: 15_000 });
    expect(g.faltando).toEqual([]);
  });
  it('não calcula sem dado e diz o que falta', () => {
    const g = indicadoresCapitalGiro({ dias: 30, receita: 900_000, cmv: 810_000 });
    expect(g.pmr).toBeNull();
    expect(g.faltando.length).toBe(3);
  });
  it('efeito da variação do giro no caixa', () => {
    expect(variacaoCapitalGiro({ contasReceber: 100, estoque: 200, contasPagar: 150 }, { contasReceber: 160, estoque: 180, contasPagar: 170 }).efeitoNoCaixa).toBe(-20);
  });
});

describe('posto: combustível e conveniência', () => {
  const ant = indicadoresPosto([
    { categoria: 'combustivel', produto: 'GASOLINA C', quantidade: 100_000, valor: 600_000, custo: 550_000 },
    { categoria: 'conveniencia', produto: 'LOJA', quantidade: 0, valor: 50_000, custo: 30_000 },
  ]);
  const atu = indicadoresPosto([
    { categoria: 'combustivel', produto: 'GASOLINA C', quantidade: 92_000, valor: 552_000, custo: 496_800 },
    { categoria: 'conveniencia', produto: 'LOJA', quantidade: 0, valor: 52_000, custo: 33_000 },
  ]);
  it('preço, custo e margem por litro', () => {
    const g = atu.produtos.find(p => p.produto === 'GASOLINA C');
    expect(g).toMatchObject({ precoMedio: 6, custoMedio: 5.4, margemPorUnidade: 0.6 });
  });
  it('pagou menos de combustível: separa volume de preço', () => {
    const cmp = compararPosto(ant, atu).find(p => p.produto === 'GASOLINA C');
    expect(cmp.volume.pct).toBe(-8);
    expect(cmp.custo.efeitoVolume).toBe(-44_000); // comprou/vendeu menos litros
    expect(cmp.custo.efeitoPreco).toBe(-9_200); // litro mais barato
    expect(cmp.custo.efeitoVolume + cmp.custo.efeitoPreco).toBe(cmp.custo.total);
  });
  it('decomposição sem quantidade não inventa', () => {
    expect(decomporVolumePreco({ q0: 0, v0: 10, q1: 0, v1: 12 })).toBeNull();
  });
});

describe('atividades do fluxo', () => {
  it('reconhece os grupos raiz e separa recebimentos de fornecedores', () => {
    const arvore = [
      { nome: '1. ATIVIDADES OPERACIONAIS', tipo: 'grupo', totalPeriodo: 50, children: [
        { nome: 'Recebimentos de clientes', totalPeriodo: 1000, children: [] },
        { nome: 'Pagamentos a fornecedores', totalPeriodo: -800, children: [] },
        { nome: 'Salários', totalPeriodo: -150, children: [] },
      ] },
      { nome: '= CAIXA OPERACIONAL', tipo: 'subtotal', totalPeriodo: 50 },
      { nome: '3. ATIVIDADES DE FINANCIAMENTO', tipo: 'grupo', totalPeriodo: 30, children: [] },
    ];
    const r = resumirAtividades(arvore);
    expect(r).toMatchObject({ caixaOperacional: 50, caixaFinanciamento: 30, caixaInvestimento: null, recebimentosOperacionais: 1000, pagamentosFornecedores: 800, outrasSaidasOperacionais: 150 });
    expect(r.reconhecidas).toEqual(['operacional', 'financiamento']);
  });
});
