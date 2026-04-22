import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronLeft, ChevronRight, LogOut,
  LayoutDashboard, FolderKanban, Wallet, FileText, BarChart3, Settings2,
  Landmark, Coins, WalletCards, FileSearch,
} from 'lucide-react';
import { useAdminSession } from '../../hooks/useAuth';
import { logoutAdmin } from '../../lib/auth';

const navigationAll = [
  {
    section: 'Principal',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, permissao: 'dashboard' },
    ],
  },
  {
    section: 'Gestao interna',
    items: [
      {
        name: 'Cadastros',
        icon: FolderKanban,
        children: [
          { name: 'Clientes', href: '/admin/clientes', permissao: 'clientes' },
          { name: 'Colaboradores', href: '/admin/colaboradores', permissao: 'colaboradores' },
          { name: 'Usuarios do Sistema', href: '/admin/cadastros/usuarios', permissao: 'usuarios' },
          { name: 'Fornecedores', href: '/admin/cadastros/fornecedores', permissao: 'fornecedores' },
          { name: 'Plano de Contas', href: '/admin/cadastros/plano-contas', permissao: 'plano_contas' },
          { name: 'Motivos de Movimentacao', href: '/admin/cadastros/motivos', permissao: 'motivos' },
        ],
      },
      {
        name: 'Financeiro',
        icon: Wallet,
        children: [
          { name: 'Contas a Pagar', href: '/admin/financeiro/contas-pagar', permissao: 'contas_pagar' },
          { name: 'Contas a Receber', href: '/admin/financeiro/contas-receber', permissao: 'contas_receber' },
        ],
      },
      {
        name: 'Fiscal',
        icon: FileText,
        children: [
          { name: 'Notas Fiscais', href: '/admin/fiscal/notas-fiscais', permissao: 'fiscal' },
          { name: 'Agendamento de Emissao', href: '/admin/fiscal/agendamento', permissao: 'fiscal' },
        ],
      },
    ],
  },
  {
    section: 'Consultoria',
    items: [
      { name: 'Parametros', href: '/admin/parametros', icon: Settings2, permissao: 'parametros' },
      { name: 'Relatorios Cliente', href: '/admin/relatorios-cliente', icon: BarChart3, permissao: 'relatorios_cliente' },
    ],
  },
  {
    section: 'BPO',
    items: [
      { name: 'Conciliacao Bancaria', href: '/admin/bpo/conciliacao-bancaria', icon: Landmark, permissao: 'conciliacao_bancaria' },
      { name: 'Conciliacao de Caixas', href: '/admin/bpo/conciliacao-caixas', icon: Coins, permissao: 'conciliacao_caixas' },
      { name: 'Caixa Administrativo', href: '/admin/bpo/caixa-administrativo', icon: WalletCards, permissao: 'caixa_administrativo' },
      { name: 'Validacao OFX', href: '/admin/bpo/validacao-ofx', icon: FileSearch, permissao: 'conciliacao_bancaria' },
    ],
  },
];

// Filtra navegacao com base nas permissoes do usuario logado
function filtrarNavegacao(permissoes) {
  const perms = new Set(permissoes || []);
  const visivel = (item) => !item.permissao || perms.has(item.permissao);
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

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAdminSession();
  const usuario = session?.usuario;

  const navigation = useMemo(() => filtrarNavegacao(usuario?.permissoes), [usuario?.permissoes]);

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

  const nomeUsuario = usuario?.nome || 'Usuario';
  const emailUsuario = usuario?.email || '';
  const initials = nomeUsuario.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      className={`group fixed left-0 top-0 z-40 flex h-screen flex-col bg-white border-r border-gray-200/70 transition-all duration-300 ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      {/* Floating toggle button on the right edge */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expandir' : 'Recolher'}
        className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 shadow-sm hover:text-blue-600 hover:border-blue-300 hover:shadow transition-all opacity-0 group-hover:opacity-100"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Logo */}
      <div className="flex h-16 items-center px-5 flex-shrink-0 border-b border-gray-100">
        <Link to="/admin/dashboard" className={`flex items-center gap-3 ${collapsed ? 'mx-auto' : ''}`}>
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-[15px] shadow-md shadow-blue-500/30 flex-shrink-0">
            C
            <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-[14px] font-semibold text-gray-900 tracking-tight leading-tight">CCI Admin</p>
              <p className="text-[11px] text-gray-400 leading-tight">Portal interno</p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navigation.map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-[0.15em]">
                {section.section}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;

                // Simple link
                if (!item.children) {
                  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      title={collapsed ? item.name : undefined}
                      className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      {isActive && !collapsed && (
                        <motion.span
                          layoutId="activeBar"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-blue-600"
                        />
                      )}
                      {Icon && <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />}
                      {!collapsed && <span>{item.name}</span>}
                    </NavLink>
                  );
                }

                // Collapsed with children
                if (collapsed) {
                  const firstHref = item.children.find(c => c.href)?.href || item.children[0]?.children?.[0]?.href;
                  const isActive = isSubtreeActive(item, location.pathname);
                  return (
                    <Link
                      key={item.name}
                      to={firstHref || '#'}
                      title={item.name}
                      className={`flex items-center justify-center rounded-md px-3 py-2.5 transition-all duration-200 ${
                        isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {Icon && <Icon className={`h-[17px] w-[17px] ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />}
                    </Link>
                  );
                }

                // Expandable item
                const isActive = isSubtreeActive(item, location.pathname);
                const isOpen = expanded.has(item.name);

                return (
                  <div key={item.name}>
                    <button
                      onClick={() => toggleExpand(item.name)}
                      className={`relative w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-blue-600" />
                      )}
                      {Icon && <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />}
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : 'text-gray-400'}`}
                      />
                    </button>

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
                                      className={`relative w-full flex items-center justify-between rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200 ${
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
                                                  `block rounded-md px-3 py-1.5 text-[12px] transition-all duration-200 ${
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
                                    `relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[12.5px] transition-all duration-200 ${
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
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: User */}
      <div className="flex-shrink-0 border-t border-gray-100 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-2.5 border border-gray-100">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 flex-shrink-0">
              {initials}
              <div className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-gray-900 truncate leading-tight">{nomeUsuario}</p>
              <p className="text-[10.5px] text-gray-400 truncate leading-tight mt-0.5">{emailUsuario}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title="Sair"
            className="w-full flex items-center justify-center rounded-md py-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
