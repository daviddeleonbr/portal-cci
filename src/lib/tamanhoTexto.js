// Tamanho do texto (acessibilidade) — escolha do usuário, salva no aparelho.
//
// Como funciona: a variável CSS --escala-texto (no <html>) multiplica
//  - o font-size da raiz (index.css) → tudo que é rem (text-sm, espaçamentos
//    do Tailwind) cresce junto;
//  - todo font-size em px (os text-[11px] etc.) — o plugin `cci-escala-fonte`
//    do vite.config.js reescreve `font-size: Npx` → `calc(Npx * var(--escala-texto, 1))`.
// O index.html aplica a escala salva antes do React montar (sem "pulo").
import { useSyncExternalStore } from 'react';

export const TAMANHOS_TEXTO = [
  { k: 'padrao', rot: 'Padrão', escala: 1 },
  { k: 'grande', rot: 'Grande', escala: 1.15 },
  { k: 'muito_grande', rot: 'Muito grande', escala: 1.3 },
];

const CHAVE = 'cci_tamanho_texto'; // mesma chave do script do index.html
const EVENTO = 'cci:tamanho-texto';

export function lerTamanhoTexto() {
  try {
    const v = localStorage.getItem(CHAVE);
    return TAMANHOS_TEXTO.some(t => t.k === v) ? v : 'padrao';
  } catch { return 'padrao'; }
}

export function aplicarTamanhoTexto(k) {
  const t = TAMANHOS_TEXTO.find(x => x.k === k) || TAMANHOS_TEXTO[0];
  document.documentElement.style.setProperty('--escala-texto', String(t.escala));
}

export function definirTamanhoTexto(k) {
  try { localStorage.setItem(CHAVE, k); } catch { /* sem storage: vale só nesta sessão */ }
  aplicarTamanhoTexto(k);
  window.dispatchEvent(new Event(EVENTO));
}

function assinar(cb) {
  const onStorage = (e) => { if (e.key === CHAVE) { aplicarTamanhoTexto(lerTamanhoTexto()); cb(); } };
  window.addEventListener(EVENTO, cb);
  window.addEventListener('storage', onStorage); // outras abas
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener('storage', onStorage); };
}

export function useTamanhoTexto() {
  return useSyncExternalStore(assinar, lerTamanhoTexto, () => 'padrao');
}
