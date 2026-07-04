// Contratos — gestão interna de contratos com clientes.
// 3 abas:
//   • Ativos              — contratos em vigor (placeholder)
//   • Propostas           — propostas em negociação (placeholder)
//   • Serviços oferecidos — catálogo de serviços que a CCI presta (ativo)

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileCheck, FileText, Briefcase, AlertCircle, Calculator,
  Plus, Search, Pencil, Trash2, CheckCircle2, Pause, Play, Loader2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { formatCurrency } from '../utils/format';
import * as servicosService from '../services/servicosOferecidosService';
import AbaPropostas from './contratos/AbaPropostas';
import AbaPrecificacao from './contratos/AbaPrecificacao';
import AbaRascunhos from './contratos/AbaRascunhos';

const TABS = [
  { key: 'ativos',        label: 'Ativos',              icon: FileCheck  },
  { key: 'rascunhos',     label: 'Rascunhos',           icon: Pencil     },
  { key: 'propostas',     label: 'Propostas',           icon: FileText   },
  { key: 'servicos',      label: 'Serviços oferecidos', icon: Briefcase  },
  { key: 'precificacao',  label: 'Precificação',        icon: Calculator },
];

export default function Contratos() {
  const [aba, setAba] = useState('ativos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader
        title="Contratos"
        description="Contratos ativos, propostas em negociação e catálogo de serviços oferecidos"
      />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden">
        {TABS.map(t => {
          const Icon = t.icon;
          const ativo = aba === t.key;
          return (
            <button key={t.key} onClick={() => setAba(t.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                ativo ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {t.label}
              </span>
              {ativo && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
            </button>
          );
        })}
      </div>

      {aba === 'ativos'       && <Placeholder titulo="Contratos ativos" descricao="Liste aqui os contratos em vigor com cada cliente." />}
      {aba === 'rascunhos'    && <AbaRascunhos showToast={showToast} />}
      {aba === 'propostas'    && <AbaPropostas showToast={showToast} />}
      {aba === 'servicos'     && <AbaServicos showToast={showToast} />}
      {aba === 'precificacao' && <AbaPrecificacao showToast={showToast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Placeholder (Ativos, Propostas — virão depois)
// ═══════════════════════════════════════════════════════════
function Placeholder({ titulo, descricao }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 p-10 text-center shadow-sm">
      <div className="h-12 w-12 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
        <FileText className="h-6 w-6 text-blue-500" />
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-1">{titulo}</p>
      <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">{descricao}</p>
      <div className="inline-flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
        <AlertCircle className="h-3.5 w-3.5" /> Recurso em desenvolvimento
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Aba: Serviços oferecidos — catálogo CRUD
// ═══════════════════════════════════════════════════════════
const CATEGORIA_STYLE = {
  consultoria:  'bg-blue-50    text-blue-700    border-blue-200',
  bpo:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  fiscal:       'bg-amber-50   text-amber-700   border-amber-200',
  tecnologia:   'bg-violet-50  text-violet-700  border-violet-200',
  treinamento:  'bg-rose-50    text-rose-700    border-rose-200',
  outro:        'bg-gray-100   text-gray-600    border-gray-200',
};

function AbaServicos({ showToast }) {
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [modal, setModal] = useState({ open: false, data: null });

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await servicosService.listarServicos();
      setServicos(data);
    } catch (err) {
      showToast('error', 'Erro ao carregar serviços: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (dados) => {
    try {
      await servicosService.salvarServico(dados);
      showToast('success', dados.id ? 'Serviço atualizado' : 'Serviço cadastrado');
      setModal({ open: false, data: null });
      await carregar();
    } catch (err) {
      showToast('error', err.message);
      throw err;
    }
  };

  const togglerAtivo = async (s) => {
    try {
      await servicosService.alternarAtivo(s.id, !s.ativo);
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const remover = async (s) => {
    if (!confirm(`Remover o serviço "${s.nome}"?`)) return;
    try {
      await servicosService.excluirServico(s.id);
      showToast('success', 'Serviço removido');
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = servicos.filter(s => {
    if (filtroCategoria !== 'todas' && s.categoria !== filtroCategoria) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!s.nome?.toLowerCase().includes(q) && !s.descricao?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header da aba */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Catálogo de serviços</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Cadastre uma vez e reuse em propostas e contratos.
          </p>
        </div>
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo serviço
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou descrição…"
            className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todas">Todas as categorias</option>
          {servicosService.CATEGORIAS.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtrados.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Nenhum serviço cadastrado</p>
            <p className="text-xs text-gray-400">Clique em "Novo serviço" para cadastrar o primeiro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left  px-6 py-3 font-medium">Serviço</th>
                  <th className="text-left  px-6 py-3 font-medium">Categoria</th>
                  <th className="text-right px-6 py-3 font-medium">Valor</th>
                  <th className="text-left  px-6 py-3 font-medium">Periodicidade</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((s, i) => {
                  const cat = servicosService.metaCategoria(s.categoria);
                  const per = servicosService.metaPeriodicidade(s.periodicidade);
                  return (
                    <motion.tr key={s.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                        {s.descricao && <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">{s.descricao}</p>}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${CATEGORIA_STYLE[s.categoria] || CATEGORIA_STYLE.outro}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(Number(s.valor || 0))}
                        {s.tipo_valor === 'unitario' && (
                          <span className="ml-1 text-[10.5px] font-normal text-gray-400">/ {s.unidade || 'un'}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {per.label}
                        <span className="block text-[10px] text-gray-400">
                          {s.tipo_valor === 'unitario' ? `Por ${s.unidade || 'unidade'}` : 'Valor fixo'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          s.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {s.ativo ? <CheckCircle2 className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                          {s.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => togglerAtivo(s)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title={s.ativo ? 'Inativar' : 'Reativar'}>
                            {s.ativo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => setModal({ open: true, data: s })}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remover(s)}
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

      <ModalServico
        open={modal.open}
        servico={modal.data}
        onClose={() => setModal({ open: false, data: null })}
        onSave={salvar}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: criar / editar serviço
// ═══════════════════════════════════════════════════════════
function ModalServico({ open, servico, onClose, onSave }) {
  const [form, setForm] = useState({
    nome: '', descricao: '', categoria: 'consultoria',
    valor: '', periodicidade: 'mensal', tipo_valor: 'fixo', unidade: '',
    ativo: true, observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (servico) {
      setForm({
        ...servico,
        valor: String(servico.valor ?? ''),
        tipo_valor: servico.tipo_valor || 'fixo',
        unidade:    servico.unidade    || '',
      });
    } else {
      setForm({
        nome: '', descricao: '', categoria: 'consultoria',
        valor: '', periodicidade: 'mensal', tipo_valor: 'fixo', unidade: '',
        ativo: true, observacoes: '',
      });
    }
  }, [open, servico]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await onSave({ ...form, valor: parseFloat(form.valor) || 0 });
    } catch { /* handled */ } finally { setSalvando(false); }
  };

  const isEdit = !!servico?.id;

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Editar serviço' : 'Novo serviço oferecido'}
      size="md"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button type="submit" form="form-servico" disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </div>
      )}
    >
      <form id="form-servico" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nome do serviço *</label>
          <input type="text" required value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Consultoria DRE mensal"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
          <textarea rows={2} value={form.descricao || ''}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="O que está incluído nesse serviço?"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoria *</label>
            <select required value={form.categoria}
              onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {servicosService.CATEGORIAS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Periodicidade *</label>
            <select required value={form.periodicidade}
              onChange={e => setForm(f => ({ ...f, periodicidade: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {servicosService.PERIODICIDADES.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Tipo de cobrança — fixo vs por unidade */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de cobrança *</label>
            <div className="grid grid-cols-2 gap-2">
              {servicosService.TIPOS_VALOR.map(t => (
                <button key={t.key} type="button"
                  onClick={() => setForm(f => ({ ...f, tipo_valor: t.key }))}
                  className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                    form.tipo_valor === t.key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {t.label}
                  <span className="block text-[10.5px] font-normal mt-0.5 text-gray-500">
                    {t.key === 'fixo' ? 'Ex: consultoria R$ 2.500/mês' : 'Ex: R$ 5 por nota fiscal'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Valor (label dinâmico) + unidade quando unitário */}
          {form.tipo_valor === 'fixo' ? (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Valor de referência (R$)</label>
              <input type="number" step="0.01" value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="0,00"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <p className="text-[10.5px] text-gray-400 mt-0.5">
                Valor total no período — pode ser ajustado em cada proposta.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Valor por unidade (R$)</label>
                <input type="number" step="0.01" value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Unidade *</label>
                <input type="text" value={form.unidade}
                  onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                  placeholder="nota, hora, lançamento…"
                  required={form.tipo_valor === 'unitario'}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="col-span-2">
                <p className="text-[10.5px] text-gray-400 -mt-1">
                  Cobrança proporcional: valor × quantidade. Em cada proposta você informa
                  quantas unidades.
                </p>
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
          <textarea rows={2} value={form.observacoes || ''}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            placeholder="Notas internas sobre o serviço (não aparecem em proposta)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.ativo}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Serviço ativo (disponível pra selecionar em propostas)
          </label>
        </div>
      </form>
    </Modal>
  );
}
