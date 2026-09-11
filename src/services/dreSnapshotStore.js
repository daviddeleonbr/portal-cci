// dreSnapshotStore.js
// ============================================================
// Guarda temporariamente o dataset JÁ GERADO da DRE para que o "Modo Tela
// Cheia" (aba nova) reaproveite sem re-buscar no Autosystem. Usa IndexedDB
// porque é compartilhado entre abas do mesmo domínio e aguenta MBs (o
// localStorage estoura). Entradas expiram (TTL) para não crescer sem limite.
// ============================================================

const DB_NOME = 'cci_dre_snapshots';
const STORE = 'snapshots';
const TTL_MS = 2 * 60 * 60 * 1000; // 2h

function abrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Remove snapshots antigos (best-effort).
async function podar(db) {
  try {
    const limite = Date.now() - TTL_MS;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        if (!c.value?.ts || c.value.ts < limite) c.delete();
        c.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch { /* noop */ }
}

export async function salvarSnapshotDRE(token, data) {
  const db = await abrir();
  await podar(db);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ data, ts: Date.now() }, token);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function lerSnapshotDRE(token) {
  const db = await abrir();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(token);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  if (!rec) return null;
  if (rec.ts && Date.now() - rec.ts > TTL_MS) return null;
  return rec.data || null;
}
