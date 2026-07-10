// Registro do service worker + fluxo de atualização SEM logout.
//
// Problema: o app é uma SPA. Depois do 1º load, a navegação é client-side,
// então o browser quase nunca re-checa o SW — o usuário só pega o bundle novo
// após dois carregamentos completos (ex.: logout + login). Aqui resolvemos:
//   1) checamos update periodicamente e sempre que a aba volta a ficar visível;
//   2) quando há versão nova, chamamos `onNovaVersao` pra UI mostrar um toast;
//      aplicar = updateSW(true) → ativa o SW novo e recarrega a página.
//
// Requer `registerType: 'prompt'` no VitePWA (vite.config.js).
import { registerSW } from 'virtual:pwa-register';

const INTERVALO_CHECAGEM_MS = 30 * 60 * 1000; // 30 min

let aplicar = null;

export function iniciarAtualizacaoPwa(onNovaVersao) {
  aplicar = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const checar = () => { registration.update().catch(() => {}); };
      setInterval(checar, INTERVALO_CHECAGEM_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checar();
      });
      window.addEventListener('online', checar);
    },
    onNeedRefresh() { onNovaVersao?.(); },
  });
}

// Ativa o SW novo (skipWaiting) e recarrega a página no bundle atualizado.
export function aplicarAtualizacao() {
  if (aplicar) aplicar(true);
  else window.location.reload();
}
