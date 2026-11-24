import {
  LayoutDashboard, BarChart3, TrendingUp, PieChart,
  HelpCircle, Coins, UserCog, ClipboardCheck,
  ShoppingCart, Activity, Gauge,
  ArrowUpRight, ArrowDownLeft, Settings, Lightbulb, FileSpreadsheet, Receipt,
  Boxes, AlertTriangle, KeyRound, Fuel, CalendarDays, Calculator,
} from 'lucide-react';

// Menu do portal do cliente — compartilhado pela sidebar (ClienteSidebar)
// e pela barra inferior do celular (ClienteBottomNav).

// Os hrefs são montados em runtime com prefixo `/cliente/<tipoCliente>`
// para que webposto e autosystem reusem o mesmo menu.
// `barraMobile`: rótulo curto do item na barra inferior do celular
// (ClienteBottomNav). Esses itens somem do drawer no mobile — lá fica "o resto".
export function buildNavigation(prefix, tipoCliente = 'webposto') {
  return [
    {
      section: 'Principal',
      items: [
        { name: 'Visão Geral', href: `${prefix}/dashboard`, icon: LayoutDashboard, permissao: 'dashboard' },
        { name: 'Minhas tarefas', href: `${prefix}/tarefas`, icon: ClipboardCheck, permissao: 'tarefas', barraMobile: 'Tarefas' },
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
        { name: 'Sangrias', href: `${prefix}/sangrias`, icon: Coins, permissao: ['sangrias', 'sangrias_consultar'], barraMobile: 'Sangrias' },
        { name: 'Fechamento de caixa', href: `${prefix}/fechamento-caixa`, icon: Calculator, permissao: 'fechamento_caixa' },
        { name: 'Notas Fiscais', href: `${prefix}/financeiro/notas-fiscais`, icon: FileSpreadsheet, permissao: 'notas_fiscais', barraMobile: 'Notas' },
        { name: 'Contas a Pagar', href: `${prefix}/bpo/contas-pagar`, icon: CalendarDays, permissao: 'bpo_contas_pagar' },
        { name: 'Contas a Receber', href: `${prefix}/bpo/contas-receber`, icon: ArrowDownLeft, permissao: 'bpo_contas_receber' },
        { name: 'Outras Contas', href: `${prefix}/bpo/outras-contas`, icon: Receipt, permissao: 'outras_contas', barraMobile: 'Outras contas' },
        { name: 'Serviços BPO', href: `${prefix}/bpo`, icon: ClipboardCheck, permissao: 'bpo' },
        { name: 'Acessos', href: `${prefix}/acessos`, icon: KeyRound, permissao: 'acessos' },
        // LMC: por enquanto só Webposto (endpoint /INTEGRACAO/V1/LMCS)
        ...(tipoCliente === 'webposto' ? [{ name: 'LMC', href: `${prefix}/lmc`, icon: Fuel, permissao: 'lmc' }] : []),
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

