// Outras Contas a Pagar (BPO): cliente registra contas sem NF
// (adiantamentos, empréstimos, transferências etc) para a CCI lançar.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt, Plus, Loader2, AlertCircle, Search, RefreshCw,
  Calendar, Trash2, Upload, File, Download, X, CheckCircle2,
  Info, Clock,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import { useClienteSession } from '../../../hooks/useAuth';
import * as ocService from '../../../services/outraContaService';
import { formatCurrency } from '../../../utils/format';

const STATUS_PILLS = {
  enviada:   { label: 'Aguardando lançamento', bg: 'bg-blue-50 dark:bg-blue-500/15',       text: 'text-blue-700 dark:text-blue-300',     dot: 'bg-blue-500' },
  lancada:   { label: 'Lançada',               bg: 'bg-emerald-50 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  devolvida: { label: 'Devolvida',             bg: 'bg-rose-50 dark:bg-rose-500/15',       text: 'text-rose-700 dark:text-rose-300',     dot: 'bg-rose-500' },
};

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

export default function ClienteOutrasContas() {
  const session = useClienteSession();
  const cliente = session?.cliente;

  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('enviada');
  const [busca, setBusca] = useState('');
  const [modalNova, setModalNova] = useState(false);
  const [toast, setToast] = useState(null);

  const carregar = useCallback(async () => {
    if (!cliente?.id) return;
    setLoading(true); setError(null);
    try {
      const lista = await ocService.listarPorCliente(cliente.id);
      setContas(lista);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [cliente?.id]);

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
        return [c.descricao, c.beneficiario_nome, c.observacao].some(v => String(v || '').toLowerCase().includes(q));
      });
  }, [contas, tab, busca]);

  const totalValor = filtradas.reduce((s, c) => s + Number(c.valor || 0), 0);

  const excluir = async (conta) => {
    if (!confirm(`Excluir "${conta.descricao}"?`)) return;
    try {
      await ocService.excluir(conta.id);
      await carregar();
      setToast({ tipo: 'success', mensagem: 'Conta excluída' });
    } catch (err) {
      setToast({ tipo: 'error', mensagem: 'Erro ao excluir: ' + err.message });
    }
  };

  return (
    <div>
      <PageHeader title="Outras contas a pagar" description="Contas sem NF: adiantamentos, empréstimos, transferências">
        <button onClick={() => setModalNova(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 sm:px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors min-w-[44px] justify-center">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova conta</span>
        </button>
        <button onClick={carregar} disabled={loading}
          aria-label="Atualizar"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50 min-w-[44px] justify-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      {/* Aviso operacional */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Antes de enviar — informações importantes</p>
          <ul className="text-[12.5px] text-blue-900/85 dark:text-blue-200/90 mt-1.5 space-y-1.5 leading-relaxed">
            <li className="flex items-start gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <span>
                Se sua empresa contratou o serviço de <strong>inclusão de pagamentos no banco pela CCI</strong>,
                as informações precisam ser registradas <strong>até 16:00</strong> do dia da solicitação.
                Envios após esse horário serão incluídos apenas <strong>no próximo dia útil</strong>.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <span>
                Pagou uma conta por conta própria, <em>sem</em> a inclusão da CCI?
                <strong> Preencha o formulário mesmo assim</strong> — a CCI precisa saber o destino do valor para registrar corretamente.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
          {Object.entries(STATUS_PILLS).map(([k, cfg]) => {
            const ativo = tab === k;
            const n = contagens[k] || 0;
            return (
              <button key={k} onClick={() => setTab(k)}
                className={`flex items-center gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? `border-current ${cfg.text}` : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-white/[0.04]'
                }`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                <span>{cfg.label}</span>
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
          placeholder="Buscar por descrição, beneficiário ou observação..."
          className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/15 mb-3">
            <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Nenhuma conta nesta categoria.</p>
          {tab === 'enviada' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Clique em "Nova conta" para registrar a primeira.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {filtradas.map(c => <CardConta key={c.id} conta={c} onExcluir={excluir} />)}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Data pgto</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5">Descrição</th>
                    <th className="px-3 py-2.5">Beneficiário</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-3 py-2.5">Status</th>
                    {tab === 'enviada' && <th className="px-2 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {filtradas.map(c => {
                    const cat = ocService.CATEGORIAS.find(x => x.key === c.categoria);
                    const cfg = STATUS_PILLS[c.status];
                    return (
                      <tr key={c.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.07] transition-colors">
                        <td className="px-4 py-3 font-mono tabular-nums text-[12px] text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtData(c.data_pagamento)}</td>
                        <td className="px-3 py-3 text-[12px] text-gray-700 dark:text-gray-300">{cat?.label || c.categoria}</td>
                        <td className="px-3 py-3">
                          <p className="text-[12.5px] text-gray-900 dark:text-gray-100 truncate max-w-[260px]" title={c.descricao}>{c.descricao}</p>
                          {c.observacao && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate max-w-[260px]" title={c.observacao}>{c.observacao}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-[12px] text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{c.beneficiario_nome || '—'}</p>
                          {c.beneficiario_documento && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{c.beneficiario_documento}</p>}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(c.valor)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                          {c.status === 'devolvida' && c.motivo_devolucao && (
                            <p className="text-[10px] text-rose-700 dark:text-rose-400 mt-1 max-w-[200px] truncate" title={c.motivo_devolucao}>
                              {c.motivo_devolucao}
                            </p>
                          )}
                          {c.status === 'lancada' && (
                            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1">em {fmtDataHora(c.lancada_em)}</p>
                          )}
                        </td>
                        {tab === 'enviada' && (
                          <td className="px-2 py-3">
                            <button onClick={() => excluir(c)} title="Excluir"
                              className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t-2 border-gray-200 dark:border-white/10">
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-4 py-2 text-[11.5px] text-gray-700 dark:text-gray-300">
                      Total: {filtradas.length} {filtradas.length === 1 ? 'conta' : 'contas'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900 dark:text-gray-100">{formatCurrency(totalValor)}</td>
                    <td colSpan={tab === 'enviada' ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {modalNova && (
        <ModalNovaConta
          cliente={cliente}
          onClose={() => setModalNova(false)}
          onCriada={async () => { setModalNova(false); await carregar(); setToast({ tipo: 'success', mensagem: 'Conta registrada para a CCI lançar' }); }}
          onErro={(msg) => setToast({ tipo: 'error', mensagem: msg })}
        />
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function CardConta({ conta, onExcluir }) {
  const cfg = STATUS_PILLS[conta.status];
  const cat = ocService.CATEGORIAS.find(c => c.key === conta.categoria);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{conta.descricao}</p>
          <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{cat?.label}</p>
        </div>
        <p className="font-mono tabular-nums text-[14px] font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">{formatCurrency(conta.valor)}</p>
      </div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          <Calendar className="inline h-3 w-3" /> {fmtData(conta.data_pagamento)}
          {conta.beneficiario_nome && <span> · {conta.beneficiario_nome}</span>}
        </p>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      {conta.motivo_devolucao && (
        <p className="text-[10.5px] text-rose-700 dark:text-rose-400 mt-1">{conta.motivo_devolucao}</p>
      )}
      {conta.status === 'enviada' && (
        <button onClick={() => onExcluir(conta)}
          className="text-[10.5px] text-rose-600 dark:text-rose-400 hover:underline mt-1">
          Excluir
        </button>
      )}
    </div>
  );
}

// ─── Modal de cadastro de nova conta ─────────────────────────
function ModalNovaConta({ cliente, onClose, onCriada, onErro }) {
  const [categoria, setCategoria] = useState('outros');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataPgto, setDataPgto] = useState('');
  const [benefNome, setBenefNome] = useState('');
  const [benefDoc, setBenefDoc] = useState('');
  const [benefTipo, setBenefTipo] = useState('pj');
  const [formaPgto, setFormaPgto] = useState('pix');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const inputFileRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !salvando) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, salvando]);

  const podeSalvar = descricao.trim() && Number(valor) > 0;

  const submit = async (e) => {
    e?.preventDefault();
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      const conta = await ocService.criar({
        cliente_id: cliente.id,
        categoria, descricao: descricao.trim(),
        valor: Number(valor),
        data_pagamento: dataPgto || null,
        beneficiario_nome: benefNome.trim() || null,
        beneficiario_documento: benefDoc.trim() || null,
        beneficiario_tipo: benefDoc.trim() ? benefTipo : null,
        forma_pagamento: formaPgto || null,
        observacao: observacao.trim() || null,
      });
      if (arquivo) {
        await ocService.adicionarArquivo({ contaId: conta.id, clienteId: cliente.id, file: arquivo });
      }
      await onCriada();
    } catch (err) {
      onErro?.(err.message || String(err));
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={salvando ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nova conta a pagar</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Use pra contas sem nota fiscal (adiantamento, empréstimo, taxa avulsa).
            </p>
          </div>
          <button onClick={onClose} disabled={salvando}
            className="p-2 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 dark:text-gray-400 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Categoria <span className="text-rose-500">*</span></span>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40">
              {ocService.CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Descrição <span className="text-rose-500">*</span></span>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Adiantamento p/ fornecedor X — 50% do pedido #123"
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Valor (R$) <span className="text-rose-500">*</span></span>
              <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-right font-mono tabular-nums text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Data do pagamento</span>
              <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)}
                className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
            </label>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Beneficiário</span>
              <input type="text" value={benefNome} onChange={e => setBenefNome(e.target.value)}
                placeholder="Nome ou razão social"
                className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
            </label>
            <div className="flex items-end gap-1">
              <select value={benefTipo} onChange={e => setBenefTipo(e.target.value)}
                className="h-11 px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-xs font-semibold text-gray-700 dark:text-gray-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40">
                <option value="pj">PJ</option>
                <option value="pf">PF</option>
              </select>
              <input type="text" value={benefDoc} onChange={e => setBenefDoc(e.target.value)}
                placeholder={benefTipo === 'pf' ? 'CPF' : 'CNPJ'}
                className="w-32 h-11 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Forma de pagamento</span>
            <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)}
              className="w-full h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40">
              <option value="pix">PIX</option>
              <option value="ted">TED / DOC</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao">Cartão</option>
              <option value="cheque">Cheque</option>
              <option value="outros">Outros</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Observação</span>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
              placeholder="Informações adicionais para a CCI"
              className="w-full px-3 py-2 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          </label>

          {/* Anexo opcional */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">Comprovante (opcional)</span>
            {arquivo ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10">
                <File className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-300 flex-1 truncate">{arquivo.name}</span>
                <button type="button" onClick={() => setArquivo(null)}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline">Remover</button>
              </div>
            ) : (
              <button type="button" onClick={() => inputFileRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg border border-dashed border-gray-300 dark:border-white/15 bg-gray-50/50 dark:bg-white/[0.02] text-gray-600 dark:text-gray-400 text-sm hover:border-blue-400 dark:hover:border-blue-500/40 hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.06]">
                <Upload className="h-4 w-4" /> Anexar comprovante
              </button>
            )}
            <input ref={inputFileRef} type="file" className="hidden"
              accept="application/pdf,image/*"
              onChange={e => setArquivo(e.target.files?.[0] || null)} />
          </div>
        </form>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-2">
          <button onClick={onClose} disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50">
            Cancelar
          </button>
          <div className="flex-1" />
          <button onClick={submit} disabled={!podeSalvar || salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Enviar para CCI
          </button>
        </div>
      </motion.div>
    </div>
  );
}
