// ============================================================
// Cache localStorage v2 pras páginas do cliente Webposto.
// ============================================================
//
// DESIGN:
//
// 1) CHAVE SIMPLES: `webposto-v2:<pagina>:<chaveApiId>`
//    Não inclui datas, empresas, ou outros filtros que variam. Pra cada
//    rede (chaveApiId), há UMA entrada por página. Cache vale pra a
//    "última visualização" daquela página naquela rede.
//
//    Por que: chaves complexas com data/empresas geravam cache miss
//    constantes — `seteDiasAtrasIso()` recalcula a cada mount, IDs
//    podem variar de ordem, etc. Chave simples = match garantido.
//
// 2) TTL 24h: dados são considerados válidos por 24h. Após isso, miss.
//
// 3) LOGS no console pra debug: toda operação (get/set/miss/expired/error)
//    é logada. Facilita identificar problemas de quota, serialização,
//    chaves não-batendo, etc.
//
// 4) Wrapper opcional pra serializar Maps automaticamente (JSON nativo
//    não suporta Map).
// ============================================================

const PREFIX = 'webposto-v2:';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function montarChave(pagina, chaveApiId) {
  return `${PREFIX}${pagina}:${chaveApiId || 'sem-api'}`;
}

// Converte Maps em [["k", v], ...] recursivamente (1 nível) pra serialização.
function serializeValor(v) {
  if (v instanceof Map) return { __map: Array.from(v.entries()) };
  return v;
}

// Reverte: { __map: [...] } → new Map(...)
function deserializeValor(v) {
  if (v && typeof v === 'object' && '__map' in v && Array.isArray(v.__map)) {
    return new Map(v.__map);
  }
  return v;
}

// Aplica serialize em todos os campos top-level do objeto `dados`.
function preparaParaSalvar(dados) {
  if (!dados || typeof dados !== 'object') return dados;
  const out = {};
  for (const k of Object.keys(dados)) out[k] = serializeValor(dados[k]);
  return out;
}

function restauraDoSalvo(dados) {
  if (!dados || typeof dados !== 'object') return dados;
  const out = {};
  for (const k of Object.keys(dados)) out[k] = deserializeValor(dados[k]);
  return out;
}

// ─── API pública ──────────────────────────────────────────

export function salvarCache(pagina, chaveApiId, dados) {
  if (!pagina || !chaveApiId) {
    console.warn(`[webpostoCache] salvar SKIPPED: pagina=${pagina}, chaveApiId=${chaveApiId}`);
    return false;
  }
  try {
    const k = montarChave(pagina, chaveApiId);
    const obj = {
      salvoEm: Date.now(),
      chaveApiId,
      dados: preparaParaSalvar(dados),
    };
    const raw = JSON.stringify(obj);
    localStorage.setItem(k, raw);
    // eslint-disable-next-line no-console
    console.log(`[webpostoCache] ✓ SALVO ${pagina} (${(raw.length / 1024).toFixed(1)}KB) chaveApi=${chaveApiId.slice(0, 8)}`);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[webpostoCache] ✗ FALHA salvar ${pagina}:`, err?.message || err);
    return false;
  }
}

export function lerCache(pagina, chaveApiId) {
  if (!pagina || !chaveApiId) return null;
  try {
    const k = montarChave(pagina, chaveApiId);
    const raw = localStorage.getItem(k);
    if (!raw) {
      // eslint-disable-next-line no-console
      console.log(`[webpostoCache] - miss ${pagina} (sem entrada)`);
      return null;
    }
    const obj = JSON.parse(raw);
    const idadeMs = Date.now() - (obj.salvoEm || 0);
    if (idadeMs > TTL_MS) {
      localStorage.removeItem(k);
      // eslint-disable-next-line no-console
      console.log(`[webpostoCache] - miss ${pagina} (expirou: ${Math.round(idadeMs / 60000)}min)`);
      return null;
    }
    // eslint-disable-next-line no-console
    console.log(`[webpostoCache] ✓ HIT ${pagina} (idade ${Math.round(idadeMs / 1000)}s) chaveApi=${chaveApiId.slice(0, 8)}`);
    return restauraDoSalvo(obj.dados);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[webpostoCache] ✗ erro ao ler ${pagina}:`, err?.message || err);
    return null;
  }
}

export function temCache(pagina, chaveApiId) {
  return lerCache(pagina, chaveApiId) !== null;
}

export function limparCache(pagina, chaveApiId) {
  try {
    const k = montarChave(pagina, chaveApiId);
    localStorage.removeItem(k);
  } catch { /* noop */ }
}

export function limparTodos() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
    // eslint-disable-next-line no-console
    console.log(`[webpostoCache] limpou ${keys.length} entradas`);
  } catch { /* noop */ }
}
