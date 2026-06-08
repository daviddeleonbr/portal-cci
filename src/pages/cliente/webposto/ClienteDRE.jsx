import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import RelatorioDRE from '../../RelatorioDRE';
import EmpresaMultiSelect from '../../../components/vendas/EmpresaMultiSelect';
import { useClienteSession } from '../../../hooks/useAuth';

export default function ClienteDRE() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];

  // Empresas Webposto da rede com empresa_codigo válido.
  const empresasDisponiveis = useMemo(
    () => {
      const base = clientesRede.length > 0 ? clientesRede : (cliente ? [cliente] : []);
      return base.filter(c => c.empresa_codigo != null && c.empresa_codigo !== '');
    },
    [clientesRede, cliente],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(
    () => new Set(empresasDisponiveis.map(c => c.id)),
  );
  useEffect(() => {
    setEmpresasSelIds(prev => {
      if (prev.size === 0 && empresasDisponiveis.length > 0) {
        return new Set(empresasDisponiveis.map(c => c.id));
      }
      return prev;
    });
  }, [empresasDisponiveis]);

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds],
  );

  // Constrói redeContexto sempre — RelatorioDRE entra em modoRede e
  // itera as empresaCodigos selecionadas.
  const redeContexto = useMemo(() => {
    if (empresasSel.length === 0 || !cliente?.chave_api_id) return null;
    return {
      nomeRede:       session?.chaveApi?.nome || cliente?.nome,
      chaveApiId:     cliente.chave_api_id,
      empresaCodigos: empresasSel.map(e => Number(e.empresa_codigo)),
    };
  }, [empresasSel, cliente, session?.chaveApi?.nome]);

  if (!cliente?.id) return <Navigate to="/cliente/webposto/dashboard" replace />;

  if (!cliente.exibir_dre) {
    return (
      <div>
        <PageHeader title="DRE" description="Demonstração do resultado do exercicio" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Relatório não disponível para esta empresa</p>
            <p className="text-amber-700">
              O DRE ainda não foi liberado pelo administrador da consultoria. Entre em contato
              se precisar visualizar este relatório.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Quando a rede só tem 1 empresa, mantém comportamento single (não mostra
  // multi-select, passa clienteIdOverride direto).
  if (empresasDisponiveis.length <= 1) {
    return <RelatorioDRE clienteIdOverride={cliente.id} backHref="/cliente/webposto/dashboard" />;
  }

  return (
    <RelatorioDRE
      redeContexto={redeContexto}
      backHref="/cliente/webposto/dashboard"
      seletorEmpresas={
        <EmpresaMultiSelect
          clientesRede={empresasDisponiveis}
          selecionadas={empresasSelIds}
          onToggle={(id) => setEmpresasSelIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onToggleTodas={() => setEmpresasSelIds(prev =>
            prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
          )}
        />
      }
    />
  );
}
