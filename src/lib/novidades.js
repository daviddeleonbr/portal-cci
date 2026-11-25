// Notas de versão ("O que há de novo").
//
// Fonte única: public/novidades.json — a 1ª entrada de `versoes` é a versão
// do app. Ele chega por dois caminhos:
//  - EMBUTIDO no bundle no build (vite.config.js → `__NOVIDADES__`): é a
//    versão que está rodando; usado depois da atualização;
//  - BUSCADO na rede (/novidades.json, fora do precache do SW — o globPatterns
//    do workbox não inclui .json): é a versão NOVA que o SW acabou de baixar;
//    usado antes de atualizar, pra mostrar o que vem por aí.
/* global __NOVIDADES__ */

const embutido = (typeof __NOVIDADES__ !== 'undefined' && __NOVIDADES__) || { versoes: [] };

export const VERSOES = embutido.versoes || [];
export const VERSAO_ATUAL = VERSOES[0]?.versao || '';

const CHAVE_VISTA = 'cci_versao_vista';
export function lerVersaoVista() {
  try { return localStorage.getItem(CHAVE_VISTA) || ''; } catch { return ''; }
}
export function marcarVersaoVista(versao) {
  try { if (versao) localStorage.setItem(CHAVE_VISTA, versao); } catch { /* sem storage */ }
}

// Notas da versão nova, direto da rede (sem cache). null se falhar.
export async function buscarVersaoNova() {
  try {
    const r = await fetch(`/novidades.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.versoes?.[0] || null;
  } catch { return null; }
}

// Quem está vendo, pela rota: portal admin, portal do cliente ou outro.
export function publicoDaRota(pathname = '') {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/cliente')) return 'cliente';
  return 'todos';
}

// Itens que interessam a esse público (os 'todos' valem pra qualquer um).
export function itensDoPublico(entrada, publico) {
  return (entrada?.itens || []).filter(i => !i.publico || i.publico === 'todos' || publico === 'todos' || i.publico === publico);
}

// Avisos de versão só aparecem DENTRO do sistema, com a sessão do portal ativa.
// Logins, seletor de portais, senha, landings e proposta ficam de fora (lista do
// que entra, não do que sai: rota pública nova não precisa ser lembrada aqui).
export function dentroDoSistema(pathname = '', { admin = false, cliente = false } = {}) {
  const p = (pathname || '').replace(/[/]+$/, '');
  if (p.startsWith('/admin/')) return !!admin; // '/admin' é o login
  if (p.startsWith('/cliente/webposto/') || p.startsWith('/cliente/autosystem/')) return !!cliente;
  if (p.startsWith('/tela-cheia/cliente/')) return !!cliente;
  if (p.startsWith('/tela-cheia/')) return !!admin;
  return false;
}
