import { describe, expect, it } from 'vitest';
import { modeloAutosystem, modeloSangrias } from './relatorioGeralCaixas';

// Caso Diamante Negro (26/11/2026): conta única 1.5 "SOBRA E FALTA DE CAIXA" cadastrada
// como falta; quem lança é a CCI, mas o relatório do Autosystem agrupa pelo responsável do PDV.
const rec = (debitar, creditar, valor, resp, respNome) => ({
  conta_debitar: debitar, modo_recebimento: debitar, conta_creditar: creditar, valor,
  usuario: 'cci', usuario_pessoa_id: 999, usuario_nome: 'CCI',
  responsavel_pessoa_id: resp, responsavel_nome: respNome,
});

describe('relatório geral — sobras e faltas do Autosystem', () => {
  const categoriaConta = new Map([['1.5', 'falta_caixa'], ['1.3.01.1', 'cartao_pix']]);

  it('vai para o responsável do PDV/turno, não para quem lançou, e separa sobra de falta pela conta', () => {
    const m = modeloAutosystem({
      categoriaConta,
      vendas: [{ vendedor_pessoa_id: 115, vendedor_nome: 'ANGELICA', valor: 100, grupo_produto_codigo: null }],
      recebimentos: [
        rec('1.5', '1.1.2.1', 39.14, 115, 'ANGELICA'),   // falta: debita 1.5, credita o PDV
        rec('1.5', '1.1.2.1', 0.72, 156, 'LUCIMARA'),
        rec('1.1.2.2', '1.5', 0.44, 102, 'RONAN'),       // sobra: debita o PDV, credita 1.5
        rec('1.1.2.2', '1.5', 0.96, 102, 'RONAN'),
        rec('1.5', '1.1.2.2', 15.84, 746, 'LUCAS'),
        rec('1.3.01.1', '1.1.2.1', 50, 115, 'ANGELICA'), // recebimento normal: não é sobra/falta
      ],
    });
    const por = Object.fromEntries(m.funcionarios.map(f => [f.nome, f]));
    expect(por.CCI).toBeUndefined();
    expect(por.ANGELICA.falta).toBeCloseTo(39.14);
    expect(por.ANGELICA.vendas).toBe(100); // mesma pessoa da venda: uma linha só
    expect(por.LUCIMARA.falta).toBeCloseTo(0.72);
    expect(por.RONAN.sobra).toBeCloseTo(1.40);
    expect(por.LUCAS.falta).toBeCloseTo(15.84);
    expect(m.sobras).toBeCloseTo(1.40);
    expect(m.faltas).toBeCloseTo(55.70);
    expect(m.totalRecebido).toBeCloseTo(50);
  });

  it('sem responsável (consulta antiga), fica com quem lançou', () => {
    const r = { ...rec('1.5', '1.1.2.1', 10, null, ''), responsavel_pessoa_id: undefined, responsavel_nome: undefined };
    const m = modeloAutosystem({ categoriaConta, recebimentos: [r] });
    expect(m.funcionarios.map(f => [f.nome, f.falta])).toEqual([['CCI', 10]]);
  });
});

// Caso Dona Rosa II 25/11/2026: R$ 40,00 retirados para o combustível do depósito; no
// Webposto a sangria da Kassandra caiu 40,00 (virou despesa).
describe('relatório geral — sangrias com retiradas antes do depósito', () => {
  const fechamentos = [{ data: '2026-11-25', confirmado_por: 'Karina', confirmado_em: '2026-11-26T14:41:00Z',
    registros: [
      { funcionarioCodigo: 187144, caixaCodigo: 1, nome: 'DERIVAN', dinheiroApurado: 460, dinheiroApresentado: 460 },
      { funcionarioCodigo: 195657, caixaCodigo: 2, nome: 'KASSANDRA', dinheiroApurado: 6149.75, dinheiroApresentado: 6149.75 },
      { funcionarioCodigo: 201638, caixaCodigo: 3, nome: 'MIRELLE', dinheiroApurado: 2074.68, dinheiroApresentado: 2085 },
    ],
    retiradas: [{ descricao: 'combustível para deposito', valor: 40 }] }];
  const atuais = [
    { dia: '2026-11-25', func: 187144, caixa: 1, nome: 'DERIVAN', turno: '1º TURNO', ordem: 1, valor: 460 },
    { dia: '2026-11-25', func: 195657, caixa: 2, nome: 'KASSANDRA', turno: '2º TURNO', ordem: 2, valor: 6109.75 },
    { dia: '2026-11-25', func: 201638, caixa: 3, nome: 'MIRELLE', turno: '3º TURNO', ordem: 3, valor: 2085 },
  ];

  it('retirada com funcionário: coluna Retiradas e A depositar na linha dele, sem linha extra', () => {
    const comFunc = [{ ...fechamentos[0], retiradas: [{ descricao: 'combustível para deposito', valor: 40, funcionario_codigo: 195657, caixa_codigo: 2, funcionario_nome: 'KASSANDRA' }] }];
    const s = modeloSangrias({ fechamentos: comFunc, atuais });
    expect(s.linhas.map(l => l.nome)).toEqual(['DERIVAN', 'KASSANDRA', 'MIRELLE']);
    expect(s.linhas[1]).toMatchObject({ apurado: 6149.75, apresentado: 6149.75, retiradas: 40, aDepositar: 6109.75 });
    expect(s.linhas[0]).toMatchObject({ retiradas: 0, aDepositar: 460 });
    expect(s.totais).toMatchObject({ apurado: 8684.43, apresentado: 8694.75, retiradas: 40, aDepositar: 8654.75 });
    expect(s.retiradas).toEqual([{ dia: '2026-11-25', funcionario: 'KASSANDRA', turno: '', historico: 'combustível para deposito', valor: 40 }]);
  });

  it('retirada sem funcionário (antiga): uma linha no fim só para o total a depositar bater', () => {
    const s = modeloSangrias({ fechamentos, atuais });
    expect(s.linhas.at(-1)).toMatchObject({ semFuncionario: true, retiradas: 40, aDepositar: -40, apresentado: null });
    expect(s.totais.aDepositar).toBeCloseTo(8654.75);
  });

  it('dia sem conferência: só o apurado atual do sistema', () => {
    const s = modeloSangrias({ fechamentos: [], atuais });
    expect(s.semConferencia).toEqual(['2026-11-25']);
    expect(s.linhas[1]).toMatchObject({ nome: 'KASSANDRA', apurado: 6109.75, apresentado: null, aDepositar: null });
  });
});
