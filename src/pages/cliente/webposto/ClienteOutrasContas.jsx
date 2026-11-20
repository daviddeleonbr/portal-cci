// Outras Contas a Pagar (BPO): cliente registra contas sem NF
// (adiantamentos, empréstimos, transferências etc) para a CCI lançar.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt, Plus, Loader2, AlertCircle, Search, RefreshCw,
  Calendar, Trash2, Upload, File, Download, X, CheckCircle2,
  Info, Clock, Camera, ChevronDown,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import { useClienteSession } from '../../../hooks/useAuth';
import * as ocService from '../../../services/outraContaService';
import { formatCurrency } from '../../../utils/format';
import CampoData from '../../../components/ui/CampoData';

// Rótulo curto das abas no celular (3 abas lado a lado, sem rolagem)
const ABA_CURTA = { enviada: 'Aguardando', lancada: 'Lançadas', devolvida: 'Devolvidas' };

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
  // Aviso "Antes de enviar": no celular começa recolhido (ocupava meia tela)
  const [avisoAberto, setAvisoAberto] = useState(false);

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
          className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-blue-700 text-white px-3 sm:px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors min-w-[44px] justify-center">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova conta</span>
        </button>
        <button onClick={carregar} disabled={loading}
          aria-label="Atualizar"
          className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50 min-w-[44px] justify-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      {/* Aviso operacional */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-3 sm:p-4 mb-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Info className="h-5 w-5 text-blue-700 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="hidden sm:block text-sm font-semibold text-blue-900 dark:text-blue-200">Antes de enviar — informações importantes</p>
          {/* Celular: resumo de 1 linha + "ver detalhes" */}
          <button type="button" onClick={() => setAvisoAberto(v => !v)} aria-expanded={avisoAberto}
            className="sm:hidden flex w-full min-h-[36px] items-center gap-2 text-left">
            <span className="flex-1 text-sm text-blue-900 dark:text-blue-200">
              <strong>Envie até 16:00</strong> para entrar no mesmo dia.
            </span>
            <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-blue-800 dark:text-blue-300 flex-shrink-0">
              {avisoAberto ? 'Fechar' : 'Detalhes'}
              <ChevronDown className={`h-4 w-4 transition-transform ${avisoAberto ? 'rotate-180' : ''}`} aria-hidden="true" />
            </span>
          </button>
          <ul className={`text-[13px] sm:text-[12.5px] text-blue-900 dark:text-blue-200/90 mt-1.5 space-y-1.5 leading-relaxed ${avisoAberto ? 'block' : 'hidden sm:block'}`}>
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
        <div role="tablist" aria-label="Situação" className="grid grid-cols-3 sm:flex sm:items-center sm:gap-1 sm:px-2 border-b border-gray-100 dark:border-white/10">
          {Object.entries(STATUS_PILLS).map(([k, cfg]) => {
            const ativo = tab === k;
            const n = contagens[k] || 0;
            return (
              <button key={k} role="tab" aria-selected={ativo} onClick={() => setTab(k)}
                className={`flex min-h-[48px] items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-1 sm:px-4 py-3 text-[13px] sm:text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? `border-current font-semibold ${cfg.text}` : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-white/[0.04]'
                }`}>
                <span className={`hidden sm:inline h-2 w-2 rounded-full ${cfg.dot}`} />
                <span className="sm:hidden">{ABA_CURTA[k]}</span>
                <span className="hidden sm:inline">{cfg.label}</span>
                <span className={`inline-flex min-w-[20px] h-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums sm:bg-transparent sm:px-0 sm:min-w-0 sm:font-normal sm:text-[10.5px] ${
                  ativo ? `${cfg.bg} ${cfg.text}` : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'} sm:!text-gray-400`}>
                  <span className="hidden sm:inline">·&nbsp;</span>{n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} enterKeyHint="search"
            aria-label="Buscar contas"
            placeholder="Buscar por descrição, beneficiário ou observação..."
            className="hidden sm:block w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} enterKeyHint="search"
            aria-label="Buscar contas" placeholder="Buscar conta ou beneficiário"
            className="sm:hidden w-full h-12 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 pl-10 pr-11 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 [&::-webkit-search-cancel-button]:hidden" />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="sm:hidden absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md text-gray-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button onClick={carregar} disabled={loading} aria-label="Atualizar lista"
          className="sm:hidden flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 active:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 px-6 py-10 sm:p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/15 mb-3">
            <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {busca ? 'Nenhuma conta encontrada.' : 'Nenhuma conta nesta categoria.'}
          </p>
          {tab === 'enviada' && !busca && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span className="hidden sm:inline">Clique em "Nova conta" para registrar a primeira.</span>
              <span className="sm:hidden">Toque em <strong>Nova conta</strong> para registrar a primeira.</span>
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            <div className="flex items-baseline justify-between px-1 pb-1 text-[13px] text-gray-600 dark:text-gray-400">
              <span>{filtradas.length} {filtradas.length === 1 ? 'conta' : 'contas'}</span>
              <span>Total <strong className="tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(totalValor)}</strong></span>
            </div>
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

      {/* Celular: botão flutuante com rótulo, acima da barra inferior (4rem + safe-area) */}
      <div className="sm:hidden h-20" aria-hidden="true" />
      <button type="button" onClick={() => setModalNova(true)}
        className="sm:hidden fixed right-4 z-20 bottom-[calc(5rem+env(safe-area-inset-bottom))] inline-flex h-14 items-center gap-2 rounded-full bg-blue-700 pl-5 pr-6 text-base font-semibold text-white shadow-lg shadow-gray-900/20 active:bg-blue-800">
        <Plus className="h-5 w-5" aria-hidden="true" /> Nova conta
      </button>

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
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/70 dark:border-white/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-gray-900 dark:text-gray-100 line-clamp-2">{conta.descricao}</p>
          <p className="mt-0.5 text-[12px] text-gray-600 dark:text-gray-400">{cat?.label}</p>
        </div>
        <p className="tabular-nums text-base font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">{formatCurrency(conta.valor)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-700 dark:text-gray-300">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Calendar className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" /> {fmtData(conta.data_pagamento)}
        </span>
        {conta.beneficiario_nome && <span className="min-w-0 truncate">{conta.beneficiario_nome}</span>}
      </div>
      {conta.status === 'devolvida' && conta.motivo_devolucao && (
        <p className="mt-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[13px] text-rose-800 dark:text-rose-300">
          <strong>Motivo:</strong> {conta.motivo_devolucao}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
          {cfg.label}{conta.status === 'lancada' && conta.lancada_em ? ` · ${fmtDataHora(conta.lancada_em)}` : ''}
        </span>
        {conta.status === 'enviada' && (
          <button onClick={() => onExcluir(conta)}
            className="-mr-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-rose-700 dark:text-rose-400 active:bg-rose-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modal de cadastro de nova conta ─────────────────────────
// ─── Formulário "Nova conta a pagar" (pensado pro celular) ─────
// - inputs com 16px no mobile (text-base): abaixo disso o iOS dá zoom no foco;
// - teclado certo por campo (inputMode numeric p/ valor e CPF/CNPJ);
// - escolhas curtas viram chips (toque único) em vez de <select>;
// - valor com máscara de moeda digitada da direita p/ esquerda (centavos);
// - comprovante: "Tirar foto" abre a câmera direto; "Arquivo" abre a galeria/PDF.
const CLS_INPUT = 'w-full h-12 sm:h-11 px-3 mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40';
const CLS_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400';

const FORMAS_PGTO = [
  { key: 'pix', label: 'PIX' },
  { key: 'ted', label: 'TED / DOC' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cartao', label: 'Cartão' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'outros', label: 'Outros' },
];

// "123456" (centavos digitados) → "1.234,56"
function mascaraMoeda(centavos) {
  if (!centavos) return '';
  return (Number(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Só dígitos → CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00), parcial enquanto digita
function mascaraDoc(dig, tipo) {
  const d = dig.slice(0, tipo === 'pf' ? 11 : 14);
  if (tipo === 'pf') {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function Chip({ ativo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`min-h-[44px] px-3 py-2 rounded-lg border text-sm leading-tight text-left transition-colors ${
        ativo
          ? 'border-blue-700 bg-blue-50 text-blue-800 font-semibold ring-1 ring-blue-700 dark:bg-blue-500/15'
          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

function ModalNovaConta({ cliente, onClose, onCriada, onErro }) {
  const [categoria, setCategoria] = useState('outros');
  const [descricao, setDescricao] = useState('');
  const [valorCentavos, setValorCentavos] = useState(''); // só dígitos
  const [dataPgto, setDataPgto] = useState('');
  const [benefNome, setBenefNome] = useState('');
  const [benefDocDig, setBenefDocDig] = useState(''); // só dígitos
  const [benefTipo, setBenefTipo] = useState('pj');
  const [formaPgto, setFormaPgto] = useState('pix');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const inputFileRef = useRef(null);
  const inputCameraRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !salvando) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, salvando]);

  const valor = Number(valorCentavos || 0) / 100;
  const faltando = [
    !(valor > 0) && 'valor',
    !descricao.trim() && 'descrição',
  ].filter(Boolean);
  const podeSalvar = faltando.length === 0;
  const benefDoc = mascaraDoc(benefDocDig, benefTipo);

  const submit = async (e) => {
    e?.preventDefault();
    setTentouEnviar(true);
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      const conta = await ocService.criar({
        cliente_id: cliente.id,
        categoria, descricao: descricao.trim(),
        valor,
        data_pagamento: dataPgto || null,
        beneficiario_nome: benefNome.trim() || null,
        beneficiario_documento: benefDoc || null,
        beneficiario_tipo: benefDoc ? benefTipo : null,
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

  const erroDescricao = tentouEnviar && !descricao.trim();
  const erroValor = tentouEnviar && !(valor > 0);
  const tamanhoArquivo = arquivo
    ? (arquivo.size >= 1048576 ? `${(arquivo.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(arquivo.size / 1024))} KB`)
    : '';
  const escolherArquivo = (e) => { setArquivo(e.target.files?.[0] || null); e.target.value = ''; };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={salvando ? undefined : onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        role="dialog" aria-modal="true" aria-labelledby="titulo-nova-conta"
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] sm:max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Alça (mobile) */}
        <div className="sm:hidden flex justify-center pt-2"><span className="h-1 w-10 rounded-full bg-gray-300" /></div>
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-white/10">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Receipt className="h-5 w-5 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="titulo-nova-conta" className="text-base font-semibold text-gray-900 dark:text-gray-100">Nova conta a pagar</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Contas sem nota fiscal</p>
          </div>
          <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar"
            className="h-11 w-11 -mr-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500 dark:text-gray-400 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <form id="form-nova-conta" onSubmit={submit} noValidate className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
          {/* Valor primeiro: é o dado principal, e já abre o teclado numérico */}
          <label className="block">
            <span className={CLS_LABEL}>Valor <span className="text-rose-600">*</span></span>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-500 pointer-events-none">R$</span>
              <input type="text" inputMode="numeric" autoComplete="off" enterKeyHint="next"
                value={mascaraMoeda(valorCentavos)} placeholder="0,00"
                onChange={e => setValorCentavos(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12))}
                aria-invalid={erroValor}
                className={`${CLS_INPUT} !mt-0 !h-14 sm:!h-12 pl-11 !text-xl sm:!text-lg font-semibold tabular-nums ${erroValor ? '!border-rose-500' : ''}`} />
            </div>
            {erroValor && <span className="mt-1 block text-xs text-rose-600">Informe o valor.</span>}
          </label>

          <label className="block">
            <span className={CLS_LABEL}>Descrição <span className="text-rose-600">*</span></span>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Adiantamento ao fornecedor X" enterKeyHint="next" autoCapitalize="sentences"
              aria-invalid={erroDescricao}
              className={`${CLS_INPUT} ${erroDescricao ? '!border-rose-500' : ''}`} />
            {erroDescricao && <span className="mt-1 block text-xs text-rose-600">Descreva a conta.</span>}
          </label>

          <div>
            <span className={CLS_LABEL}>Categoria <span className="text-rose-600">*</span></span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {ocService.CATEGORIAS.map(c => (
                <Chip key={c.key} ativo={categoria === c.key} onClick={() => setCategoria(c.key)}>{c.label}</Chip>
              ))}
            </div>
          </div>

          <div>
            <span className={CLS_LABEL}>Data do pagamento</span>
            <CampoData value={dataPgto} onChange={setDataPgto} titulo="Data do pagamento"
              className="!h-12 sm:!h-11 !text-base sm:!text-sm" />
          </div>

          <div>
            <span className={CLS_LABEL}>Forma de pagamento</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {FORMAS_PGTO.map(f => (
                <Chip key={f.key} ativo={formaPgto === f.key} onClick={() => setFormaPgto(f.key)}>
                  <span className="block text-center">{f.label}</span>
                </Chip>
              ))}
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className={CLS_LABEL}>Beneficiário</legend>
            <input type="text" value={benefNome} onChange={e => setBenefNome(e.target.value)}
              placeholder="Nome ou razão social" autoComplete="off" enterKeyHint="next" aria-label="Nome do beneficiário"
              className={CLS_INPUT} />
            <div className="flex gap-2">
              <div className="flex h-12 sm:h-11 rounded-lg border border-gray-200 dark:border-white/10 p-1 bg-gray-50 dark:bg-white/[0.03] flex-shrink-0" role="radiogroup" aria-label="Tipo de pessoa">
                {[['pj', 'PJ'], ['pf', 'PF']].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={benefTipo === k}
                    onClick={() => { setBenefTipo(k); setBenefDocDig(d => d.slice(0, k === 'pf' ? 11 : 14)); }}
                    className={`w-12 rounded-md text-sm font-semibold transition-colors ${
                      benefTipo === k ? 'bg-white dark:bg-slate-700 text-blue-800 dark:text-blue-300 shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <input type="text" inputMode="numeric" autoComplete="off" enterKeyHint="next"
                value={benefDoc} onChange={e => setBenefDocDig(e.target.value.replace(/\D/g, ''))}
                placeholder={benefTipo === 'pf' ? 'CPF' : 'CNPJ'} aria-label={benefTipo === 'pf' ? 'CPF do beneficiário' : 'CNPJ do beneficiário'}
                className={`${CLS_INPUT} !mt-0 tabular-nums`} />
            </div>
          </fieldset>

          <label className="block">
            <span className={CLS_LABEL}>Observação</span>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3}
              placeholder="Informações adicionais para a CCI"
              className={`${CLS_INPUT} !h-auto py-2.5`} />
          </label>

          {/* Anexo opcional */}
          <div>
            <span className={`${CLS_LABEL} block mb-1`}>Comprovante (opcional)</span>
            {arquivo ? (
              <div className="flex items-center gap-3 pl-3 min-h-[52px] rounded-lg border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10">
                <File className="h-5 w-5 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{arquivo.name}</p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400">{tamanhoArquivo}</p>
                </div>
                <button type="button" onClick={() => setArquivo(null)}
                  className="h-11 px-3 text-sm font-medium text-rose-600 dark:text-rose-400">Remover</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Câmera só no celular (no desktop o "capture" é ignorado e viraria um botão duplicado) */}
                <button type="button" onClick={() => inputCameraRef.current?.click()}
                  className="sm:hidden inline-flex items-center justify-center gap-2 h-12 rounded-lg border border-dashed border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-300 text-sm font-medium active:bg-gray-50">
                  <Camera className="h-4 w-4" /> Tirar foto
                </button>
                <button type="button" onClick={() => inputFileRef.current?.click()}
                  className="sm:col-span-2 inline-flex items-center justify-center gap-2 h-12 sm:h-11 rounded-lg border border-dashed border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-300 text-sm font-medium hover:border-blue-400 hover:bg-blue-50/30 active:bg-gray-50">
                  <Upload className="h-4 w-4" /> <span className="sm:hidden">Arquivo</span><span className="hidden sm:inline">Anexar comprovante</span>
                </button>
              </div>
            )}
            <input ref={inputFileRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={escolherArquivo} />
            <input ref={inputCameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={escolherArquivo} />
          </div>
        </form>

        {/* Rodapé fixo: no celular, Enviar ocupa a largura toda (alvo grande, ao alcance do polegar) */}
        <div className="px-4 sm:px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 border-t border-gray-100 dark:border-white/10 bg-white dark:bg-slate-900">
          {tentouEnviar && !podeSalvar && (
            <p className="mb-2 text-xs text-rose-600" role="alert">Falta preencher: {faltando.join(' e ')}.</p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            <button type="button" onClick={onClose} disabled={salvando}
              className="h-11 rounded-lg px-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50">
              Cancelar
            </button>
            <div className="hidden sm:block flex-1" />
            {/* Não fica desabilitado: tocar com campo faltando mostra o que falta */}
            <button type="submit" form="form-nova-conta" disabled={salvando}
              className="inline-flex items-center justify-center gap-2 h-12 sm:h-11 rounded-lg bg-blue-700 text-white px-4 text-base sm:text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {salvando ? 'Enviando…' : 'Enviar para CCI'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
