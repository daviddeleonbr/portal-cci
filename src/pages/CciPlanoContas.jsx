import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, Search, Layers,
  TrendingUp, TrendingDown, ChevronRight, FolderPlus,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as cciService from '../services/cciFinanceiroService';
import { proximoCodigoHierarquico } from '../services/cciFinanceiroService';

export default function CciPlanoContas() {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [expanded, setExpanded] = useState(new Set());

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await cciService.listarPlanoContas();
      setContas(data || []);
      setExpanded(new Set((data || []).filter(c => c.classificacao === 'S').map(c => c.id)));
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (form) => {
    try {
      if (form.id) {
        await cciService.atualizarContaPlano(form.id, form);
        showToast('success', 'Conta atualizada');
      } else {
        await cciService.criarContaPlano(form);
        showToast('success', 'Conta criada');
      }
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const excluir = async (id) => {
    try {
      await cciService.excluirContaPlano(id);
      showToast('success', 'Conta excluida');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  // Filtros + agrupamento hierarquico
  const filtrados = contas.filter(c => {
    if (filtroGrupo !== 'todos' && c.grupo !== filtroGrupo) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const raizes = filtrados.filter(c => !c.parent_id).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const getFilhos = (parentId) => filtrados.filter(c => c.parent_id === parentId).sort((a, b) => a.codigo.localeCompare(b.codigo));

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Plano de Contas CCI" description="Plano de contas interno para controle financeiro da CCI">
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </PageHeader>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por codigo ou nome..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 flex-wrap">
          {[
            { v: 'todos',      l: 'Todas' },
            { v: 'ativo',      l: 'Ativo' },
            { v: 'passivo',    l: 'Passivo' },
            { v: 'patrimonio', l: 'Patrimonio' },
            { v: 'receita',    l: 'Receita' },
            { v: 'custo',      l: 'Custo' },
            { v: 'despesa',    l: 'Despesa' },
          ].map(o => (
            <button key={o.v} onClick={() => setFiltroGrupo(o.v)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                filtroGrupo === o.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : raizes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Layers className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{contas.length === 0 ? 'Nenhuma conta cadastrada.' : 'Nenhuma conta corresponde aos filtros.'}</p>
          {contas.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Comece criando contas sinteticas (grupos) e depois analiticas.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          <ul className="py-1">
            {raizes.map((c, i) => (
              <ContaRow key={c.id} conta={c} depth={0} isLast={i === raizes.length - 1}
                expanded={expanded}
                getFilhos={getFilhos}
                onToggle={toggleExpand}
                onAddChild={(parent) => setModal({ open: true, data: { parent_id: parent.id, grupo: parent.grupo } })}
                onEdit={(c) => setModal({ open: true, data: c })}
                onDelete={(c) => setConfirm({ open: true, nome: c.nome, onConfirm: () => excluir(c.id) })}
              />
            ))}
          </ul>
        </div>
      )}

      <ModalConta open={modal.open} data={modal.data} contas={contas}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

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

const GRUPO_CFG = {
  ativo:      { label: 'Ativo',      color: 'bg-blue-50 text-blue-700' },
  passivo:    { label: 'Passivo',    color: 'bg-orange-50 text-orange-600' },
  patrimonio: { label: 'Patrimonio', color: 'bg-violet-50 text-violet-700' },
  receita:    { label: 'Receita',    color: 'bg-emerald-50 text-emerald-700' },
  custo:      { label: 'Custo',      color: 'bg-amber-50 text-amber-700' },
  despesa:    { label: 'Despesa',    color: 'bg-red-50 text-red-600' },
};

function ContaRow({ conta, depth, isLast, expanded, getFilhos, onToggle, onAddChild, onEdit, onDelete }) {
  const filhos = getFilhos(conta.id);
  const hasChildren = filhos.length > 0;
  const isExpanded = expanded.has(conta.id);
  const isSintetica = conta.classificacao === 'S';
  const indent = depth * 24;
  const grupoCfg = GRUPO_CFG[conta.grupo] || GRUPO_CFG.despesa;

  const rowBg = depth === 0 ? 'bg-gray-50/60' : isSintetica ? 'bg-gray-50/30' : '';

  return (
    <li>
      <div
        className={`relative flex items-center gap-2 pr-4 py-0.5 hover:bg-blue-50/30 transition-colors group ${rowBg}`}
        style={{ paddingLeft: 12 + indent, minHeight: depth === 0 ? 32 : 26 }}
      >
        {/* Linhas conectoras verticais/horizontais */}
        {depth > 0 && (
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: 12 + (depth - 1) * 24 + 10 }}>
            {!isLast && <div className="absolute top-0 bottom-0 w-px bg-gray-200" />}
            {isLast && <div className="absolute top-0 w-px bg-gray-200" style={{ height: '50%' }} />}
            <div className="absolute top-1/2 left-0 h-px w-3 bg-gray-200" />
          </div>
        )}

        {/* Expand/collapse */}
        <div className="w-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <button onClick={() => onToggle(conta.id)}
              className="h-5 w-5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-all">
              <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </motion.div>
            </button>
          ) : (
            <div className={`h-1.5 w-1.5 rounded-full ${isSintetica ? 'bg-slate-300' : 'bg-blue-300'}`} />
          )}
        </div>

        {/* Codigo */}
        <span className={`text-[11px] font-mono flex-shrink-0 whitespace-nowrap w-44 ${
          depth === 0 ? 'text-gray-900 font-bold'
            : isSintetica ? 'text-gray-700 font-semibold'
            : 'text-gray-400'
        }`}>
          {conta.codigo}
        </span>

        {/* Nome */}
        <span className={`truncate flex-1 min-w-0 ${
          depth === 0 ? 'text-[13px] font-bold text-gray-900 uppercase tracking-wide'
            : isSintetica ? 'text-[13px] font-semibold text-gray-800'
            : 'text-[13px] text-gray-700'
        }`}>
          {conta.nome}
        </span>

        {/* Badges */}
        {depth === 0 ? (
          <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 font-medium flex-shrink-0 ${grupoCfg.color}`}>
            {grupoCfg.label}
          </span>
        ) : (
          <>
            <span className={`text-[9px] rounded px-1.5 py-0.5 flex-shrink-0 font-mono font-semibold ${
              conta.natureza === 'devedora' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`} title={conta.natureza === 'devedora' ? 'Devedora' : 'Credora'}>
              {conta.natureza === 'devedora' ? 'D' : 'C'}
            </span>
            <span className={`text-[9px] rounded px-1.5 py-0.5 flex-shrink-0 ${
              isSintetica ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-600'
            }`} title={isSintetica ? 'Sintetica' : 'Analitica'}>
              {isSintetica ? 'S' : 'A'}
            </span>
          </>
        )}

        {!conta.ativo && (
          <span className="text-[9px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-500 flex-shrink-0">Inativa</span>
        )}

        {/* Acoes */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {isSintetica && (
            <button onClick={() => onAddChild(conta)} title="Adicionar sub-conta"
              className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => onEdit(conta)} title="Editar"
            className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(conta)} title="Excluir"
            className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filhos */}
      <AnimatePresence>
        {isExpanded && filhos.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}>
            {filhos.map((f, i) => (
              <ContaRow key={f.id} conta={f} depth={depth + 1} isLast={i === filhos.length - 1}
                expanded={expanded} getFilhos={getFilhos}
                onToggle={onToggle} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function ModalConta({ open, data, contas, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (data?.id) {
        setForm({ ...data });
      } else {
        setForm({
          nome: '', classificacao: 'A',
          grupo: data?.grupo || 'despesa',
          natureza: 'devedora',
          parent_id: data?.parent_id || '',
          ativo: true, observacoes: '',
        });
      }
    }
  }, [open, data]);

  // Natureza automatica: ativo/despesa/custo -> devedora, passivo/patrimonio/receita -> credora
  useEffect(() => {
    if (!form.grupo || form.id) return;
    const naturezaSugerida = ['ativo', 'despesa', 'custo'].includes(form.grupo) ? 'devedora' : 'credora';
    if (form.natureza !== naturezaSugerida) {
      setForm(f => ({ ...f, natureza: naturezaSugerida }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.grupo]);

  // Se escolheu parent, herda o grupo dele (sem gerar loop com o useEffect acima)
  useEffect(() => {
    if (form.id || !form.parent_id) return;
    const parent = contas.find(c => c.id === form.parent_id);
    if (parent && parent.grupo && parent.grupo !== form.grupo) {
      setForm(f => ({ ...f, grupo: parent.grupo }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.parent_id, contas]);

  // Codigo calculado em tempo real via useMemo (nao precisa esperar useEffect)
  const codigoPreview = useMemo(() => {
    if (form.id) return form.codigo || data?.codigo || '';
    const parent = form.parent_id ? contas.find(c => c.id === form.parent_id) : null;
    const grupoEfetivo = parent?.grupo || form.grupo;
    return proximoCodigoHierarquico(contas, grupoEfetivo, form.parent_id);
  }, [form.id, form.parent_id, form.grupo, form.codigo, contas, data]);

  // Permite escolher qualquer conta sintetica como pai
  const possiveisPais = contas
    .filter(c => c.classificacao === 'S' && c.id !== form.id)
    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

  const submit = async (e) => {
    e.preventDefault();
    const codigoFinal = codigoPreview || form.codigo;
    if (!codigoFinal?.trim() || !form.nome?.trim()) return;
    setSaving(true);
    try { await onSave({ ...form, codigo: codigoFinal }); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Conta' : 'Nova Conta'} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[11rem_1fr] gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Codigo</label>
            <input type="text" readOnly value={codigoPreview || ''}
              placeholder="—"
              title="Codigo gerado automaticamente a partir do grupo e da conta pai"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono bg-gray-50 text-gray-800 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" required value={form.nome || ''}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Ativo Nao Circulante"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Classificacao</label>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setForm(f => ({ ...f, classificacao: 'S' }))}
              className={`h-10 rounded-lg text-xs font-medium ${form.classificacao === 'S' ? 'bg-slate-100 border-2 border-slate-400 text-slate-800' : 'bg-gray-50 border-2 border-transparent text-gray-500'}`}>
              Sintetica (agrupa)
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, classificacao: 'A' }))}
              className={`h-10 rounded-lg text-xs font-medium ${form.classificacao === 'A' ? 'bg-blue-100 border-2 border-blue-400 text-blue-800' : 'bg-gray-50 border-2 border-transparent text-gray-500'}`}>
              Analitica (recebe lancto)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Grupo Contabil {form.parent_id && <span className="text-gray-400 font-normal">(herdado do pai)</span>}
          </label>
          <div className="grid grid-cols-3 gap-1">
            {[
              { v: 'ativo',      l: '1 Ativo',       c: 'blue' },
              { v: 'passivo',    l: '2 Passivo',     c: 'orange' },
              { v: 'patrimonio', l: '3 Patrimonio',  c: 'violet' },
              { v: 'custo',      l: '4 Custo',       c: 'amber' },
              { v: 'despesa',    l: '5 Despesa',     c: 'red' },
              { v: 'receita',    l: '6 Receita',     c: 'emerald' },
            ].map(g => {
              const active = form.grupo === g.v;
              const disabled = !!form.parent_id;
              const colors = {
                blue:    active ? 'bg-blue-100 border-blue-400 text-blue-800'          : 'bg-gray-50 text-gray-500',
                orange:  active ? 'bg-orange-100 border-orange-400 text-orange-800'    : 'bg-gray-50 text-gray-500',
                violet:  active ? 'bg-violet-100 border-violet-400 text-violet-800'    : 'bg-gray-50 text-gray-500',
                emerald: active ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'bg-gray-50 text-gray-500',
                amber:   active ? 'bg-amber-100 border-amber-400 text-amber-800'       : 'bg-gray-50 text-gray-500',
                red:     active ? 'bg-red-100 border-red-400 text-red-800'             : 'bg-gray-50 text-gray-500',
              };
              return (
                <button key={g.v} type="button" disabled={disabled}
                  onClick={() => !disabled && setForm(f => ({ ...f, grupo: g.v }))}
                  className={`h-10 rounded-lg text-xs font-medium border-2 ${active ? colors[g.c] : 'border-transparent'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  {g.l}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Natureza</label>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setForm(f => ({ ...f, natureza: 'devedora' }))}
              className={`h-10 rounded-lg text-xs font-medium ${form.natureza === 'devedora' ? 'bg-red-100 border-2 border-red-400 text-red-800' : 'bg-gray-50 border-2 border-transparent text-gray-500'}`}>
              Devedora (D)
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, natureza: 'credora' }))}
              className={`h-10 rounded-lg text-xs font-medium ${form.natureza === 'credora' ? 'bg-blue-100 border-2 border-blue-400 text-blue-800' : 'bg-gray-50 border-2 border-transparent text-gray-500'}`}>
              Credora (C)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Conta pai (opcional)</label>
          <select value={form.parent_id || ''}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">Raiz (conta de 1º nivel)</option>
            {possiveisPais.map(c => (
              <option key={c.id} value={c.id}>{c.codigo} - {c.nome}</option>
            ))}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">
            O codigo e gerado automaticamente: <strong>1.01.01.001.0001</strong> conforme a hierarquia.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.ativo !== false}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="rounded border-gray-300" />
            Ativa
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={saving || !codigoPreview?.trim() || !form.nome?.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
