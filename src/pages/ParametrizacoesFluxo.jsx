import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Trash2, ChevronRight,
  Layers, Loader2, AlertCircle,
  FileSpreadsheet,
  ArrowLeft, Equal, FolderOpen, GripVertical,
  ArrowDownCircle, ArrowUpCircle,
  Sparkles, FileBarChart,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as fluxoService from '../services/mascaraFluxoCaixaService';

// ─── Tipos de linha no Fluxo de Caixa ─────────────────────
const TIPO_LINHA = {
  grupo:     { label: 'Grupo',     icon: FolderOpen,      color: 'text-gray-900',                bg: 'bg-slate-100 text-slate-700',     desc: 'Agrupa contas (ex: ATIVIDADES OPERACIONAIS)' },
  entrada:   { label: 'Entrada',   icon: ArrowDownCircle, color: 'text-emerald-700',             bg: 'bg-emerald-50 text-emerald-700',  desc: 'Entrada de caixa' },
  saida:     { label: 'Saida',     icon: ArrowUpCircle,   color: 'text-red-700',                 bg: 'bg-red-50 text-red-600',          desc: 'Saida de caixa' },
  subtotal:  { label: 'Subtotal',  icon: Equal,           color: 'text-blue-700 font-semibold',  bg: 'bg-purple-50 text-purple-700',    desc: 'Calculo intermediario (ex: = FLUXO OPERACIONAL)' },
  resultado: { label: 'Resultado', icon: Equal,           color: 'text-emerald-700 font-bold',   bg: 'bg-emerald-50 text-emerald-700',  desc: 'Resultado liquido (ex: = VARIACAO DE CAIXA)' },
};

