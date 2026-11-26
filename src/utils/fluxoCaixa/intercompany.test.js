import { describe, expect, it } from 'vitest';
import { analisarIntercompany, idMovimento, indicioIntercompany, removerMovimentos } from './intercompany';
import { montarFluxo } from './motor';
import { detectarAnomalias, duplicidades } from './anomalias';

const empresas = [
  { empresa_codigo: 1, nome: 'POSTO DONA ROSA LTDA' },
  { empresa_codigo: 2, nome: 'POSTO DONA ROSA II LTDA' },
  { empresa_codigo: 3, nome: 'AUTO POSTO TRIVELA' },
];
const tipoPorConta = new Map([['101', 'bancaria'], ['201', 'bancaria'], ['301', 'bancaria']]);
let seq = 1;
const mov = (emp, conta, tipo, valor, data, extra = {}) => ({
  codigo: `m${seq++}`, empresaCodigo: emp, contaCodigo: conta, tipo, valor, dataMovimento: data,
  planoContaGerencialCodigo: '7.1', descricao: '', tipoDocumentoOrigem: 'X', ...extra,
});

describe('indícios de transferência entre empresas', () => {
  it('pessoa é outra empresa do grupo', () => {
    const ind = indicioIntercompany(mov(1, '101', 'Débito', 100, '2026-10-01', { pessoaNome: 'DONA ROSA II' }), empresas);
    expect(ind.citadas).toEqual(['2']);
  });
  it('não aponta a própria empresa nem fornecedor comum', () => {
    expect(indicioIntercompany(mov(2, '201', 'Débito', 100, '2026-10-01', { pessoaNome: 'POSTO DONA ROSA II' }), empresas)).toBeNull();
    expect(indicioIntercompany(mov(1, '101', 'Débito', 100, '2026-10-01', { pessoaNome: 'IPIRANGA PRODUTOS DE PETROLEO' }), empresas)).toBeNull();
  });
  it('histórico de transferência entre filiais', () => {
    expect(indicioIntercompany(mov(1, '101', 'Débito', 100, '2026-10-01', { descricao: 'TRANSF. P/ FILIAL' }), empresas)).not.toBeNull();
  });
});

describe('casamento e eliminação no consolidado', () => {
  it('casa saída × entrada de empresas diferentes e elimina só o par', () => {
    const a = mov(1, '101', 'Débito', 100000, '2026-10-05', { pessoaNome: 'DONA ROSA II' });
    const b = mov(2, '201', 'Crédito', 100000, '2026-10-05', { pessoaNome: 'POSTO DONA ROSA' });
    const venda = mov(1, '101', 'Crédito', 5000, '2026-10-05', { planoContaGerencialCodigo: '3.1' });
    const r = analisarIntercompany({ movimentos: [a, b, venda], tipoPorConta, empresas });
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0]).toMatchObject({ nivel: 'comprovado', empresaOrigem: '1', empresaDestino: '2', valor: 100000 });
    const dados = removerMovimentos({ '2026-10': { movimentos: [a, b, venda] } }, r.idsEliminaveis);
    expect(dados['2026-10'].movimentos).toEqual([venda]);
  });

  it('provável quando só uma ponta tem indício e as datas diferem', () => {
    const a = mov(1, '101', 'Débito', 2500, '2026-10-05', { descricao: 'Transferência para filial' });
    const b = mov(3, '301', 'Crédito', 2500, '2026-10-07');
    const r = analisarIntercompany({ movimentos: [a, b], tipoPorConta, empresas });
    expect(r.pares[0].nivel).toBe('provavel');
  });

  it('não casa: mesmo sentido, mesma empresa, valor diferente ou mais de 3 dias', () => {
    const a = mov(1, '101', 'Débito', 900, '2026-10-01', { pessoaNome: 'TRIVELA' });
    const r = analisarIntercompany({ movimentos: [
      a,
      mov(3, '301', 'Débito', 900, '2026-10-01'), // mesmo sentido
      mov(1, '101', 'Crédito', 900, '2026-10-01'), // mesma empresa
      mov(3, '301', 'Crédito', 901, '2026-10-01'), // outro valor
      mov(3, '301', 'Crédito', 900, '2026-10-09'), // longe
    ], tipoPorConta, empresas });
    expect(r.pares).toHaveLength(0);
    expect(r.soltas).toHaveLength(1);
    expect(r.soltas[0].situacao).toBe('sem_contrapartida');
  });

  it('cita empresa específica: a contrapartida tem que ser dela', () => {
    const a = mov(1, '101', 'Débito', 700, '2026-10-01', { pessoaNome: 'TRIVELA' });
    const r = analisarIntercompany({ movimentos: [a, mov(2, '201', 'Crédito', 700, '2026-10-01')], tipoPorConta, empresas });
    expect(r.pares).toHaveLength(0);
  });

  it('conta cadastrada de transferência entre filiais: casa sem depender do histórico', () => {
    const contas = new Set(['1.1.9.01']);
    const a = mov(1, '101', 'Débito', 4200, '2026-10-03', { planoContaGerencialCodigo: '1.1.9.01' });
    const b = mov(3, '301', 'Crédito', 4200, '2026-10-04', { _contraparteBruta: ' 1.1.9.01 ', planoContaGerencialCodigo: '4.4' });
    const semCadastro = analisarIntercompany({ movimentos: [a, b], tipoPorConta, empresas });
    expect(semCadastro.pares).toHaveLength(0);
    const r = analisarIntercompany({ movimentos: [a, b], tipoPorConta, empresas, contasIntercompany: contas });
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].nivel).toBe('comprovado');
  });

  it('empresa analisada sozinha: contrapartida não verificada', () => {
    const r = analisarIntercompany({ movimentos: [mov(1, '101', 'Débito', 50, '2026-10-01', { pessoaNome: 'TRIVELA' })], tipoPorConta, empresas, visaoRede: false });
    expect(r.soltas[0].situacao).toBe('contrapartida_nao_verificada');
  });

  it('cenário: caixa da rede melhora só por transferência interna → eliminada, variação real aparece', () => {
    const grupos = [
      { id: 'op', parent_id: null, ordem: 1, tipo: 'grupo', nome: '1. OPERACIONAIS' },
      { id: 'fin', parent_id: null, ordem: 2, tipo: 'grupo', nome: '3. FINANCIAMENTO' },
      { id: 'var', parent_id: null, ordem: 3, tipo: 'resultado', nome: '= VARIAÇÃO' },
    ];
    const mapeamentos = [
      { id: '1', plano_conta_codigo: '3.1', grupo_fluxo_id: 'op', lado: null },
      { id: '2', plano_conta_codigo: '7.1', grupo_fluxo_id: 'fin', lado: 'C' }, // só a entrada foi mapeada
    ];
    const ent = mov(2, '201', 'Crédito', 30000, '2026-10-10', { pessoaNome: 'DONA ROSA' });
    const sai = mov(1, '101', 'Débito', 30000, '2026-10-10', { pessoaNome: 'DONA ROSA II', planoContaGerencialCodigo: '7.2' });
    const deficit = mov(2, '201', 'Débito', 8000, '2026-10-12', { planoContaGerencialCodigo: '3.1' });
    const dadosPorMes = { '2026-10': { movimentos: [ent, sai, deficit] } };
    const meses = [{ key: '2026-10' }];
    const sem = montarFluxo({ dadosPorMes, tipoPorConta, grupos, mapeamentos, meses });
    expect(sem.totalGeral).toBe(22000); // parece que sobrou caixa
    const ic = analisarIntercompany({ movimentos: dadosPorMes['2026-10'].movimentos, tipoPorConta, empresas });
    const com = montarFluxo({ dadosPorMes: removerMovimentos(dadosPorMes, ic.idsEliminaveis), tipoPorConta, grupos, mapeamentos, meses });
    expect(com.totalGeral).toBe(-8000); // a operação do grupo consumiu caixa
    expect(idMovimento(ent)).not.toBe(idMovimento(sai));
  });
});

