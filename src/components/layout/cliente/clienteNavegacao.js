import {
  LayoutDashboard, BarChart3, TrendingUp, PieChart,
  Coins, UserCog, ClipboardCheck,
  ShoppingCart, Activity, Gauge,
  ArrowUpRight, ArrowDownLeft, Settings, FileSpreadsheet, Receipt,
  Boxes, AlertTriangle, KeyRound, Fuel, Calculator,
} from 'lucide-react';

// Menu do portal do cliente — compartilhado pela sidebar (ClienteSidebar)
// e pela barra inferior do celular (ClienteBottomNav).

// Os hrefs são montados em runtime com prefixo `/cliente/<tipoCliente>`
// para que webposto e autosystem reusem o mesmo menu.
// `curto`: rótulo do item na barra inferior do celular (ClienteBottomNav).
// `barraMobile`: tem preferência p/ ocupar lugar na barra (ver itensBarraMobile).
export function buildNavigation(prefix, tipoCliente = 'webposto') {
  return [
    {
      section: 'Principal',
      items: [
        { name: 'Visão Geral', href: `${prefix}/dashboard`, icon: LayoutDashboard, permissao: 'dashboard', curto: 'Início' },
      ],
    },
    {
      section: 'Relatórios',
      items: [
        { name: 'DRE', href: `${prefix}/dre`, icon: BarChart3, permissao: 'dre', curto: 'DRE', requerFlag: 'exibir_dre' },
        { name: 'Fluxo de Caixa', href: `${prefix}/fluxo-caixa`, icon: TrendingUp, permissao: 'fluxo_caixa', curto: 'Fluxo', requerFlag: 'exibir_fluxo_caixa' },
        { name: 'Relatórios BI', href: `${prefix}/relatorios-bi`, icon: PieChart, permissao: 'relatorios_bi', curto: 'BI' },
      ],
    },
    {
      section: 'Comercial',
      items: [
        { name: 'Vendas', href: `${prefix}/comercial/vendas`, icon: ShoppingCart, permissao: 'comercial_vendas', curto: 'Vendas' },
        { name: 'Operação', href: `${prefix}/comercial/operacao`, icon: Activity, permissao: 'comercial_operacao', curto: 'Operação' },
        { name: 'Produtividade', href: `${prefix}/comercial/produtividade`, icon: Gauge, permissao: 'comercial_produtividade', curto: 'Produtiv.' },
        { name: 'Análise de Estoques', href: `${prefix}/comercial/estoques`, icon: Boxes, permissao: 'comercial_estoques', curto: 'Estoques' },
        // Compras só faz sentido em autosystem (puxa análise de estoque do AS)
        ...(tipoCliente === 'autosystem' ? [{ name: 'Compras', href: `${prefix}/compras`, icon: ShoppingCart, permissao: 'compras', curto: 'Compras' }] : []),
      ],
    },
    {
      section: 'Financeiro',
      items: [
        { name: 'Contas a Pagar', href: `${prefix}/financeiro/contas-pagar`, icon: ArrowUpRight, permissao: 'financeiro', curto: 'A pagar' },
        { name: 'Contas a Receber', href: `${prefix}/financeiro/contas-receber`, icon: ArrowDownLeft, permissao: 'financeiro', curto: 'A receber' },
      ],
    },
    {
      section: 'BPO',
      items: [
        { name: 'Minhas tarefas', href: `${prefix}/tarefas`, icon: ClipboardCheck, permissao: 'tarefas', curto: 'Tarefas', barraMobile: true },
        { name: 'Sangrias', href: `${prefix}/sangrias`, icon: Coins, permissao: ['sangrias', 'sangrias_consultar'], curto: 'Sangrias', barraMobile: true },
        { name: 'Fechamento de caixa', href: `${prefix}/fechamento-caixa`, icon: Calculator, permissao: 'fechamento_caixa', curto: 'Caixa' },
        { name: 'Notas Fiscais', href: `${prefix}/financeiro/notas-fiscais`, icon: FileSpreadsheet, permissao: 'notas_fiscais', curto: 'Notas', barraMobile: true },
        { name: 'Contas a Pagar', href: `${prefix}/bpo/contas-pagar`, icon: ArrowUpRight, permissao: 'bpo_contas_pagar', curto: 'Pagar BPO' },
        { name: 'Contas a Receber', href: `${prefix}/bpo/contas-receber`, icon: ArrowDownLeft, permissao: 'bpo_contas_receber', curto: 'Receb. BPO' },
        // Outras Contas: a página só existe no Webposto (no Autosystem o link caía em `/`)
        ...(tipoCliente === 'webposto' ? [{ name: 'Outras Contas', href: `${prefix}/bpo/outras-contas`, icon: Receipt, permissao: 'outras_contas', curto: 'Outras', barraMobile: true }] : []),
        { name: 'Serviços BPO', href: `${prefix}/bpo`, icon: ClipboardCheck, permissao: 'bpo', curto: 'Serviços' },
        { name: 'Acessos', href: `${prefix}/acessos`, icon: KeyRound, permissao: 'acessos', curto: 'Acessos' },
        // LMC: por enquanto só Webposto (endpoint /INTEGRACAO/V1/LMCS)
        ...(tipoCliente === 'webposto' ? [{ name: 'LMC', href: `${prefix}/lmc`, icon: Fuel, permissao: 'lmc', curto: 'LMC' }] : []),
      ],
    },
    {
      section: 'Atendimento',
      items: [
        { name: 'Pendências', href: `${prefix}/pendencias`, icon: AlertTriangle, badgeKey: 'pendencias', permissao: 'pendencias', curto: 'Pendências' },
      ],
    },
    {
      section: 'Administração da Rede',
      items: [
        { name: 'Usuários da Rede', href: `${prefix}/usuarios`, icon: UserCog, permissao: 'gerenciar_usuarios', curto: 'Usuários' },
        { name: 'Configurações', href: `${prefix}/configuracoes`, icon: Settings, permissao: 'configuracoes', curto: 'Ajustes' },
      ],
    },
  ];
}

