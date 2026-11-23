// Utilitários do LMC (Livro de Movimentação de Combustíveis).

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Período padrão: do 1º dia do mês até ontem (o LMC do dia fecha no dia
// seguinte). No dia 1º, mostra o mês anterior inteiro.
export function periodoPadraoLmc() {
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const ini = new Date(ontem.getFullYear(), ontem.getMonth(), 1);
  return { de: iso(ini), ate: iso(ontem) };
}
