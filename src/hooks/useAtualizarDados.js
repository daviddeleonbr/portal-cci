import { useEffect, useRef } from 'react';

// Canal global de "atualizar dados". O toast global (ClienteLayout) dispara o
// evento; páginas que sabem se recarregar sozinhas (in-place) registram sua
// função via useAtualizarDados e marcam o evento como tratado. Se nenhuma
// página tratar, o layout cai no fallback (reload).
const EVENTO = 'cci:atualizar-dados';

// Página registra sua função de refresh in-place.
export function useAtualizarDados(onAtualizar) {
  const ref = useRef(onAtualizar);
  useEffect(() => { ref.current = onAtualizar; });
  useEffect(() => {
    const handler = (e) => {
      if (e?.detail) e.detail.handled = true;
      try { ref.current?.(); } catch { /* noop */ }
    };
    window.addEventListener(EVENTO, handler);
    return () => window.removeEventListener(EVENTO, handler);
  }, []);
}

// Dispara o pedido de atualização. Retorna true se alguma página tratou
// (refresh in-place); false → o chamador pode dar reload como fallback.
export function dispararAtualizacao() {
  const ev = new CustomEvent(EVENTO, { detail: { handled: false } });
  window.dispatchEvent(ev);
  return ev.detail.handled === true;
}
