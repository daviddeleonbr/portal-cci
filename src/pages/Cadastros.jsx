// Página unificada "Cadastros" — agrupa Clientes, Colaboradores, Usuários,
// Fornecedores, Plano de Contas e Motivos em abas (mesmo padrão de Notas
// Fiscais e Financeiro).
//
// Cada página filha aceita prop `embedded` que oculta o PageHeader próprio
// e renderiza o botão de ação inline.

import { useMemo, useState } from 'react';
import { Building2, Users, UserCog, Truck, Layers, ListChecks } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { useAdminSession } from '../hooks/useAuth';
import Clientes from './Clientes';
import Colaboradores from './Colaboradores';
import CciUsuarios from './CciUsuarios';
import CciFornecedores from './CciFornecedores';
import CciPlanoContas from './CciPlanoContas';
import CciMotivos from './CciMotivos';

// Mapa URL → aba. Quem chegar por /admin/cadastros/X cai na aba X.
const TABS = [
  { key: 'clientes',       label: 'Clientes',         icon: Building2,  match: '/admin/clientes',                permissao: 'clientes',       Component: Clientes        },
  { key: 'colaboradores',  label: 'Colaboradores',    icon: Users,      match: '/admin/colaboradores',           permissao: 'colaboradores',  Component: Colaboradores   },
  { key: 'usuarios',       label: 'Usuários',         icon: UserCog,    match: '/admin/cadastros/usuarios',      permissao: 'usuarios',       Component: CciUsuarios     },
  { key: 'fornecedores',   label: 'Fornecedores',     icon: Truck,      match: '/admin/cadastros/fornecedores',  permissao: 'fornecedores',   Component: CciFornecedores },
  { key: 'plano-contas',   label: 'Plano de Contas',  icon: Layers,     match: '/admin/cadastros/plano-contas',  permissao: 'plano_contas',   Component: CciPlanoContas  },
  { key: 'motivos',        label: 'Motivos',          icon: ListChecks, match: '/admin/cadastros/motivos',       permissao: 'motivos',        Component: CciMotivos      },
];

export default function Cadastros() {
  const session = useAdminSession();
  const perms = useMemo(() => new Set(session?.usuario?.permissoes || []), [session?.usuario?.permissoes]);
  const tabsVisiveis = useMemo(() => TABS.filter(t => !t.permissao || perms.has(t.permissao)), [perms]);

  const [aba, setAba] = useState(() => {
    if (typeof window === 'undefined') return TABS[0].key;
    const path = window.location.pathname;
    return TABS.find(t => path.startsWith(t.match))?.key || TABS[0].key;
  });

  // Se a aba selecionada pela URL não está visível pra esse user, cai na primeira disponível
  const abaEfetiva = tabsVisiveis.some(t => t.key === aba) ? aba : (tabsVisiveis[0]?.key);
  const Ativa = TABS.find(t => t.key === abaEfetiva)?.Component;

  return (
    <div>
      <PageHeader title="Cadastros" description="Gestão de clientes, equipe, fornecedores, plano de contas e motivos" />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden">
        {tabsVisiveis.map(t => {
          const Icon = t.icon;
          const ativo = abaEfetiva === t.key;
          return (
            <button key={t.key} onClick={() => setAba(t.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                ativo ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {t.label}
              </span>
              {ativo && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
            </button>
          );
        })}
      </div>

      {Ativa && <Ativa embedded />}
    </div>
  );
}
