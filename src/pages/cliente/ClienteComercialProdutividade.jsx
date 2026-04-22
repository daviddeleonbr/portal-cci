import { Gauge } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

export default function ClienteComercialProdutividade() {
  return (
    <div>
      <PageHeader title="Produtividade" description="Produtividade por frentista, turno e unidade" />
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <EmptyState
          icon={Gauge}
          title="Em breve"
          description="Ranking de produtividade por frentista, ticket medio, volume por hora e eficiencia de turno."
        />
      </div>
    </div>
  );
}
