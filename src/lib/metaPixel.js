// Meta Pixel (Facebook / Instagram Ads) da CCI.
//
// Carregado SOB DEMANDA apenas nas páginas públicas de campanha (a landing de
// vendas) — NÃO no portal admin/cliente logado. Isso mantém os dados do pixel
// focados no tráfego de anúncio, evita rastrear usuários autenticados (clientes
// e equipe) em ferramentas internas e reduz exposição de LGPD.
//
// init() é idempotente: pode ser chamado mais de uma vez sem recarregar o script.

const PIXEL_ID = '1084361160655833';
let iniciado = false;

export function initPixel() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  if (!window.fbq) {
    // Stub oficial da Meta (equivalente ao snippet, sem a versão minificada).
    const n = function () {
      if (n.callMethod) n.callMethod.apply(n, arguments);
      else n.queue.push(arguments);
    };
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    const t = document.createElement('script');
    t.async = true;
    t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const s = document.getElementsByTagName('script')[0];
    if (s && s.parentNode) s.parentNode.insertBefore(t, s);
    else document.head.appendChild(t);
  }
  window.fbq('init', PIXEL_ID);
}

export function pixelPageView() {
  if (typeof window !== 'undefined' && window.fbq) window.fbq('track', 'PageView');
}

// Evento padrão da Meta (ex.: 'Lead', 'Contact') — dispara só se o pixel carregou.
export function pixelTrack(evento, params) {
  if (typeof window !== 'undefined' && window.fbq) window.fbq('track', evento, params);
}

// Evento personalizado (aparece como Custom no Ads Manager).
export function pixelTrackCustom(evento, params) {
  if (typeof window !== 'undefined' && window.fbq) window.fbq('trackCustom', evento, params);
}
