import { describe, expect, it } from 'vitest';
import { montarFluxo } from '../fluxoCaixa/motor';
import { montarPacoteController, validarRespostaController, validarRespostaFocada } from './pacoteController';

const tipoPorConta = new Map([['101', 'bancaria']]);
const grupos = [
  { id: 'op', parent_id: null, ordem: 1, tipo: 'grupo', nome: '1. ATIVIDADES OPERACIONAIS' },
  { id: 'rec', parent_id: 'op', ordem: 1, tipo: 'entrada', nome: 'Recebimentos de clientes' },
  { id: 'forn', parent_id: 'op', ordem: 2, tipo: 'saida', nome: 'Pagamentos a fornecedores' },
  { id: 'fin', parent_id: null, ordem: 2, tipo: 'grupo', nome: '3. ATIVIDADES DE FINANCIAMENTO' },
  { id: 'var', parent_id: null, ordem: 3, tipo: 'resultado', nome: '= VARIAÇÃO DE CAIXA' },
];
const mapeamentos = [
  { id: 'a', plano_conta_codigo: '3.1', grupo_fluxo_id: 'rec', lado: null, plano_conta_descricao: 'Vendas' },
  { id: 'b', plano_conta_codigo: '4.1', grupo_fluxo_id: 'forn', lado: null, plano_conta_descricao: 'Combustível' },
  { id: 'c', plano_conta_codigo: '7.1', grupo_fluxo_id: 'fin', lado: null, plano_conta_descricao: 'Empréstimos' },
];
const mov = (mes, plano, tipo, valor, pessoaNome = null) => ({ codigo: `${mes}${plano}${valor}`, contaCodigo: '101', planoContaGerencialCodigo: plano, tipo, valor, dataMovimento: `${mes}-10`, descricao: 'x', pessoaNome });
const dadosPorMes = {
  '2026-09': { movimentos: [mov('2026-09', '3.1', 'Crédito', 1000000), mov('2026-09', '4.1', 'Débito', 900000)] },
  '2026-10': { movimentos: [mov('2026-10', '3.1', 'Crédito', 980000), mov('2026-10', '4.1', 'Débito', 700000, 'DISTRIBUIDORA X'), mov('2026-10', '7.1', 'Crédito', 50000)] },
};
const meses = [{ key: '2026-09' }, { key: '2026-10' }];

function pacote(extra = {}) {
  const f = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses });
  return montarPacoteController({
    meta: { empresa: 'Posto Teste', diasAtual: 31 },
    fluxo: { comCalculos: f.comCalculos, chaves: { atual: '2026-10', anterior: '2026-09' }, meses6: ['2026-09', '2026-10'], rotulos: { '2026-09': 'Set/2026', '2026-10': 'Out/2026' } },
    ...extra,
  });
}

describe('pacote controller', () => {
  it('atividades, variação e maiores fatores com fatos citáveis', () => {
    const p = pacote();
    const op = p.caixa.atividades.find(a => a.campo === 'caixaOperacional');
    const fato = (id) => p.fatos.find(x => x.id === id);
    expect(fato(op.atual).valor).toBe(280000);
    expect(fato(op.anterior).valor).toBe(100000);
    expect(fato(p.caixa.variacao.atual).valor).toBe(330000);
    expect(p.caixa.maioresFatores[0].conta).toBe('Combustível');
    expect(p.caixa.maioresFatores[0].lancamentos[0].pessoa).toBe('DISTRIBUIDORA X');
  });

  it('cruza com a DRE e aponta pagamento menor sem custo menor', () => {
    const p = pacote({ dre: { porMes: {
      '2026-09': { receitaBruta: 1000000, lucroBruto: 100000, resultado: 30000 },
      '2026-10': { receitaBruta: 1000000, lucroBruto: 100000, resultado: 30000 },
    } } });
    expect(p.cruzamentoDreCaixa.map(d => d.id)).toContain('pagou-menos-sem-custo-menor');
  });

  it('lista o que falta (DRE, giro, estoque, vendas)', () => {
    const p = pacote();
    expect(p.dadosAusentes.join(' ')).toMatch(/DRE/);
    expect(p.dadosAusentes.join(' ')).toMatch(/estoque/);
  });
});

describe('validação da resposta', () => {
  it('marca evidência inexistente e valor que não está no pacote', () => {
    const p = pacote();
    const { insights, problemas } = validarRespostaController({
      resumo_executivo: { situacao: 'alerta', fator_negativo: { texto: 'Pagou R$ 700.000,00 a fornecedores e R$ 123.456,78 de outra coisa', evidencias: ['F1', 'F999'] } },
    }, p);
    expect(insights.resumo_executivo.fator_negativo._evidenciasInvalidas).toEqual(['F999']);
    expect(insights.resumo_executivo.fator_negativo._valoresNaoEncontrados).toEqual([123456.78]);
    expect(problemas.some(x => /seção ausente: plano_acao/.test(x))).toBe(true);
  });
});

describe('Fase 5: detalhe por conta e respostas focadas', () => {
  it('detalhe da conta: pessoas que explicam a variação, série e lançamentos (fatos D…)', () => {
    const p = pacote();
    const det = p.detalheContas.find(d => d.conta === 'Combustível');
    const fd = (id) => p.fatosDetalhe.find(x => x.id === id);
    expect(det.qtdLancamentos).toEqual({ anterior: 1, atual: 1 });
    const dist = det.porPessoa.find(x => x.pessoa === 'DISTRIBUIDORA X');
    expect(fd(dist.atual).valor).toBe(-700000);
    expect(det.serie6m).toHaveLength(2);
    expect(p.fatosDetalhe.every(x => x.id.startsWith('D'))).toBe(true);
  });

  it('valida resposta focada com fatos do detalhe', () => {
    const p = pacote();
    const det = p.detalheContas.find(d => d.conta === 'Combustível');
    const { resposta, problemas } = validarRespostaFocada({
      resumo: 'A DISTRIBUIDORA X recebeu R$ 700.000,00; R$ 1.234,00 não existe.', evidencias: [det.atual, 'D9999'],
    }, p);
    expect(resposta._valoresNaoEncontrados).toEqual([1234]);
    expect(resposta._evidenciasInvalidas).toEqual(['D9999']);
    expect(problemas.length).toBe(2);
  });
});
