import { describe, expect, it } from 'vitest';
import {
  TRANSFER_CODE, TRANSFER_TIPO_DOC, SEM_PLANO_PREFIX, aplicarCalculosFluxo, conciliarFluxoComSaldos, distribuirPagamentoTitulos,
  indexarMovimentos, lancamentosAutosystemParaMovimentos, montarFluxo,
} from './motor';

const meses = [{ key: '2026-09' }, { key: '2026-10' }];
const tipoPorConta = new Map([['101', 'bancaria'], ['102', 'caixa'], ['103', 'aplicacao']]);
const mov = (mes, conta, plano, tipo, valor, extra = {}) => ({
  codigo: `${mes}-${conta}-${plano}-${valor}`, movimentoContaCodigo: Math.round(valor * 100), contaCodigo: conta,
  planoContaGerencialCodigo: plano, tipo, valor, dataMovimento: `${mes}-10`, descricao: 'x', tipoDocumentoOrigem: 'X', ...extra,
});
// Máscara: 1. OPERACIONAIS (Recebimentos / Pagamentos) · subtotal · 2. FINANCIAMENTO · resultado
const grupos = [
  { id: 'op', parent_id: null, ordem: 1, tipo: 'grupo', nome: '1. ATIVIDADES OPERACIONAIS' },
  { id: 'rec', parent_id: 'op', ordem: 1, tipo: 'entrada', nome: 'Recebimentos' },
  { id: 'pag', parent_id: 'op', ordem: 2, tipo: 'saida', nome: 'Pagamentos' },
  { id: 'sop', parent_id: null, ordem: 2, tipo: 'subtotal', nome: '= CAIXA OPERACIONAL' },
  { id: 'fin', parent_id: null, ordem: 3, tipo: 'grupo', nome: '3. ATIVIDADES DE FINANCIAMENTO' },
  { id: 'var', parent_id: null, ordem: 4, tipo: 'resultado', nome: '= VARIAÇÃO DE CAIXA' },
];
const mapeamentos = [
  { id: 'm1', plano_conta_codigo: '3.1', grupo_fluxo_id: 'rec', lado: null },
  { id: 'm2', plano_conta_codigo: '4.1', grupo_fluxo_id: 'pag', lado: null },
  { id: 'm3', plano_conta_codigo: '7.1', grupo_fluxo_id: 'fin', lado: null },
];

