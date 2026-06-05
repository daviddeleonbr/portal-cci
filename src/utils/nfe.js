// ============================================================
// Helpers para chave de acesso da NF-e (44 dígitos).
//
// Layout oficial (SEFAZ — modelo 55/NF-e e 65/NFC-e):
//   posição  tamanho  campo
//   ----------------------------------------
//   0-1      2        cUF       código UF do emitente
//   2-5      4        AAMM      ano/mês emissão
//   6-19     14       CNPJ      emitente
//   20-21    2        mod       modelo (55=NFe, 65=NFCe)
//   22-24    3        serie
//   25-33    9        nNF       número da nota fiscal
//   34       1        tpEmis    tipo de emissão
//   35-42    8        cNF       código numérico
//   43       1        cDV       dígito verificador
// ============================================================

const RE_DIGITOS = /^\d{44}$/;

// Normaliza: remove tudo que não for dígito (espaços, pontos, etc).
function somenteDigitos(chave) {
  return String(chave ?? '').replace(/\D/g, '');
}

// Decompõe a chave em todos os campos. Retorna null se inválida.
export function parseChaveNFe(chave) {
  const c = somenteDigitos(chave);
  if (!RE_DIGITOS.test(c)) return null;
  return {
    uf:             c.slice(0, 2),
    anoMes:         c.slice(2, 6),
    cnpj:           c.slice(6, 20),
    modelo:         c.slice(20, 22),
    serie:          c.slice(22, 25),
    numero:         c.slice(25, 34),
    tipoEmissao:    c.slice(34, 35),
    codigoNumerico: c.slice(35, 43),
    dv:             c.slice(43, 44),
  };
}

// Retorna o número da nota como inteiro (sem zeros à esquerda) ou null.
// Ex: chave "...000029192190896741" → 29192
export function numeroNotaDaChave(chave) {
  const p = parseChaveNFe(chave);
  if (!p) return null;
  const n = parseInt(p.numero, 10);
  return Number.isFinite(n) ? n : null;
}

// Retorna a série como inteiro ou null. Ex: "001" → 1.
export function serieDaChave(chave) {
  const p = parseChaveNFe(chave);
  if (!p) return null;
  const n = parseInt(p.serie, 10);
  return Number.isFinite(n) ? n : null;
}

// Formata o número da nota com separador de milhares: 29192 → "29.192".
export function formatNumeroNota(numero) {
  if (numero == null) return '—';
  return Number(numero).toLocaleString('pt-BR');
}
