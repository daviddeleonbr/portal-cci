import { Award } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

export default function ClienteComercialComissionamento() {
  return (
    <div>
      <PageHeader title="Comissionamento" description="Calculo e acompanhamento de comissoes dos frentistas" />
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm">
        <EmptyState
          icon={Award}
          title="Em breve"
          description="Regras de comissao por produto, meta por frentista, previa mensal e fechamento."
        />
      </div>
    </div>
  );
}
