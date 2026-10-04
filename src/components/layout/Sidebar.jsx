import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronLeft, LogOut,
  LayoutDashboard, FolderKanban, Wallet, FileText, BarChart3, Settings2,
  Coins, WalletCards, PieChart, Settings, Bell, Megaphone, Lightbulb,
  MessageCircle, RefreshCw, Eye, AlertTriangle,
  Activity, FileSpreadsheet, Receipt, FileSignature, FileDown,
} from 'lucide-react';
import { useAdminSession } from '../../hooks/useAuth';
import { nivelAdmin } from '../../services/usuariosSistemaService';
import LogoCCI from '../ui/LogoCCI';
import { logoutAdmin } from '../../lib/auth';
import * as pendenciasService from '../../services/pendenciasService';
import * as melhoriasService from '../../services/melhoriasService';

const navigationAll = [
  {
    section: 'Principal',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, permissao: 'dashboard' },
    ],
  },
  {
    section: 'Gestão interna',
    items: [
      {
        name: 'Cadastros',
        href: '/admin/cadastros',
        icon: FolderKanban,
        permissaoQualquer: ['clientes', 'colaboradores', 'usuarios', 'fornecedores', 'plano_contas', 'motivos'],
      },
      {
        name: 'Financeiro',
        href: '/admin/financeiro/contas-pagar',
        icon: Wallet,
        permissao: 'contas_pagar',
      },
      {
        name: 'Notas Fiscais',
        href: '/admin/fiscal/notas-fiscais',
        icon: FileText,
        permissao: 'fiscal',
      },
      {
        name: 'Contratos',
        href: '/admin/contratos',
        icon: FileSignature,
      },
    ],
  },
  {
    section: 'Consultoria',
    items: [
      { name: 'Parâmetros', href: '/admin/parametros', icon: Settings2, permissao: 'parametros' },
      { name: 'Relatórios Cliente', href: '/admin/relatorios-cliente', icon: BarChart3, permissao: 'relatorios_cliente' },
      { name: 'Relatórios BI', href: '/admin/relatorios-bi', icon: PieChart, permissao: 'relatorios_bi' },
    ],
  },
  {
    section: 'BPO',
    items: [
      { name: 'Conciliação de Caixas', href: '/admin/bpo/conciliacao-caixas', icon: Coins, permissao: 'conciliacao_caixas' },
      { name: 'Caixa Administrativo', href: '/admin/bpo/caixa-administrativo', icon: WalletCards, permissao: 'caixa_administrativo' },
      { name: 'Manifestação de Notas', href: '/admin/fiscal/manifestacao', icon: FileSpreadsheet, permissao: 'notas_fiscais' },
      { name: 'Outras Contas a Pagar', href: '/admin/bpo/outras-contas', icon: Receipt, permissao: 'outras_contas' },
    ],
  },
  {
    section: 'Ferramentas',
    items: [
      { name: 'Exportação Contábil', href: '/admin/ferramentas/exportacao-contabil', icon: FileDown, nivelMinimo: 3 },
    ],
  },
  {
    section: 'Comunicações',
    items: [
      { name: 'Pendências', href: '/admin/pendencias', icon: AlertTriangle, badgeKey: 'pendencias' },
      { name: 'Notificações', href: '/admin/notificacoes', icon: Bell, permissao: 'notificacoes' },
      { name: 'Mensagens Iniciais', href: '/admin/mensagens-iniciais', icon: Megaphone, permissao: 'mensagens_iniciais' },
      { name: 'Melhorias do Sistema', href: '/admin/melhorias', icon: Lightbulb, permissao: 'melhorias', badgeKey: 'melhorias' },
      { name: 'Suporte (chat)', href: '/admin/suporte', icon: MessageCircle, permissao: 'suporte_admin' },
    ],
  },
  {
    section: 'Configurações',
    items: [
      { name: 'Geral', href: '/admin/configuracoes', icon: Settings, permissao: 'parametros' },
      { name: 'Uso do Portal', href: '/admin/uso-portal', icon: Activity, permissao: 'uso_portal' },
      { name: 'Webposto · Sincronia', href: '/admin/webposto-sync', icon: RefreshCw, permissao: 'webposto_sync' },
      { name: 'Portal cliente · Demo', href: '/admin/portal-demo', icon: Eye },
    ],
  },
];

// Filtra navegacao com base nas permissoes do usuario logado.
// Suporta `permissao` (string única — precisa ter) e `permissaoQualquer`
// (array — basta ter pelo menos uma). Útil em itens agrupados (Cadastros).
function filtrarNavegacao(usuario) {
  const perms = new Set(usuario?.permissoes || []);
  const nivel = nivelAdmin(usuario);
  const visivel = (item) => {
    if (item.nivelMinimo && nivel < item.nivelMinimo) return false;
    if (item.permissao && !perms.has(item.permissao)) return false;
    if (item.permissaoQualquer && !item.permissaoQualquer.some(p => perms.has(p))) return false;
    return true;
  };
  return navigationAll
    .map(section => ({
      ...section,
      items: section.items
        .map(item => {
          if (item.children) {
            const filhosVisiveis = item.children.filter(visivel);
            return filhosVisiveis.length ? { ...item, children: filhosVisiveis } : null;
          }
          return visivel(item) ? item : null;
        })
        .filter(Boolean),
    }))
    .filter(section => section.items.length > 0);
}

function isSubtreeActive(item, pathname) {
  if (item.href && pathname.startsWith(item.href)) return true;
  if (item.children) return item.children.some(c => isSubtreeActive(c, pathname));
  return false;
}

// Texto da sidebar: no desktop some com a sidebar recolhida e aparece ao
// passar o mouse (padrão Visor360). No mobile (gaveta) fica sempre visível.
const FADE = 'whitespace-nowrap lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity lg:duration-200';

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAdminSession();
  const usuario = session?.usuario;

  const navigation = useMemo(() => filtrarNavegacao(usuario), [usuario]);

  // Contadores pra badges em "Pendências" e "Melhorias do Sistema".
  // Re-carrega ao navegar (admin pode ter resolvido algo na página anterior).
  const [badges, setBadges] = useState({});
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [pend, melh] = await Promise.all([
          pendenciasService.contarAbertasAdmin().catch(() => 0),
          melhoriasService.contarAbertasAdmin().catch(() => 0),
        ]);
        if (!cancelado) setBadges({ pendencias: pend, melhorias: melh });
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
    <aside
      className={`group fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col overflow-hidden bg-white border-r border-gray-200/70 transition-[width,transform] duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} lg:translate-x-0
        lg:w-16 lg:hover:w-[260px] lg:hover:shadow-2xl lg:hover:shadow-gray-900/10`}
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
                <div className="absolute left-2 right-2 top-1/2 h-px bg-gray-200 hidden lg:block lg:group-hover:opacity-0 transition-opacity duration-200" aria-hidden />
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
                      title={item.name}
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
                          <span className="absolute top-1.5 left-[26px] h-2 w-2 rounded-full bg-rose-500 hidden lg:block lg:group-hover:opacity-0 transition-opacity duration-200" />
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
                      onClick={() => toggleExpand(item.name)}
                      title={item.name}
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
                        className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : 'text-gray-400'} lg:opacity-0 lg:group-hover:opacity-100`}
                      />
                    </button>

                    <div className="lg:hidden lg:group-hover:block">
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

      {/* Bottom: User — recolhida: só o avatar; expandida: avatar + nome + sair */}
      <div className="flex-shrink-0 border-t border-gray-100 p-2">
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
    </aside>
  );
}
