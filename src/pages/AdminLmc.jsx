// LMC (Livro de Movimentação de Combustíveis) — admin (BPO). Por enquanto só
// redes Webposto (endpoint /INTEGRACAO/V1/LMCS). Escolhe rede → empresa →
// período e mostra o mesmo painel do cliente (PainelLmc).

import { useEffect, useMemo, useState } from 'react';
import { Fuel, Loader2, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import InputData from '../components/ui/InputData';
import PainelLmc from '../components/lmc/PainelLmc';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import { periodoPadraoLmc } from '../utils/lmc';

const inp = 'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

export default function AdminLmc() {
  const [clientes, setClientes] = useState([]);
  const [chaves, setChaves] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [redeSel, setRedeSel] = useState(null);
  const [clienteId, setClienteId] = useState('');
  const [{ de: deIni, ate: ateIni }] = useState(periodoPadraoLmc);
  const [de, setDe] = useState(deIni);
  const [ate, setAte] = useState(ateIni);
  // Consulta aplicada (só muda ao clicar em Carregar)
  const [consulta, setConsulta] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs] = await Promise.all([clientesService.listarClientes(), mapService.listarChavesApi()]);
        const wp = (lista || []).filter(c => c.usa_webposto && c.chave_api_id && c.empresa_codigo);
        setClientes(wp);
        const ids = new Set(wp.map(c => c.chave_api_id));
        setChaves((chs || []).filter(ch => ch.ativo !== false && ids.has(ch.id)));
      } catch (e) { setErro(e.message); }
      finally { setCarregando(false); }
    })();
  }, []);

  const contagensPorRede = useMemo(() => {
    const m = new Map();
    clientes.forEach(c => m.set(c.chave_api_id, (m.get(c.chave_api_id) || 0) + 1));
    return m;
  }, [clientes]);

  const empresas = useMemo(() => (redeSel?.tipo === 'webposto'
    ? clientes.filter(c => c.chave_api_id === redeSel.id).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    : []), [clientes, redeSel]);
  const cliente = empresas.find(c => c.id === clienteId) || null;
  const chave = chaves.find(ch => ch.id === cliente?.chave_api_id);
  const periodoInvalido = de && ate && de > ate;

  const carregar = () => {
    if (!cliente || !chave || periodoInvalido) return;
    qualityApi.limparCacheTransacional();
    setConsulta(c => ({ apiKey: chave.chave, empresaCodigo: cliente.empresa_codigo, de, ate, nome: cliente.nome, seq: (c?.seq || 0) + 1 }));
  };

  return (
    <div>
      <PageHeader title="LMC" description="Livro de Movimentação de Combustíveis (Webposto): lançamentos, medições e sobras/faltas de estoque" />

      <div className="mb-4 rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_1fr_320px_auto]">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">1. Rede</label>
            <SeletorRedeBPO chavesApi={chaves} redesAutosystem={[]} contagensPorRede={contagensPorRede}
              value={redeSel} onChange={(v) => { setRedeSel(v); setClienteId(''); }} disabled={carregando} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">2. Empresa</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} disabled={!redeSel}
              className={`${inp} disabled:bg-gray-50 disabled:text-gray-400`}>
              <option value="">{redeSel ? 'Selecione uma empresa…' : 'Escolha a rede primeiro'}</option>
              {empresas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.cnpj ? ` (${c.cnpj})` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">De</label>
              <InputData value={de} onChange={e => setDe(e.target.value)} titulo="Início do período" className={inp} />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Até</label>
              <InputData value={ate} onChange={e => setAte(e.target.value)} titulo="Fim do período" className={inp} />
            </div>
          </div>
          <button type="button" onClick={carregar} disabled={!cliente || !chave || periodoInvalido}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Carregar
          </button>
        </div>
        {periodoInvalido && <p className="mt-2 text-xs text-red-600">A data inicial é maior que a final.</p>}
        {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
      </div>

      {consulta ? (
        <>
          <p className="mb-3 text-sm text-gray-700"><strong>{consulta.nome}</strong> · {consulta.de.split('-').reverse().join('/')} a {consulta.ate.split('-').reverse().join('/')}</p>
          <PainelLmc apiKey={consulta.apiKey} empresaCodigo={consulta.empresaCodigo} empresaNome={consulta.nome}
            dataInicial={consulta.de} dataFinal={consulta.ate} recarga={consulta.seq} />
        </>
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-16 text-center shadow-sm">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <Fuel className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-900">Selecione a rede, a empresa e o período</p>
          <p className="mt-1 text-xs text-gray-600">Por enquanto, só redes Webposto.</p>
        </div>
      )}
    </div>
  );
}
