// Página unificada "Financeiro" — agrupa Contas a Pagar, Contas a Receber e o
// Banco Inter (conta da própria CCI) em abas (igual o que fizemos na página
// Notas Fiscais).
//
// As páginas filhas (`CciContasPagar` e `Boletos`) aceitam a prop `embedded`
// que oculta o próprio PageHeader e injeta o botão de ação inline antes
// dos KPIs.

import { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Landmark } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import CciContasPagar from './CciContasPagar';
import Boletos from './Boletos';
import BancoInterPainel from '../components/financeiro/BancoInterPainel';
import { useAdminSession } from '../hooks/useAuth';

export default function Financeiro() {
  const session = useAdminSession();
  // Banco Inter: só quem tem a permissão (dados bancários da CCI).
  const podeInter = (session?.usuario?.permissoes || []).includes('banco_inter');

  // URL inicial escolhe a aba: /contas-receber → receber, /banco-inter → inter.
  const [aba, setAba] = useState(() => {
    const p = typeof window !== 'undefined' ? window.location.pathname : '';
    if (p.includes('/banco-inter')) return 'inter';
    if (p.includes('/contas-receber')) return 'receber';
    return 'pagar';
  });
  const abaAtiva = aba === 'inter' && !podeInter ? 'pagar' : aba;

  const renderAba = (id, Icone, children) => (
    <button key={id} onClick={() => setAba(id)}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
        abaAtiva === id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
      }`}>
      <span className="flex items-center gap-2">
        <Icone className="h-4 w-4" />
        {children}
      </span>
      {abaAtiva === id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
    </button>
  );

  return (
    <div>
      <PageHeader title="Financeiro" description="Contas a pagar e a receber da CCI" />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex items-center gap-1">
        {renderAba('pagar', ArrowUpRight, 'Contas a Pagar')}
        {renderAba('receber', ArrowDownLeft, 'Contas a Receber')}
        {podeInter && renderAba('inter', Landmark, 'Banco Inter')}
      </div>

      {abaAtiva === 'pagar'   && <CciContasPagar embedded />}
      {abaAtiva === 'receber' && <Boletos        embedded />}
      {abaAtiva === 'inter'   && <BancoInterPainel />}
    </div>
  );
}
