// Peças do "Controle do menu" lateral (desktop), usadas pelo Sidebar (admin)
// e pelo ClienteSidebar. Modos e classes: src/lib/modoMenu.js.
//  - ControleMenu: botão no rodapé da barra + caixa com os 4 modos.
//  - CaixaOpcoesMenu: caixa ao lado do ícone (modos Recolhido / Opções ao
//    passar o mouse) com o nome do item e o submenu. Fica num portal, fora da
//    barra (que tem overflow-hidden e cortaria a caixa).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, PanelLeft } from 'lucide-react';
import { MODOS_MENU } from '../../lib/modoMenu';

export function ControleMenu({ modo, onMudar, fade }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const botaoRef = useRef(null);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (botaoRef.current?.contains(e.target) || caixaRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const esc = (e) => { if (e.key === 'Escape') { setAberto(false); botaoRef.current?.focus(); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const alternar = () => {
    const r = botaoRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
    setAberto(v => !v);
  };

  return (
    <>
      <button ref={botaoRef} type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={aberto}
        title="Controle do menu"
        className="hidden lg:flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800">
        <PanelLeft className="h-[17px] w-[17px] flex-shrink-0" aria-hidden="true" />
        <span className={fade}>Controle do menu</span>
      </button>
      {aberto && pos && createPortal(
        <div ref={caixaRef} role="menu" aria-label="Controle do menu"
          className="fixed z-[70] w-64 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl"
          style={{ left: pos.left, bottom: pos.bottom }}>
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Controle do menu</p>
          {MODOS_MENU.map(m => {
            const on = m.k === modo;
            return (
              <button key={m.k} type="button" role="menuitemradio" aria-checked={on}
                onClick={() => { onMudar(m.k); setAberto(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${on ? 'font-semibold text-gray-900' : 'text-gray-700'} hover:bg-gray-50`}>
                <Check className={`h-4 w-4 flex-shrink-0 ${on ? 'text-blue-700' : 'invisible'}`} aria-hidden="true" />
                {m.rot}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// alvo: { item, rect, tipo } — item do menu ({ name, href, icon, children }),
// a posição do ícone na tela e o tipo ('dica' = só o nome; 'menu' = nome +
// submenu). onEntrar/onSair mantêm a caixa aberta enquanto o mouse passa do
// ícone para ela.
// Suavidade: entra/sai deslizando e esmaecendo; ao trocar de item com a caixa
// aberta ela DESLIZA até o novo ícone (transição de `top`) e o conteúdo troca
// com um fade curto.
const SUAVE = [0.2, 0.8, 0.2, 1];

export function CaixaOpcoesMenu({ alvo, hrefAtivo, onEntrar, onSair, onFechar }) {
  const caixaRef = useRef(null);
  useEffect(() => {
    if (!alvo) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onFechar?.(); };
    // Clique na própria barra (data-menu-lateral) não fecha aqui: o item
    // clicado decide (troca de item ou fecha ao clicar no mesmo).
    const fora = (e) => {
      if (caixaRef.current?.contains(e.target) || e.target.closest?.('[data-menu-lateral]')) return;
      onFechar?.();
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', fora);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', fora); };
  }, [alvo, onFechar]);

  let conteudo = null;
  if (alvo) {
    const { item, rect, tipo } = alvo;
    const left = rect.right + 8;
    const cls = (ativo) => `block rounded-md px-3 py-1.5 text-[13px] transition-colors ${ativo ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`;

    if (tipo === 'dica') {
      // Etiqueta escura com o nome, centralizada no ícone
      conteudo = (
        <motion.div key="dica" role="tooltip" ref={caixaRef} onMouseEnter={onEntrar} onMouseLeave={onSair}
          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.16, ease: SUAVE }}
          className="pointer-events-none fixed z-[70] whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-[13px] font-medium text-white shadow-lg"
          style={{ left, top: rect.top + rect.height / 2, y: '-50%', transition: 'top 180ms cubic-bezier(0.2,0.8,0.2,1)' }}>
          <motion.span key={item.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
            {item.name}
          </motion.span>
        </motion.div>
      );
    } else {
      const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - 80));
      conteudo = (
        <motion.div key="menu" ref={caixaRef} role="menu" aria-label={item.name} onMouseEnter={onEntrar} onMouseLeave={onSair}
          initial={{ opacity: 0, x: -8, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: SUAVE }}
          className="fixed z-[70] min-w-[200px] max-w-[280px] origin-left overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl"
          style={{ left, top, maxHeight: `calc(100vh - ${top + 8}px)`, transition: 'top 180ms cubic-bezier(0.2,0.8,0.2,1)' }}>
          <motion.div key={item.name} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: SUAVE }}>
            {item.href && !item.children ? (
              <NavLink to={item.href} onClick={onFechar} className={() => `${cls(item.href === hrefAtivo)} font-semibold`}>{item.name}</NavLink>
            ) : (
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{item.name}</p>
            )}
            {(item.children || []).map(c => (c.children ? (
              <div key={c.name} className="mt-1">
                <p className="px-3 pb-0.5 pt-1 text-[12px] font-semibold text-gray-800">{c.name}</p>
                {c.children.map(gc => (
                  <NavLink key={gc.name} to={gc.href} onClick={onFechar} className={() => `${cls(gc.href === hrefAtivo)} pl-5`}>{gc.name}</NavLink>
                ))}
              </div>
            ) : (
              <NavLink key={c.name} to={c.href} onClick={onFechar} className={() => cls(c.href === hrefAtivo)}>{c.name}</NavLink>
            )))}
          </motion.div>
        </motion.div>
      );
    }
  }

  return createPortal(<AnimatePresence>{conteudo}</AnimatePresence>, document.body);
}
