import { describe, expect, it } from 'vitest';
import { modeloAutosystem } from './relatorioGeralCaixas';

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
