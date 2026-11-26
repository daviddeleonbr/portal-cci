import { useModoMenu, definirModoMenu, classesModoMenu, useCaixaOpcoes } from '../../lib/modoMenu';
import { ControleMenu, CaixaOpcoesMenu } from './ControleMenuLateral';
import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronLeft, LogOut } from 'lucide-react';
import { useAdminSession } from '../../hooks/useAuth';
import { filtrarNavegacao } from './adminNavegacao';
import LogoCCI from '../ui/LogoCCI';
import { logoutAdmin } from '../../lib/auth';
import * as pendenciasService from '../../services/pendenciasService';

function isSubtreeActive(item, pathname) {
  if (item.href && pathname.startsWith(item.href)) return true;
  if (item.children) return item.children.some(c => isSubtreeActive(c, pathname));
  return false;
}

// Desktop: 4 modos escolhidos no "Controle do menu" (src/lib/modoMenu.js).
// Textos usam `FADE` (classes do modo). No mobile (gaveta) ficam sempre visíveis.

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAdminSession();
  const usuario = session?.usuario;

  const navigation = useMemo(() => filtrarNavegacao(usuario), [usuario]);

  // Modo do menu no desktop (Expandido / Recolhido / Expandir ao passar o mouse /
  // Opções ao passar o mouse) — ver src/lib/modoMenu.js
  const modo = useModoMenu('admin');
  const cm = classesModoMenu(modo);
  const FADE = cm.fade;
  const caixa = useCaixaOpcoes(modo);

  // Contador pro badge de "Pendências".
  // Re-carrega ao navegar (admin pode ter resolvido algo na página anterior).
  const [badges, setBadges] = useState({});
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const pend = await pendenciasService.contarAbertasAdmin().catch(() => 0);
        if (!cancelado) setBadges({ pendencias: pend });
      } catch { /* silencioso — badge zerado se falhar */ }
    })();
    return () => { cancelado = true; };
  }, [location.pathname]);

  // Determina o href "mais específico" que case com a URL atual — apenas esse
  // item fica destacado. Evita rotas pai (ex: /admin/bpo) ativarem junto com
  // rotas filhas (ex: /admin/bpo/outras-contas).
  const hrefAtivo = useMemo(() => {
    const todos = [];
    navigation.forEach(s => s.items.forEach(it => {
      if (it.href) todos.push(it.href);
      if (it.children) it.children.forEach(c => { if (c.href) todos.push(c.href); });
    }));
    let melhor = '';
    todos.forEach(href => {
      const bate = location.pathname === href || location.pathname.startsWith(href + '/');
      if (bate && href.length > melhor.length) melhor = href;
    });
    return melhor;
  }, [navigation, location.pathname]);

  const TOP_LEVEL_EXPANDABLE = useMemo(() => navigation
    .flatMap(s => s.items)
    .filter(i => i.children)
    .map(i => i.name), [navigation]);

  const [expanded, setExpanded] = useState(() => {
    const open = new Set();
    navigation.forEach(section => {
      section.items.forEach(item => {
        if (item.children && isSubtreeActive(item, location.pathname)) {
          open.add(item.name);
        }
      });
    });
    return open;
  });

  useEffect(() => {
    const next = new Set();
    navigation.forEach(section => {
      section.items.forEach(item => {
        if (item.children && isSubtreeActive(item, location.pathname)) {
          next.add(item.name);
          item.children.forEach(child => {
            if (child.children && isSubtreeActive(child, location.pathname)) {
              next.add(child.name);
            }
          });
        }
      });
    });
    setExpanded(next);
  }, [location.pathname, navigation]);

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (TOP_LEVEL_EXPANDABLE.includes(name)) {
          TOP_LEVEL_EXPANDABLE.forEach(n => {
            if (n !== name) next.delete(n);
          });
        }
        next.add(name);
      }
      return next;
    });
  };

  const handleLogout = (e) => {
    e.preventDefault();
    logoutAdmin();
    navigate('/admin', { replace: true });
  };

  const nomeUsuario = usuario?.nome || 'Usuário';
  const emailUsuario = usuario?.email || '';
  const initials = nomeUsuario.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Desktop (≥lg): igual ao Visor360 — recolhida (rail de ícones, 64px) por padrão
  // e expande ao passar o mouse, SOBREPONDO o conteúdo (não empurra a página).
  // Textos ficam montados e só esmaecem (FADE), então nada pula ao expandir.
  // Mobile (<lg): gaveta que desliza da lateral (largura cheia), aberta pelo
  // botão de menu do Header.
  return (
    <aside data-menu-lateral=""
      className={`group fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col overflow-hidden bg-white border-r border-gray-200/70 transition-[width,transform] duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} lg:translate-x-0
        ${cm.aside}`}
    >
      {/* Close button (mobile only) */}
      <button
        onClick={onMobileClose}
        aria-label="Fechar menu"
        className="lg:hidden absolute right-2 top-3.5 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex h-16 items-center px-5 flex-shrink-0 border-b border-gray-100">
        <Link to="/admin/dashboard" className="flex items-center gap-3">
          <div className="h-6 w-6 flex-shrink-0">
            <LogoCCI className="h-6 w-6" title="CCI Admin" />
          </div>
          <div className={FADE}>
            <p className="font-display text-[14px] font-semibold text-gray-900 tracking-tight leading-tight">CCI Admin</p>
            <p className="text-[11px] text-gray-400 leading-tight">Portal interno</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="menu-lateral flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-0.5">
        {navigation.map((section, idx) => (
          <div key={section.section}>
            {/* Título da seção (expandida) ↔ linha divisória (recolhida). "Principal" não tem título. */}
            {section.section !== 'Principal' && (
            <div className="relative mt-2 mb-2.5 h-[14px]">
              <p className={`absolute inset-x-3 top-0 text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em] leading-[14px] ${FADE}`}>
                {section.section}
              </p>
              {idx > 0 && (
                <div className={`absolute left-2 right-2 top-1/2 h-px bg-gray-200 hidden ${cm.marca}`} aria-hidden />
              )}
            </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;

                // Simple link
                if (!item.children) {
                  const isActive = item.href === hrefAtivo;
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      title={modo === 'opcoes' || modo === 'recolhido' ? undefined : item.name}
                      {...caixa.propsItem(item)}
                      className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="activeBar"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-blue-600"
                        />
                      )}
                      {Icon && <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />}
                      <span className={FADE}>{item.name}</span>
                      {badge > 0 && (
                        <>
                          <span className={`ml-auto inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white tabular-nums ${FADE}`}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                          {/* Recolhida: ponto vermelho discreto sobre o ícone */}
                          <span className={`absolute top-1.5 left-[26px] h-2 w-2 rounded-full bg-rose-500 hidden ${cm.marca}`} />
                        </>
                      )}
                    </NavLink>
                  );
                }

                // Expandable item (submenu só aparece com a sidebar expandida)
                const isActive = isSubtreeActive(item, location.pathname);
                const isOpen = expanded.has(item.name);

                return (
                  <div key={item.name}>
                    <button
                      onClick={(e) => { if (!caixa.cliqueComSubmenu(item, e.currentTarget)) toggleExpand(item.name); }}
                      title={modo === 'opcoes' || modo === 'recolhido' ? undefined : item.name}
                      {...caixa.propsItem(item)}
                      className={`relative w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-blue-600" />
                      )}
                      {Icon && <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />}
                      <span className={`flex-1 text-left ${FADE}`}>{item.name}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : 'text-gray-400'} ${cm.chevron}`}
                      />
                    </button>

                    <div className={cm.submenu}>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="relative ml-4 mt-1 space-y-0.5 pl-3">
                            <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200" />

                            {item.children.map((child) => {
                              if (child.children) {
                                const childOpen = expanded.has(child.name);
                                const childActive = isSubtreeActive(child, location.pathname);
                                return (
                                  <div key={child.name}>
                                    <button
                                      onClick={() => toggleExpand(child.name)}
                                      className={`relative w-full flex items-center justify-between rounded-md px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-all duration-200 ${
                                        childActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                    >
                                      <span className="flex items-center gap-2.5">
                                        <span className={`h-1 w-1 rounded-full transition-colors ${childActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                        {child.name}
                                      </span>
                                      <ChevronDown
                                        className={`h-3 w-3 transition-transform duration-200 ${childOpen ? 'rotate-180 text-gray-500' : 'text-gray-400'}`}
                                      />
                                    </button>
                                    <AnimatePresence initial={false}>
                                      {childOpen && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                          className="overflow-hidden"
                                        >
                                          <div className="relative ml-3.5 mt-0.5 space-y-0.5 pl-3">
                                            <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-150" />
                                            {child.children.map((gc) => (
                                              <NavLink
                                                key={gc.name}
                                                to={gc.href}
                                                className={({ isActive: gcActive }) =>
                                                  `block rounded-md px-3 py-1.5 text-[12px] whitespace-nowrap transition-all duration-200 ${
                                                    gcActive
                                                      ? 'text-blue-700 font-medium bg-blue-50/60'
                                                      : 'text-gray-400 hover:text-gray-700'
                                                  }`
                                                }
                                              >
                                                {gc.name}
                                              </NavLink>
                                            ))}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                );
                              }

                              return (
                                <NavLink
                                  key={child.name}
                                  to={child.href}
                                  className={({ isActive: childActive }) =>
                                    `relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-all duration-200 ${
                                      childActive
                                        ? 'text-blue-700 font-medium bg-blue-50/60'
                                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                    }`
                                  }
                                >
                                  {({ isActive: childActive }) => (
                                    <>
                                      <span className={`h-1 w-1 rounded-full transition-colors ${childActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                      {child.name}
                                    </>
                                  )}
                                </NavLink>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: Controle do menu (desktop) + User — recolhida: só o avatar; expandida: avatar + nome + sair */}
      <div className="flex-shrink-0 border-t border-gray-100 p-2 space-y-1">
        <ControleMenu modo={modo} onMudar={(m) => { caixa.fechar(); definirModoMenu('admin', m); }} fade={FADE} />
        <div className="flex items-center gap-2.5 overflow-hidden rounded-lg bg-gray-50 p-2 border border-gray-100">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 flex-shrink-0">
            {initials}
            <div className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-50" />
          </div>
          <div className={`flex-1 min-w-0 ${FADE}`}>
            <p className="text-[12px] font-medium text-gray-900 truncate leading-tight">{nomeUsuario}</p>
            <p className="text-[10.5px] text-gray-400 truncate leading-tight mt-0.5">{emailUsuario}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className={`rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 ${FADE}`}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <CaixaOpcoesMenu alvo={caixa.alvo} hrefAtivo={hrefAtivo}
        onEntrar={caixa.manter} onSair={caixa.sairDaCaixa} onFechar={caixa.fechar} />
    </aside>
  );
}
