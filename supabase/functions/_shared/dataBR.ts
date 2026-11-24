// Fuso do Brasil (America/Sao_Paulo) nas Edge Functions — o runtime roda em
// UTC: `new Date().toISOString().slice(0, 10)` depois das 21h no Brasil já é o
// dia seguinte. Use hojeBR() para "hoje" (e deslocamentos em dias).
const fmtIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

export function isoDataBR(d: Date = new Date()): string {
  return fmtIso.format(d);
}

// 'YYYY-MM-DD' de hoje no Brasil + deltaDias
export function hojeBR(deltaDias = 0): string {
  const [y, m, d] = isoDataBR().split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + deltaDias, 12));
  return base.toISOString().slice(0, 10);
}
