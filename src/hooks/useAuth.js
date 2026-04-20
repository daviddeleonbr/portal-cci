import { useSyncExternalStore } from 'react';

// useSyncExternalStore exige que getSnapshot retorne a MESMA referencia
// quando o estado nao mudou. Como o localStorage guarda string, cacheamos
// (raw -> parsed) e so trocamos a referencia quando a string muda.

const ADMIN_KEY = 'cci_session_admin';
const CLIENTE_KEY = 'cci_session_cliente';

const cache = {
  [ADMIN_KEY]: { raw: undefined, parsed: null },
  [CLIENTE_KEY]: { raw: undefined, parsed: null },
};

function snapshot(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { /* noop */ }
  const entry = cache[key];
  if (entry.raw === raw) return entry.parsed;
  entry.raw = raw;
  try { entry.parsed = raw ? JSON.parse(raw) : null; }
  catch { entry.parsed = null; }
  return entry.parsed;
}

function subscribe(callback) {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener('cci:session-change', handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('cci:session-change', handler);
  };
}

const getAdminSnapshot = () => snapshot(ADMIN_KEY);
const getClienteSnapshot = () => snapshot(CLIENTE_KEY);

export function useAdminSession() {
  return useSyncExternalStore(subscribe, getAdminSnapshot, () => null);
}

export function useClienteSession() {
  return useSyncExternalStore(subscribe, getClienteSnapshot, () => null);
}

export function notifySessionChange() {
  window.dispatchEvent(new Event('cci:session-change'));
}
