import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, Search,
  CheckCircle2, XCircle, Clock, Ban, Receipt, DollarSign,
  Calendar, FileText,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as cciService from '../services/cciFinanceiroService';
import { formatCurrency } from '../utils/format';

const STATUS_CFG = {
  aberto:    { label: 'Aberto',    color: 'bg-blue-50 text-blue-700 border-blue-200',        icon: Clock },
  pago:      { label: 'Pago',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  vencido:   { label: 'Vencido',   color: 'bg-red-50 text-red-700 border-red-200',           icon: AlertCircle },
  parcial:   { label: 'Parcial',   color: 'bg-amber-50 text-amber-700 border-amber-200',     icon: Clock },
  cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500 border-gray-200',       icon: XCircle },
};

function hojeStr() { return new Date().toISOString().split('T')[0]; }

function calcStatus(c) {
  if (c.status === 'pago' || c.status === 'cancelado' || c.status === 'parcial') return c.status;
  if (c.vencimento < hojeStr()) return 'vencido';
  return 'aberto';
}

export default function CciContasPagar() {
  const [contas, setContas] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [planoContas, setPlanoContas] = useState([]);
  const [motivosLancamento, setMotivosLancamento] = useState([]);
  const [motivosPagamento, setMotivosPagamento] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modal, setModal] = useState({ open: false, data: null });
  const [modalPag, setModalPag] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [cps, forns, plano, motivLanc, motivPag] = await Promise.all([
        cciService.listarContasPagar(),
        cciService.listarFornecedores(),
        cciService.listarPlanoContasAnaliticas('despesa'),
        cciService.listarMotivos('lancamento_pagar'),
        cciService.listarMotivos('pagamento_pagar'),
      ]);
      setContas(cps || []);
      setFornecedores(forns || []);
      setPlanoContas(plano || []);
      setMotivosLancamento(motivLanc || []);
      setMotivosPagamento(motivPag || []);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await cciService.atualizarContaPagar(form.id, form);
        showToast('success', 'Conta atualizada');
      } else if (form.quantidade_parcelas > 1) {
        await cciService.criarContasPagarParcelado(form, Number(form.quantidade_parcelas));
        showToast('success', `${form.quantidade_parcelas} parcelas criadas`);
      } else {
        await cciService.criarContaPagar(form);
        showToast('success', 'Conta criada');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const marcarPaga = async (form) => {
    try {
      await cciService.marcarComoPaga(form.id, form);
      showToast('success', 'Pagamento registrado');
      setModalPag({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const cancelar = async (id) => {
    try {
      await cciService.cancelarContaPagar(id);
      showToast('success', 'Conta cancelada');
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await cciService.excluirContaPagar(id);
      showToast('success', 'Conta excluida');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  // Indicadores
  const kpis = useMemo(() => {
    const hoje = hojeStr();
    let aberto = 0, vencido = 0, pago = 0, qtdAberto = 0, qtdVencido = 0, qtdPago = 0;
    contas.forEach(c => {
      const s = calcStatus(c);
      const v = Number(c.valor || 0);
      if (s === 'aberto') { aberto += v; qtdAberto++; }
      if (s === 'vencido') { vencido += v; qtdVencido++; }
      if (s === 'pago') { pago += Number(c.valor_pago || c.valor || 0); qtdPago++; }
    });
    return { aberto, vencido, pago, qtdAberto, qtdVencido, qtdPago };
  }, [contas]);

  const filtradas = useMemo(() => {
    return contas.filter(c => {
      const sCalc = calcStatus(c);
      if (filtroStatus !== 'todos' && sCalc !== filtroStatus) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const forn = c.cci_fornecedores?.nome?.toLowerCase() || '';
        return c.descricao.toLowerCase().includes(q)
          || forn.includes(q)
          || (c.numero_documento || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [contas, busca, filtroStatus]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Contas a Pagar (CCI)" description="Controle de obrigacoes financeiras da CCI">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KpiCard label="Em aberto" valor={kpis.aberto} qtd={kpis.qtdAberto} icon={Clock} color="blue" />
        <KpiCard label="Vencidos" valor={kpis.vencido} qtd={kpis.qtdVencido} icon={AlertCircle} color="red" />
        <KpiCard label="Pagos (no periodo)" valor={kpis.pago} qtd={kpis.qtdPago} icon={CheckCircle2} color="emerald" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descricao, fornecedor ou documento..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
          {['todos', 'aberto', 'vencido', 'pago', 'cancelado'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all capitalize ${
                filtroStatus === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s === 'todos' ? 'Todas' : STATUS_CFG[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Receipt className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{contas.length === 0 ? 'Nenhuma conta cadastrada.' : 'Nenhuma conta corresponde aos filtros.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Descricao</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Plano de contas</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map(c => {
                  const s = calcStatus(c);
                  const cfg = STATUS_CFG[s] || STATUS_CFG.aberto;
                  const Icon = cfg.icon;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50 group">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium text-gray-800">{c.descricao}</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          {c.numero_documento && <span className="font-mono">Nº {c.numero_documento}</span>}
                          {c.quantidade_parcelas > 1 && <span>• {c.parcela}/{c.quantidade_parcelas}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{c.cci_fornecedores?.nome || '—'}</td>
                      <td className="px-4 py-2.5 text-[11px]">
                        {c.cci_plano_contas ? (
                          <div>
                            <span className="font-mono text-gray-400">{c.cci_plano_contas.codigo}</span>
                            <span className="ml-1 text-gray-600">{c.cci_plano_contas.nome}</span>
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{formatData(c.vencimento)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-900 whitespace-nowrap">
                        {formatCurrency(Number(c.valor))}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                          <Icon className="h-2.5 w-2.5" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {s !== 'pago' && s !== 'cancelado' && (
                            <button onClick={() => setModalPag({ open: true, data: c })}
                              title="Registrar pagamento"
                              className="rounded p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                              <DollarSign className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setModal({ open: true, data: c })}
                            title="Editar"
                            className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {s !== 'cancelado' && (
                            <button onClick={() => cancelar(c.id)}
                              title="Cancelar"
                              className="rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setConfirm({ open: true, nome: c.descricao, onConfirm: () => excluir(c.id) })}
                            title="Excluir"
                            className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalContaPagar open={modal.open} data={modal.data} fornecedores={fornecedores} planoContas={planoContas}
        motivos={motivosLancamento}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <ModalPagamento open={modalPag.open} data={modalPag.data} motivos={motivosPagamento}
        onClose={() => setModalPag({ open: false, data: null })} onSave={marcarPaga} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir a conta <strong>{confirm.nome}</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function KpiCard({ label, valor, qtd, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(valor || 0)}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{qtd} {qtd === 1 ? 'conta' : 'contas'}</p>
    </motion.div>
  );
}

function ModalContaPagar({ open, data, fornecedores, planoContas, motivos, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(data?.id ? {
        ...data,
        fornecedor_id: data.fornecedor_id || '',
        plano_conta_id: data.plano_conta_id || '',
        motivo_lancamento_id: data.motivo_lancamento_id || '',
      } : {
        descricao: '', fornecedor_id: '', plano_conta_id: '',
        motivo_lancamento_id: motivos?.[0]?.id || '',
        numero_documento: '', data_emissao: hojeStr(), vencimento: hojeStr(),
        valor: '', parcela: 1, quantidade_parcelas: 1, observacoes: '',
      });
    }
  }, [open, data, motivos]);

  const motivoSelecionado = motivos?.find(m => m.id === form.motivo_lancamento_id);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.descricao?.trim() || !form.vencimento || !form.valor) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descricao *</label>
          <input type="text" required autoFocus value={form.descricao || ''}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Aluguel escritorio - Jan/2026"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fornecedor</label>
            <select value={form.fornecedor_id || ''}
              onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value || null }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecionar...</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Plano de contas (despesa)</label>
            <select value={form.plano_conta_id || ''}
              onChange={e => setForm(f => ({ ...f, plano_conta_id: e.target.value || null }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecionar...</option>
              {planoContas.map(p => <option key={p.id} value={p.id}>{p.codigo} - {p.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Motivo */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de Movimentacao *</label>
          {(motivos?.length || 0) === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Nenhum motivo de tipo "Lancamento de Conta a Pagar" cadastrado. Vá em <strong>Cadastros &gt; Motivos de Movimentacao</strong> para criar.
            </div>
          ) : (
            <>
              <select value={form.motivo_lancamento_id || ''}
                onChange={e => setForm(f => ({ ...f, motivo_lancamento_id: e.target.value || null }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">Selecionar...</option>
                {motivos.map(m => <option key={m.id} value={m.id}>{m.codigo} - {m.nome}</option>)}
              </select>
              {motivoSelecionado && (motivoSelecionado.conta_debito || motivoSelecionado.conta_credito) && (
                <div className="mt-2 flex items-stretch gap-2 bg-gray-50 rounded-lg p-2 text-[11px]">
                  <div className="flex-1 bg-white rounded border border-red-100 px-2 py-1">
                    <p className="text-[9px] font-semibold text-red-600 uppercase">Debito</p>
                    <p className="text-gray-700">{motivoSelecionado.conta_debito?.codigo} {motivoSelecionado.conta_debito?.nome}</p>
                  </div>
                  <div className="flex-1 bg-white rounded border border-blue-100 px-2 py-1">
                    <p className="text-[9px] font-semibold text-blue-600 uppercase">Credito</p>
                    <p className="text-gray-700">{motivoSelecionado.conta_credito?.codigo} {motivoSelecionado.conta_credito?.nome}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Documento / NF</label>
            <input type="text" value={form.numero_documento || ''}
              onChange={e => setForm(f => ({ ...f, numero_documento: e.target.value }))}
              placeholder="Ex: 12345"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data de emissao</label>
            <input type="date" value={form.data_emissao || ''}
              onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vencimento *</label>
            <input type="date" required value={form.vencimento || ''}
              onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Valor (R$) *</label>
            <input type="number" step="0.01" required value={form.valor || ''}
              onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
              placeholder="0,00"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-right focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          {!data?.id && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parcelas</label>
              <input type="number" min="1" max="120" value={form.quantidade_parcelas || 1}
                onChange={e => setForm(f => ({ ...f, quantidade_parcelas: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-center focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes</label>
          <textarea rows={2} value={form.observacoes || ''}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={saving || !form.descricao?.trim() || !form.vencimento || !form.valor}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : (form.quantidade_parcelas > 1 ? `Criar ${form.quantidade_parcelas} parcelas` : 'Criar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalPagamento({ open, data, motivos, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && data) {
      setForm({
        id: data.id,
        data_pagamento: hojeStr(),
        valor_pago: data.valor,
        juros: 0,
        desconto: 0,
        forma_pagamento: '',
        motivo_pagamento_id: motivos?.[0]?.id || '',
      });
    }
  }, [open, data, motivos]);

  const motivoSelecionado = motivos?.find(m => m.id === form.motivo_pagamento_id);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  const totalLiquido = Number(form.valor_pago || 0) + Number(form.juros || 0) - Number(form.desconto || 0);

  return (
    <Modal open={open} onClose={onClose} title="Registrar Pagamento" size="sm">
      {data && (
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Conta</p>
            <p className="text-sm font-medium text-gray-900">{data.descricao}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Venc.: {formatData(data.vencimento)} · Valor: {formatCurrency(Number(data.valor))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data do pagamento</label>
              <input type="date" required value={form.data_pagamento || ''}
                onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Forma de pagamento</label>
              <select value={form.forma_pagamento || ''}
                onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                <option value="">Selecionar...</option>
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferencia</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartao</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Valor</label>
              <input type="number" step="0.01" required value={form.valor_pago || ''}
                onChange={e => setForm(f => ({ ...f, valor_pago: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-right focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Juros (R$)</label>
              <input type="number" step="0.01" value={form.juros || ''}
                onChange={e => setForm(f => ({ ...f, juros: e.target.value }))}
                placeholder="0,00"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-right focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Desconto (R$)</label>
              <input type="number" step="0.01" value={form.desconto || ''}
                onChange={e => setForm(f => ({ ...f, desconto: e.target.value }))}
                placeholder="0,00"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-right focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
          </div>

          {/* Motivo de pagamento */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de Movimentacao *</label>
            {(motivos?.length || 0) === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Cadastre um motivo tipo "Pagamento de Conta a Pagar" em <strong>Cadastros &gt; Motivos</strong>.
              </div>
            ) : (
              <>
                <select value={form.motivo_pagamento_id || ''}
                  onChange={e => setForm(f => ({ ...f, motivo_pagamento_id: e.target.value || null }))}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                  <option value="">Selecionar...</option>
                  {motivos.map(m => <option key={m.id} value={m.id}>{m.codigo} - {m.nome}</option>)}
                </select>
                {motivoSelecionado && (motivoSelecionado.conta_debito || motivoSelecionado.conta_credito) && (
                  <div className="mt-2 flex items-stretch gap-2 bg-gray-50 rounded-lg p-2 text-[11px]">
                    <div className="flex-1 bg-white rounded border border-red-100 px-2 py-1">
                      <p className="text-[9px] font-semibold text-red-600 uppercase">Debito</p>
                      <p className="text-gray-700">{motivoSelecionado.conta_debito?.codigo} {motivoSelecionado.conta_debito?.nome}</p>
                    </div>
                    <div className="flex-1 bg-white rounded border border-blue-100 px-2 py-1">
                      <p className="text-[9px] font-semibold text-blue-600 uppercase">Credito</p>
                      <p className="text-gray-700">{motivoSelecionado.conta_credito?.codigo} {motivoSelecionado.conta_credito?.nome}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-emerald-50 rounded-lg p-3 flex justify-between items-center border border-emerald-100">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total pago</span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(totalLiquido)}</span>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Registrar pagamento
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function formatData(d) {
  if (!d) return '—';
  const [y, m, dd] = String(d).split('-');
  if (!y || !m || !dd) return d;
  return `${dd}/${m}/${y}`;
}
