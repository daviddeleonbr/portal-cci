import { useMemo, useState, useEffect } from 'react';
import { useLocation, NavLink, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronLeft, LogOut,
  LayoutDashboard, BarChart3, TrendingUp, PieChart,
  HelpCircle, Coins, UserCog, ClipboardCheck,
  ShoppingCart, Activity, Gauge,
  ArrowUpRight, ArrowDownLeft, Settings, Lightbulb, FileSpreadsheet, Receipt,
  Boxes, AlertTriangle,
} from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import LogoCCI from '../../ui/LogoCCI';
import { logoutCliente } from '../../../lib/auth';
import * as pendenciasService from '../../../services/pendenciasService';

// Os hrefs são montados em runtime com prefixo `/cliente/<tipoCliente>`
// para que webposto e autosystem reusem o mesmo menu.
function buildNavigation(prefix, tipoCliente = 'webposto') {
  return [
    {
      section: 'Principal',
      items: [
        { name: 'Visão Geral', href: `${prefix}/dashboard`, icon: LayoutDashboard, permissao: 'dashboard' },
      ],
    },
    {
      section: 'Relatórios',
      items: [
        { name: 'DRE', href: `${prefix}/dre`, icon: BarChart3, permissao: 'dre', requerFlag: 'exibir_dre' },
        { name: 'Fluxo de Caixa', href: `${prefix}/fluxo-caixa`, icon: TrendingUp, permissao: 'fluxo_caixa', requerFlag: 'exibir_fluxo_caixa' },
        { name: 'Relatórios BI', href: `${prefix}/relatorios-bi`, icon: PieChart, permissao: 'relatorios_bi' },
      ],
    },
    {
      section: 'Comercial',
      items: [
        { name: 'Vendas', href: `${prefix}/comercial/vendas`, icon: ShoppingCart, permissao: 'comercial_vendas' },
        { name: 'Operação', href: `${prefix}/comercial/operacao`, icon: Activity, permissao: 'comercial_operacao' },
        { name: 'Produtividade', href: `${prefix}/comercial/produtividade`, icon: Gauge, permissao: 'comercial_produtividade' },
        { name: 'Análise de Estoques', href: `${prefix}/comercial/estoques`, icon: Boxes, permissao: 'comercial_estoques' },
        // Compras só faz sentido em autosystem (puxa análise de estoque do AS)
        ...(tipoCliente === 'autosystem' ? [{ name: 'Compras', href: `${prefix}/compras`, icon: ShoppingCart, permissao: 'compras' }] : []),
      ],
    },
    {
      section: 'Financeiro',
      items: [
        { name: 'Contas a Pagar', href: `${prefix}/financeiro/contas-pagar`, icon: ArrowUpRight, permissao: 'financeiro' },
        { name: 'Contas a Receber', href: `${prefix}/financeiro/contas-receber`, icon: ArrowDownLeft, permissao: 'financeiro' },
      ],
    },
    {
      section: 'BPO',
      items: [
        { name: 'Sangrias', href: `${prefix}/sangrias`, icon: Coins, permissao: 'sangrias' },
        { name: 'Notas Fiscais', href: `${prefix}/financeiro/notas-fiscais`, icon: FileSpreadsheet, permissao: 'notas_fiscais' },
        { name: 'Outras Contas', href: `${prefix}/bpo/outras-contas`, icon: Receipt, permissao: 'outras_contas' },
        { name: 'Serviços BPO', href: `${prefix}/bpo`, icon: ClipboardCheck, permissao: 'bpo' },
      ],
    },
    {
      section: 'Atendimento',
      items: [
        { name: 'Pendências', href: `${prefix}/pendencias`, icon: AlertTriangle, badgeKey: 'pendencias', permissao: 'pendencias' },
        { name: 'Suporte', href: `${prefix}/suporte`, icon: HelpCircle, permissao: 'suporte' },
        { name: 'Melhorias do Sistema', href: `${prefix}/melhorias`, icon: Lightbulb, permissao: 'melhorias' },
      ],
    },
    {
      section: 'Administração da Rede',
      items: [
        { name: 'Usuários da Rede', href: `${prefix}/usuarios`, icon: UserCog, permissao: 'gerenciar_usuarios' },
        { name: 'Configurações', href: `${prefix}/configuracoes`, icon: Settings, permissao: 'configuracoes' },
      ],
    },
  ];
}

