// Notas Fiscais a Manifestar (cliente Autosystem) — MESMO fluxo do Webposto.
// O cliente sincroniza as notas "a manifestar" do Autosystem, vê o panorama
// por status e clica pra abrir e complementar (produtos + anexos), depois
// "Envia à CCI". A sincronização traz as notas do banco remoto Autosystem
// (via Edge Function) pra tabela `nf_manifestacao` do Supabase — daí em
// diante o pipeline é idêntico ao Webposto.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet, RefreshCw, Loader2, AlertCircle, Search,
  ChevronRight, Calendar, Paperclip, CalendarRange,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import * as nfService from '../../../services/notaManifestacaoService';
import { formatCurrency } from '../../../utils/format';
import { numeroNotaDaChave, serieDaChave, formatNumeroNota } from '../../../utils/nfe';

const STATUS_PILLS = {
  pendente:         { label: 'Pendente',      bg: 'bg-gray-100 dark:bg-white/[0.06]',      text: 'text-gray-700 dark:text-gray-300',     dot: 'bg-gray-400' },
  em_preenchimento: { label: 'Preenchendo',   bg: 'bg-amber-50 dark:bg-amber-500/15',      text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500' },
  enviada:          { label: 'Enviada à CCI', bg: 'bg-blue-50 dark:bg-blue-500/15',        text: 'text-blue-700 dark:text-blue-300',     dot: 'bg-blue-500' },
  lancada:          { label: 'Lançada',       bg: 'bg-emerald-50 dark:bg-emerald-500/15',  text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  devolvida:        { label: 'Devolvida',     bg: 'bg-rose-50 dark:bg-rose-500/15',        text: 'text-rose-700 dark:text-rose-300',     dot: 'bg-rose-500' },
};

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

// Janela padrão: últimos ~90 dias até o fim do mês atual. As notas "a
// manifestar" costumam abranger mais de um mês (prazo de manifestação), então
// abrimos mais que o mês corrente pra não esconder pendências.
function inicioPeriodoPadrao() {
  const d = new Date(); d.setDate(d.getDate() - 90);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fimMesAtual() {
  const d = new Date();
  const u = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, '0')}-${String(u.getDate()).padStart(2, '0')}`;
}

function chaveAbreviada(chave) {
  if (!chave || chave.length < 12) return chave || '—';
  return `${chave.slice(0, 4)}…${chave.slice(-8)}`;
}

export default function ClienteNotasFiscais() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const redeId = asRede?.id;
  const navigate = useNavigate();

  const { empresaId, setEmpresaId, empresasDisponiveis } = useEmpresaAtiva();
  const empresaAtual = useMemo(
    () => empresasDisponiveis.find(c => c.id === empresaId) || null,
    [empresasDisponiveis, empresaId],
  );
  const empresasSelIds = useMemo(() => new Set(empresaId ? [empresaId] : []), [empresaId]);

  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState(null);
  const [tabStatus, setTabStatus] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [dataDe, setDataDe] = useState(inicioPeriodoPadrao());
  const [dataAte, setDataAte] = useState(fimMesAtual());
  const [toast, setToast] = useState(null);

  const carregar = useCallback(async () => {
    if (!empresaAtual?.id) { setNotas([]); return; }
    setLoading(true);
    setError(null);
    try {
      const lista = await nfService.listarPorCliente(empresaAtual.id);
      setNotas(lista);
    } catch (err) {
      setError(err.message || 'Falha ao carregar notas');
    } finally { setLoading(false); }
  }, [empresaAtual?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const sincronizar = async () => {
    if (!redeId) {
      setToast({ tipo: 'error', mensagem: 'Rede Autosystem não configurada.' });
      return;
    }
    setSincronizando(true);
    try {
      // Sincroniza a REDE inteira (banco remoto é single-tenant) e atribui cada
      // nota à empresa dona pelo empresa_codigo (rede de empresa única recebe todas).
      const { criadas, total } = await nfService.sincronizarComAutosystem({
        asRedeId: redeId,
        empresas: empresasDisponiveis,
      });
      setToast({
        tipo: 'success',
        mensagem: criadas > 0
          ? `${criadas} nova(s) nota(s) sincronizada(s) (de ${total} a manifestar)`
          : `Nenhuma nota nova (${total} já estavam sincronizadas)`,
      });
      await carregar();
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao sincronizar: ' + (err.message || err) });
    } finally { setSincronizando(false); }
  };

  // Filtro de período (data de emissão) antes de tudo, pra contagens das abas
  // refletirem o período selecionado.
  const notasDoPeriodo = useMemo(() => {
    return notas.filter(n => {
      const d = String(n.data_emissao || '').slice(0, 10);
      if (!d) return false;
      if (dataDe  && d < dataDe)  return false;
      if (dataAte && d > dataAte) return false;
      return true;
    });
  }, [notas, dataDe, dataAte]);

  const contagens = useMemo(() => {
    const c = { pendente: 0, em_preenchimento: 0, enviada: 0, lancada: 0, devolvida: 0 };
    notasDoPeriodo.forEach(n => { c[n.status_portal] = (c[n.status_portal] || 0) + 1; });
    return c;
  }, [notasDoPeriodo]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return notasDoPeriodo
      .filter(n => n.status_portal === tabStatus)
      .filter(n => {
        if (!q) return true;
        return [
          n.razao_social_fornecedor, n.cnpj_fornecedor, n.chave_documento,
        ].some(v => String(v || '').toLowerCase().includes(q));
      });
  }, [notasDoPeriodo, tabStatus, busca]);

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Notas Fiscais" description="Manifestação de notas — Autosystem" />
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-6 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  const totalValor = filtradas.reduce((s, n) => s + Number(n.valor || 0), 0);

  return (
    <div>
      <PageHeader title="Notas Fiscais" description={asRede?.nome || 'Manifestação de notas recebidas'}>
        {empresasDisponiveis.length > 1 && (
          <EmpresaSeletorCompartilhado
            single
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresaId(id)}
          />
        )}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <CalendarRange className="h-3 w-3" /> Emissão entre
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </div>
        <button onClick={sincronizar} disabled={sincronizando || !empresaAtual}
          aria-label="Sincronizar com Autosystem"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-w-[44px] justify-center">
          {sincronizando
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
      </PageHeader>

      {/* Datas no mobile (abaixo do header) */}
      <div className="md:hidden grid grid-cols-2 gap-2 mb-3">
        <label className="block">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1 mb-1">
            <CalendarRange className="h-3 w-3" /> De
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </label>
        <label className="block">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Até</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </label>
      </div>

      {/* Abas por status — grid 3 col no mobile, linha no desktop */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="sm:hidden grid grid-cols-3 gap-1 p-1.5">
          {Object.entries(STATUS_PILLS).map(([k, cfg]) => {
            const ativo = tabStatus === k;
            const n = contagens[k] || 0;
            return (
              <button key={k} onClick={() => setTabStatus(k)}
                className={`flex flex-col items-start gap-0.5 px-2 py-2 rounded-lg text-left transition-all min-h-[52px] ${
                  ativo ? `${cfg.bg} ${cfg.text} ring-1 ring-current/20` : 'bg-gray-50/60 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.08]'
                }`}>
                <span className="flex items-center gap-1 w-full">
                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
                  <span className="text-[10.5px] font-medium truncate flex-1">{cfg.label}</span>
                </span>
                <span className="font-mono text-[13px] font-bold tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden sm:flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
          {Object.entries(STATUS_PILLS).map(([k, cfg]) => {
            const ativo = tabStatus === k;
            const n = contagens[k] || 0;
            return (
              <button key={k} onClick={() => setTabStatus(k)}
                className={`flex items-center gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? `border-current ${cfg.text}` : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-white/[0.04]'
                }`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                <span>{cfg.label}</span>
                <span className={`text-[10.5px] tabular-nums ${ativo ? '' : 'text-gray-400'}`}>· {n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por fornecedor, CNPJ ou chave..."
          className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-colors" />
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
          <span className="text-sm">Carregando notas...</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/15 mb-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {tabStatus === 'pendente'
              ? 'Nenhuma nota pendente'
              : `Nenhuma nota com status "${STATUS_PILLS[tabStatus]?.label}"`}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tabStatus === 'pendente' && 'Clique em Sincronizar para buscar as notas a manifestar no Autosystem.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {filtradas.map(n => (
              <CardNota key={n.id} nota={n} onClick={() => navigate(`/cliente/autosystem/financeiro/notas-fiscais/${n.id}`)} />
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Emissão</th>
                    <th className="px-3 py-2.5">Fornecedor</th>
                    <th className="px-3 py-2.5">Nº NF / Série</th>
                    <th className="px-3 py-2.5 text-center">Produtos</th>
                    <th className="px-3 py-2.5 text-center">Anexos</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {filtradas.map(n => (
                    <tr key={n.id}
                      onClick={() => navigate(`/cliente/autosystem/financeiro/notas-fiscais/${n.id}`)}
                      className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.07] cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono tabular-nums text-[12.5px] text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtData(n.data_emissao)}</td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[280px]" title={n.razao_social_fornecedor}>{n.razao_social_fornecedor || '—'}</p>
                        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 font-mono">{n.cnpj_fornecedor || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const num = numeroNotaDaChave(n.chave_documento);
                          const ser = serieDaChave(n.chave_documento);
                          return (
                            <>
                              <p className="font-mono tabular-nums text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                                {num != null ? formatNumeroNota(num) : '—'}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                                {ser != null ? `série ${ser}` : '—'}
                              </p>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300">{n.qtdProdutos}</td>
                      <td className="px-3 py-3 text-center text-[11px] text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3 text-gray-400" />
                          {n.qtdNotaFiscal + n.qtdBoleto}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(n.valor)}</td>
                      <td className="px-2 py-3">
                        <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                  <tr className="font-semibold">
                    <td colSpan={5} className="px-4 py-2 text-[11.5px] text-gray-700 dark:text-gray-300">
                      Total: {filtradas.length} {filtradas.length === 1 ? 'nota' : 'notas'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900 dark:text-gray-100">{formatCurrency(totalValor)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function CardNota({ nota, onClick }) {
  const cfg = STATUS_PILLS[nota.status_portal] || STATUS_PILLS.pendente;
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 active:bg-blue-50/30 dark:active:bg-blue-500/[0.08] transition-colors p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{nota.razao_social_fornecedor || '—'}</p>
          <p className="text-[10.5px] text-gray-400 dark:text-gray-500 font-mono">{nota.cnpj_fornecedor || '—'}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {fmtData(nota.data_emissao)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Paperclip className="h-3 w-3" />
          {nota.qtdNotaFiscal + nota.qtdBoleto} anexos
        </span>
        <span className="ml-auto font-mono tabular-nums text-[13px] font-bold text-gray-900 dark:text-gray-100">
          {formatCurrency(nota.valor)}
        </span>
      </div>
      {(() => {
        const num = numeroNotaDaChave(nota.chave_documento);
        const ser = serieDaChave(nota.chave_documento);
        return num != null ? (
          <p className="text-[10.5px] text-gray-500 dark:text-gray-400">
            <span className="font-mono tabular-nums font-semibold text-gray-700 dark:text-gray-300">NF nº {formatNumeroNota(num)}</span>
            {ser != null && <span className="ml-1">· série {ser}</span>}
          </p>
        ) : (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">{chaveAbreviada(nota.chave_documento)}</p>
        );
      })()}
    </motion.button>
  );
}
