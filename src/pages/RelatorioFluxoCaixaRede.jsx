import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import RelatorioFluxoCaixa from './RelatorioFluxoCaixa';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';

// Fluxo de Caixa consolidado da rede: agrega todas as empresas Webposto de uma
// chave_api. Reusa o RelatorioFluxoCaixa passando `redeContexto` com a lista.
export default function RelatorioFluxoCaixaRede() {
  const { chaveApiId } = useParams();
  const [redeContexto, setRedeContexto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [chaves, todosClientes] = await Promise.all([
          mapService.listarChavesApi(),
          clientesService.listarClientes(),
        ]);
        const chave = (chaves || []).find(c => c.id === chaveApiId);
        if (!chave) throw new Error('Rede nao encontrada');
        const empresas = (todosClientes || []).filter(c =>
          c.chave_api_id === chaveApiId
          && c.status === 'ativo'
          && c.usa_webposto
          && c.empresa_codigo != null
        );
        if (empresas.length === 0) {
          throw new Error('Nenhuma empresa Webposto ativa encontrada nesta rede');
        }
        setRedeContexto({
          chaveApiId,
          nomeRede: chave.nome || 'Rede',
          empresaCodigos: empresas.map(e => Number(e.empresa_codigo)),
          empresas,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [chaveApiId]);

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
      backHref="/admin/relatorios-cliente"
    />
  );
}