// flagSource é o objeto onde procuramos as flags `requerFlag` (`exibir_dre`
// etc.). Para Webposto vem de `session.cliente` (flag por empresa);
// para Autosystem vem de `session.asRede` (flag por rede).
function filtrarNavegacao(navigationAll, permissoes, flagSource) {
  const perms = new Set(permissoes || []);
  const visivel = (item) => {
    if (item.permissao && !perms.has(item.permissao)) return false;
    if (item.requerFlag && !flagSource?.[item.requerFlag]) return false;
    return true;
  };
  return navigationAll
    .map(section => ({
      ...section,
      items: section.items
        .map(item => {
          if (item.children) {
            const filhosVisiveis = item.children.filter(visivel);
            return filhosVisiveis.length && visivel(item) ? { ...item, children: filhosVisiveis } : null;
          }
          return visivel(item) ? item : null;
        })
        .filter(Boolean),
    }))
    .filter(section => section.items.length > 0);
}

function isSubtreeActive(item, pathname) {
  if (item.href && (pathname === item.href || pathname.startsWith(item.href + '/'))) return true;
  if (item.children) return item.children.some(c => isSubtreeActive(c, pathname));
  return false;
}

// Texto da sidebar: no desktop some com a sidebar recolhida e aparece ao
// passar o mouse (padrão Visor360). No mobile (drawer) fica sempre visível.
const FADE = 'whitespace-nowrap lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity lg:duration-200';

export default function ClienteSidebar({ mobileOpen, onMobileClose }) {
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

  const navigation = useMemo(
    () => {
      const nav = filtrarNavegacao(buildNavigation(prefix, tipoCliente), usuario?.permissoes, flagSource);
      return usaVisor360
        ? nav.filter(s => s.section !== 'Comercial' && s.section !== 'Financeiro')
        : nav;
    },
    [prefix, tipoCliente, usuario?.permissoes, flagSource, usaVisor360],
  );

  // Calcula o href "mais específico" que case com a URL atual. Evita o bug
  // de "/bpo" e "/bpo/outras-contas" ativarem simultaneamente — apenas o
  // mais longo (o que melhor identifica a página) fica destacado.
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

  // Badge de "Pendências" — conta pendências ATIVAS pra esse cliente
  // (respeita escopo de rede/cliente + janela + recorrência).
  const chaveApiId = session?.chaveApi?.id;
  const clientesIds = useMemo(
    () => (session?.clientesRede || []).map(c => c.id),
    [session?.clientesRede],
  );
  const [badges, setBadges] = useState({});
  useEffect(() => {
    if (!chaveApiId && clientesIds.length === 0) return;
    let cancelado = false;
    (async () => {
      try {
        const n = await pendenciasService.contarAbertasCliente({ clientesIds, chaveApiId });
        if (!cancelado) setBadges({ pendencias: n });
      } catch { /* silencioso */ }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveApiId, clientesIds.join(','), location.pathname]);

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleLogout = (e) => {
    e.preventDefault();
    logoutCliente();
    navigate('/cliente/login', { replace: true });
  };

  const nomeCliente = cliente?.nome || usuario?.nome || 'Cliente';
  const cnpjCliente = cliente?.cnpj || '';
  const initials = nomeCliente.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Desktop (≥lg): igual ao Visor360 — recolhida (rail de ícones, 64px) por padrão
  // e expande ao passar o mouse, SOBREPONDO o conteúdo (não empurra a página).
  // Mobile (<lg): drawer overlay com slide, sempre com largura cheia (260px).
  return (
    <aside
      className={`group fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col overflow-hidden bg-white border-r border-gray-200/70 transition-[width,transform] duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        lg:w-16 lg:hover:w-[260px] lg:hover:shadow-2xl lg:hover:shadow-gray-900/10`}
    >
      {/* Close button (mobile only) */}
      <button
        onClick={onMobileClose}
        aria-label="Fechar menu"
        className="lg:hidden absolute right-2 top-2 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex h-16 items-center px-5 flex-shrink-0 border-b border-gray-100">
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
      <nav className="menu-lateral flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-0.5">
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
                <div className="absolute left-2 right-2 top-1/2 h-px bg-gray-200 hidden lg:block lg:group-hover:opacity-0 transition-opacity duration-200" aria-hidden />
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
                      title={item.name}
                      className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="clienteActiveBar"
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
      <div className="flex-shrink-0 border-t border-gray-100 p-2">
        <div className="flex items-center gap-2.5 overflow-hidden rounded-lg bg-gray-50 p-2 border border-gray-100">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-semibold shadow-md shadow-blue-500/20 flex-shrink-0">
            {initials}
            <div className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-50" />
          </div>
          <div className={`flex-1 min-w-0 ${FADE}`}>
            <p className="text-[12px] font-medium text-gray-900 truncate leading-tight">{nomeCliente}</p>
            <p className="text-[10.5px] text-gray-400 truncate leading-tight mt-0.5">{cnpjCliente}</p>
          </div>
          <button onClick={handleLogout} title="Sair"
            className={`rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 ${FADE}`}>
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
