// LMC (Livro de Movimentação de Combustíveis) — portal do cliente, Webposto.
// Só visualização: o que foi lançado no Webposto para a empresa ativa, com
// sobras/faltas de estoque por combustível (ver PainelLmc).

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import InputData from '../../../components/ui/InputData';
import CardEmpresaAtiva from '../../../components/cliente/CardEmpresaAtiva';
import PainelLmc from '../../../components/lmc/PainelLmc';
import { useClienteSession } from '../../../hooks/useAuth';
import { trocarEmpresaAtiva } from '../../../lib/auth';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { periodoPadraoLmc } from '../../../utils/lmc';

export default function ClienteLmc() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const usuario = session?.usuario;

  const [{ de: deIni, ate: ateIni }] = useState(periodoPadraoLmc);
  const [de, setDe] = useState(deIni);
  const [ate, setAte] = useState(ateIni);
  const [apiKey, setApiKey] = useState(null);
  const [erroChave, setErroChave] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!cliente?.chave_api_id) return undefined;
    let cancelado = false;
    (async () => {
      try {
        const chaves = await mapService.listarChavesApi();
        const ch = (chaves || []).find(c => c.id === cliente.chave_api_id);
        if (!cancelado) { setApiKey(ch?.chave || null); setErroChave(ch ? null : 'Chave da API Webposto não encontrada para esta rede.'); }
      } catch (e) { if (!cancelado) setErroChave(e.message); }
    })();
    return () => { cancelado = true; };
  }, [cliente?.chave_api_id]);

  const periodoInvalido = de && ate && de > ate;

  if (!cliente?.usa_webposto || !cliente?.chave_api_id || !cliente?.empresa_codigo) {
    return (
      <div>
        <PageHeader title="LMC" description="Livro de Movimentação de Combustíveis" />
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-14 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Integração Webposto não configurada para esta empresa.</p>
          <p className="mt-1 text-xs text-gray-600">Fale com a CCI para habilitar.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="LMC" description="Livro de Movimentação de Combustíveis: entradas, vendas, medições e sobras/faltas de estoque" />

      <CardEmpresaAtiva
        empresa={cliente}
        empresas={session?.clientesRede || []}
        onTrocar={usuario?.permissoes?.includes('trocar_empresa') ? trocarEmpresaAtiva : undefined}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2 sm:flex sm:w-auto sm:gap-3">
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-600">De</label>
            <InputData value={de} onChange={e => setDe(e.target.value)} titulo="Início do período"
              className="h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-600">Até</label>
            <InputData value={ate} onChange={e => setAte(e.target.value)} titulo="Fim do período"
              className="h-9 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
          </div>
        </div>
        <button type="button" onClick={() => { qualityApi.limparCacheTransacional(); setRecarga(n => n + 1); }} disabled={!apiKey || periodoInvalido}
          className="inline-flex h-11 sm:h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Recarregar
        </button>
        {periodoInvalido && <p className="w-full text-xs text-red-600">A data inicial é maior que a final.</p>}
      </div>

      {erroChave ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erroChave}</div>
      ) : apiKey && !periodoInvalido ? (
        <PainelLmc apiKey={apiKey} empresaCodigo={cliente.empresa_codigo} empresaNome={cliente.nome}
          clienteId={cliente.id} podeEditarReal={(usuario?.permissoes || []).includes('lmc_editar')} usuarioNome={usuario?.nome || ''} dataInicial={de} dataFinal={ate} recarga={recarga} />
      ) : null}
    </div>
  );
}
