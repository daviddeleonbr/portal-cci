// Registro do service worker + fluxo de atualização SEM logout.
//
// Problema: o app é uma SPA. Depois do 1º load, a navegação é client-side,
// então o browser quase nunca re-checa o SW — o usuário só pega o bundle novo
// após dois carregamentos completos (ex.: logout + login). Aqui resolvemos:
//   1) checamos update periodicamente e sempre que a aba volta a ficar visível;
//   2) quando há versão nova, chamamos `onNovaVersao` pra UI mostrar o aviso;
//   3) instalar = manda o SW novo assumir (skipWaiting) SEM recarregar; quando
//      ele assume, a UI mostra "Ok, reiniciar portal" e o reload é do usuário.
//
// Requer `registerType: 'prompt'` no VitePWA (vite.config.js).
import { registerSW } from 'virtual:pwa-register';

const INTERVALO_CHECAGEM_MS = 30 * 60 * 1000; // 30 min

let aplicar = null;
let swRegistration = null;
let aoAssumir = null; // resolve da instalação em andamento

export function iniciarAtualizacaoPwa(onNovaVersao) {
  aplicar = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      const checar = () => { registration.update().catch(() => {}); };
      setInterval(checar, INTERVALO_CHECAGEM_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checar();
      });
      window.addEventListener('online', checar);
    },
    onNeedRefresh() { onNovaVersao?.(); },
    // O SW novo assumiu o controle. Sem este callback a lib recarregaria a
    // página sozinha; aqui só avisamos — o reload vem do botão "Reiniciar".
    // (Também dispara em OUTRAS abas quando uma delas instala.)
    onNeedReload() {
      if (aoAssumir) { aoAssumir(); aoAssumir = null; }
      else window.dispatchEvent(new Event('pwa:versao-instalada'));
    },
  });
}

// Instala a versão nova (o SW em espera assume) sem recarregar a página.
// Resolve quando o SW novo assumiu — ou, por segurança, após um tempo
// (sem SW em espera, o atual já é o mais novo: o reload basta).
export function instalarAtualizacao() {
  return new Promise((resolve) => {
    const temEspera = !!(swRegistration && (swRegistration.waiting || swRegistration.installing));
    let feito = false;
    const concluir = () => { if (!feito) { feito = true; aoAssumir = null; resolve(); } };
    aoAssumir = concluir;
    try { navigator.serviceWorker?.addEventListener?.('controllerchange', concluir, { once: true }); } catch { /* sem SW */ }
    try {
      if (aplicar) {
        const r = aplicar(true); // só manda o skipWaiting (o reload automático foi desligado)
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    } catch { /* cai no fallback */ }
    setTimeout(concluir, temEspera ? 10000 : 400);
  });
}

// Recarrega já na versão nova.
export function reiniciarPortal() {
  window.location.reload();
}
