import { useModoMenu, definirModoMenu, classesModoMenu, useCaixaOpcoes } from '../../../lib/modoMenu';
import { ControleMenu, CaixaOpcoesMenu } from '../ControleMenuLateral';
import { useMemo, useState, useEffect } from 'react';
import { useLocation, NavLink, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, X, LogOut, PieChart, ArrowUpRight, UserRound } from 'lucide-react';
import { navegacaoDaSessao, hrefAtivoDoMenu, itensBarraMobile, itensDoMenu } from './clienteNavegacao';
import { useClienteSession } from '../../../hooks/useAuth';
import LogoCCI from '../../ui/LogoCCI';
import { logoutCliente } from '../../../lib/auth';
import PerfilModalCliente from './PerfilModalCliente';

function isSubtreeActive(item, pathname) {
  if (item.href && (pathname === item.href || pathname.startsWith(item.href + '/'))) return true;
  if (item.children) return item.children.some(c => isSubtreeActive(c, pathname));
  return false;
}

// Desktop: 4 modos do "Controle do menu" (src/lib/modoMenu.js); textos usam `FADE` (classes do modo).

export default function ClienteSidebar({ mobileOpen, onMobileClose, badges = {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useClienteSession();
  const cliente = session?.cliente;
  const asRede  = session?.asRede;
  const usuario = session?.usuario;
  const tipoCliente = session?.tipoCliente || 'webposto';
  const prefix = `/cliente/${tipoCliente}`;
  // Flags (DRE / Fluxo) vêm do cliente (Webposto) ou da rede (Autosystem)
  const flagSource = tipoCliente === 'autosystem' ? asRede : cliente;
  // Cliente que usa o Visor360: as informações comerciais/financeiras ficam lá,
  // então escondemos as seções Comercial e Financeiro e mostramos um botão de
  // acesso. A URL do Visor360 é fixa por tipo (mesmas do seletor /visor360).
  const usaVisor360 = !!flagSource?.usa_visor360;
  const visor360Url = tipoCliente === 'autosystem'
    ? 'https://visor360-as.cci.app.br'
    : 'https://visor360.cci.app.br';

  // Modo do menu no desktop — ver src/lib/modoMenu.js
  const modo = useModoMenu('cliente');
  const cm = classesModoMenu(modo);
  const FADE = cm.fade;
  const caixa = useCaixaOpcoes(modo);

  const navigation = useMemo(() => navegacaoDaSessao(session), [session]);
  const hrefAtivo = useMemo(() => hrefAtivoDoMenu(navigation, location.pathname), [navigation, location.pathname]);

  const [expanded, setExpanded] = useState(() => {
    const open = new Set();
    navigation.forEach(section => section.items.forEach(item => {
      if (item.children && isSubtreeActive(item, location.pathname)) open.add(item.name);
    }));
    return open;
  });

  useEffect(() => {
    const next = new Set();
    navigation.forEach(section => section.items.forEach(item => {
      if (item.children && isSubtreeActive(item, location.pathname)) next.add(item.name);
    }));
    setExpanded(next);
  }, [location.pathname, navigation]);

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const [perfilAberto, setPerfilAberto] = useState(false);
  const handleLogout = (e) => {
    e?.preventDefault?.();
    setPerfilAberto(false);
    logoutCliente();
    navigate('/cliente/login', { replace: true });
  };

  const nomeCliente = cliente?.nome || usuario?.nome || 'Cliente';
  const cnpjCliente = cliente?.cnpj || '';
  const initials = nomeCliente.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Menu do celular (gaveta "Mais"): grade de blocos, sem os atalhos que já
  // estão na barra inferior. Submenus (children) entram achatados.
  const secoesMobile = useMemo(() => {
    const naBarra = new Set(itensBarraMobile(navigation).map(i => i.href));
    return navigation
      .map(sec => ({ ...sec, items: itensDoMenu([sec]).filter(it => !naBarra.has(it.href)) }))
      .filter(sec => sec.items.length > 0);
  }, [navigation]);

  // Desktop (≥lg): igual ao Visor360 — recolhida (rail de ícones, 64px) por padrão
  // e expande ao passar o mouse, SOBREPONDO o conteúdo (não empurra a página).
  // Mobile (<lg): gaveta de BAIXO PRA CIMA (botão "Mais" da ClienteBottomNav),
  // largura cheia, encostada logo acima da barra inferior — tocar "Mais" de
  // novo fecha. Os atalhos da barra não se repetem aqui (secoesMobile).
  return (
    <aside data-menu-lateral=""
      aria-label="Menu"
      className={`group fixed z-40 flex flex-col overflow-hidden bg-white ease-in-out
        inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom)-3.5rem)] w-full
        rounded-t-2xl border-t border-gray-200 shadow-[0_-12px_32px_-12px_rgba(15,23,42,0.25)]
        transition-[transform,opacity,visibility] duration-300
        ${mobileOpen ? 'translate-y-0 opacity-100 visible' : 'translate-y-full opacity-0 invisible pointer-events-none'}
        lg:visible lg:opacity-100 lg:pointer-events-auto lg:translate-y-0 lg:transition-[width] lg:inset-x-auto lg:left-0 lg:top-0 lg:bottom-auto lg:h-screen lg:max-h-none
        ${cm.aside} lg:rounded-none lg:border-t-0 lg:border-r lg:border-gray-200/70 lg:shadow-none`}
    >
      {/* Cabeçalho da gaveta (mobile): alça + título + fechar */}
      <div className="lg:hidden flex-shrink-0">
        <div className="flex justify-center pt-2"><span className="h-1 w-10 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between pl-5 pr-2 pt-1 pb-1">
          <p className="text-sm font-semibold text-gray-900">Menu</p>
          <button onClick={onMobileClose} aria-label="Fechar menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="hidden lg:flex h-16 items-center px-5 flex-shrink-0 border-b border-gray-100">
        <Link to={`${prefix}/dashboard`} className="flex items-center gap-3">
          <div className="h-6 w-6 flex-shrink-0">
            <LogoCCI className="h-6 w-6" title="CCI Cliente" />
          </div>
          <div className={FADE}>
            <p className="text-[14px] font-semibold text-gray-900 tracking-tight leading-tight">CCI</p>
            <p className="text-[11px] text-gray-400 leading-tight">Portal do Cliente</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      {/* Navegação — CELULAR: blocos em grade (alvo grande, leitura rápida) */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 space-y-5">
        {usaVisor360 && (
          <a href={visor360Url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl bg-blue-700 px-4 min-h-[52px] text-sm font-semibold text-white active:bg-blue-800">
            <PieChart className="h-5 w-5 flex-shrink-0" />
            <span className="flex-1">Acessar Visor360</span>
            <ArrowUpRight className="h-4 w-4 flex-shrink-0" />
          </a>
        )}
        {secoesMobile.map(section => (
          <section key={section.section} aria-label={section.section === 'Principal' ? 'Início' : section.section}>
            {section.section !== 'Principal' && (
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">{section.section}</h3>
            )}
            <div className="grid grid-cols-3 gap-2">
              {section.items.map(item => {
                const Icon = item.icon;
                const on = item.href === hrefAtivo;
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <NavLink key={item.href} to={item.href}
                    className={`relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors ${
                      on ? 'border-blue-700 bg-blue-50 ring-1 ring-blue-700' : 'border-gray-200 bg-white active:bg-gray-50'}`}>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${on ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700'}`}>
                      {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <span className={`text-[12px] leading-tight line-clamp-2 ${on ? 'font-semibold text-blue-800' : 'font-medium text-gray-800'}`}>
                      {item.name}
                    </span>
                    {badge > 0 && (
                      <span className="absolute right-1.5 top-1.5 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white tabular-nums"
                        aria-label={`${badge} pendente${badge === 1 ? '' : 's'}`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </section>
        ))}
        {secoesMobile.length === 0 && !usaVisor360 && (
          <p className="py-6 text-center text-sm text-gray-600">Todas as suas opções já estão na barra abaixo.</p>
        )}
      </div>

      {/* Navegação — DESKTOP: lista na sidebar recolhível */}
      <nav className="menu-lateral hidden lg:block flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-0.5">
        {usaVisor360 && (
          <a
            href={visor360Url}
            target="_blank"
            rel="noopener noreferrer"
            title="Acessar Visor360"
            className="mb-2 flex items-center gap-3 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-800 transition-all"
          >
            <PieChart className="h-[17px] w-[17px] flex-shrink-0" />
            <span className={`flex-1 ${FADE}`}>Acessar Visor360</span>
            <ArrowUpRight className={`h-4 w-4 flex-shrink-0 ${FADE}`} />
          </a>
        )}
        {navigation.map((section, idx) => (
          <div key={section.section}>
            {/* Título da seção (expandida) ↔ linha divisória (recolhida). "Principal" não tem título. */}
            {section.section !== 'Principal' && (
            <div className="relative mt-2 mb-2.5 h-[14px]">
              <p className={`absolute inset-x-3 top-0 text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em] leading-[14px] ${FADE}`}>
                {section.section}
              </p>
              {(idx > 0 || usaVisor360) && (
                <div className={`absolute left-2 right-2 top-1/2 h-px bg-gray-200 hidden ${cm.marca}`} aria-hidden />
              )}
            </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;

                // Simple link (no children)
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
                          layoutId="clienteActiveBar"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-accent-500"
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
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-accent-500" />
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
                            {item.children.map((child) => (
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
                            ))}
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

      {/* Bottom: User — recolhida: só o avatar; expandida: avatar + nome + sair */}
      {/* CELULAR: cartão do usuário com ações rotuladas (alvos de 44px+) */}
      <div className="lg:hidden flex-shrink-0 border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white text-sm font-semibold flex-shrink-0" aria-hidden="true">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{nomeCliente}</p>
            {cnpjCliente && <p className="text-xs text-gray-600 truncate tabular-nums">{cnpjCliente}</p>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPerfilAberto(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 active:bg-gray-50">
            <UserRound className="h-4 w-4" aria-hidden="true" /> Meu perfil
          </button>
          <button type="button" onClick={handleLogout}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-700 active:bg-rose-50">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
          </button>
        </div>
      </div>

      {/* DESKTOP: recolhida mostra só o avatar; expandida, avatar + nome + sair */}
      <div className="hidden lg:block flex-shrink-0 border-t border-gray-100 p-2 space-y-1">
        <ControleMenu modo={modo} onMudar={(m) => { caixa.fechar(); definirModoMenu('cliente', m); }} fade={FADE} />
        <div className="flex items-center gap-2.5 overflow-hidden rounded-lg bg-gray-50 p-2 border border-gray-100">
          <button type="button" onClick={() => setPerfilAberto(true)} title="Meu perfil"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left hover:opacity-80">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 flex-shrink-0">
            {initials}
            <div className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-50" />
          </div>
          <div className={`flex-1 min-w-0 ${FADE}`}>
            <p className="text-[12px] font-medium text-gray-900 truncate leading-tight">{nomeCliente}</p>
            <p className="text-[10.5px] text-gray-400 truncate leading-tight mt-0.5">{cnpjCliente}</p>
          </div>
          </button>
          <button onClick={handleLogout} title="Sair"
            className={`rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 ${FADE}`}>
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <CaixaOpcoesMenu alvo={caixa.alvo} hrefAtivo={hrefAtivo}
        onEntrar={caixa.manter} onSair={caixa.sairDaCaixa} onFechar={caixa.fechar} />
      {perfilAberto && <PerfilModalCliente onClose={() => setPerfilAberto(false)} />}
    </aside>
  );
}
