// FUSO DO BRASIL como padrão do sistema (America/Sao_Paulo).
// Use estas funções em vez de `date.toISOString().slice(0, 10)`: o toISOString
// é UTC — depois das 21h no Brasil ele já devolve o DIA SEGUINTE.
// O banco também roda em America/Sao_Paulo (migração 222).

export const TZ_BR = 'America/Sao_Paulo';

const fmtIso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit' });

// Date → 'YYYY-MM-DD' no fuso do Brasil (padrão: agora)
export function isoDataBR(d = new Date()) {
  return fmtIso.format(d instanceof Date ? d : new Date(d));
}

// Hoje no Brasil, opcionalmente deslocado em dias ('YYYY-MM-DD')
export function hojeBR(deltaDias = 0) {
  if (!deltaDias) return isoDataBR();
  const [y, m, d] = isoDataBR().split('-').map(Number);
  return isoDataBR(new Date(y, m - 1, d + deltaDias, 12));
}
