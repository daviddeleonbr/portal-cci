import { describe, expect, it } from 'vitest';
import { distribuirLancamentosAutosystemDre, ehContaPassagem, somarVendasAutosystemPorCategoria } from './motorDre';

const lanc = (credito, debito, valor, extra = {}) => ({ lancamento_id: Math.round(valor), credito_codigo: credito, debito_codigo: debito, valor, empresa: 1, data: '2026-10-05', ...extra });

describe('DRE Autosystem: lançamentos → títulos', () => {
  it('receita (crédito) e despesa (débito) das contas mapeadas', () => {
    const d = distribuirLancamentosAutosystemDre([lanc('3.1', '1.1.1', 500), lanc('1.1.1', '4.1', 200)], ['3.1', '4.1']);
    expect(d.titulosReceber.map(t => [t.planoContaGerencialCodigo, t.valor])).toEqual([['3.1', 500]]);
    expect(d.titulosPagar.map(t => [t.planoContaGerencialCodigo, t.valor])).toEqual([['4.1', 200]]);
    expect(d.casados).toBe(2);
  });

  it('competência: provisão na 2.1.1 conta; a baixa da mesma conta é ignorada', () => {
    const provisao = lanc('2.1.1.05', '4.9', 1000); // despesa x conta a pagar
    const baixa = lanc('1.1.1', '2.1.1.05', 1000); // pagamento da conta a pagar
    const d = distribuirLancamentosAutosystemDre([provisao, baixa], ['2.1.1.05']);
    expect(d.titulosPagar.map(t => [t.planoContaGerencialCodigo, t.valor])).toEqual([['2.1.1.05', 1000]]);
    expect(d.titulosReceber).toEqual([]);
  });

  it('passagem mapeada vence a contrapartida (sem dupla contagem)', () => {
    const d = distribuirLancamentosAutosystemDre([lanc('2.1.1.05', '4.9', 300)], ['2.1.1.05', '4.9']);
    expect(d.titulosPagar.map(t => t.planoContaGerencialCodigo)).toEqual(['2.1.1.05']);
  });

  it('códigos com espaço (char do movto) casam com o mapeamento', () => {
    const d = distribuirLancamentosAutosystemDre([lanc(' 3.1 ', '1.1.1', 10)], ['3.1']);
    expect(d.titulosReceber).toHaveLength(1);
    expect(d.semMatch).toBe(0);
  });

  it('reconhece a conta de passagem', () => {
    expect(ehContaPassagem('2.1.1.07.01')).toBe(true);
    expect(ehContaPassagem('2.1.2')).toBe(false);
  });
});

describe('DRE Autosystem: vendas por categoria', () => {
  it('soma venda e custo por categoria e empresa; ignora grupo sem categoria', () => {
    const s = somarVendasAutosystemPorCategoria([
      { grupo_produto_codigo: 1, empresa: 1, valor: 100, valor_custo: 90 },
      { grupo_produto_codigo: 1, empresa: 1, valor: 50, valor_custo: 40 },
      { grupo_produto_codigo: 7, empresa: 2, valor: 999, valor_custo: 1 },
    ], new Map([[1, 'combustivel']]));
    expect(s.porCategoria).toEqual({ combustivel: { 1: { venda: 150, custo: 130 } } });
    expect(s.ignorados).toBe(1);
    expect([...s.gruposIgnorados]).toEqual([7]);
  });
});
