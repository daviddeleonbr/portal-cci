// Modo do menu lateral no desktop (≥lg) — "Controle do menu".
//   expandido    → aberto fixo (260px), empurra o conteúdo
//   recolhido    → só ícones (64px); item com submenu abre a caixa ao clicar
//   hover        → só ícones; expande sobre o conteúdo ao passar o mouse (padrão)
//   opcoes       → só ícones; ao passar o mouse num item, caixa ao lado com o
//                  nome e o submenu
// Salvo no navegador por portal (admin / cliente). Celular: não se aplica
// (lá o menu é gaveta).
//
// As classes ficam aqui como texto literal (o Tailwind as encontra ao varrer
// src/). Os menus usam `classesModoMenu(modo)` no lugar das antigas
// `lg:w-16 lg:hover:w-[260px]`, `lg:group-hover:*` etc.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

export const MODOS_MENU = [
  { k: 'expandido', rot: 'Expandido' },
  { k: 'recolhido', rot: 'Recolhido' },
  { k: 'hover', rot: 'Expandir ao passar o mouse' },
  { k: 'opcoes', rot: 'Opções ao passar o mouse' },
];
const PADRAO = 'hover';
const EVENTO = 'cci:modo-menu';
const chave = (portal) => `cci_menu_modo_${portal}`;

export function lerModoMenu(portal) {
  try {
    const v = localStorage.getItem(chave(portal));
    return MODOS_MENU.some(m => m.k === v) ? v : PADRAO;
  } catch { return PADRAO; }
}

export function definirModoMenu(portal, modo) {
  try { localStorage.setItem(chave(portal), modo); } catch { /* sem storage: só nesta sessão */ }
  window.dispatchEvent(new Event(EVENTO));
}

function assinar(cb) {
  const onStorage = (e) => { if (e.key?.startsWith('cci_menu_modo_')) cb(); };
  window.addEventListener(EVENTO, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener('storage', onStorage); };
}

export function useModoMenu(portal) {
  return useSyncExternalStore(assinar, () => lerModoMenu(portal), () => PADRAO);
}

// Classes (só valem no desktop — todas com prefixo lg:) por modo.
//   aside   → largura/sombra da barra
//   fade    → textos (nome do item, seção, usuário)
//   marca   → coisas que só aparecem recolhida (linha entre seções, ponto de badge) — somar com `hidden`
//   submenu → container do submenu dentro da barra
//   chevron → setinha dos itens com submenu
//   margem  → recuo do conteúdo da página
export function classesModoMenu(modo) {
  switch (modo) {
    case 'expandido':
      return {
        aside: 'lg:w-[260px]',
        fade: 'whitespace-nowrap',
        marca: '',
        submenu: '',
        chevron: '',
        margem: 'lg:ml-[260px]',
      };
    case 'recolhido':
    case 'opcoes':
      return {
        aside: 'lg:w-16',
        fade: 'whitespace-nowrap lg:opacity-0',
        marca: 'lg:block',
        submenu: 'lg:hidden',
        chevron: 'lg:opacity-0',
        margem: 'lg:ml-16',
      };
    default: // hover
      return {
        aside: 'lg:w-16 lg:hover:w-[260px] lg:hover:shadow-2xl lg:hover:shadow-gray-900/10',
        fade: 'whitespace-nowrap lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity lg:duration-200',
        marca: 'lg:block lg:group-hover:opacity-0 transition-opacity duration-200',
        submenu: 'lg:hidden lg:group-hover:block',
        chevron: 'lg:opacity-0 lg:group-hover:opacity-100',
        margem: 'lg:ml-16',
      };
  }
}

// Caixa ao lado do ícone nos modos recolhidos. Dois tipos:
//   'dica' → etiqueta só com o nome (Recolhido, ao passar o mouse/foco)
//   'menu' → nome + submenu (Opções ao passar o mouse; ou clique no Recolhido)
// Suavidade: espera curta antes de abrir (não pisca quando o mouse só passa
// por cima) e, com a caixa já aberta, troca de item na hora (ela desliza).
// Devolve:
//   alvo                       → { item, rect, tipo } aberto (ou null)
//   propsItem(item)            → handlers de mouse/foco p/ o item de 1º nível
//   cliqueComSubmenu(item, el) → nos modos recolhidos (desktop) abre a caixa e
//                                devolve true (o item NÃO abre o submenu interno)
//   manter / agendarFechar / fechar → p/ a própria caixa
const ESPERA_ABRIR_MS = 120;
const ESPERA_FECHAR_MS = 180;

export function useCaixaOpcoes(modo) {
  const [alvo, setAlvo] = useState(null);
  const timer = useRef(null);
  const abertoRef = useRef(null); // espelho de `alvo` p/ os handlers
  const desktop = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 1024px)').matches;
  const definir = (v) => { abertoRef.current = v; setAlvo(v); };

  const abrir = (item, el, tipo) => { clearTimeout(timer.current); definir({ item, rect: el.getBoundingClientRect(), tipo }); };
  const abrirSuave = (item, el, tipo) => {
    clearTimeout(timer.current);
    const rect = el.getBoundingClientRect();
    if (abertoRef.current) { definir({ item, rect, tipo }); return; } // já aberta: troca na hora (desliza)
    timer.current = setTimeout(() => definir({ item, rect, tipo }), ESPERA_ABRIR_MS);
  };
  const fechar = useCallback(() => { clearTimeout(timer.current); abertoRef.current = null; setAlvo(null); }, []);
  const agendarFechar = () => { clearTimeout(timer.current); timer.current = setTimeout(() => definir(null), ESPERA_FECHAR_MS); };
  const manter = () => clearTimeout(timer.current);

  const propsItem = (item) => {
    if (modo === 'opcoes') {
      const ent = (e) => { if (desktop()) abrirSuave(item, e.currentTarget, 'menu'); };
      return { onMouseEnter: ent, onMouseLeave: agendarFechar, onFocus: ent, onBlur: agendarFechar };
    }
    if (modo === 'recolhido') {
      // Dica com o nome — mas não por cima de um submenu aberto pelo clique
      const ent = (e) => { if (desktop() && abertoRef.current?.tipo !== 'menu') abrirSuave(item, e.currentTarget, 'dica'); };
      const sai = () => { if (abertoRef.current?.tipo !== 'menu') agendarFechar(); else clearTimeout(timer.current); };
      return { onMouseEnter: ent, onMouseLeave: sai, onFocus: ent, onBlur: sai };
    }
    return {};
  };
  const cliqueComSubmenu = (item, el) => {
    if (!desktop() || (modo !== 'recolhido' && modo !== 'opcoes')) return false;
    if (modo === 'recolhido' && abertoRef.current?.tipo === 'menu' && abertoRef.current.item === item) fechar();
    else abrir(item, el, 'menu');
    return true;
  };
  // Mouse saiu da caixa: fecha — exceto o submenu aberto por CLIQUE no Recolhido
  const sairDaCaixa = () => { if (!(modo === 'recolhido' && abertoRef.current?.tipo === 'menu')) agendarFechar(); };
  return { alvo, propsItem, cliqueComSubmenu, manter, agendarFechar, sairDaCaixa, fechar };
}
