import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import RelatorioDRE from './RelatorioDRE';
import * as clientesService from '../services/clientesService';
import * as autosystemService from '../services/autosystemService';

// DRE consolidada da rede Autosystem: agrega todas as empresas Autosystem
// de uma `as_rede`. Reusa o RelatorioDRE passando `redeContexto` com
// `asRedeId` + lista de empresaCodigos.
export default function RelatorioDREAsRede() {
  const { asRedeId } = useParams();
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
        const empresas = (todosClientes || []).filter(c =>
          c.as_rede_id === asRedeId
          && c.status === 'ativo'
          && c.empresa_codigo != null
        );
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
  }, [asRedeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
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
    <RelatorioDRE
      redeContexto={redeContexto}
      backHref="/admin/relatorios-cliente"
    />
  );
}
