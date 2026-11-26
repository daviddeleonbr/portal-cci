// Comparação entre dois valores, com os cuidados de análise financeira:
// - diferença em R$ sempre; % só quando a base existe e não troca de sinal;
// - a leitura (melhorou/piorou) depende da NATUREZA: entrada/receita subir é bom,
//   saída/custo subir (em tamanho) é ruim — e nem toda queda de saída é boa (pode
//   ser pagamento adiado), por isso a função não julga sozinha: devolve números.

export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
export const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// → { anterior, atual, diferenca, pct (null = sem base), semBase, trocouSinal }
export function comparar(anterior, atual) {
  const a = Number(anterior) || 0;
  const b = Number(atual) || 0;
  const semBase = Math.abs(a) < 0.005;
  const trocouSinal = !semBase && Math.abs(b) >= 0.005 && Math.sign(a) !== Math.sign(b);
  return {
    anterior: r2(a),
    atual: r2(b),
    diferenca: r2(b - a),
    // variação do TAMANHO (|b|/|a| − 1): saídas de −100 para −120 = +20%
    pct: semBase || trocouSinal ? null : r1((Math.abs(b) / Math.abs(a) - 1) * 100),
    semBase,
    trocouSinal,
  };
}

// Variação "relevante": acima de % E de R$ mínimos (evita barulho em contas pequenas)
export const relevante = (c, { pct = 5, valor = 1000 } = {}) => Math.abs(c.diferenca) >= valor && (c.pct == null || Math.abs(c.pct) >= pct);

// Valor por dia (comparar períodos de durações diferentes)
export const porDia = (valor, dias) => (dias > 0 ? (Number(valor) || 0) / dias : null);
