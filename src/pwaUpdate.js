// Registro do service worker + fluxo de atualização SEM logout.
//
// Problema: o app é uma SPA. Depois do 1º load, a navegação é client-side,
// então o browser quase nunca re-checa o SW — o usuário só pega o bundle novo
// após dois carregamentos completos (ex.: logout + login). Aqui resolvemos:
//   1) checamos update a cada 5 min, no foco da janela e ao voltar a ficar visível;
//   2) quando há versão nova, `avisar` dispara o evento que o NovaVersaoToast escuta
//      (e guarda em `avisoPendente` se a tela ainda não montou);
//   3) instalar = manda o SW novo assumir (skipWaiting) SEM recarregar; quando
//      ele assume, a UI mostra "Ok, reiniciar portal" e o reload é do usuário.
//
// Requer `registerType: 'prompt'` no VitePWA (vite.config.js).
import { registerSW } from 'virtual:pwa-register';

const INTERVALO_CHECAGEM_MS = 5 * 60 * 1000; // 5 min
const MIN_ENTRE_CHECAGENS_MS = 60 * 1000;      // foco/visibilidade: no máximo 1 por minuto

let aplicar = null;
let swRegistration = null;
let aoAssumir = null; // resolve da instalação em andamento
let ultimaChecagem = 0;

// O aviso pode sair ANTES de a tela montar (versão nova já baixada quando o app
// abre): fica guardado aqui e o NovaVersaoToast lê ao montar.
let pendente = null; // null | 'disponivel' | 'instalada'
export const avisoPendente = () => pendente;
function avisar(tipo) {
  pendente = tipo;
  window.dispatchEvent(new Event(tipo === 'instalada' ? 'pwa:versao-instalada' : 'pwa:nova-versao'));
}

// A biblioteca (workbox-window) PARA de escutar depois da 1ª atualização que
// percebe; por isso acompanhamos o registro por conta própria: todo deploy avisa.
function acompanhar(registration) {
  registration.addEventListener('updatefound', () => {
    const novo = registration.installing;
    if (!novo || !registration.active) return; // 1ª instalação da vida: sem aviso
    novo.addEventListener('statechange', () => {
      if (novo.state === 'installed' && registration.waiting === novo) avisar('disponivel');
    });
  });
}

function checar(forcar = false) {
  if (!swRegistration) return;
  const agora = Date.now();
  if (!forcar && agora - ultimaChecagem < MIN_ENTRE_CHECAGENS_MS) return;
  ultimaChecagem = agora;
  swRegistration.update().catch(() => {});
}

export function iniciarAtualizacaoPwa() {
  // O SW novo assumiu: ou foi esta aba que instalou, ou foi outra aba/janela
  // (aí esta precisa reiniciar também). A 1ª ativação da vida não conta.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (aoAssumir) aoAssumir();
      else avisar('instalada');
    });
  }
  aplicar = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      ultimaChecagem = Date.now(); // o registro já confere a versão
      acompanhar(registration);
      setInterval(() => checar(true), INTERVALO_CHECAGEM_MS);
      // App instalado que fica aberto: o foco avisa mesmo sem ter sido minimizado
      window.addEventListener('focus', () => checar());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checar();
      });
      window.addEventListener('online', () => checar());
    },
    onNeedRefresh() { avisar('disponivel'); },
    // Sem este callback a lib recarregaria a página sozinha. O aviso sai do
    // controllerchange acima e o reload vem do botão "Reiniciar".
    onNeedReload() {},
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
