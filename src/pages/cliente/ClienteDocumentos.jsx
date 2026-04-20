import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, FileText, File, FileArchive, FolderOpen, Filter } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import { TableSkeleton } from '../../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../../hooks/useSimulatedLoading';
import { clienteDocumentos } from '../../data/clienteMockData';
import { formatDate } from '../../utils/format';

const tipoIcons = {
  PDF: FileText,
  ZIP: FileArchive,
  TXT: File,
};

const tipoCores = {
  Contabil: 'bg-blue-50 text-blue-700',
  Fiscal: 'bg-purple-50 text-purple-700',
  DP: 'bg-amber-50 text-amber-700',
  Societario: 'bg-emerald-50 text-emerald-700',
  Certidoes: 'bg-cyan-50 text-cyan-700',
};

export default function ClienteDocumentos() {
  const loading = useSimulatedLoading(500);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const tipos = ['todos', ...new Set(clienteDocumentos.map(d => d.tipo))];

  const filtered = clienteDocumentos.filter(d => {
    if (tipoFilter !== 'todos' && d.tipo !== tipoFilter) return false;
    if (searchTerm && !d.nome.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const showToast = () => {
    setToast({ show: true, type: 'success', message: 'Download iniciado!' });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2000);
  };

  if (loading) return (
    <div>
      <PageHeader title="Documentos" description="Seus documentos contabeis e fiscais" />
      <TableSkeleton rows={6} cols={4} />
    </div>
  );

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Documentos" description="Acesse todos os documentos gerados pela CCI Consultoria" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {tipos.filter(t => t !== 'todos').map(tipo => (
          <button
            key={tipo}
            onClick={() => setTipoFilter(tipoFilter === tipo ? 'todos' : tipo)}
            className={`bg-white rounded-xl border p-3 text-center transition-all ${
              tipoFilter === tipo ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-100 hover:border-gray-200'
            }`}
          >
            <p className="text-lg font-semibold text-gray-900">
              {clienteDocumentos.filter(d => d.tipo === tipo).length}
            </p>
            <p className="text-xs text-gray-500">{tipo}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar documento..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
            />
          </div>
          {tipoFilter !== 'todos' && (
            <button
              onClick={() => setTipoFilter('todos')}
              className="rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Limpar filtro
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {filtered.map((doc, i) => {
            const Icon = tipoIcons[doc.formato] || FileText;
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors group"
              >
                <div className="rounded-lg bg-gray-50 p-2.5">
                  <Icon className="h-5 w-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${tipoCores[doc.tipo] || 'bg-gray-50 text-gray-600'}`}>
                      {doc.tipo}
                    </span>
                    <span className="text-xs text-gray-400">{doc.formato} - {doc.tamanho}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400 hidden sm:block">{formatDate(doc.data)}</span>
                <button
                  onClick={showToast}
                  className="rounded-lg p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Download className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <FolderOpen className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">Nenhum documento encontrado</p>
            <p className="text-xs text-gray-500 mt-1">Tente ajustar os filtros de busca</p>
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-50 text-sm text-gray-500">
          {filtered.length} documento(s)
        </div>
      </div>
    </div>
  );
}
