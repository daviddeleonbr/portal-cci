import { Activity } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

export default function ClienteComercialOperacao() {
  return (
    <div>
      <PageHeader title="Operação" description="Indicadores operacionais da rede em tempo real" />
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <EmptyState
          icon={Activity}
          title="Em breve"
          description="Visão operacional com turnos, bicos, volumes abastecidos e desvios de operação."
        />
      </div>
    </div>
  );
}
