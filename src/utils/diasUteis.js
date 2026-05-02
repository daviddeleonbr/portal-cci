// Helpers de dia util / feriados nacionais brasileiros
// Centraliza a logica usada em Contas a Pagar / Dashboard / etc.

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Algoritmo de Meeus/Jones/Butcher para Pascoa
function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const mes = Math.floor((h + L - 7 * m + 114) / 31);
  const dia = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function addDias(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const _cacheFeriados = {};
function feriadosDoAno(ano) {
  if (_cacheFeriados[ano]) return _cacheFeriados[ano];
  const pascoa = calcularPascoa(ano);
  const set = new Set([
    `${ano}-01-01`, // Confraternizacao Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independencia
    `${ano}-10-12`, // N. Sra. Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamacao da Republica
    `${ano}-11-20`, // Consciencia Negra
    `${ano}-12-25`, // Natal
    isoDate(addDias(pascoa, -48)), // Carnaval segunda
    isoDate(addDias(pascoa, -47)), // Carnaval terca
    isoDate(addDias(pascoa, -2)),  // Sexta-feira Santa
    isoDate(addDias(pascoa, 60)),  // Corpus Christi
  ]);
  _cacheFeriados[ano] = set;
  return set;
}

export function ehFeriado(d) {
  return feriadosDoAno(d.getFullYear()).has(isoDate(d));
}

export function ehDiaUtil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false; // domingo, sabado
  return !ehFeriado(d);
}

// Proximo dia util a partir de d (inclusive). Se d e util, retorna d.
export function proximoDiaUtil(d) {
  const cur = new Date(d);
  cur.setHours(0, 0, 0, 0);
  while (!ehDiaUtil(cur)) {
    cur.setDate(cur.getDate() + 1);
  }
  return cur;
}

// "Vencimento efetivo" — vencimentos em sabado/domingo/feriado rolam para o
// proximo dia util. Recebe e retorna data ISO (YYYY-MM-DD).
export function vencimentoEfetivoIso(vencimentoIso) {
  if (!vencimentoIso) return null;
  const [y, m, d] = String(vencimentoIso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return vencimentoIso;
  const dt = new Date(y, m - 1, d);
  return isoDate(proximoDiaUtil(dt));
}

export { isoDate };
