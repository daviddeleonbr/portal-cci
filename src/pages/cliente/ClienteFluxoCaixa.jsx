import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import RelatorioFluxoCaixa from '../RelatorioFluxoCaixa';
import { useClienteSession } from '../../hooks/useAuth';

export default function ClienteFluxoCaixa() {
  const session = useClienteSession();
  const cliente = session?.cliente;

  if (!cliente?.id) return <Navigate to="/cliente/dashboard" replace />;

  if (!cliente.exibir_fluxo_caixa) {
    return (
      <div>
        <PageHeader title="Fluxo de Caixa" description="Entradas e saídas por período" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Relatório não disponível para esta empresa</p>
            <p className="text-amber-700">
              O Fluxo de Caixa ainda não foi liberado pelo administrador da consultoria. Entre em
              contato se precisar visualizar este relatório.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <RelatorioFluxoCaixa clienteIdOverride={cliente.id} backHref="/cliente/dashboard" />;
}
