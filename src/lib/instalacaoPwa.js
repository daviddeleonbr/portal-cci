// "Instalar app" (PWA) — estado compartilhado + hook.
//
//  - Chrome/Edge (Android e desktop): o navegador dispara `beforeinstallprompt`
//    quando o app PODE ser instalado (e não dispara se já está instalado).
//    Guardamos o evento e o botão chama `prompt()` — a janela nativa de instalar.
//    O evento costuma vir cedo, antes do React montar: por isso este módulo é
//    importado no main.jsx (o listener entra no ar já no carregamento).
//  - iPhone/iPad: não existe instalação por código. O botão abre o passo a
//    passo (Compartilhar → Adicionar à Tela de Início). O Safari não informa se
//    o app já foi instalado → "Já instalei" esconde o botão (salvo no aparelho).
//  - Rodando como app instalado (display-mode standalone): nada aparece.
//
// São DOIS apps: o do cliente (manifesto do vite.config.js, abre em
// /cliente/login) e o do admin (public/manifest-admin.webmanifest, abre em
// /admin). `aplicarManifesto` troca o <link rel="manifest"> conforme o portal
// aberto, e o navegador oferece a instalação do app certo.
import { useSyncExternalStore } from 'react';

const CHAVE_IOS_OK = 'cci_pwa_ios_instalado';
const ouvintes = new Set();
let eventoInstalar = null;
let instaladoAgora = false;

const avisar = () => ouvintes.forEach(fn => fn());

const MANIFESTO_ADMIN = '/manifest-admin.webmanifest';
const MANIFESTO_CLIENTE = '/manifest.webmanifest';
export function aplicarManifesto(pathname) {
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');
  let link = document.querySelector('link[rel="manifest"]');
  const atual = link?.getAttribute('href');
  if (admin ? atual === MANIFESTO_ADMIN : atual !== MANIFESTO_ADMIN) return;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.setAttribute('href', admin ? MANIFESTO_ADMIN : MANIFESTO_CLIENTE);
  // O evento guardado era do outro app; o navegador dispara de novo p/ este.
  eventoInstalar = null;
  instaladoAgora = false;
  avisar();
}

if (typeof window !== 'undefined') {
  aplicarManifesto(window.location.pathname);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sem a mini-barra automática do Chrome; o portal mostra o botão
    eventoInstalar = e;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    eventoInstalar = null;
    instaladoAgora = true;
    avisar();
  });
}

function rodandoComoApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true; // iOS
}

function ehIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS se apresenta como "Macintosh" com toque
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function iosJaInstalou() {
  try { return localStorage.getItem(CHAVE_IOS_OK) === '1'; } catch { return false; }
}

// Snapshot estável (useSyncExternalStore compara por referência)
let ultimo = null;
function ler() {
  const app = rodandoComoApp();
  const ios = ehIos();
  const modo = app || instaladoAgora ? null
    : eventoInstalar ? 'nativo'
    : ios && !iosJaInstalou() ? 'ios'
    : null;
  if (!ultimo || ultimo.modo !== modo) ultimo = { modo };
  return ultimo;
}

function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

// modo: 'nativo' (janela do navegador) | 'ios' (passo a passo) | null (não mostrar)
export function useInstalacaoPwa() {
  const { modo } = useSyncExternalStore(assinar, ler, () => ({ modo: null }));
  return { modo };
}

// Abre a janela nativa. Resolve true se o usuário aceitou.
export async function instalarNativo() {
  const e = eventoInstalar;
  if (!e) return false;
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  eventoInstalar = null; // o evento só pode ser usado uma vez
  if (outcome === 'accepted') instaladoAgora = true;
  avisar();
  return outcome === 'accepted';
}

export function marcarIosInstalado() {
  try { localStorage.setItem(CHAVE_IOS_OK, '1'); } catch { /* sem storage */ }
  avisar();
}
