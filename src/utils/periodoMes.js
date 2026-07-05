// Helpers de período por mês (usados pelo SeletorMesAno e pelas telas
// comerciais). Ficam fora do componente pra não quebrar o fast-refresh
// (react-refresh só gosta de arquivos que exportam componentes).

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ISO (YYYY-MM-DD) do 1º dia do mês.
export function primeiroDiaMesIso(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

// ISO do último dia do mês (mes: 1-12). `new Date(ano, mes, 0)` = último dia.
export function ultimoDiaMesIso(ano, mes) {
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}
