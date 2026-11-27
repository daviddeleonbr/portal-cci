import { describe, expect, it } from 'vitest';
import { modeloAutosystem, modeloWebposto, serieDiaria } from './analiseCartoes';

// Trivela (nov/2026): Master débito cobrado ~1,33% com 0,65% cadastrado
describe('análise de cartões — Webposto', () => {
  const remessas = [
    { administradoraCodigo: 1, administradora: 'MASTER DEBITO - SIPAG', dataPagamento: '2026-11-03', valorRemessa: 1000, taxasDespesas: 13.3, valorLiquido: 986.7 },
    { administradoraCodigo: 1, administradora: 'MASTER DEBITO - SIPAG', dataPagamento: '2026-11-04', valorRemessa: 500, taxasDespesas: 6.65, valorLiquido: 493.35 },
    { administradoraCodigo: 2, administradora: 'PIX', dataPagamento: '2026-11-03', valorRemessa: 800, taxasDespesas: 0, valorLiquido: 800 },
    { administradoraCodigo: 1, administradora: 'MASTER DEBITO - SIPAG', dataPagamento: '2026-10-31', valorRemessa: 999, taxasDespesas: 9, valorLiquido: 990 }, // fora
  ];
  const cartoes = [
    { vendaCodigo: 10, administradoraCodigo: 1, adiministradoraDescricao: 'MASTER DEBITO - SIPAG', valor: 100, taxaPercentual: 0.65 },
    { vendaCodigo: 11, administradoraCodigo: 3, adiministradoraDescricao: 'GOODCARD', valor: 50, taxaPercentual: 2.99 },
    { vendaCodigo: 99, administradoraCodigo: 1, adiministradoraDescricao: 'MASTER DEBITO - SIPAG', valor: 30, taxaPercentual: 0.65 }, // sem itens
  ];
  const itens = [
    { vendaCodigo: 10, produtoCodigo: 'GAS', totalVenda: 150, totalCusto: 135 }, // cartão pagou 100 de 150
    { vendaCodigo: 10, produtoCodigo: 'OLEO', totalVenda: 50, totalCusto: 30 },
    { vendaCodigo: 11, produtoCodigo: 'GAS', totalVenda: 50, totalCusto: 45 },
  ];
  const m = modeloWebposto({ remessas, cartoes, itens, ehCombustivel: i => i.produtoCodigo === 'GAS', de: '2026-11-01', ate: '2026-11-30' });
  const por = Object.fromEntries(m.cartoes.map(c => [c.nome, c]));

  it('taxa efetiva vem das baixas e alerta quando passa da cadastrada', () => {
    expect(por['MASTER DEBITO - SIPAG'].taxaEfetiva).toBeCloseTo(1.33, 2);
    expect(por['MASTER DEBITO - SIPAG'].taxaCadastrada).toBeCloseTo(0.65, 2);
    expect(por['MASTER DEBITO - SIPAG'].acimaCadastrada).toBe(true);
    expect(por.PIX.taxaEfetiva).toBe(0);
    expect(m.totais.bruto).toBeCloseTo(2300);
  });

  it('margem do combustível: a parte paga no cartão, com a taxa efetiva', () => {
    const c = por['MASTER DEBITO - SIPAG'].combustivel; // 100/200 da venda: gasolina 75, custo 67,5
    expect(c.valor).toBeCloseTo(75);
    expect(c.custo).toBeCloseTo(67.5);
    expect(c.taxa).toBeCloseTo(75 * 0.0133, 3);
    expect(c.consumo).toBeCloseTo((100 * 75 * 0.0133) / 7.5, 1);
  });

  it('administradora sem baixa no período usa a cadastrada e avisa', () => {
    expect(por.GOODCARD.taxaVendas).toBeCloseTo(50 * 0.0299, 3);
    expect(m.avisos.join(' ')).toMatch(/taxa cadastrada/);
    expect(m.avisos.join(' ')).toMatch(/sem itens/);
  });

  it('série diária soma os cartões e filtra por um', () => {
    expect(serieDiaria(m.dias).map(d => [d.data, d.bruto])).toEqual([['2026-11-03', 1800], ['2026-11-04', 500]]);
    expect(serieDiaria(m.dias, '1')[0].taxaEfetiva).toBeCloseTo(1.33, 2);
  });
});

// Banco modelo Autosystem (jun/2022): Visa crédito, taxa rateada pela própria baixa
describe('análise de cartões — Autosystem', () => {
  const m = modeloAutosystem({
    dias: [
      { data: '2022-06-01', conta: '1.3.01.1.1', conta_nome: 'CARTAO VISA CREDITO', bruto: 6321.2, taxa: 113.78, liquido: 6207.42, ajuste: 0, baixas: 1 },
      { data: '2022-06-02', conta: '1.3.01.2.1', conta_nome: 'CARTAO VISA DEBITO', bruto: 9000, taxa: 80, liquido: 4000, ajuste: 4920, baixas: 1 },
    ],
    produtos: [
      { conta: '1.3.01.1.1', grupo_produto_codigo: 192, valor: 17200, custo: 15667.75, taxa: 309.57, itens_sem_custo: 0 },
      { conta: '1.3.01.1.1', grupo_produto_codigo: 500, valor: 1000, custo: 700, taxa: 18, itens_sem_custo: 2 },
    ],
    categoriaGrupo: new Map([[192, 'combustivel'], [500, 'conveniencia']]),
  });
  const visa = m.cartoes.find(c => c.chave === '1.3.01.1.1');

  it('consumo da margem do combustível pela taxa', () => {
    expect(visa.combustivel.margem).toBeCloseTo(1532.25);
    expect(visa.combustivel.consumo).toBeCloseTo(20.2, 1);
    expect(visa.margemLiquida).toBeCloseTo(17200 + 1000 - 15667.75 - 700 - 309.57 - 18);
  });

  it('ajuste fica fora da taxa efetiva e gera aviso', () => {
    const deb = m.cartoes.find(c => c.chave === '1.3.01.2.1');
    expect(deb.taxaEfetiva).toBeCloseTo(100 * 80 / 4080, 2);
    expect(deb.taxaCadastrada).toBeNull();
    expect(m.avisos.join(' ')).toMatch(/ajuste/);
    expect(m.avisos.join(' ')).toMatch(/sem custo/);
  });
});
