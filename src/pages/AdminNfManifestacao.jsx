// Admin CCI — fila de notas enviadas pelos clientes para validação/lançamento.
//
// Tab principal "Pendentes" mostra status_portal='enviada'. Histórico
// (lancada/devolvida) acessível em outras tabs.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, Loader2, AlertCircle, Search, RefreshCw,
  ChevronRight, Building2, Paperclip, Package, Briefcase,
  CalendarRange, Network,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import * as nfService from '../services/notaManifestacaoService';
import * as mapService from '../services/mapeamentoService';
import { formatCurrency } from '../utils/format';
import { numeroNotaDaChave, serieDaChave, formatNumeroNota } from '../utils/nfe';

function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hojeStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Tabs: a primeira lista notas que o cliente ainda não enviou (pra a CCI
// cobrar). As demais são pós-processamento.
// 'cobrar' agrupa pendente + em_preenchimento (ambas significam "cliente
// não enviou ainda").
const TABS = [
  { key: 'cobrar',    label: 'Para cobrar',  cor: 'amber',   dot: 'bg-amber-500',
    statusBd: ['pendente', 'em_preenchimento'] },
  { key: 'enviada',   label: 'Pendentes CCI', cor: 'blue',    dot: 'bg-blue-500' },
  { key: 'lancada',   label: 'Lançadas',     cor: 'emerald', dot: 'bg-emerald-500' },
  { key: 'devolvida', label: 'Devolvidas',   cor: 'rose',    dot: 'bg-rose-500' },
];

// Situações da manifestação NFe (campo `situacao_manifestacao` da Quality).
// 0 = sem manifestação ainda; 1 = ciência da operação confirmada.
const SITUACAO_MANIF = {
  0: { label: 'Sem manifestação',         bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  1: { label: 'Confirmação da operação',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};
function pillSituacao(codigo) {
  const cfg = SITUACAO_MANIF[codigo];
  if (!cfg) return { label: codigo == null ? '—' : `Cód ${codigo}`, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  return cfg;
}

export default function AdminNfManifestacao() {
  const navigate = useNavigate();
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('cobrar');
  const [busca, setBusca] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('todas'); // 'todas' | '0' | '1'
  const [dataDe, setDataDe] = useState(inicioMesAtual());
  const [dataAte, setDataAte] = useState(hojeStr());
  const [redes, setRedes] = useState([]);            // [{ id, nome }]
  const [filtroRede, setFiltroRede] = useState('todas');

  // Carrega lista de redes (chaves_api) uma vez pra popular o select.
  useEffect(() => {
    mapService.listarChavesApi()
      .then(setRedes)
      .catch(() => setRedes([]));
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const lista = await nfService.listarParaAdmin({
        dataDe, dataAte,
        chaveApiId: filtroRede === 'todas' ? null : filtroRede,
      });
      setNotas(lista);
    } catch (err) {
      setError(err.message || 'Falha ao carregar');
    } finally { setLoading(false); }
  }, [dataDe, dataAte, filtroRede]);

  useEffect(() => { carregar(); }, [carregar]);

  const contagens = useMemo(() => {
    const c = { cobrar: 0, enviada: 0, lancada: 0, devolvida: 0 };
    notas.forEach(n => {
      if (n.status_portal === 'pendente' || n.status_portal === 'em_preenchimento') c.cobrar++;
      else c[n.status_portal] = (c[n.status_portal] || 0) + 1;
    });
    return c;
  }, [notas]);

  const tabAtual = TABS.find(t => t.key === tab);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const statusFiltro = tabAtual?.statusBd || [tab];
    return notas
      .filter(n => statusFiltro.includes(n.status_portal))
      .filter(n => {
        // Na aba "Para cobrar" só interessa quem ainda não fez manifestação.
        if (tab === 'cobrar') return Number(n.situacao_manifestacao) === 0;
        if (filtroSituacao === 'todas') return true;
        return String(n.situacao_manifestacao ?? '') === filtroSituacao;
      })
      .filter(n => {
        if (!q) return true;
        return [
          n.razao_social_fornecedor, n.cnpj_fornecedor,
          n.chave_documento, n.cliente?.nome, n.cliente?.cnpj,
        ].some(v => String(v || '').toLowerCase().includes(q));
      });
  }, [notas, tab, tabAtual, busca, filtroSituacao]);

  const totalValor = filtradas.reduce((s, n) => s + Number(n.valor || 0), 0);

  return (
    <div>
      <PageHeader title="Manifestação de Notas" description="Notas a manifestar — cobrança de clientes, validação e lançamento">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <CalendarRange className="h-3 w-3" /> Emissão
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          <select value={filtroRede} onChange={e => setFiltroRede(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 min-w-[180px]">
            <option value="todas">Todas as redes</option>
            {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <button onClick={carregar} disabled={loading}
          aria-label="Atualizar"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50 min-w-[44px] justify-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {TABS.map(t => {
            const ativo = tab === t.key;
            const n = contagens[t.key] || 0;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? `border-${t.cor}-600 text-${t.cor}-700` : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-white/[0.04]'
                }`}>
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                {t.label}
                <span className="text-[10.5px] text-gray-400 dark:text-gray-500">· {n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca + filtro de situação NFe */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente, fornecedor, CNPJ ou chave..."
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </div>
        {tab === 'cobrar' ? (
          <div className="inline-flex items-center gap-1.5 h-[42px] px-3 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-xs font-medium text-amber-800 dark:text-amber-300 sm:min-w-[220px]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Apenas "Sem manifestação"
          </div>
        ) : (
          <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value)}
            className="h-[42px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 sm:min-w-[220px]">
            <option value="todas">Todas as situações NFe</option>
            <option value="0">0 · Sem manifestação</option>
            <option value="1">1 · Confirmação da operação</option>
          </select>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {tab === 'cobrar' ? 'Nenhuma nota aguardando cliente preencher 🎉' : 'Nenhuma nota nesta categoria.'}
          </p>
          {tab === 'cobrar' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Os clientes já enviaram tudo do período. Ajuste o filtro para ver outros intervalos.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{
                    tab === 'cobrar'    ? 'Sincronizada em'
                    : tab === 'enviada' ? 'Enviada em'
                    : tab === 'lancada' ? 'Lançada em'
                                        : 'Devolvida em'
                  }</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Fornecedor</th>
                  <th className="px-3 py-2.5">Nº NF</th>
                  <th className="px-3 py-2.5">Emissão</th>
                  <th className="px-3 py-2.5">Situação NFe</th>
                  <th className="px-3 py-2.5 text-center">Prod.</th>
                  <th className="px-3 py-2.5 text-center">Anexos</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {filtradas.map(n => {
                  const ts = tab === 'cobrar'    ? n.created_at
                          : tab === 'enviada'  ? n.enviada_em
                          : tab === 'lancada'  ? n.lancada_em
                                                : n.devolvida_em;
                  return (
                    <tr key={n.id}
                      onClick={() => navigate(`/admin/fiscal/manifestacao/${n.id}`)}
                      className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.07] cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300 dark:text-gray-600 whitespace-nowrap">{fmtDataHora(ts)}</td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]" title={n.cliente?.nome}>{n.cliente?.nome || '—'}</p>
                        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 dark:text-gray-500 font-mono">{n.cliente?.cnpj || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title={n.razao_social_fornecedor}>{n.razao_social_fornecedor || '—'}</p>
                        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 dark:text-gray-500 font-mono">{n.cnpj_fornecedor || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const num = numeroNotaDaChave(n.chave_documento);
                          const ser = serieDaChave(n.chave_documento);
                          return (
                            <>
                              <p className="font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">
                                {num != null ? formatNumeroNota(num) : '—'}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                                {ser != null ? `série ${ser}` : '—'}
                              </p>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-[12px] text-gray-700">{fmtData(n.data_emissao)}</td>
                      <td className="px-3 py-3">
                        {(() => {
                          const sit = pillSituacao(n.situacao_manifestacao);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium whitespace-nowrap ${sit.bg} ${sit.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sit.dot}`} />
                              {sit.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300">{n.qtdProdutos}</td>
                      <td className="px-3 py-3 text-center text-[11px] text-gray-700 dark:text-gray-300 dark:text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3 text-gray-400" />
                          NF {n.qtdNotaFiscal} · Bol {n.qtdBoleto}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(n.valor)}</td>
                      <td className="px-2 py-3">
                        <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                <tr className="font-semibold">
                  <td colSpan={8} className="px-4 py-2 text-[11.5px] text-gray-700 dark:text-gray-300">
                    Total: {filtradas.length} {filtradas.length === 1 ? 'nota' : 'notas'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900">{formatCurrency(totalValor)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
