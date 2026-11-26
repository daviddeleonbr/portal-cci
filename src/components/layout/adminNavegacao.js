import {
  LayoutDashboard, FolderKanban, Wallet, FileText, Settings2,
  Coins, WalletCards, PieChart, Settings,
  RefreshCw, Eye, AlertTriangle,
  Activity, FileSpreadsheet, Receipt, FileSignature, FileDown, ListChecks, KeyRound,
  Fuel, ArrowUpRight, ArrowDownLeft, FileBarChart, Sparkles, FlaskConical,
} from 'lucide-react';
import { nivelAdmin } from '../../services/usuariosSistemaService';

// Menu do portal admin — fonte única para a Sidebar E para as guardas de rota
// (RequirePermissaoAdmin): a mesma regra que esconde o item bloqueia a URL.
// Regras por item: `permissao` (precisa ter), `permissaoQualquer` (basta uma),
// `permissaoTodas` (precisa de todas), `nivelMinimo` (nível do admin).
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
        permissao: 'contratos',
      },
    ],
  },
  {
    section: 'Consultoria',
    items: [
      { name: 'Parâmetros', href: '/admin/parametros', icon: Settings2, permissao: 'parametros' },
      { name: 'DRE', href: '/admin/consultoria/dre', icon: FileBarChart, permissao: 'relatorios_cliente' },
      { name: 'Fluxo de Caixa', href: '/admin/consultoria/fluxo-caixa', icon: Wallet, permissao: 'relatorios_cliente' },
      { name: 'Análise de IA', href: '/admin/consultoria/analise-ia', icon: Sparkles, permissaoTodas: ['relatorios_cliente', 'analise_ia'] },
      { name: 'Análise de Lançamentos', href: '/admin/consultoria/analise-lancamentos', icon: FlaskConical, permissao: 'relatorios_cliente' },
      { name: 'Relatórios BI', href: '/admin/relatorios-bi', icon: PieChart, permissao: 'relatorios_bi' },
      { name: 'Caixa Administrativo', href: '/admin/bpo/caixa-administrativo', icon: WalletCards, permissao: 'caixa_administrativo' },
    ],
  },
  {
    section: 'BPO',
    items: [
      { name: 'Tarefas', href: '/admin/tarefas', icon: ListChecks, permissao: 'tarefas' },
      { name: 'Conciliação de Caixas', href: '/admin/bpo/conciliacao-caixas', icon: Coins, permissao: 'conciliacao_caixas' },
      { name: 'Contas a Pagar', href: '/admin/bpo/contas-pagar', icon: ArrowUpRight, permissao: 'bpo_contas_pagar' },
      { name: 'Contas a Receber', href: '/admin/bpo/contas-receber', icon: ArrowDownLeft, permissao: 'bpo_contas_receber' },
      { name: 'LMC', href: '/admin/bpo/lmc', icon: Fuel, permissao: 'lmc' },
      { name: 'Manifestação de Notas', href: '/admin/fiscal/manifestacao', icon: FileSpreadsheet, permissao: 'notas_fiscais' },
      { name: 'Outras Contas a Pagar', href: '/admin/bpo/outras-contas', icon: Receipt, permissao: 'outras_contas' },
      { name: 'Acessos', href: '/admin/acessos', icon: KeyRound, permissao: 'acessos' },
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
// (array — basta ter pelo menos uma) e `permissaoTodas` (array — precisa de todas). Útil em itens agrupados (Cadastros).
export function filtrarNavegacao(usuario) {
  const perms = new Set(usuario?.permissoes || []);
  const nivel = nivelAdmin(usuario);
  const visivel = (item) => atendeRegra(perms, nivel, item);
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


function atendeRegra(perms, nivel, regra) {
  if (regra.nivelMinimo && nivel < regra.nivelMinimo) return false;
  if (regra.permissao && !perms.has(regra.permissao)) return false;
  if (regra.permissaoQualquer && !regra.permissaoQualquer.some(p => perms.has(p))) return false;
  if (regra.permissaoTodas && !regra.permissaoTodas.every(p => perms.has(p))) return false;
  return true;
}

// O admin atende a regra? (mesma lógica do menu)
export function adminAtendeRegra(usuario, regra) {
  return atendeRegra(new Set(usuario?.permissoes || []), nivelAdmin(usuario), regra || {});
}

// Primeiro item do menu que o admin pode abrir (null = nenhum). Prefere os que
// dependem de permissão (o trabalho dele); os abertos a
// todos (Pendências/Demo), só se não houver outro.
export function primeiraPaginaAdmin(usuario) {
  const itens = filtrarNavegacao(usuario).flatMap(sec => sec.items);
  const temRegra = (i) => i.permissao || i.permissaoQualquer || i.permissaoTodas || i.nivelMinimo;
  const alvo = (i) => i.href || i.children?.[0]?.href;
  const item = itens.find(i => temRegra(i) && alvo(i)) || itens.find(alvo);
  return item ? alvo(item) : null;
}
