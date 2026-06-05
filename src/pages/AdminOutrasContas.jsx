// Admin CCI — Outras contas a pagar enviadas pelos clientes.
// Lista por tab (Aguardando / Lançadas / Devolvidas) e permite marcar como
// lançada ou devolver com motivo (mesmo padrão da manifestação de notas).

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt, Loader2, AlertCircle, Search, RefreshCw,
  Calendar, Download, File, CheckCircle2, XCircle, CalendarRange,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAdminSession } from '../hooks/useAuth';
import * as ocService from '../services/outraContaService';
import * as mapService from '../services/mapeamentoService';
import { formatCurrency } from '../utils/format';

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
function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hojeStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TABS = [
  { key: 'enviada',   label: 'Aguardando',  cor: 'blue',    dot: 'bg-blue-500' },
  { key: 'lancada',   label: 'Lançadas',    cor: 'emerald', dot: 'bg-emerald-500' },
  { key: 'devolvida', label: 'Devolvidas',  cor: 'rose',    dot: 'bg-rose-500' },
];

export default function AdminOutrasContas() {
  const adminSession = useAdminSession();
  const usuario = adminSession?.usuario;

  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('enviada');
  const [busca, setBusca] = useState('');
  const [dataDe, setDataDe] = useState(inicioMesAtual());
  const [dataAte, setDataAte] = useState(hojeStr());
  const [redes, setRedes] = useState([]);
  const [filtroRede, setFiltroRede] = useState('todas');
  const [contaSelecionada, setContaSelecionada] = useState(null);
  const [modalDevolver, setModalDevolver] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    mapService.listarChavesApi().then(setRedes).catch(() => setRedes([]));
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const lista = await ocService.listarParaAdmin({
        dataDe, dataAte,
        chaveApiId: filtroRede === 'todas' ? null : filtroRede,
      });
      setContas(lista);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [dataDe, dataAte, filtroRede]);

  useEffect(() => { carregar(); }, [carregar]);

  const contagens = useMemo(() => {
    const c = { enviada: 0, lancada: 0, devolvida: 0 };
    contas.forEach(n => { c[n.status] = (c[n.status] || 0) + 1; });
    return c;
  }, [contas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas
      .filter(c => c.status === tab)
      .filter(c => {
        if (!q) return true;
        return [c.descricao, c.beneficiario_nome, c.cliente?.nome, c.cliente?.cnpj, c.observacao]
          .some(v => String(v || '').toLowerCase().includes(q));
      });
  }, [contas, tab, busca]);

  const totalValor = filtradas.reduce((s, c) => s + Number(c.valor || 0), 0);

  const lancar = async (conta) => {
    if (!confirm(`Marcar "${conta.descricao}" como LANÇADA no sistema?`)) return;
    setSalvando(true);
    try {
      await ocService.marcarLancada(conta.id, { adminUsuarioId: usuario?.id });
      await carregar();
      setToast({ tipo: 'success', mensagem: 'Conta marcada como lançada' });
    } catch (err) { setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message }); }
    finally { setSalvando(false); }
  };

  const baixarArquivo = async (arq) => {
    try {
      const url = await ocService.urlAssinada(arq.storage_path);
      if (url) window.open(url, '_blank');
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message });
    }
  };

  const confirmarDevolucao = async () => {
    if (!motivoDevolucao.trim()) {
      setToast({ tipo: 'error', mensagem: 'Informe o motivo' }); return;
    }
    setSalvando(true);
    try {
      await ocService.devolverParaCliente(contaSelecionada.id, {
        motivo: motivoDevolucao, adminUsuarioId: usuario?.id,
      });
      await carregar();
      setModalDevolver(false);
      setContaSelecionada(null);
      setMotivoDevolucao('');
      setToast({ tipo: 'success', mensagem: 'Conta devolvida ao cliente' });
    } catch (err) { setToast({ tipo: 'error', mensagem: 'Erro: ' + err.message }); }
    finally { setSalvando(false); }
  };

  return (
    <div>
      <PageHeader title="Outras contas a pagar" description="Contas enviadas pelos clientes — adiantamentos, empréstimos, transferências">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <CalendarRange className="h-3 w-3" /> Data pgto
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
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50 min-w-[44px] justify-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
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

      {/* Busca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por cliente, descrição, beneficiário..."
          className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" /><p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /><span className="text-sm">Carregando...</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/15 mb-3">
            <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Nenhuma conta nesta categoria.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{tab === 'enviada' ? 'Enviada em' : tab === 'lancada' ? 'Lançada em' : 'Devolvida em'}</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Categoria</th>
                  <th className="px-3 py-2.5">Descrição</th>
                  <th className="px-3 py-2.5">Beneficiário</th>
                  <th className="px-3 py-2.5">Data pgto</th>
                  <th className="px-3 py-2.5 text-center">Anexos</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  {tab === 'enviada' && <th className="px-2 py-2.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {filtradas.map(c => {
                  const cat = ocService.CATEGORIAS.find(x => x.key === c.categoria);
                  const ts = tab === 'enviada' ? c.enviada_em : tab === 'lancada' ? c.lancada_em : c.devolvida_em;
                  return (
                    <tr key={c.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.07]">
                      <td className="px-4 py-3 font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDataHora(ts)}</td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]" title={c.cliente?.nome}>{c.cliente?.nome || '—'}</p>
                        <p className="text-[10.5px] text-gray-400 dark:text-gray-500 font-mono">{c.cliente?.cnpj || '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-[11.5px] text-gray-700 dark:text-gray-300">{cat?.label || c.categoria}</td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] text-gray-900 dark:text-gray-100 truncate max-w-[260px]" title={c.descricao}>{c.descricao}</p>
                        {c.observacao && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate max-w-[260px]" title={c.observacao}>{c.observacao}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[12px] text-gray-800 dark:text-gray-200 truncate max-w-[160px]">{c.beneficiario_nome || '—'}</p>
                        {c.beneficiario_documento && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{c.beneficiario_documento}</p>}
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtData(c.data_pagamento)}</td>
                      <td className="px-3 py-3 text-center">
                        {c.arquivos?.length ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300">
                            <File className="h-3 w-3" /> {c.arquivos.length}
                          </span>
                        ) : <span className="text-[11px] text-gray-400 dark:text-gray-500">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(c.valor)}</td>
                      {tab === 'enviada' && (
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setContaSelecionada(c)}
                              title="Ver detalhes"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-50 dark:bg-white/[0.04] hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-700 dark:text-gray-300 text-[11px] font-medium">
                              Ver
                            </button>
                            <button onClick={() => lancar(c)} disabled={salvando}
                              title="Marcar como lançada"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold disabled:opacity-50">
                              <CheckCircle2 className="h-3 w-3" /> Lançar
                            </button>
                            <button onClick={() => { setContaSelecionada(c); setModalDevolver(true); }}
                              title="Devolver ao cliente"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
                              <XCircle className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                <tr className="font-semibold">
                  <td colSpan={7} className="px-4 py-2 text-[11.5px] text-gray-700 dark:text-gray-300">
                    Total: {filtradas.length} {filtradas.length === 1 ? 'conta' : 'contas'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900 dark:text-gray-100">{formatCurrency(totalValor)}</td>
                  {tab === 'enviada' && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalhes (quando "Ver") */}
      {contaSelecionada && !modalDevolver && (
        <Modal open={true} onClose={() => setContaSelecionada(null)} title="Detalhes da conta">
          <DetalheConta conta={contaSelecionada} onBaixar={baixarArquivo} />
        </Modal>
      )}

      {/* Modal devolver */}
      <Modal open={modalDevolver} onClose={() => { setModalDevolver(false); setMotivoDevolucao(''); }} title="Devolver ao cliente">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Descreva o que o cliente precisa corrigir/complementar.
          </p>
          <textarea value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)}
            rows={5} placeholder="Ex: Falta o comprovante de transferência"
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-900/40" />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setModalDevolver(false); setMotivoDevolucao(''); }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]">Cancelar</button>
            <button onClick={confirmarDevolucao} disabled={salvando || !motivoDevolucao.trim()}
              className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
              Devolver ao cliente
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function DetalheConta({ conta, onBaixar }) {
  const cat = ocService.CATEGORIAS.find(x => x.key === conta.categoria);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Cliente</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{conta.cliente?.nome}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">{conta.cliente?.cnpj}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria" value={cat?.label || conta.categoria} />
        <Field label="Valor" value={formatCurrency(conta.valor)} highlight />
        <Field label="Data pgto" value={fmtData(conta.data_pagamento)} />
        <Field label="Forma" value={conta.forma_pagamento || '—'} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Descrição</p>
        <p className="text-sm text-gray-800 dark:text-gray-200">{conta.descricao}</p>
      </div>
      {conta.beneficiario_nome && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Beneficiário</p>
          <p className="text-sm text-gray-800 dark:text-gray-200">{conta.beneficiario_nome}</p>
          {conta.beneficiario_documento && <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">{conta.beneficiario_tipo === 'pf' ? 'CPF' : 'CNPJ'}: {conta.beneficiario_documento}</p>}
        </div>
      )}
      {conta.observacao && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Observação</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{conta.observacao}</p>
        </div>
      )}
      {(conta.arquivos?.length || 0) > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Anexos</p>
          <ul className="space-y-1">
            {conta.arquivos.map(a => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/10">
                <File className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="flex-1 text-[12.5px] text-gray-800 dark:text-gray-200 truncate">{a.nome_original}</span>
                <button onClick={() => onBaixar(a)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-blue-600 dark:text-blue-400 hover:underline">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{label}</p>
      <p className={`mt-0.5 ${highlight ? 'font-mono tabular-nums font-bold text-gray-900 dark:text-gray-100' : 'text-sm text-gray-800 dark:text-gray-200'}`}>{value}</p>
    </div>
  );
}