// ═══════════════════════════════════════════════════════════
// Modelo padrao dropdown (Metodo Indireto | Metodo Direto)
// ═══════════════════════════════════════════════════════════
function ModeloDropdown({ onCriar, saving }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const itens = [
    {
      metodo: 'indireto',
      titulo: 'Metodo Indireto',
      descricao: 'Parte do Lucro Liquido e chega na variacao de caixa',
      icon: FileBarChart,
    },
    {
      metodo: 'direto',
      titulo: 'Metodo Direto',
      descricao: 'Mostra entradas e saidas de caixa diretamente',
      icon: ArrowDownCircle,
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} disabled={saving}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
        <Sparkles className="h-4 w-4 text-blue-600" /> Usar modelo padrao
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Modelos IFRS (linguagem simples)</p>
            </div>
            {itens.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.metodo}
                  onClick={() => { onCriar(item.metodo); setOpen(false); }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <Icon className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{item.titulo}</p>
                    <p className="text-[11px] text-gray-500 leading-snug">{item.descricao}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
export default function ParametrizacoesFluxo() {
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [mascaras, setMascaras] = useState([]);
  const [mascaraSelecionada, setMascaraSelecionada] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMascara, setModalMascara] = useState({ open: false, data: null });
  const [modalConfirm, setModalConfirm] = useState({ open: false, message: '', onConfirm: null });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const carregarMascaras = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fluxoService.listarMascaras();
      setMascaras(data || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar mascaras: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarGrupos = useCallback(async (mascaraId) => {
    try {
      const data = await fluxoService.listarGrupos(mascaraId);
      setGrupos(data || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar grupos');
    }
  }, []);

  useEffect(() => { carregarMascaras(); }, [carregarMascaras]);

  useEffect(() => {
    if (mascaraSelecionada) {
      carregarGrupos(mascaraSelecionada.id);
    }
  }, [mascaraSelecionada, carregarGrupos]);

  const salvarMascara = async (form) => {
    try {
      setSaving(true);
      if (form.id) {
        await fluxoService.atualizarMascara(form.id, { nome: form.nome, descricao: form.descricao });
        showToast('success', 'Mascara atualizada');
      } else {
        await fluxoService.criarMascara({ nome: form.nome, descricao: form.descricao });
        showToast('success', 'Mascara criada');
      }
      setModalMascara({ open: false, data: null });
      await carregarMascaras();
    } catch (err) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  const criarDoModelo = async (metodo) => {
    try {
      setSaving(true);
      await fluxoService.criarMascaraDoModeloPadrao(metodo);
      showToast('success', `Mascara criada a partir do modelo ${metodo}`);
      await carregarMascaras();
    } catch (err) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  const deletarMascara = async (id) => {
    try {
      await fluxoService.excluirMascara(id);
      if (mascaraSelecionada?.id === id) { setMascaraSelecionada(null); setGrupos([]); }
      showToast('success', 'Mascara excluida');
      await carregarMascaras();
    } catch (err) { showToast('error', err.message); }
  };

  const adicionarLinha = async (tipo, parentId = null, afterOrdem = null) => {
    try {
      setSaving(true);
      const ordem = afterOrdem != null ? afterOrdem + 1 : grupos.length + 1;
      // Entradas somam (sinal=1), saidas subtraem (sinal=-1). Demais tipos = 1.
      const sinal = tipo === 'saida' ? -1 : 1;
      await fluxoService.criarGrupo({
        mascara_id: mascaraSelecionada.id,
        nome: '',
        tipo,
        sinal,
        ordem,
        parent_id: parentId,
      });
      await carregarGrupos(mascaraSelecionada.id);
    } catch (err) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  const atualizarLinha = async (id, campos) => {
    try {
      await fluxoService.atualizarGrupo(id, campos);
      await carregarGrupos(mascaraSelecionada.id);
    } catch (err) { showToast('error', err.message); }
  };

  const deletarLinha = async (id) => {
    try {
      await fluxoService.excluirGrupo(id);
      await carregarGrupos(mascaraSelecionada.id);
      showToast('success', 'Linha removida');
    } catch (err) { showToast('error', err.message); }
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Mascaras Fluxo de Caixa" description="Configure a estrutura das mascaras de Fluxo de Caixa">
        {!mascaraSelecionada && (
          <div className="flex items-center gap-2">
            <ModeloDropdown onCriar={criarDoModelo} saving={saving} />
            <button onClick={() => setModalMascara({ open: true, data: null })}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Nova Mascara
            </button>
          </div>
        )}
      </PageHeader>

      {!mascaraSelecionada ? (
        <MascarasList mascaras={mascaras} loading={loading}
          onSelect={setMascaraSelecionada}
          onEdit={(m) => setModalMascara({ open: true, data: m })}
          onDelete={(m) => setModalConfirm({ open: true, message: `Excluir mascara "${m.nome}"?`, onConfirm: () => { deletarMascara(m.id); setModalConfirm({ open: false }); } })}
        />
      ) : (
        <FluxoTreeBuilder
          mascara={mascaraSelecionada}
          grupos={grupos}
          saving={saving}
          onBack={() => { setMascaraSelecionada(null); setGrupos([]); }}
          onAddLinha={adicionarLinha}
          onUpdateLinha={atualizarLinha}
          onDeleteLinha={(g) => setModalConfirm({ open: true, message: `Excluir "${g.nome || 'linha vazia'}"?`, onConfirm: () => { deletarLinha(g.id); setModalConfirm({ open: false }); } })}
        />
      )}

      <ModalMascara open={modalMascara.open} data={modalMascara.data} saving={saving}
        onClose={() => setModalMascara({ open: false, data: null })} onSave={salvarMascara} />

      <ModalConfirm open={modalConfirm.open} message={modalConfirm.message}
        onClose={() => setModalConfirm({ open: false })} onConfirm={modalConfirm.onConfirm} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Fluxo Tree Builder
// ═══════════════════════════════════════════════════════════
function FluxoTreeBuilder({ mascara, grupos, saving, onBack, onAddLinha, onUpdateLinha, onDeleteLinha }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [activeId, setActiveId] = useState(null);
  const inputRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const vazia = grupos.find(g => !g.nome && !editingId);
    if (vazia) {
      setEditingId(vazia.id);
      setEditValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [grupos, editingId]);

  useEffect(() => {
    const grupoIds = grupos.filter(g => g.tipo === 'grupo').map(g => g.id);
    setExpandedGrupos(new Set(grupoIds));
  }, [grupos]);

  const startEdit = (grupo) => {
    setEditingId(grupo.id);
    setEditValue(grupo.nome);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmEdit = async () => {
    if (editingId && editValue.trim()) {
      await onUpdateLinha(editingId, { nome: editValue.trim() });
    } else if (editingId && !editValue.trim()) {
      const grupo = grupos.find(g => g.id === editingId);
      if (grupo && !grupo.nome) await onDeleteLinha(grupo);
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
  };

  const toggleExpand = (id) => {
    setExpandedGrupos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const topLevel = grupos.filter(g => !g.parent_id).sort((a, b) => a.ordem - b.ordem);
  const getChildren = (parentId) => grupos.filter(g => g.parent_id === parentId).sort((a, b) => a.ordem - b.ordem);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const draggedItem = grupos.find(g => g.id === active.id);
    const targetItem = grupos.find(g => g.id === over.id);
    if (!draggedItem || !targetItem) return;
    if (draggedItem.parent_id !== targetItem.parent_id) return;

    const siblings = grupos
      .filter(g => g.parent_id === draggedItem.parent_id)
      .sort((a, b) => a.ordem - b.ordem);

    const oldIndex = siblings.findIndex(g => g.id === active.id);
    const newIndex = siblings.findIndex(g => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const updates = reordered.map((g, i) => ({ id: g.id, ordem: i + 1 }));
    try {
      await fluxoService.reordenarGrupos(updates);
      await onUpdateLinha(draggedItem.id, { ordem: newIndex + 1 });
    } catch (err) {
      console.error('Reorder failed:', err);
    }
  };

  const activeItem = activeId ? grupos.find(g => g.id === activeId) : null;

  const treeProps = {
    expandedGrupos, editingId, editValue, inputRef,
    onToggleExpand: toggleExpand, onStartEdit: startEdit, onEditChange: setEditValue,
    onConfirmEdit: confirmEdit, onKeyDown: handleKeyDown, onDelete: onDeleteLinha,
    onAddChild: (tipo, parentId, ordem) => onAddLinha(tipo, parentId, ordem),
    onUpdateLinha, getChildren,
    sensors,
  };

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{mascara.nome}</h2>
            <p className="text-xs text-gray-400">{grupos.length} linha(s)</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200/60 shadow-sm">

        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Layers className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-800">Estrutura do Fluxo de Caixa</span>
          </div>
          <AddLineDropdown onAdd={(tipo) => onAddLinha(tipo, null, grupos.length)} />
        </div>

        {grupos.length === 0 && !saving && (
          <div className="px-6 py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="h-7 w-7 text-gray-300" />
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Mascara vazia</h3>
            <p className="text-xs text-gray-400 mb-5 max-w-xs mx-auto leading-relaxed">
              Monte a estrutura do seu Fluxo de Caixa adicionando grupos, entradas, saidas e subtotais.
            </p>
            <button onClick={() => onAddLinha('grupo')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Adicionar primeiro grupo
            </button>
          </div>
        )}

        {grupos.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}>
            <div className="py-1">
              <SortableGroup items={topLevel} depth={0} {...treeProps} />
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
              {activeItem && <DragOverlayRow item={activeItem} />}
            </DragOverlay>
          </DndContext>
        )}

        {grupos.length > 0 && (
          <div className="mx-5 py-3 border-t border-gray-100 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-gray-900" />
            <span className="text-[11px] font-bold text-gray-900 uppercase tracking-widest">Variacao Liquida</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function SortableGroup({ items, depth, sensors, ...treeProps }) {
  const ids = items.map(g => g.id);
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {items.map((grupo, i) => (
        <SortableTreeRow key={grupo.id} grupo={grupo} depth={depth}
          children={treeProps.getChildren(grupo.id)}
          isLast={i === items.length - 1}
          sensors={sensors}
          {...treeProps} />
      ))}
    </SortableContext>
  );
}

function DragOverlayRow({ item }) {
  const tipo = TIPO_LINHA[item.tipo] || TIPO_LINHA.grupo;
  const isGrupo = item.tipo === 'grupo';
  const isCalc = item.tipo === 'subtotal' || item.tipo === 'resultado';
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-blue-200 shadow-xl opacity-95">
      <GripVertical className="h-3.5 w-3.5 text-blue-400" />
      <span className={`text-[13px] truncate ${
        isGrupo ? 'font-bold text-gray-900 uppercase' : isCalc ? 'font-semibold text-gray-700 uppercase' : 'text-gray-600'
      }`}>
        {isCalc ? '= ' : ''}{item.nome || 'Sem nome'}
      </span>
      <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tipo.bg}`}>
        {tipo.label}
      </span>
    </div>
  );
}

function SortableTreeRow({
  grupo, depth, children, isLast, sensors,
  expandedGrupos, editingId, editValue, inputRef,
  onToggleExpand, onStartEdit, onEditChange, onConfirmEdit, onKeyDown,
  onDelete, onAddChild, onUpdateLinha,
  getChildren
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: grupo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const tipo = TIPO_LINHA[grupo.tipo] || TIPO_LINHA.grupo;
  const isGrupo = grupo.tipo === 'grupo';
  const isCalc = grupo.tipo === 'subtotal' || grupo.tipo === 'resultado';
  const isResultado = grupo.tipo === 'resultado';
  const isEditing = editingId === grupo.id;
  const isExpanded = expandedGrupos.has(grupo.id);
  const indent = depth * 24;

  const rowBg = isResultado
    ? 'bg-gradient-to-r from-emerald-50/60 to-transparent'
    : isCalc
      ? 'bg-gradient-to-r from-slate-50/80 to-transparent'
      : isGrupo && depth === 0
        ? 'bg-gradient-to-r from-gray-50/50 to-transparent'
        : '';

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`relative flex items-center gap-1.5 pr-4 group/row transition-all duration-150 hover:bg-blue-50/30 ${rowBg}`}
        style={{ paddingLeft: 12 + indent, minHeight: isGrupo && depth === 0 ? 46 : isCalc ? 42 : 38 }}
      >
        <button {...attributes} {...listeners}
          className="flex-shrink-0 flex items-center justify-center h-6 w-5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-colors opacity-0 group-hover/row:opacity-100"
          title="Arrastar para reordenar">
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {depth > 0 && (
          <div className="absolute top-0 bottom-0" style={{ left: 12 + (depth - 1) * 24 + 14 }}>
            {!isLast && <div className="absolute top-0 bottom-0 w-px bg-gray-200" />}
            {isLast && <div className="absolute top-0 w-px bg-gray-200" style={{ height: '50%' }} />}
            <div className="absolute top-1/2 left-0 h-px w-3 bg-gray-200" />
          </div>
        )}

        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {isGrupo ? (
            <button onClick={() => onToggleExpand(grupo.id)}
              className="flex items-center justify-center h-5 w-5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </motion.div>
            </button>
          ) : isCalc ? (
            <span className="text-[10px] font-bold text-gray-400">=</span>
          ) : grupo.tipo === 'entrada' ? (
            <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-500" />
          ) : grupo.tipo === 'saida' ? (
            <ArrowUpCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input ref={inputRef} type="text" value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onConfirmEdit} onKeyDown={onKeyDown}
              placeholder="Digite o nome..."
              autoFocus
              className="w-full bg-white border border-blue-300 rounded-md outline-none px-2 py-1 text-[13px] focus:ring-2 focus:ring-blue-100 transition-shadow"
              style={{ textTransform: isGrupo || isCalc ? 'uppercase' : 'none' }}
            />
          ) : (
            <button onClick={() => onStartEdit(grupo)}
              className={`text-left w-full truncate py-0.5 transition-colors ${
                isGrupo && depth === 0
                  ? 'text-[13px] font-bold text-gray-900 uppercase tracking-wide'
                  : isGrupo
                    ? 'text-[13px] font-semibold text-gray-800 uppercase'
                    : isResultado
                      ? 'text-[13px] font-bold text-emerald-800 uppercase'
                      : isCalc
                        ? 'text-[13px] font-semibold text-gray-700 uppercase'
                        : 'text-[13px] text-gray-600'
              } hover:text-blue-600`}>
              {grupo.nome || <span className="text-gray-300 italic normal-case font-normal">Clique para nomear...</span>}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${tipo.bg}`}>
            {tipo.label}
          </span>

          {!isCalc && !isGrupo && (
            <button onClick={() => onUpdateLinha(grupo.id, { sinal: grupo.sinal === 1 ? -1 : 1 })}
              className={`text-[10px] font-bold font-mono rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0 transition-colors ${
                grupo.sinal === -1 ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }`}
              title={grupo.sinal === -1 ? 'Subtrai' : 'Soma'}>
              {grupo.sinal === -1 ? '\u2212' : '+'}
            </button>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {isGrupo && (
              <AddChildDropdown onAdd={(t) => onAddChild(t, grupo.id, getChildren(grupo.id).length)} />
            )}
            <button onClick={() => onDelete(grupo)}
              className="rounded-md p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isGrupo && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'visible' }}
          >
            <SortableGroup items={children} depth={depth + 1}
              sensors={sensors}
              expandedGrupos={expandedGrupos} editingId={editingId} editValue={editValue} inputRef={inputRef}
              onToggleExpand={onToggleExpand} onStartEdit={onStartEdit} onEditChange={onEditChange}
              onConfirmEdit={onConfirmEdit} onKeyDown={onKeyDown} onDelete={onDelete}
              onAddChild={onAddChild} onUpdateLinha={onUpdateLinha}
              getChildren={getChildren}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Add Line Dropdown (top-level)
// ═══════════════════════════════════════════════════════════
function AddLineDropdown({ onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { tipo: 'grupo',     label: 'Grupo',     desc: 'Categoria agrupadora',       icon: FolderOpen },
    { tipo: 'entrada',   label: 'Entrada',   desc: 'Entrada de caixa',           icon: ArrowDownCircle },
    { tipo: 'saida',     label: 'Saida',     desc: 'Saida de caixa',             icon: ArrowUpCircle },
    { tipo: 'subtotal',  label: 'Subtotal',  desc: 'Linha calculada (=)',        icon: Equal },
    { tipo: 'resultado', label: 'Resultado', desc: 'Resultado liquido final',    icon: Equal },
  ];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors">
        <Plus className="h-3.5 w-3.5" /> Adicionar Linha
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl border border-gray-100 shadow-xl z-50 overflow-hidden">
            {items.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.tipo} onClick={() => { onAdd(item.tipo); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Dropdown within a group row - opens same set of child types
function AddChildDropdown({ onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { tipo: 'grupo',    label: 'Sub-grupo', icon: FolderOpen },
    { tipo: 'entrada',  label: 'Entrada',   icon: ArrowDownCircle },
    { tipo: 'saida',    label: 'Saida',     icon: ArrowUpCircle },
    { tipo: 'subtotal', label: 'Subtotal',  icon: Equal },
  ];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        title="Adicionar filho">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-gray-100 shadow-lg z-50 overflow-hidden">
            {items.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.tipo} onClick={() => { onAdd(item.tipo); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 text-[12px] text-gray-700">
                  <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Mascaras List
// ═══════════════════════════════════════════════════════════
function MascarasList({ mascaras, loading, onSelect, onEdit, onDelete }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-5 w-40 bg-gray-100 rounded mb-3" />
            <div className="h-4 w-60 bg-gray-50 rounded mb-4" />
            <div className="h-4 w-24 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (mascaras.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100">
        <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma mascara criada</h3>
        <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
          Crie uma mascara de Fluxo de Caixa para configurar a estrutura do demonstrativo.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mascaras.map((m, i) => (
        <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className="bg-white rounded-xl border border-gray-100 p-6 hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer group"
          onClick={() => onSelect(m)}>
          <div className="flex items-start justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onEdit(m); }} className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(m); }} className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{m.nome}</h3>
          {m.descricao && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.descricao}</p>}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {m.grupos_fluxo_caixa?.[0]?.count || 0} linhas</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {m.ativo ? 'Ativa' : 'Inativa'}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modais
// ═══════════════════════════════════════════════════════════
function ModalMascara({ open, data, saving, onClose, onSave }) {
  const [form, setForm] = useState({ nome: '', descricao: '' });
  useEffect(() => {
    if (open) setForm(data ? { id: data.id, nome: data.nome, descricao: data.descricao || '' } : { nome: '', descricao: '' });
  }, [open, data]);

  return (
    <Modal open={open} onClose={onClose} title={data ? 'Editar Mascara' : 'Nova Mascara Fluxo de Caixa'} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
          <input type="text" required value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-shadow"
            placeholder="Ex: Fluxo Operacional - Postos" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Descricao</label>
          <textarea value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none transition-shadow"
            placeholder="Descricao opcional" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving || !form.nome.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {data ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalConfirm({ open, message, onClose, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title="Confirmar" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-sm text-gray-600 pt-2">{message}</p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Excluir</button>
        </div>
      </div>
    </Modal>
  );
}
