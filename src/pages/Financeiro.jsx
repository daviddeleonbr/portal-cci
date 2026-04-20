import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Filter, ArrowUpCircle, ArrowDownCircle, MoreHorizontal, Download } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../hooks/useSimulatedLoading';
import { lancamentos } from '../data/mockData';
import { formatCurrency, formatDate } from '../utils/format';

export default function Financeiro() {
  const loading = useSimulatedLoading(500);
  const [filter, setFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const filtered = lancamentos.filter(l => {
    if (filter !== 'todos' && l.tipo !== filter) return false;
    if (searchTerm && !l.descricao.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const totalReceitas = lancamentos.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
  const totalDespesas = lancamentos.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setModalOpen(false);
    showToast('success', 'Lancamento criado com sucesso!');
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Financeiro" description="Gestao de receitas e despesas" />
        <TableSkeleton rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Financeiro" description="Gestao de receitas e despesas">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Lancamento
        </button>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Receitas</p>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(totalReceitas)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="rounded-lg bg-red-50 p-2.5">
            <ArrowDownCircle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Despesas</p>
            <p className="text-lg font-semibold text-red-500">{formatCurrency(totalDespesas)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <div className={`rounded-lg p-2.5 ${totalReceitas - totalDespesas >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
            <ArrowUpCircle className={`h-5 w-5 ${totalReceitas - totalDespesas >= 0 ? 'text-blue-600' : 'text-red-500'}`} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Saldo</p>
            <p className={`text-lg font-semibold ${totalReceitas - totalDespesas >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
              {formatCurrency(totalReceitas - totalDespesas)}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar lancamento..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-9 w-64 rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm text-gray-600 placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['todos', 'receita', 'despesa'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'todos' ? 'Todos' : f === 'receita' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
            <button className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition-colors">
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descricao</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {filtered.map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-full p-1 ${item.tipo === 'receita' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          {item.tipo === 'receita'
                            ? <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                            : <ArrowDownCircle className="h-4 w-4 text-red-400" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.descricao}</p>
                          {item.cliente && <p className="text-xs text-gray-500">{item.cliente}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.categoria}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(item.data)}</td>
                    <td className={`px-6 py-4 text-sm font-semibold text-right ${item.tipo === 'receita' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {item.tipo === 'receita' ? '+' : '-'} {formatCurrency(item.valor)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-gray-50 text-sm text-gray-500">
          {filtered.length} lancamento(s) encontrado(s)
        </div>
      </div>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Lancamento" size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
            <select className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descricao</label>
            <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Descricao do lancamento" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor</label>
              <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="R$ 0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Data</label>
              <input type="date" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria</label>
            <select className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option>Servicos Contabeis</option>
              <option>Consultoria</option>
              <option>Pessoal</option>
              <option>Aluguel</option>
              <option>Tecnologia</option>
              <option>Impostos</option>
              <option>Outros</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cliente (opcional)</label>
            <select className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Nenhum</option>
              <option>Tech Solutions Ltda</option>
              <option>Inovacao SA</option>
              <option>Comercio Global</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Salvar Lancamento
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
