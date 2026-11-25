// BPO · Contas a receber — admin (CCI). Escolhe a rede (Webposto ou Autosystem)
// e vê tudo o que o cliente tem a receber em aberto: notas a prazo, faturas,
// cheques e cartões (PainelContasReceberBpo). Só consulta: nada é gravado.

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, Loader2, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import PainelContasReceberBpo from '../components/bpo/PainelContasReceberBpo';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import * as qualityApi from '../services/qualityApiService';

export default function BpoContasReceber() {
  const [clientes, setClientes] = useState([]);
  const [chaves, setChaves] = useState([]);
  const [redesAS, setRedesAS] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [redeSel, setRedeSel] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs, ras] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        const validos = (lista || []).filter(c =>
          (c.usa_webposto && c.chave_api_id && c.empresa_codigo) || (c.as_rede_id && c.empresa_codigo != null && c.empresa_codigo !== ''));
        setClientes(validos);
        const idsWp = new Set(validos.filter(c => c.chave_api_id).map(c => c.chave_api_id));
        setChaves((chs || []).filter(ch => ch.ativo !== false && idsWp.has(ch.id)));
        const idsAs = new Set(validos.filter(c => c.as_rede_id).map(c => c.as_rede_id));
        setRedesAS((ras || []).filter(r => idsAs.has(r.id)));
      } catch (e) { setErro(e.message); }
      finally { setCarregando(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => { const k = c.chave_api_id || c.as_rede_id; if (k) m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [clientes]);

  const empresas = useMemo(() => {
    if (!redeSel) return [];
    return clientes
      .filter(c => (redeSel.tipo === 'webposto' ? c.chave_api_id === redeSel.id : c.as_rede_id === redeSel.id && !c.chave_api_id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [clientes, redeSel]);
  const redeNome = redeSel ? [...chaves, ...redesAS].find(r => r.id === redeSel.id)?.nome || 'rede' : '';

  return (
    <div>
      <PageHeader title="Contas a Receber" description="O que o cliente tem a receber em aberto: notas a prazo, faturas, cheques e cartões">
        {redeSel && (
          <button type="button" onClick={() => { qualityApi.limparCacheTransacional(); setRecarga(n => n + 1); }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
          </button>
        )}
      </PageHeader>

      <div className="mb-4 rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rede</label>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 lg:max-w-xl">
            <SeletorRedeBPO chavesApi={chaves} redesAutosystem={redesAS} contagensPorRede={contagensPorRede}
              value={redeSel} onChange={setRedeSel} disabled={carregando} />
          </div>
          {carregando && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-hidden="true" />}
        </div>
        {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
      </div>

      {redeSel && empresas.length > 0 ? (
        <PainelContasReceberBpo key={`${redeSel.tipo}:${redeSel.id}`} tipo={redeSel.tipo} empresas={empresas}
          redeId={redeSel.tipo === 'autosystem' ? redeSel.id : null} redeNome={redeNome} recarga={recarga} />
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-16 text-center shadow-sm">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <ArrowDownLeft className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-900">{redeSel ? 'Esta rede não tem empresas vinculadas ao sistema.' : 'Selecione a rede'}</p>
          <p className="mt-1 text-xs text-gray-600">Os títulos em aberto vêm do sistema do cliente (Webposto ou Autosystem).</p>
        </div>
      )}
    </div>
  );
}
