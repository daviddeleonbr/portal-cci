// Aba "Propostas" da página Contratos.
// Lista propostas + modal de criação/edição com seleção de itens do
// catálogo de Serviços Oferecidos.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Search, Pencil, Trash2, Send, CheckCircle2, XCircle, Loader2,
  FileText, MoreHorizontal, Receipt,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../../utils/format';
import * as propostasService from '../../services/propostasService';
import * as servicosService from '../../services/servicosOferecidosService';
import * as clientesService from '../../services/clientesService';

const STATUS_STYLE = {
  rascunho:   'bg-gray-100   text-gray-600    border-gray-200',
  enviada:    'bg-blue-50    text-blue-700    border-blue-200',
  aceita:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejeitada:  'bg-rose-50    text-rose-700    border-rose-200',
  expirada:   'bg-amber-50   text-amber-700   border-amber-200',
  convertida: 'bg-violet-50  text-violet-700  border-violet-200',
};

export default function AbaPropostas({ showToast }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modal, setModal] = useState({ open: false, propostaId: null });

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await propostasService.listarPropostas();
      setPropostas(data);
    } catch (err) {
      showToast('error', 'Erro ao carregar propostas: ' + err.message);
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const remover = async (p) => {
    if (!confirm(`Remover a proposta "${p.titulo}"?`)) return;
    try {
      await propostasService.excluirProposta(p.id);
      showToast('success', 'Proposta removida');
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const transicao = async (p, novoStatus, msg) => {
    try {
      await propostasService.alterarStatus(p.id, novoStatus);
      showToast('success', msg);
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtradas = propostas.filter(p => {
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!p.titulo?.toLowerCase().includes(q) && !p.cliente_nome?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totaisPorStatus = useMemo(() => {
    const acc = { rascunho: 0, enviada: 0, aceita: 0, valorAceita: 0 };
    propostas.forEach(p => {
      if (p.status === 'rascunho') acc.rascunho++;
      if (p.status === 'enviada')  acc.enviada++;
      if (p.status === 'aceita')   { acc.aceita++; acc.valorAceita += Number(p.valor_total || 0); }
    });
    return acc;
  }, [propostas]);

  return (
    <div>
      {/* Header da aba */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Propostas comerciais</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Monte propostas usando o catálogo de serviços oferecidos.
          </p>
        </div>
        <button onClick={() => setModal({ open: true, propostaId: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Nova proposta
        </button>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-4 py-2.5 bg-white rounded-lg border border-gray-200/60">
        <KpiInline label="Rascunho"   value={totaisPorStatus.rascunho}             color="gray"    />
        <span className="h-5 w-px bg-gray-200" />
        <KpiInline label="Enviadas"   value={totaisPorStatus.enviada}              color="blue"    />
        <span className="h-5 w-px bg-gray-200" />
        <KpiInline label="Aceitas"    value={totaisPorStatus.aceita}               color="emerald" />
        <span className="h-5 w-px bg-gray-200" />
        <KpiInline label="Valor aceito" value={formatCurrency(totaisPorStatus.valorAceita)} color="emerald" />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou cliente…"
            className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os status</option>
          {propostasService.STATUS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtradas.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Nenhuma proposta encontrada</p>
            <p className="text-xs text-gray-400">Clique em "Nova proposta" para criar a primeira.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left  px-6 py-3 font-medium">Proposta</th>
                  <th className="text-left  px-6 py-3 font-medium">Cliente</th>
                  <th className="text-right px-6 py-3 font-medium">Valor</th>
                  <th className="text-left  px-6 py-3 font-medium">Data</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((p, i) => {
                  const meta = propostasService.metaStatus(p.status);
                  return (
                    <motion.tr key={p.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                      onClick={() => setModal({ open: true, propostaId: p.id })}>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-900">{p.titulo}</p>
                        {p.descricao && <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">{p.descricao}</p>}
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-900">{p.cliente_nome}</p>
                        {p.cliente_cnpj && <p className="text-xs text-gray-400 font-mono">{p.cliente_cnpj}</p>}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(Number(p.valor_total || 0))}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {formatDate(p.data_proposta)}
                        {p.valida_ate && <p className="text-[10.5px] text-gray-400">Válida até {formatDate(p.valida_ate)}</p>}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[p.status]}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {p.status === 'rascunho' && (
                            <button onClick={() => transicao(p, 'enviada', 'Marcada como enviada')}
                              className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Marcar como enviada">
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {p.status === 'enviada' && (
                            <>
                              <button onClick={() => transicao(p, 'aceita', 'Proposta aceita')}
                                className="rounded-md p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Aceitar">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => transicao(p, 'rejeitada', 'Proposta rejeitada')}
                                className="rounded-md p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Rejeitar">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          <button onClick={() => setModal({ open: true, propostaId: p.id })}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remover(p)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remover">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <ModalProposta
        open={modal.open}
        propostaId={modal.propostaId}
        onClose={() => setModal({ open: false, propostaId: null })}
        onSaved={() => { setModal({ open: false, propostaId: null }); carregar(); }}
        showToast={showToast}
      />
    </div>
  );
}

function KpiInline({ label, value, color }) {
  const colors = {
    gray:    'bg-gray-100   text-gray-600',
    blue:    'bg-blue-50    text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${colors[color]}`} />
      <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-base font-bold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: criar / editar proposta
// ═══════════════════════════════════════════════════════════
function ModalProposta({ open, propostaId, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(estadoInicial());
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Catálogos auxiliares
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [buscaServico, setBuscaServico] = useState('');

  function estadoInicial() {
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '',
      titulo: '', descricao: '', observacoes: '',
      data_proposta: hoje, valida_ate: '',
      desconto_valor: '0', desconto_percentual: '0',
      status: 'rascunho',
    };
  }

  // Carrega catálogos ao abrir
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const [cls, srv] = await Promise.all([
          clientesService.listarClientes(),
          servicosService.listarServicos({ apenasAtivos: true }),
        ]);
        if (!cancel) {
          setClientes((cls || []).filter(c => c.status === 'ativo'));
          setServicos(srv || []);
        }
      } catch { /* form funciona mesmo sem catálogos */ }
    })();
    return () => { cancel = true; };
  }, [open]);

  // Carrega proposta (modo edição)
  useEffect(() => {
    if (!open) return;
    if (!propostaId) { setForm(estadoInicial()); setItens([]); return; }
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const p = await propostasService.buscarProposta(propostaId);
        if (cancel) return;
        setForm({
          ...p,
          desconto_valor:      String(p.desconto_valor      ?? '0'),
          desconto_percentual: String(p.desconto_percentual ?? '0'),
          valida_ate:          p.valida_ate || '',
        });
        setItens(p.itens || []);
      } catch (err) {
        showToast('error', 'Erro ao carregar proposta: ' + err.message);
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [open, propostaId, showToast]);

  const clientesFiltrados = (() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter(c =>
      (c.nome || '').toLowerCase().includes(t)
      || (c.razao_social || '').toLowerCase().includes(t)
      || (c.cnpj || '').toLowerCase().includes(t)
    ).slice(0, 30);
  })();

  const servicosFiltrados = (() => {
    const t = buscaServico.trim().toLowerCase();
    if (!t) return servicos.slice(0, 30);
    return servicos.filter(s =>
      s.nome.toLowerCase().includes(t) || (s.descricao || '').toLowerCase().includes(t)
    ).slice(0, 30);
  })();

  const selecionarCliente = (c) => {
    setForm(f => ({
      ...f,
      cliente_id:    c.id,
      cliente_nome:  c.razao_social || c.nome,
      cliente_cnpj:  (c.cnpj || '').replace(/\D/g, ''),
      cliente_email: c.contato_email || '',
    }));
    setBuscaCliente('');
  };

  const adicionarServico = (s) => {
    setItens(prev => [...prev, {
      servico_id:     s.id,
      nome:           s.nome,
      descricao:      s.descricao,
      categoria:      s.categoria,
      periodicidade:  s.periodicidade,
      tipo_valor:     s.tipo_valor || 'fixo',
      unidade:        s.unidade    || null,
      quantidade:     1,
      valor_unitario: Number(s.valor || 0),
    }]);
    setBuscaServico('');
  };

  const adicionarItemAvulso = () => {
    setItens(prev => [...prev, {
      servico_id: null, nome: 'Item personalizado', descricao: '',
      categoria: 'outro', periodicidade: 'mensal',
      tipo_valor: 'fixo', unidade: null,
      quantidade: 1, valor_unitario: 0,
    }]);
  };

  const atualizarItem = (idx, campo, valor) => {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  };

  const removerItem = (idx) => {
    setItens(prev => prev.filter((_, i) => i !== idx));
  };

  const totais = propostasService.calcularTotais(
    itens, Number(form.desconto_valor || 0), Number(form.desconto_percentual || 0)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (itens.length === 0) {
      alert('Adicione pelo menos um item à proposta.');
      return;
    }
    setSalvando(true);
    try {
      await propostasService.salvarProposta({
        ...form,
        desconto_valor:      parseFloat(form.desconto_valor)      || 0,
        desconto_percentual: parseFloat(form.desconto_percentual) || 0,
      }, itens);
      showToast('success', propostaId ? 'Proposta atualizada' : 'Proposta criada');
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally { setSalvando(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose}
      title={propostaId ? 'Editar proposta' : 'Nova proposta'}
      size="xl"
      footer={(
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Subtotal: <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{formatCurrency(totais.subtotal)}</span>
            {totais.desconto > 0 && <> · Desconto: <span className="text-rose-600 dark:text-rose-400 tabular-nums">−{formatCurrency(totais.desconto)}</span></>}
            <span className="ml-2">Total: <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(totais.total)}</span></span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
              Cancelar
            </button>
            <button type="submit" form="form-proposta" disabled={salvando}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {propostaId ? 'Salvar alterações' : 'Criar proposta'}
            </button>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        </div>
      ) : (
        <form id="form-proposta" onSubmit={handleSubmit} className="space-y-5">
          {/* Cliente */}
          <div className="rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/[0.08] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h4 className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" /> Cliente / Prospect
              </h4>
              {form.cliente_id && (
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '' }))}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-medium">Limpar</button>
              )}
            </div>
            {form.cliente_id ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-500/30 px-3 py-2">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{form.cliente_nome}</p>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {form.cliente_cnpj && <span className="font-mono">CNPJ {form.cliente_cnpj}</span>}
                  {form.cliente_email && <span>· {form.cliente_email}</span>}
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input type="text" value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="Buscar cliente cadastrado…"
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                </div>
                {buscaCliente && clientesFiltrados.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/5">
                    {clientesFiltrados.map(c => (
                      <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/15 transition-colors">
                        <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{c.razao_social || c.nome}</p>
                        <div className="flex items-center gap-2 text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {c.cnpj && <span className="font-mono">CNPJ {c.cnpj}</span>}
                          {c.cidade && <span>· {c.cidade}/{c.estado}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-1.5">
                  Ou preencha os campos abaixo manualmente (prospect).
                </p>
              </>
            )}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="col-span-2">
                <input type="text" required value={form.cliente_nome}
                  onChange={e => setForm(f => ({ ...f, cliente_nome: e.target.value }))}
                  placeholder="Nome / Razão Social *"
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </div>
              <input type="text" value={form.cliente_cnpj}
                onChange={e => setForm(f => ({ ...f, cliente_cnpj: e.target.value }))}
                placeholder="CNPJ"
                className="h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              <input type="email" value={form.cliente_email}
                onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))}
                placeholder="Email"
                className="h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
            </div>
          </div>

          {/* Informações da proposta */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Proposta</h4>
            <div className="space-y-3">
              <input type="text" required value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Título *"
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              <textarea rows={2} value={form.descricao || ''}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição (aparece na proposta enviada)"
                className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data *</label>
                  <input type="date" required value={form.data_proposta}
                    onChange={e => setForm(f => ({ ...f, data_proposta: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Válida até</label>
                  <input type="date" value={form.valida_ate || ''}
                    onChange={e => setForm(f => ({ ...f, valida_ate: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                </div>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Itens da proposta</h4>
              <button type="button" onClick={adicionarItemAvulso}
                className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                + Item avulso
              </button>
            </div>

            {/* Picker de serviços do catálogo */}
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.03] p-3 mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input type="text" value={buscaServico} onChange={e => setBuscaServico(e.target.value)}
                  placeholder="Adicionar serviço do catálogo (buscar por nome ou descrição…)"
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </div>
              {buscaServico && servicosFiltrados.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/5">
                  {servicosFiltrados.map(s => (
                    <button key={s.id} type="button" onClick={() => adicionarServico(s)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/15 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate">{s.nome}</p>
                          {s.descricao && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate">{s.descricao}</p>}
                        </div>
                        <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums flex-shrink-0">
                          {formatCurrency(Number(s.valor || 0))}
                          {s.tipo_valor === 'unitario' && (
                            <span className="ml-0.5 text-[10px] font-normal text-gray-400 dark:text-gray-500">/ {s.unidade || 'un'}</span>
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de itens adicionados */}
            {itens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-white/15 px-4 py-8 text-center">
                <FileText className="h-8 w-8 text-gray-300 dark:text-white/20 mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Nenhum item ainda. Use a busca acima pra adicionar serviços do catálogo.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-white/10 divide-y divide-gray-100 dark:divide-white/5 overflow-hidden">
                {itens.map((it, idx) => (
                  <div key={idx} className="p-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.03]">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-5">
                        <input type="text" value={it.nome}
                          onChange={e => atualizarItem(idx, 'nome', e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2.5 text-sm font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                        <input type="text" value={it.descricao || ''}
                          onChange={e => atualizarItem(idx, 'descricao', e.target.value)}
                          placeholder="Descrição do item"
                          className="w-full mt-1.5 h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-2.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                          {it.tipo_valor === 'unitario'
                            ? `Qtd (${it.unidade || 'un'})`
                            : 'Qtd'}
                        </label>
                        <input type="number" step="0.01" value={it.quantidade}
                          onChange={e => atualizarItem(idx, 'quantidade', e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2.5 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                          {it.tipo_valor === 'unitario'
                            ? `Valor por ${it.unidade || 'un'}`
                            : 'Valor unit. (R$)'}
                        </label>
                        <input type="number" step="0.01" value={it.valor_unitario}
                          onChange={e => atualizarItem(idx, 'valor_unitario', e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-2.5 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
                      </div>
                      <div className="col-span-2 text-right pt-5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                          {formatCurrency((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0))}
                        </p>
                      </div>
                      <div className="col-span-1 flex justify-end pt-5">
                        <button type="button" onClick={() => removerItem(idx)}
                          className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desconto */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Desconto (opcional)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Valor (R$)</label>
                <input type="number" step="0.01" value={form.desconto_valor}
                  onChange={e => setForm(f => ({ ...f, desconto_valor: e.target.value, desconto_percentual: '0' }))}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Percentual (%)</label>
                <input type="number" step="0.01" value={form.desconto_percentual}
                  onChange={e => setForm(f => ({ ...f, desconto_percentual: e.target.value, desconto_valor: '0' }))}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
              </div>
            </div>
            <p className="text-[10.5px] text-gray-400 dark:text-gray-500 mt-1">Use só um dos dois — o que preencher zera o outro.</p>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Observações (internas)</label>
            <textarea rows={2} value={form.observacoes || ''}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Notas internas (não aparecem na proposta)"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          </div>
        </form>
      )}
    </Modal>
  );
}