describe('pontos de atenção', () => {
  it('duplicidade: mesmo dia, conta, valor e histórico em movimentos diferentes', () => {
    const indice = { lancamentosPorConta: { '4.1': [
      { id: 'a', data: '2026-10-01', valor: 350, sinal: -1, descricao: 'ENERGIA', contaCodigo: '101', empresaCodigo: 1 },
      { id: 'b', data: '2026-10-01', valor: 350, sinal: -1, descricao: 'ENERGIA', contaCodigo: '101', empresaCodigo: 1 },
      { id: 'c', data: '2026-10-02', valor: 350, sinal: -1, descricao: 'ENERGIA', contaCodigo: '101', empresaCodigo: 1 },
    ] } };
    const d = duplicidades(indice);
    expect(d).toHaveLength(1);
    expect(d[0].valor).toBe(350);
  });

  it('pico, conta que zerou, investimento suspeito e conciliação', () => {
    const meses = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const arvore = [
      { nome: '1. OPERACIONAIS', contas: [
        { codigo: '4.1', descricao: 'Fornecedores', valoresPorMes: { a: -10000, b: -11000, c: -25000 }, totalPeriodo: -46000, lancamentos: [] },
        { codigo: '4.2', descricao: 'Aluguel', valoresPorMes: { a: -3000, b: -3000, c: 0 }, totalPeriodo: -6000, lancamentos: [] },
      ], children: [] },
      { nome: '2. ATIVIDADES DE INVESTIMENTO', contas: [
        { codigo: '6.1', descricao: 'Manutenção de bombas', valoresPorMes: { a: 0, b: 0, c: -4000 }, totalPeriodo: -4000, lancamentos: [] },
      ], children: [] },
    ];
    const achados = detectarAnomalias({ indice: { lancamentosPorConta: {} }, arvore, meses,
      conciliacao: { bate: false, naoExplicada: 120, variacaoSaldos: 1000, totalFluxo: 880 } });
    const tipos = achados.map(a => a.tipo);
    expect(tipos).toContain('pico');
    expect(tipos).toContain('recorrente_zerada');
    expect(tipos).toContain('classificacao_investimento');
    expect(tipos).toContain('conciliacao');
    expect(achados.find(a => a.tipo === 'pico').nivel).toBe('atencao'); // mais saída
  });
});