describe('motor do fluxo de caixa', () => {
  it('soma por grupo, sobe para o pai e calcula subtotal e variação', () => {
    const dadosPorMes = {
      '2026-09': { movimentos: [mov('2026-09', '101', '3.1', 'Crédito', 1000), mov('2026-09', '101', '4.1', 'Débito', 600)] },
      '2026-10': { movimentos: [mov('2026-10', '102', '3.1', 'Crédito', 500), mov('2026-10', '101', '7.1', 'Crédito', 200)] },
    };
    const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses });
    const op = f.comCalculos.find(n => n.id === 'op');
    expect(op.valoresPorMes).toEqual({ '2026-09': 400, '2026-10': 500 });
    expect(f.comCalculos.find(n => n.id === 'sop').totalPeriodo).toBe(900);
    expect(f.totalGeral).toBe(1100);
  });

  it('ignora contas que não são bancária/caixa e manda o sem plano para "Sem classificação"', () => {
    const dadosPorMes = {
      '2026-10': { movimentos: [
        mov('2026-10', '103', '3.1', 'Crédito', 999), // aplicação: fora
        mov('2026-10', '101', null, 'Débito', 50, { tipoDocumentoOrigem: 'SUPRIMENTO' }),
        mov('2026-10', '101', '9.9', 'Crédito', 30), // plano sem vínculo
      ] },
    };
    const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses });
    expect(f.totalGeral).toBe(0);
    expect(f.semClassificacao.totalPeriodo).toBe(-20);
    expect(f.semClassificacao.contas.map(c => c.codigo).sort()).toEqual(['9.9', `${SEM_PLANO_PREFIX}SUPRIMENTO`]);
  });

  it('mapeamento por direção: a mesma conta vai a grupos diferentes', () => {
    const map = [
      { id: 'a', plano_conta_codigo: '5.5', grupo_fluxo_id: 'rec', lado: 'C' },
      { id: 'b', plano_conta_codigo: '5.5', grupo_fluxo_id: 'pag', lado: 'D' },
    ];
    const dadosPorMes = { '2026-10': { movimentos: [mov('2026-10', '101', '5.5', 'Crédito', 300), mov('2026-10', '101', '5.5', 'Débito', 120)] } };
    const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos: map, meses });
    const op = f.arvore.find(n => n.id === 'op');
    expect(op.children.find(c => c.id === 'rec').totalPeriodo).toBe(300);
    expect(op.children.find(c => c.id === 'pag').totalPeriodo).toBe(-120);
    expect(f.semClassificacao).toBeNull();
  });

  it('baixa em lote: o rateio fecha ao centavo com o pagamento', () => {
    const m = mov('2026-10', '101', '2.1.1.01', 'Débito', 100, {
      _rateioProvisao: [{ codigo: '4.1', valor: 33.33 }, { codigo: '4.2', valor: 33.33 }, { codigo: '4.3', valor: 33.34 }],
    });
    const idx = indexarMovimentos({ dadosPorMes: { '2026-10': { movimentos: [m] } }, tipoPorConta });
    const soma = ['4.1', '4.2', '4.3'].reduce((s, c) => s + idx.totaisPorConta[c]['2026-10'], 0);
    expect(Math.round(soma * 100) / 100).toBe(-100);
  });

  it('mapeamento direto da conta-ponte vence a resolução por provisão', () => {
    const m = mov('2026-10', '101', '4.1', 'Débito', 80, { _contraparteBruta: '2.1.1.7.01' });
    const map = [...mapeamentos, { id: 'm4', plano_conta_codigo: '2.1.1.7.01', grupo_fluxo_id: 'fin', lado: null }];
    const f = montarFluxo({ dadosPorMes: { '2026-10': { movimentos: [m] } }, tipoPorConta, grupos, mapeamentos: map, meses });
    expect(f.arvore.find(n => n.id === 'fin').totalPeriodo).toBe(-80);
  });

  it('título pago em lote: cada título no seu plano, somando o valor do banco', () => {
    const m = mov('2026-10', '101', null, 'Débito', 320.6, { tipoDocumentoOrigem: 'TITULO_PAGAR_PAGAMENTO', movimentoContaCodigo: 77 });
    const titulos = new Map([[77, [
      { planoContaGerencialCodigo: '4.1', valor: 159, pagamento: [{ codigoDocumento: 77, valorPago: 320.6 }] },
      { planoContaGerencialCodigo: '4.2', valor: 161.6, pagamento: [{ codigoDocumento: 77, valorPago: 0.64 }] },
    ]]]);
    const partes = distribuirPagamentoTitulos(m, titulos);
    expect(partes.map(p => p.valorTitulo)).toEqual([159, 161.6]); // usa o valor de face, que fecha
  });

  it('transferências entre contas próprias entram na variação, antes do resultado', () => {
    const dadosPorMes = { '2026-10': { movimentos: [
      mov('2026-10', '101', '3.1', 'Crédito', 1000),
      mov('2026-10', '101', null, 'Débito', 400, { tipoDocumentoOrigem: TRANSFER_TIPO_DOC }),
    ] } };
    const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses });
    expect(f.transferencias.totalPeriodo).toBe(-400);
    const ids = f.comCalculos.map(n => n.id);
    expect(ids.indexOf('__transferencias__')).toBe(ids.indexOf('var') - 1);
    expect(f.totalGeral).toBe(600);
    expect(f.indice.totaisPorConta[TRANSFER_CODE]).toBeDefined();
  });

  it('resultado soma grupos posicionados depois dele', () => {
    const arvore = [
      { id: 'a', tipo: 'grupo', valoresPorMes: { x: 10 }, totalPeriodo: 10 },
      { id: 'r', tipo: 'resultado', valoresPorMes: {}, totalPeriodo: 0 },
      { id: 'b', tipo: 'grupo', valoresPorMes: { x: 5 }, totalPeriodo: 5 },
    ];
    const out = aplicarCalculosFluxo({ arvore, meses: [{ key: 'x' }] });
    expect(out.find(n => n.id === 'r').totalPeriodo).toBe(15);
  });

  it('filtra por empresa (visão da rede com categoria)', () => {
    const dadosPorMes = { '2026-10': { movimentos: [
      mov('2026-10', '101', '3.1', 'Crédito', 100, { empresaCodigo: 1 }),
      mov('2026-10', '101', '3.1', 'Crédito', 900, { empresaCodigo: 2 }),
    ] } };
    const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses, empresaFiltroSet: new Set(['1']) });
    expect(f.totalGeral).toBe(100);
  });
});

describe('Autosystem → movimentos', () => {
  it('provisão 2.1.1 resolvida, sem provisão e transferência', () => {
    const { movimentos, naoClassificadas211 } = lancamentosAutosystemParaMovimentos([
      { lancamento_id: 1, sinal: -1, valor: 50, contraparte_codigo: ' 2.1.1.01 ', contraparte_resolvida_codigo: '4.1 ', lado_caixa: 'credito', credito_codigo: ' 101 ', empresa: 1 },
      { lancamento_id: 2, sinal: -1, valor: 20, contraparte_codigo: '2.1.1.02', lado_caixa: 'credito', credito_codigo: '101', empresa: 1 },
      { lancamento_id: 3, sinal: 1, valor: 70, contraparte_codigo: '102', contraparte_eh_caixa: true, lado_caixa: 'debito', debito_codigo: '101', empresa: 2 },
    ]);
    expect(movimentos[0].planoContaGerencialCodigo).toBe('4.1');
    expect(movimentos[0].contaCodigo).toBe('101');
    expect(movimentos[1]._naoClassificada211).toBe(true);
    expect(naoClassificadas211).toBe(1);
    expect(movimentos[2].planoContaGerencialCodigo).toBeNull();
    expect(movimentos[2].tipoDocumentoOrigem).toBe(TRANSFER_TIPO_DOC);
  });
});

describe('conciliação fluxo × saldos', () => {
  it('diferença explicada pelo "Sem classificação" bate', () => {
    const composicao = [{ saldoInicial: 100, entradas: 1000, saidas: 400, saldoAtual: 700 }];
    const c = conciliarFluxoComSaldos({ composicao, totalGeral: 650, semClassificacaoTotal: -50 });
    expect(c.diferenca).toBe(-50);
    expect(c.bate).toBe(true);
    expect(c.saldosFecham).toBe(true);
  });
  it('aponta diferença não explicada e saldo que não fecha', () => {
    const composicao = [{ saldoInicial: 100, entradas: 1000, saidas: 400, saldoAtual: 750 }];
    const c = conciliarFluxoComSaldos({ composicao, totalGeral: 600 });
    expect(c.naoExplicada).toBe(50);
    expect(c.bate).toBe(false);
    expect(c.saldosFecham).toBe(false);
  });
});
