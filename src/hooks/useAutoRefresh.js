// Auto-refresh em background pras páginas Webposto cliente.
//
// COMPORTAMENTO:
// - Roda `refreshFn` a cada `intervalMs` (default 10 min)
// - PAUSA quando a aba não está visível (economiza requests)
// - Faz refresh imediato quando a aba volta a ficar visível APÓS o intervalo
// - Cleanup automático no unmount
//
// Use `silencioso: true` no carregar() pra não mostrar banner durante o
// refresh em background.

import { useEffect, useRef } from 'react';

export function useAutoRefresh(refreshFn, intervalMs = 10 * 60 * 1000) {
  const fnRef = useRef(refreshFn);
  fnRef.current = refreshFn; // sempre o callback mais recente

  useEffect(() => {
    let intervalId;
    let ultimoRefresh = Date.now();

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // eslint-disable-next-line no-console
        console.log(`[autoRefresh] disparando refresh em background (${new Date().toLocaleTimeString('pt-BR')})`);
        fnRef.current();
        ultimoRefresh = Date.now();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[autoRefresh] erro no refresh:', err);
      }
    };

    intervalId = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimoRefresh >= intervalMs) {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
