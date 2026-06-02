// Admin > Consultoria > Reunião
// Dashboard de apresentação (em construção). A versão anterior
// (CRUD de reuniões + KPIs) foi descartada — este espaço será
// reconstruído como um dashboard otimizado para apresentar ao
// cliente durante reuniões mensais.

import { Presentation } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function CciReunioes() {
  return (
    <div>
      <PageHeader title="Reunião"
        description="Dashboard de apresentação dos KPIs de saúde econômica e financeira." />

      <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm max-w-2xl mx-auto">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 mb-4">
          <Presentation className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Em construção</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
          Esta página será o dashboard de apresentação das reuniões mensais.
          Em breve traremos KPIs de saúde econômica e financeira em layout
          otimizado para projetar ao cliente.
        </p>
      </div>
    </div>
  );
}
