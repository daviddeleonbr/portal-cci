import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Loader2, Search, ListTodo, Calendar, User,
  Check, AlertCircle, Clock, Zap, Building2, CheckCircle2, XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useClienteSession } from '../../hooks/useAuth';
import * as tarefasService from '../../services/clienteTarefasService';

function ontemEFuturoStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

const CORES_STATUS = {
  amber:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10',
  blue:    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10',
  gray:    'bg-gray-100 text-gray-600 border-gray-200',
  red:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10',
};

export default function ClienteTarefas() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const chaveApi = session?.chaveApi;
  const empresasDisponiveis = session?.clientesRede || [];

  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const temAcessoTotal = !!usuario?.permissoes?.includes('gerenciar_usuarios');
  const meuNome = (usuario?.nome || '').trim().toLowerCase();

  const carregar = useCallback(async () => {
    if (!chaveApi?.id) return;
    try {
      setLoading(true);
      const data = await tarefasService.listar(chaveApi.id);
      // Operacional ve apenas suas tarefas; acesso total ve todas
      const visiveis = temAcessoTotal
        ? data
        : data.filter(t => (t.responsavel || '').trim().toLowerCase() === meuNome);
      setTarefas(visiveis);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [chaveApi?.id, temAcessoTotal, meuNome]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await tarefasService.atualizar(form.id, form);
        showToast('success', 'Tarefa atualizada');
      } else {
        await tarefasService.criar({ ...form, chave_api_id: chaveApi.id, criado_por: usuario?.nome });
        showToast('success', 'Tarefa criada');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await tarefasService.excluir(id);
      showToast('success', 'Tarefa excluida');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const mudarStatus = async (tarefa, novoStatus) => {
    try {
      await tarefasService.atualizar(tarefa.id, { status: novoStatus });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tarefas.filter(t => {
      if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false;
      if (!q) return true;
      return t.titulo.toLowerCase().includes(q)
        || (t.descricao || '').toLowerCase().includes(q)
        || (t.responsavel || '').toLowerCase().includes(q);
    });
  }, [tarefas, busca, filtroStatus]);

  const stats = useMemo(() => ({
    total: tarefas.length,
    pendentes: tarefas.filter(t => t.status === 'pendente').length,
    em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
    concluidas: tarefas.filter(t => t.status === 'concluida').length,
    atrasadas: tarefas.filter(tarefasService.isAtrasada).length,
  }), [tarefas]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Gestor de Tarefas"
        description={temAcessoTotal
          ? `Controle de atividades dos colaboradores da ${chaveApi?.nome || 'rede'}`
          : 'Suas tarefas atribuidas na rede'}>
        {temAcessoTotal && (
          <button onClick={() => setModal({ open: true, data: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        )}
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Pendentes" valor={stats.pendentes} icon={Clock} color="amber" />
        <StatCard label="Em andamento" valor={stats.em_andamento} icon={Zap} color="blue" />
        <StatCard label="Concluidas" valor={stats.concluidas} icon={CheckCircle2} color="emerald" />
        <StatCard label="Atrasadas" valor={stats.atrasadas} icon={AlertCircle} color="red" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por titulo, descricao ou responsavel..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {['todos', 'pendente', 'em_andamento', 'concluida', 'cancelada'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filtroStatus === s ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {s === 'todos' ? 'Todos' : s === 'em_andamento' ? 'Em andamento' : tarefasService.STATUS.find(x => x.key === s)?.label || s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <ListTodo className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-700 mb-1">
            {tarefas.length === 0 ? 'Nenhuma tarefa cadastrada ainda' : 'Nenhuma tarefa encontrada nos filtros'}
          </p>
          {tarefas.length === 0 && (
            <button onClick={() => setModal({ open: true, data: null })}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Criar primeira tarefa
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtradas.map(t => (
            <TarefaRow key={t.id} tarefa={t}
              podeEditar={temAcessoTotal}
              onEdit={() => setModal({ open: true, data: t })}
              onExcluir={() => setConfirm({ open: true, tarefa: t, onConfirm: () => excluir(t.id) })}
              onStatus={(s) => mudarStatus(t, s)} />
          ))}
        </div>
      )}

      <ModalTarefa open={modal.open} data={modal.data} empresas={empresasDisponiveis}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir tarefa" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir a tarefa <strong>"{confirm.tarefa?.titulo}"</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, valor, icon: Icon, color }) {
  const bgs = {
    amber:   'bg-amber-50 text-amber-600',
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${bgs[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{valor}</p>
    </div>
  );
}

function TarefaRow({ tarefa, podeEditar, onEdit, onExcluir, onStatus }) {
  const statusInfo = tarefasService.STATUS.find(s => s.key === tarefa.status);
  const prioInfo = tarefasService.PRIORIDADES.find(p => p.key === tarefa.prioridade);
  const atrasada = tarefasService.isAtrasada(tarefa);

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl border shadow-sm p-4 group ${
        atrasada ? 'border-red-300' : 'border-gray-200/60'
      }`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onStatus(tarefa.status === 'concluida' ? 'pendente' : 'concluida')}
          title={tarefa.status === 'concluida' ? 'Reabrir' : 'Concluir'}
          className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            tarefa.status === 'concluida' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
          }`}>
          {tarefa.status === 'concluida' && <Check className="h-3 w-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${tarefa.status === 'concluida' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {tarefa.titulo}
              </p>
              {tarefa.descricao && (
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{tarefa.descricao}</p>
              )}
            </div>

            {podeEditar && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={onEdit}
                  className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={onExcluir}
                  className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-2">
            <select value={tarefa.status}
              onChange={(e) => onStatus(e.target.value)}
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 border cursor-pointer ${CORES_STATUS[statusInfo?.cor] || CORES_STATUS.gray}`}>
              {tarefasService.STATUS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            {prioInfo && tarefa.prioridade !== 'normal' && (
              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${CORES_STATUS[prioInfo.cor]}`}>
                {prioInfo.label}
              </span>
            )}

            {tarefa.responsavel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <User className="h-3 w-3 text-gray-400" /> {tarefa.responsavel}
              </span>
            )}

            {tarefa.prazo && (
              <span className={`inline-flex items-center gap-1 text-[11px] ${atrasada ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                <Calendar className="h-3 w-3 text-gray-400" /> {formatDataBR(tarefa.prazo)}
                {atrasada && <span className="ml-0.5 text-[10px] uppercase">atrasada</span>}
              </span>
            )}

            {tarefa.clientes?.nome && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Building2 className="h-3 w-3 text-gray-400" /> {tarefa.clientes.nome}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ModalTarefa({ open, data, empresas, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data?.id) {
      setForm({ ...data, cliente_id: data.cliente_id || '' });
    } else {
      setForm({
        titulo: '', descricao: '', responsavel: '', prazo: '',
        status: 'pendente', prioridade: 'normal', cliente_id: '',
      });
    }
  }, [open, data]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.titulo?.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        cliente_id: form.cliente_id || null,
        prazo: form.prazo || null,
      });
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar tarefa' : 'Nova tarefa'} size="md">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Titulo *</label>
          <input type="text" required autoFocus value={form.titulo || ''}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Enviar extrato de abril"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descricao</label>
          <textarea rows={2} value={form.descricao || ''}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Detalhes da atividade"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Responsavel</label>
            <input type="text" value={form.responsavel || ''}
              onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
              placeholder="Nome do colaborador"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Prazo</label>
            <input type="date" value={form.prazo || ''}
              onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status || 'pendente'}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {tarefasService.STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Prioridade</label>
            <select value={form.prioridade || 'normal'}
              onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {tarefasService.PRIORIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Empresa (opcional)</label>
            <select value={form.cliente_id || ''}
              onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Todas</option>
              {(empresas || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={saving || !form.titulo?.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
