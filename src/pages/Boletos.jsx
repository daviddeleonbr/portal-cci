import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Receipt, Copy, Eye, MoreHorizontal, Building2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../hooks/useSimulatedLoading';
import { boletos } from '../data/mockData';
import { formatCurrency, formatDate } from '../utils/format';

export default function Boletos() {
  const loading = useSimulatedLoading(500);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const filtered = boletos.filter(b => {
    if (statusFilter !== 'todos' && b.status !== statusFilter) return false;
    if (searchTerm && !b.cliente.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const totalPago = boletos.filter(b => b.status === 'pago').reduce((s, b) => s + b.valor, 0);
  const totalPendente = boletos.filter(b => b.status === 'pendente').reduce((s, b) => s + b.valor, 0);
  const totalVencido = boletos.filter(b => b.status === 'vencido').reduce((s, b) => s + b.valor, 0);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setModalOpen(false);
    showToast('success', 'Boleto gerado com sucesso!');
  };

  if (loading) return (
    <div>
      <PageHeader title="Boletos" description="Gestão de boletos - Banco Inter" />
      <TableSkeleton rows={6} cols={6} />
    </div>
  );

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Boletos" description="Gestão de boletos bancários - Banco Inter">
        <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-1.5">
          <Building2 className="h-4 w-4 text-orange-600" />
          <span className="text-xs font-medium text-orange-700">Banco Inter</span>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Gerar Boleto
        </button>
      </PageHeader>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Pagos</p>
          <p className="text-xl font-semibold text-emerald-600">{formatCurrency(totalPago)}</p>
          <p className="text-xs text-gray-400 mt-1">{boletos.filter(b => b.status === 'pago').length} boletos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Pendentes</p>
          <p className="text-xl font-semibold text-amber-600">{formatCurrency(totalPendente)}</p>
          <p className="text-xs text-gray-400 mt-1">{boletos.filter(b => b.status === 'pendente').length} boletos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Vencidos</p>
          <p className="text-xl font-semibold text-red-500">{formatCurrency(totalVencido)}</p>
          <p className="text-xs text-gray-400 mt-1">{boletos.filter(b => b.status === 'vencido').length} boletos</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b border-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9 w-64 rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            {['todos', 'pago', 'pendente', 'vencido'].map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  statusFilter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pagamento</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((boleto, i) => (
                <motion.tr
                  key={boleto.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono font-medium text-gray-900">{boleto.numero}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{boleto.cliente}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(boleto.dataVencimento)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(boleto.dataPagamento)}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(boleto.valor)}</td>
                  <td className="px-6 py-4 text-center"><StatusBadge status={boleto.status} /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDetailModal(boleto)}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => showToast('success', 'Linha digitavel copiada!')}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Copiar linha digitavel"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-50 text-sm text-gray-500">
          {filtered.length} boleto(s) encontrado(s)
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Detalhes do Boleto" size="sm">
        {detailModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-500">Número</p><p className="text-sm font-mono font-medium">{detailModal.numero}</p></div>
              <div><p className="text-xs text-gray-500">Status</p><div className="mt-0.5"><StatusBadge status={detailModal.status} /></div></div>
              <div><p className="text-xs text-gray-500">Cliente</p><p className="text-sm font-medium">{detailModal.cliente}</p></div>
              <div><p className="text-xs text-gray-500">Valor</p><p className="text-sm font-semibold">{formatCurrency(detailModal.valor)}</p></div>
              <div><p className="text-xs text-gray-500">Emissão</p><p className="text-sm">{formatDate(detailModal.dataEmissao)}</p></div>
              <div><p className="text-xs text-gray-500">Vencimento</p><p className="text-sm">{formatDate(detailModal.dataVencimento)}</p></div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Linha Digitavel</p>
              <p className="text-xs font-mono text-gray-700 break-all">23793.38128 60000.000003 00000.000400 1 87650000004500</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Gerar Boleto" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-100 flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-orange-600" />
            <span className="text-xs text-orange-700">Emissão via API Banco Inter (simulado)</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cliente</label>
            <select className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option>Tech Solutions Ltda</option>
              <option>Inovação SA</option>
              <option>Comércio Global</option>
              <option>Construções Lima</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor</label>
              <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="R$ 0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vencimento</label>
              <input type="date" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
            <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Referente a..." />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Gerar Boleto
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
