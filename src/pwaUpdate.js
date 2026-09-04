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
let swRegistration = null;

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
  });
}

// Ativa o SW novo (skipWaiting) e recarrega a página no bundle atualizado.
//
// Robustez: `updateSW(true)` só recarrega quando o novo SW ASSUME o controle
// (evento `controllerchange`). Mas se no clique não há mais um SW "em espera"
// (já ativou, ou por corrida), o skipWaiting vira no-op e o controllerchange
// NUNCA dispara — antes o botão ficava girando pra sempre. Aqui garantimos o
// reload por 3 vias, com trava pra recarregar UMA vez só:
//   1) controllerchange (caminho normal, mais rápido);
//   2) o retorno de updateSW(true) (que também recarrega internamente);
//   3) fallback por timeout — se nada recarregou, força o reload.
export function aplicarAtualizacao() {
  let recarregou = false;
  const recarregar = () => {
    if (recarregou) return;
    recarregou = true;
    window.location.reload();
  };

  try {
    navigator.serviceWorker?.addEventListener?.('controllerchange', recarregar, { once: true });
  } catch { /* SW indisponível → cai no fallback */ }

  // Há um SW novo esperando pra assumir? (waiting = pronto; installing = quase).
  const temEspera = !!(swRegistration && (swRegistration.waiting || swRegistration.installing));

  try {
    if (aplicar) {
      const r = aplicar(true);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
  } catch { /* ignora e cai no fallback */ }

  // Fallback por timeout garante que o botão SEMPRE recarrega:
  //  - COM SW em espera → dá tempo do skipWaiting trocar o controlador
  //    (o controllerchange normalmente recarrega antes dos 5s);
  //  - SEM SW em espera → o SW atual já é o mais novo, recarrega logo.
  setTimeout(recarregar, temEspera ? 5000 : 400);
}
