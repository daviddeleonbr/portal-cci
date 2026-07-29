// Gravação resiliente no localStorage.
//
// Problema: os caches de relatório (Quality `q*_`, Webposto) têm TTL e podem
// lotar a cota do localStorage (~5 MB). Quando isso acontece, o `setItem` da
// SESSÃO no login estoura com "exceeded the quota" e o usuário não consegue
// entrar. Aqui, se der estouro de cota, descartamos primeiro os caches
// transitórios (são recriáveis) e tentamos de novo; em último caso, limpamos
// tudo exceto uma allowlist essencial (sessões + tema).

// Prefixos de dados descartáveis (cache com TTL / reconstruíveis).
const PREFIXOS_CACHE = ['q3_', 'q2_', 'q_', 'webposto-v2:', 'webposto-cache-v1:'];
// Chaves que NUNCA devem ser removidas na limpeza agressiva.
const ESSENCIAIS = ['cci_session_admin', 'cci_session_cliente', 'cci_theme'];

function ehErroDeCota(err) {
  return !!err && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||   // Firefox
    err.code === 22 || err.code === 1014
  );
}

// Remove os caches transitórios. Retorna quantas chaves apagou.
export function purgarCachesTransitorios() {
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (PREFIXOS_CACHE.some(p => k.startsWith(p))) { localStorage.removeItem(k); n++; }
    }
  } catch { /* noop */ }
  return n;
}

function purgarNaoEssenciais(preservar = []) {
  const manter = new Set([...ESSENCIAIS, ...preservar]);
  try {
    for (const k of Object.keys(localStorage)) {
      if (!manter.has(k)) localStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

// setItem que se recupera de estouro de cota. Retorna true se conseguiu gravar.
export function setItemResiliente(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!ehErroDeCota(err)) throw err;
    // 1) descarta caches de relatório e tenta de novo
    purgarCachesTransitorios();
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err2) {
      if (!ehErroDeCota(err2)) throw err2;
      // 2) último recurso: limpa tudo menos o essencial (+ a própria chave)
      purgarNaoEssenciais([key]);
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (err3) {
        console.error('[storageSafe] falha ao gravar mesmo após limpar caches:', err3);
        return false;
      }
    }
  }
}
