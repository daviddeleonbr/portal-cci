// Página unificada "Financeiro" — agrupa Contas a Pagar e Contas a Receber
// em abas (igual o que fizemos na página Notas Fiscais).
//
// As páginas filhas (`CciContasPagar` e `Boletos`) aceitam a prop `embedded`
// que oculta o próprio PageHeader e injeta o botão de ação inline antes
// dos KPIs.

import { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import CciContasPagar from './CciContasPagar';
import Boletos from './Boletos';

export default function Financeiro() {
  // URL inicial: /admin/financeiro/contas-receber → aba 'receber';
  // qualquer outra → aba 'pagar' (default).
  const [aba, setAba] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.includes('/contas-receber')
      ? 'receber' : 'pagar'
  );

  return (
    <div>
      <PageHeader title="Financeiro" description="Contas a pagar e a receber da CCI" />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex items-center gap-1">
        <button onClick={() => setAba('pagar')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === 'pagar' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <span className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Contas a Pagar
          </span>
          {aba === 'pagar' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
        </button>
        <button onClick={() => setAba('receber')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === 'receber' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <span className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            Contas a Receber
          </span>
          {aba === 'receber' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
        </button>
      </div>

      {aba === 'pagar'   && <CciContasPagar embedded />}
      {aba === 'receber' && <Boletos        embedded />}
    </div>
  );
}
