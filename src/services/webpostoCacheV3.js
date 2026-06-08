// ============================================================
// Cache v3 pras páginas do cliente Webposto.
// ============================================================
//
// PROBLEMA: localStorage tem quota de ~5-10MB. Os datasets do Webposto
// (catálogos com milhares de produtos + agregados + dados raw) facilmente
// passam disso, causando QuotaExceededError.
//
// SOLUÇÃO: IndexedDB (quota GBs) + cache em RAM pra leitura SÍNCRONA.
//
// ARQUITETURA:
//   1. RAM cache (Map): leitura síncrona no mount, sem latência
//   2. IndexedDB: persistência entre reloads / navegações
//   3. Hidratação do RAM a partir do IndexedDB acontece UMA VEZ na
//      inicialização da app (chamada em main.jsx, antes de renderizar).
//   4. salvarCache() escreve no RAM imediato (sync) + IndexedDB async
//      (fire-and-forget).
//
// API mantém compatibilidade com webpostoCacheV2.
// ============================================================

const DB_NAME = 'webposto-cache-v3';
const STORE = 'cache';
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// RAM cache: chave → { salvoEm, dados }
const ramCache = new Map();

let dbPromise = null;
function abrirDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste ambiente'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function montarChave(pagina, chaveApiId) {
  return `${pagina}:${chaveApiId}`;
}

// ─── Hidratação (chamar 1x na inicialização da app) ──────

export async function hidratarRAM() {
  // Limpa entradas antigas do v2 (localStorage) que ocupam quota.
  try {
    const prefixosV2 = ['webposto-cache-v1:', 'webposto-v2:'];
    const remover = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixosV2.some(p => k.startsWith(p))) remover.push(k);
    }
    if (remover.length > 0) {
      remover.forEach(k => localStorage.removeItem(k));
      // eslint-disable-next-line no-console
      console.log(`[cacheV3] limpou ${remover.length} entradas antigas de localStorage (liberou quota)`);
    }
  } catch { /* noop */ }

  const inicio = performance.now();
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      const expiradas = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const v = cursor.value;
          if (v && Date.now() - (v.salvoEm || 0) <= TTL_MS) {
            ramCache.set(cursor.key, v);
          } else {
            expiradas.push(cursor.key);
          }
          cursor.continue();
        } else {
          // Limpa expiradas em background
          if (expiradas.length > 0) {
            const txDel = db.transaction(STORE, 'readwrite');
            const storeDel = txDel.objectStore(STORE);
            expiradas.forEach(k => storeDel.delete(k));
          }
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    // eslint-disable-next-line no-console
    console.log(`[cacheV3] hidratado RAM com ${ramCache.size} entrada(s) em ${Math.round(performance.now() - inicio)}ms`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cacheV3] falha ao hidratar (continua sem cache):', err?.message || err);
  }
}

// ─── API pública (sync) ──────────────────────────────────

export function lerCache(pagina, chaveApiId) {
  if (!pagina || !chaveApiId) return null;
  const k = montarChave(pagina, chaveApiId);
  const entrada = ramCache.get(k);
  if (!entrada) {
    // eslint-disable-next-line no-console
    console.log(`[cacheV3] - miss ${pagina} (RAM vazio)`);
    return null;
  }
  const idadeMs = Date.now() - (entrada.salvoEm || 0);
  if (idadeMs > TTL_MS) {
    ramCache.delete(k);
    // eslint-disable-next-line no-console
    console.log(`[cacheV3] - miss ${pagina} (expirou: ${Math.round(idadeMs / 60000)}min)`);
    return null;
  }
  // eslint-disable-next-line no-console
  console.log(`[cacheV3] ✓ HIT ${pagina} (idade ${Math.round(idadeMs / 1000)}s)`);
  return entrada.dados;
}

export function salvarCache(pagina, chaveApiId, dados) {
  if (!pagina || !chaveApiId) {
    console.warn(`[cacheV3] salvar SKIPPED: pagina=${pagina}, chaveApiId=${chaveApiId}`);
    return;
  }
  const k = montarChave(pagina, chaveApiId);
  const entrada = { salvoEm: Date.now(), dados };
  // 1) RAM imediato — disponível sync na próxima leitura
  ramCache.set(k, entrada);
  // 2) IndexedDB em background (fire-and-forget)
  (async () => {
    try {
      const db = await abrirDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(entrada, k);
      });
      // eslint-disable-next-line no-console
      console.log(`[cacheV3] ✓ persistido ${pagina} no IndexedDB`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[cacheV3] ✗ falha persistir ${pagina}:`, err?.message || err);
    }
  })();
}

export function temCache(pagina, chaveApiId) {
  if (!pagina || !chaveApiId) return false;
  const k = montarChave(pagina, chaveApiId);
  const entrada = ramCache.get(k);
  if (!entrada) return false;
  return Date.now() - (entrada.salvoEm || 0) <= TTL_MS;
}

// Retorna o timestamp (ms) de quando a entrada do cache foi salva pela
// última vez, ou null se não há cache. Usado pra UI mostrar "Atualizado há Xmin".
export function ultimaAtualizacao(pagina, chaveApiId) {
  if (!pagina || !chaveApiId) return null;
  const k = montarChave(pagina, chaveApiId);
  const entrada = ramCache.get(k);
  return entrada?.salvoEm || null;
}

export function limparCache(pagina, chaveApiId) {
  const k = montarChave(pagina, chaveApiId);
  ramCache.delete(k);
  abrirDb().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(k);
  }).catch(() => {});
}

export async function limparTodos() {
  ramCache.clear();
  try {
    const db = await abrirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
    // eslint-disable-next-line no-console
    console.log('[cacheV3] limpou tudo');
  } catch { /* noop */ }
}
