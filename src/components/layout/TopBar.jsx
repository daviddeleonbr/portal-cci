import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Bell, ChevronDown, Menu, X, ChevronRight } from 'lucide-react';
import { currentUser } from '../../data/mockData';

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard' },
  {
    name: 'Cadastros',
    children: [
      { name: 'Clientes', href: '/admin/clientes' },
      { name: 'Colaboradores', href: '/admin/colaboradores' },
      {
        name: 'Parametros',
        children: [
          { name: 'Mascara DRE', href: '/admin/parametrizacoes/mascaras' },
          { name: 'Mapeamento', href: '/admin/parametrizacoes/mapeamento' },
        ],
      },
    ],
  },
  {
    name: 'Financeiro',
    children: [
      { name: 'Contas a Pagar', href: '/admin/financeiro/contas-pagar' },
      { name: 'Contas a Receber', href: '/admin/financeiro/contas-receber' },
    ],
  },
  {
    name: 'Fiscal',
    children: [
      { name: 'Notas Fiscais', href: '/admin/fiscal/notas-fiscais' },
      { name: 'Agendamento de Emissao', href: '/admin/fiscal/agendamento' },
    ],
  },
];

// Helper: recursively check if route is active in this subtree
function isSubtreeActive(item, pathname) {
  if (item.href && pathname.startsWith(item.href)) return true;
  if (item.children) return item.children.some(c => isSubtreeActive(c, pathname));
  return false;
}

export default function TopBar() {
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);
  const [openFlyout, setOpenFlyout] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(new Set());

  const menuRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
        setOpenFlyout(null);
      }
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setOpenFlyout(null);
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleMobileExpanded = (name) => {
    setMobileExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-indigo-700 shadow-sm">
      <div className="flex h-16 items-center gap-6 px-5 lg:px-8">
        {/* Logo */}
        <Link to="/admin/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm text-white font-bold text-[15px] shadow-sm">
            C
          </div>
          <span className="text-[15px] font-semibold text-white tracking-tight hidden sm:block">CCI Admin</span>
        </Link>

        {/* Desktop Nav */}
        <nav ref={menuRef} className="hidden lg:flex items-center gap-2 flex-1">
          {navigation.map((item) => {
            // Simple link (no children)
            if (!item.children) {
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    `rounded px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {item.name}
                </NavLink>
              );
            }

            // Dropdown with children
            const isActive = isSubtreeActive(item, location.pathname);
            const isOpen = openMenu === item.name;

            return (
              <div key={item.name} className="relative">
                <button
                  onClick={() => { setOpenMenu(isOpen ? null : item.name); setOpenFlyout(null); }}
                  className={`flex items-center gap-1.5 rounded px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
                    isActive || isOpen
                      ? 'bg-white/15 text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.name}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-0 top-full min-w-[220px] bg-white rounded-b border border-t-0 border-gray-200/70 shadow-lg z-50 py-1.5"
                    >
                      {item.children.map((child) => {
                        // Nested submenu (flyout)
                        if (child.children) {
                          const flyoutOpen = openFlyout === child.name;
                          return (
                            <div
                              key={child.name}
                              className="relative"
                              onMouseEnter={() => setOpenFlyout(child.name)}
                              onMouseLeave={() => setOpenFlyout(null)}
                            >
                              <button className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors ${
                                flyoutOpen || isSubtreeActive(child, location.pathname)
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}>
                                <span>{child.name}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              </button>

                              <AnimatePresence>
                                {flyoutOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute left-full top-0 ml-0.5 min-w-[200px] bg-white rounded border border-gray-200/70 shadow-lg py-1.5"
                                  >
                                    {child.children.map((gc) => (
                                      <NavLink
                                        key={gc.name}
                                        to={gc.href}
                                        className={({ isActive: gcActive }) =>
                                          `block px-4 py-2 text-sm transition-colors ${
                                            gcActive
                                              ? 'bg-blue-50 text-blue-700 font-medium'
                                              : 'text-gray-700 hover:bg-gray-50'
                                          }`
                                        }
                                      >
                                        {gc.name}
                                      </NavLink>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        }

                        // Simple child link
                        return (
                          <NavLink
                            key={child.name}
                            to={child.href}
                            className={({ isActive: childActive }) =>
                              `block px-4 py-2 text-sm transition-colors ${
                                childActive
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`
                            }
                          >
                            {child.name}
                          </NavLink>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Right side: bell + avatar */}
        <div className="flex items-center gap-2 ml-auto">
          <button className="relative rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400" />
          </button>

          <div ref={userRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm hover:bg-white/25 transition-colors"
            >
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full w-56 bg-white rounded-b border border-t-0 border-gray-200/70 shadow-lg z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">{currentUser.name}</p>
                    <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                  </div>
                  <Link to="/" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <LogOut className="h-4 w-4 text-gray-400" />
                    <span>Sair</span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-blue-700/95 backdrop-blur-sm overflow-hidden border-t border-white/10"
          >
            <nav className="px-4 py-3 space-y-0.5">
              {navigation.map((item) => {
                if (!item.children) {
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-white/15 text-white font-medium'
                            : 'text-white/75 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {item.name}
                    </NavLink>
                  );
                }

                const expanded = mobileExpanded.has(item.name);
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => toggleMobileExpanded(item.name)}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <span>{item.name}</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="ml-3 pl-3 border-l border-white/10 space-y-0.5 mt-0.5">
                        {item.children.map((child) => {
                          if (child.children) {
                            const childExpanded = mobileExpanded.has(child.name);
                            return (
                              <div key={child.name}>
                                <button
                                  onClick={() => toggleMobileExpanded(child.name)}
                                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                  <span>{child.name}</span>
                                  <ChevronDown className={`h-3 w-3 transition-transform ${childExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {childExpanded && (
                                  <div className="ml-3 pl-3 border-l border-white/10 space-y-0.5 mt-0.5">
                                    {child.children.map((gc) => (
                                      <NavLink
                                        key={gc.name}
                                        to={gc.href}
                                        className={({ isActive }) =>
                                          `block rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                                            isActive
                                              ? 'bg-white/15 text-white font-medium'
                                              : 'text-white/65 hover:bg-white/10 hover:text-white'
                                          }`
                                        }
                                      >
                                        {gc.name}
                                      </NavLink>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <NavLink
                              key={child.name}
                              to={child.href}
                              className={({ isActive }) =>
                                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                                  isActive
                                    ? 'bg-white/15 text-white font-medium'
                                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                                }`
                              }
                            >
                              {child.name}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
