// Consultoria > Análise de cartões — página reservada, ainda em construção.
import { Construction, CreditCard } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

export default function ConsultoriaAnaliseCartoes() {
  return (
    <div>
      <PageHeader title="Análise de cartões" description="Consultoria · análise das vendas e recebimentos em cartão da rede" />
      <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-12 text-center">
        <div className="relative mx-auto mb-4 h-14 w-14">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-500/10">
            <CreditCard className="h-7 w-7 text-blue-600" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 ring-2 ring-white dark:ring-gray-900">
            <Construction className="h-3.5 w-3.5 text-amber-700" />
          </span>
        </div>
        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Página em construção</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          A Análise de cartões está sendo preparada e ficará disponível aqui em breve.
        </p>
      </div>
    </div>
  );
}
