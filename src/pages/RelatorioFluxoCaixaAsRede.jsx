import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import RelatorioFluxoCaixa from './RelatorioFluxoCaixa';
import * as clientesService from '../services/clientesService';
import * as autosystemService from '../services/autosystemService';

// Fluxo de Caixa consolidado da rede Autosystem: agrega todas as empresas
// de uma `as_rede`. Reusa o RelatorioFluxoCaixa passando `redeContexto`
// com `asRedeId` + lista de empresas.
export default function RelatorioFluxoCaixaAsRede() {
  const { asRedeId } = useParams();
  // ?empresas=id1,id2: só essas empresas da rede (multiseleção em Consultoria)
  const [searchParams] = useSearchParams();
  const filtro = searchParams.get('empresas') || '';
  const [redeContexto, setRedeContexto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [rede, todosClientes] = await Promise.all([
          autosystemService.buscarRede(asRedeId),
          clientesService.listarClientes(),
        ]);
        if (!rede) throw new Error('Rede Autosystem não encontrada');
        let empresas = (todosClientes || []).filter(c =>
          c.as_rede_id === asRedeId
          && c.status === 'ativo'
          && c.empresa_codigo != null
        );
        if (filtro) {
          const ids = new Set(filtro.split(','));
          empresas = empresas.filter(e => ids.has(e.id));
        }
        if (empresas.length === 0) {
          throw new Error('Nenhuma empresa Autosystem ativa encontrada nesta rede');
        }
        setRedeContexto({
          asRedeId,
          nomeRede: rede.nome || 'Rede',
          empresaCodigos: empresas.map(e => Number(e.empresa_codigo)),
          empresas,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [asRedeId, filtro]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!redeContexto) return null;

  return (
    <RelatorioFluxoCaixa
      redeContexto={redeContexto}
      backHref="/admin/consultoria/fluxo-caixa"
    />
  );
}
