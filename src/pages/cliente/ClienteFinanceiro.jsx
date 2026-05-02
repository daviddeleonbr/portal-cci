import { useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Download, Copy, Eye, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../../hooks/useSimulatedLoading';
import { clienteBoletos } from '../../data/clienteMockData';
import { useClienteSession } from '../../hooks/useAuth';
import { formatCurrency, formatDate } from '../../utils/format';

export default function ClienteFinanceiro() {
  const loading = useSimulatedLoading(500);
  const [detailBoleto, setDetailBoleto] = useState(null);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const session = useClienteSession();
  const nomeCliente = session?.cliente?.nome || 'Cliente';

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const totalPago = clienteBoletos.filter(b => b.status === 'pago').reduce((s, b) => s + b.valor, 0);
  const totalPendente = clienteBoletos.filter(b => b.status === 'pendente').reduce((s, b) => s + b.valor, 0);

  if (loading) return (
    <div>
      <PageHeader title="Financeiro" description="Boletos e pagamentos" />
      <TableSkeleton rows={5} cols={4} />
    </div>
  );

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Financeiro" description="Gerencie seus boletos e acompanhe pagamentos" />

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3"><CheckCircle className="h-6 w-6 text-emerald-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Pago</p>
            <p className="text-xl font-semibold text-emerald-600">{formatCurrency(totalPago)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{clienteBoletos.filter(b => b.status === 'pago').length} boletos</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
          <div className="rounded-xl bg-amber-50 p-3"><Clock className="h-6 w-6 text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Pendente</p>
            <p className="text-xl font-semibold text-amber-600">{formatCurrency(totalPendente)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{clienteBoletos.filter(b => b.status === 'pendente').length} boletos</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
          <div className="rounded-xl bg-blue-50 p-3"><Receipt className="h-6 w-6 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Mensalidade Atual</p>
            <p className="text-xl font-semibold text-gray-900">R$ 4.500,00</p>
            <p className="text-xs text-gray-400 mt-0.5">Venc. dia 10 de cada mês</p>
          </div>
        </div>
      </div>

      {/* Boletos List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Seus Boletos</h3>
        </div>

        <div className="divide-y divide-gray-50">
          {clienteBoletos.map((boleto, i) => (
            <motion.div
              key={boleto.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors"
            >
              <div className={`rounded-full p-2 ${
                boleto.status === 'pago' ? 'bg-emerald-50' : boleto.status === 'pendente' ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                {boleto.status === 'pago'
                  ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                  : boleto.status === 'pendente'
                  ? <Clock className="h-5 w-5 text-amber-500" />
                  : <AlertTriangle className="h-5 w-5 text-red-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{boleto.descricao}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  <span>Venc: {formatDate(boleto.vencimento)}</span>
                  {boleto.pagamento && <span>Pago: {formatDate(boleto.pagamento)}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(boleto.valor)}</p>
                <StatusBadge status={boleto.status} />
              </div>
              <div className="flex items-center gap-1">
                {boleto.status === 'pendente' && (
                  <>
                    <button
                      onClick={() => showToast('success', 'Linha digitavel copiada!')}
                      className="rounded-lg p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      title="Copiar linha digitavel"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => showToast('success', 'Download do boleto iniciado!')}
                      className="rounded-lg p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      title="Baixar boleto"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailBoleto(boleto)}
                  className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailBoleto} onClose={() => setDetailBoleto(null)} title="Detalhes do Boleto" size="sm">
        {detailBoleto && (
          <div className="space-y-4">
            <div className="text-center pb-4 border-b border-gray-100">
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(detailBoleto.valor)}</p>
              <div className="mt-2"><StatusBadge status={detailBoleto.status} /></div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Descrição</span>
                <span className="font-medium text-gray-900">{detailBoleto.descricao}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Vencimento</span>
                <span className="font-medium">{formatDate(detailBoleto.vencimento)}</span>
              </div>
              {detailBoleto.pagamento && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pagamento</span>
                  <span className="font-medium text-emerald-600">{formatDate(detailBoleto.pagamento)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Empresa</span>
                <span className="font-medium">{nomeCliente}</span>
              </div>
            </div>
            {detailBoleto.status === 'pendente' && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Linha Digitavel</p>
                <p className="text-xs font-mono text-gray-700 break-all">23793.38128 60000.000003 00000.000400 1 87650000004500</p>
              </div>
            )}
            {detailBoleto.status === 'pendente' && (
              <div className="flex gap-3">
                <button
                  onClick={() => { setDetailBoleto(null); showToast('success', 'Linha copiada!'); }}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="h-4 w-4" /> Copiar
                </button>
                <button
                  onClick={() => { setDetailBoleto(null); showToast('success', 'Download iniciado!'); }}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" /> Baixar PDF
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
