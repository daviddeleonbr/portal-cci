// Custo mensal de UM funcionário do posto — argumento de venda das propostas.
// Mesma conta da planilha de referência da CCI (salário contratual R$ 2.000 →
// R$ 4.992,21). Parâmetros vêm de cci_custo_funcionario_param (configuração
// geral); o salário é informado (padrão = salário mínimo).
//
// Regras da planilha:
//  - Remuneração bruta = contratual + periculosidade + assiduidade (% do contratual)
//  - INSS empresa e FGTS incidem sobre a remuneração bruta
//  - RAT e Terceiros incidem sobre o salário CONTRATUAL
//  - Vale-transporte: unidades × valor; empregado paga % do contratual (descontado)
//  - Provisões: 13º e férias = 1/12 da remuneração bruta; 1/3 de férias;
//    FGTS/INSS/RAT/Terceiros sobre a soma das provisões

export const PARAMS_PADRAO = {
  salario_minimo: 1621, pct_periculosidade: 30, pct_assiduidade: 10,
  pct_inss_empresa: 20, pct_fgts: 8, pct_rat: 3, pct_terceiros: 5.8, pct_inss_empregado: 8,
  vt_unidades: 52, vt_valor_unitario: 4.5, pct_desconto_vt: 6, valor_alimentacao: 373.41,
};

const r2 = (v) => Math.round(v * 100) / 100;

export function calcularCustoFuncionario(salario, params = {}) {
  const p = { ...PARAMS_PADRAO, ...params };
  const n = (k) => Number(p[k]) || 0;
  const contratual = Math.max(0, Number(salario) || 0);

  const periculosidade = r2(contratual * n('pct_periculosidade') / 100);
  const assiduidade = r2(contratual * n('pct_assiduidade') / 100);
  const bruto = r2(contratual + periculosidade + assiduidade);

  const vtTotal = r2(n('vt_unidades') * n('vt_valor_unitario'));
  const vtDesconto = r2(Math.min(vtTotal, contratual * n('pct_desconto_vt') / 100));

  const salarioLiquidoVT = r2(bruto - vtDesconto);          // linha 01 da planilha
  const fgts = r2(bruto * n('pct_fgts') / 100);
  const inssEmpresa = r2(bruto * n('pct_inss_empresa') / 100);
  const rat = r2(contratual * n('pct_rat') / 100);
  const terceiros = r2(contratual * n('pct_terceiros') / 100);
  const alimentacao = r2(n('valor_alimentacao'));

  const decimoTerceiro = r2(bruto / 12);
  const ferias = r2(bruto / 12);
  const tercoFerias = r2(ferias / 3);
  const baseProvisoes = decimoTerceiro + ferias + tercoFerias;
  const provFgts = r2(baseProvisoes * n('pct_fgts') / 100);
  const provInss = r2(baseProvisoes * n('pct_inss_empresa') / 100);
  const provRat = r2(baseProvisoes * n('pct_rat') / 100);
  const provTerceiros = r2(baseProvisoes * n('pct_terceiros') / 100);

  const grupos = [
    { rotulo: 'Salário e adicionais', valor: salarioLiquidoVT,
      detalhe: 'Salário, periculosidade e assiduidade (menos o vale-transporte descontado do empregado)' },
    { rotulo: 'Encargos sobre a folha', valor: r2(fgts + inssEmpresa + rat + terceiros),
      detalhe: 'FGTS, INSS da empresa, RAT e Terceiros' },
    { rotulo: 'Benefícios', valor: r2(vtTotal + alimentacao),
      detalhe: 'Vale-transporte e ticket alimentação' },
    { rotulo: 'Provisões (13º e férias)', valor: r2(decimoTerceiro + ferias + tercoFerias + provFgts + provInss + provRat + provTerceiros),
      detalhe: '13º salário, férias e 1/3, com os encargos sobre eles' },
  ];
  const total = r2(grupos.reduce((s, g) => s + g.valor, 0));

  return {
    contratual, periculosidade, assiduidade, bruto,
    linhas: {
      salarioLiquidoVT, fgts, inssEmpresa, rat, terceiros, vtTotal, alimentacao,
      decimoTerceiro, ferias, tercoFerias, provFgts, provInss, provRat, provTerceiros,
    },
    grupos,
    total,
  };
}
