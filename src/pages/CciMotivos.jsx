import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search,
  ArrowRight, Layers, Repeat,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as cciService from '../services/cciFinanceiroService';

const TIPO_OPERACAO = {
  lancamento_pagar:   { label: 'Lancamento de Conta a Pagar', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  pagamento_pagar:    { label: 'Pagamento de Conta a Pagar',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lancamento_receber: { label: 'Lancamento de Conta a Receber', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  recebimento:        { label: 'Recebimento',                 color: 'bg-blue-50 text-blue-700 border-blue-200' },
  transferencia:      { label: 'Transferencia',               color: 'bg-violet-50 text-violet-700 border-violet-200' },
  ajuste:             { label: 'Ajuste',                      color: 'bg-slate-100 text-slate-700 border-slate-200' },
  outro:              { label: 'Outro',                       color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function CciMotivos() {
  const [motivos, setMotivos] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [ms, cs] = await Promise.all([
        cciService.listarMotivos(),
        cciService.listarPlanoContasAnaliticas(),
      ]);
      setMotivos(ms || []);
      setContas(cs || []);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await cciService.atualizarMotivo(form.id, form);
        showToast('success', 'Motivo atualizado');
      } else {
        await cciService.criarMotivo(form);
        showToast('success', 'Motivo criado');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await cciService.excluirMotivo(id);
      showToast('success', 'Motivo excluido');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = motivos.filter(m => {
    if (filtroTipo !== 'todos' && m.tipo_operacao !== filtroTipo) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return m.nome.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q) || (m.descricao || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Motivos de Movimentacao" description="Templates contabeis que definem o par Debito/Credito de cada tipo de operacao">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Motivo
        </button>
      </PageHeader>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar motivos..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os tipos</option>
          {Object.entries(TIPO_OPERACAO).map(([v, c]) => (
            <option key={v} value={v}>{c.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Repeat className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{motivos.length === 0 ? 'Nenhum motivo cadastrado.' : 'Nenhum motivo corresponde aos filtros.'}</p>
          {motivos.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Crie um motivo para cada tipo de operacao (ex: "Lancamento de contas a pagar") com seu par D/C.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(m => {
            const cfg = TIPO_OPERACAO[m.tipo_operacao] || TIPO_OPERACAO.outro;
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200/60 p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Repeat className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-mono text-gray-400">{m.codigo}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {!m.ativo && <span className="text-[9px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">Inativo</span>}
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{m.nome}</p>
                      {m.descricao && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{m.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setModal({ open: true, data: m })}
                      className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setConfirm({ open: true, nome: m.nome, onConfirm: () => excluir(m.id) })}
                      className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Par Debito / Credito */}
                <div className="flex items-stretch gap-2 bg-gray-50 rounded-lg p-2">
                  <div className="flex-1 bg-white rounded border border-red-100 px-3 py-2">
                    <p className="text-[9px] font-semibold text-red-600 uppercase tracking-wider">Debito</p>
                    {m.conta_debito ? (
                      <>
                        <p className="text-[11px] font-mono text-gray-400">{m.conta_debito.codigo}</p>
                        <p className="text-sm text-gray-900 font-medium">{m.conta_debito.nome}</p>
                      </>
                    ) : <p className="text-xs text-red-500 italic">Nao configurada</p>}
                  </div>
                  <div className="flex items-center px-1 flex-shrink-0">
                    <ArrowRight className="h-4 w-4 text-gray-300" />
                  </div>
                  <div className="flex-1 bg-white rounded border border-blue-100 px-3 py-2">
                    <p className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider">Credito</p>
                    {m.conta_credito ? (
                      <>
                        <p className="text-[11px] font-mono text-gray-400">{m.conta_credito.codigo}</p>
                        <p className="text-sm text-gray-900 font-medium">{m.conta_credito.nome}</p>
                      </>
                    ) : <p className="text-xs text-red-500 italic">Nao configurada</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalMotivo open={modal.open} data={modal.data} contas={contas}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir o motivo <strong>{confirm.nome}</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ModalMotivo({ open, data, contas, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(data?.id ? { ...data } : {
        codigo: '', nome: '', descricao: '', tipo_operacao: 'lancamento_pagar',
        conta_debito_id: '', conta_credito_id: '', ativo: true,
      });
    }
  }, [open, data]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.codigo?.trim() || !form.nome?.trim()) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Motivo' : 'Novo Motivo'} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Codigo *</label>
            <input type="text" required value={form.codigo || ''}
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
              placeholder="CP-001"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" required value={form.nome || ''}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Lancamento de contas a pagar"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de Operacao</label>
          <select value={form.tipo_operacao || 'lancamento_pagar'}
            onChange={e => setForm(f => ({ ...f, tipo_operacao: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            {Object.entries(TIPO_OPERACAO).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* D / C */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-red-700 mb-1">Conta Debito *</label>
            <ContaPicker value={form.conta_debito_id} onChange={(id) => setForm(f => ({ ...f, conta_debito_id: id }))} contas={contas} color="red" />
          </div>
          <div className="pb-2"><ArrowRight className="h-5 w-5 text-gray-300" /></div>
          <div>
            <label className="block text-xs font-medium text-blue-700 mb-1">Conta Credito *</label>
            <ContaPicker value={form.conta_credito_id} onChange={(id) => setForm(f => ({ ...f, conta_credito_id: id }))} contas={contas} color="blue" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descricao</label>
          <textarea rows={2} value={form.descricao || ''}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Explicacao do que esse motivo representa"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.ativo !== false}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="rounded border-gray-300" />
            Ativo
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={saving || !form.codigo?.trim() || !form.nome?.trim() || !form.conta_debito_id || !form.conta_credito_id}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ContaPicker({ value, onChange, contas, color }) {
  const border = color === 'red' ? 'focus:border-red-400 focus:ring-red-100 border-red-100' : 'focus:border-blue-400 focus:ring-blue-100 border-blue-100';
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} required
      className={`w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 ${border}`}>
      <option value="">Selecionar...</option>
      {contas.map(c => (
        <option key={c.id} value={c.id}>{c.codigo} - {c.nome} ({c.grupo})</option>
      ))}
    </select>
  );
}
