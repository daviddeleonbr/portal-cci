// Fluxo de Caixa do cliente Autosystem.
// Reutiliza o componente <RelatorioFluxoCaixa> (mesmo usado pelo admin em
// /admin/relatorios-cliente/rede-as/:asRedeId/fluxo-caixa), montando o
// redeContexto a partir da sessão. Sempre agrega a rede inteira pelas
// empresas que o usuário pode ver (session.clientesRede, filtrado por
// empresas_permitidas no login).

import { Navigate } from 'react-router-dom';
import { AlertCircle, Building2 } from 'lucide-react';
import { useMemo } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import RelatorioFluxoCaixa from '../../RelatorioFluxoCaixa';
import { useClienteSession } from '../../../hooks/useAuth';

export default function ClienteFluxoCaixa() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = session?.clientesRede || [];

  const empresas = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const redeContexto = useMemo(() => {
    if (!asRede?.id) return null;
    return {
      asRedeId: asRede.id,
      nomeRede: asRede.nome,
      empresaCodigos: empresas.map(e => Number(e.empresa_codigo)),
      empresas,
    };
  }, [asRede, empresas]);

  if (!asRede?.id) return <Navigate to="/cliente/autosystem/dashboard" replace />;

  if (!asRede.exibir_fluxo_caixa) {
    return (
      <div>
        <PageHeader title="Fluxo de Caixa" description="Entradas e saídas consolidadas" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Relatório não liberado para esta rede</p>
            <p className="text-amber-700">
              O Fluxo de Caixa ainda não foi liberado pelo administrador da consultoria.
              Entre em contato se precisar visualizar este relatório.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (empresas.length === 0) {
    return (
      <div>
        <PageHeader title="Fluxo de Caixa" description={asRede.nome} />
        <div className="bg-white border border-gray-200/60 rounded-xl p-6 text-sm text-gray-700 flex items-start gap-3">
          <Building2 className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900 mb-1">Nenhuma empresa integrada ao Autosystem</p>
            <p className="text-gray-500">
              Esta rede ainda não tem empresas com integração Autosystem ativa, ou você não tem
              permissão para visualizá-las. Contate o administrador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <RelatorioFluxoCaixa redeContexto={redeContexto} backHref="/cliente/autosystem/dashboard" modoCliente />;
}