// flagSource é o objeto onde procuramos as flags `requerFlag` (`exibir_dre`
// etc.). Para Webposto vem de `session.cliente` (flag por empresa);
// para Autosystem vem de `session.asRede` (flag por rede).
export function filtrarNavegacao(navigationAll, permissoes, flagSource) {
  const perms = new Set(permissoes || []);
  const visivel = (item) => {
    if (item.permissao && ![].concat(item.permissao).some(p => perms.has(p))) return false; // lista = qualquer uma
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

// Menu do usuário logado (permissões + flags). Quem usa o Visor360 vê o
// comercial/financeiro por lá, então essas seções saem do menu.
export function navegacaoDaSessao(session) {
  const tipoCliente = session?.tipoCliente || 'webposto';
  const flagSource = tipoCliente === 'autosystem' ? session?.asRede : session?.cliente;
  const nav = filtrarNavegacao(buildNavigation(`/cliente/${tipoCliente}`, tipoCliente), session?.usuario?.permissoes, flagSource);
  return flagSource?.usa_visor360
    ? nav.filter(s => s.section !== 'Comercial' && s.section !== 'Financeiro')
    : nav;
}

// Itens clicáveis do menu, com os submenus (children) achatados.
export const itensDoMenu = (navigation) => navigation
  .flatMap(s => s.items.flatMap(it => (it.children ? it.children.map(c => ({ ...c, icon: c.icon || it.icon })) : [it])))
  .filter(it => it.href);

// Href "mais específico" que casa com a URL: evita que /bpo e
// /bpo/contas-pagar fiquem ativos ao mesmo tempo.
export function hrefAtivoDoMenu(navigation, pathname) {
  return itensDoMenu(navigation).reduce((melhor, { href }) => (
    (pathname === href || pathname.startsWith(href + '/')) && href.length > melhor.length ? href : melhor), '');
}

// Barra inferior do celular: no máximo 5 ícones = até 4 atalhos + "Mais" (sempre
// o último). Entram primeiro os `barraMobile` e os lugares que sobrarem são
// preenchidos com os demais itens que o usuário pode ver. Sai na ordem do menu.
export const MAX_ATALHOS_BARRA = 4;
export function itensBarraMobile(navigation) {
  const itens = itensDoMenu(navigation);
  const escolhidos = new Set([...itens.filter(i => i.barraMobile), ...itens.filter(i => !i.barraMobile)]
    .slice(0, MAX_ATALHOS_BARRA).map(i => i.href));
  return itens.filter(i => escolhidos.has(i.href));
}
