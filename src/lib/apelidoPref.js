// Preferência GLOBAL de exibição: mostrar o APELIDO das empresas em vez do
// nome/razão social. É preferência do usuário/dispositivo (localStorage),
// reativa em todo o app via useSyncExternalStore + evento custom.
import { useSyncExternalStore } from 'react';

const KEY = 'cci_usar_apelido';
const EVENT = 'cci:apelido-change';

export function getUsarApelido() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setUsarApelido(valor) {
  try { localStorage.setItem(KEY, valor ? '1' : '0'); } catch { /* noop */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* noop */ }
}

export function toggleUsarApelido() { setUsarApelido(!getUsarApelido()); }

function subscribe(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb); // sincroniza entre abas
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

// Hook reativo — re-renderiza quando o toggle muda.
export function useUsarApelido() {
  return useSyncExternalStore(subscribe, getUsarApelido, () => false);
}
