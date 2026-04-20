import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Shield, Mail, Phone, MoreHorizontal } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../hooks/useSimulatedLoading';
import { colaboradores } from '../data/mockData';

const permissaoLabels = {
  admin: { label: 'Admin', color: 'bg-red-50 text-red-700' },
  financeiro: { label: 'Financeiro', color: 'bg-blue-50 text-blue-700' },
  clientes: { label: 'Clientes', color: 'bg-purple-50 text-purple-700' },
  relatorios: { label: 'Relatorios', color: 'bg-emerald-50 text-emerald-700' },
  parametrizacoes: { label: 'Config', color: 'bg-amber-50 text-amber-700' },
  colaboradores: { label: 'Pessoas', color: 'bg-pink-50 text-pink-700' },
};

export default function Colaboradores() {
  const loading = useSimulatedLoading(500);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const filtered = colaboradores.filter(c =>
    !searchTerm || c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  if (loading) return (
    <div>
      <PageHeader title="Colaboradores" description="Gestao de equipe e permissoes" />
      <TableSkeleton rows={5} cols={5} />
    </div>
  );

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Colaboradores" description="Gestao de equipe e permissoes de acesso">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Colaborador
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-xl font-semibold">{colaboradores.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Ativos</p>
          <p className="text-xl font-semibold text-emerald-600">{colaboradores.filter(c => c.status === 'ativo').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Departamentos</p>
          <p className="text-xl font-semibold">{new Set(colaboradores.map(c => c.departamento)).size}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9 w-64 rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-4 text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Departamento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissoes</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((colab, i) => (
                <motion.tr
                  key={colab.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                  onClick={() => setDetailUser(colab)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-sm font-semibold">
                        {colab.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{colab.nome}</p>
                        <p className="text-xs text-gray-500">{colab.cargo}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{colab.departamento}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {colab.permissoes.slice(0, 3).map(p => (
                        <span key={p} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${permissaoLabels[p]?.color || 'bg-gray-50 text-gray-600'}`}>
                          {permissaoLabels[p]?.label || p}
                        </span>
                      ))}
                      {colab.permissoes.length > 3 && (
                        <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">
                          +{colab.permissoes.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={colab.status} />
                  </td>
                  <td className="px-6 py-4">
                    <button className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailUser} onClose={() => setDetailUser(null)} title="Detalhes do Colaborador" size="md">
        {detailUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-lg font-bold">
                {detailUser.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{detailUser.nome}</h3>
                <p className="text-sm text-gray-500">{detailUser.cargo} - {detailUser.departamento}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                {detailUser.email}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                {detailUser.telefone}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-semibold text-gray-900">Permissoes de Acesso</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(permissaoLabels).map(([key, val]) => {
                  const has = detailUser.permissoes.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                        has ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 bg-gray-50/50 opacity-50'
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                        has ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {has && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${has ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                        {val.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setDetailUser(null); showToast('success', 'Permissoes atualizadas!'); }}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Salvar Permissoes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Colaborador" size="md">
        <form onSubmit={(e) => { e.preventDefault(); setModalOpen(false); showToast('success', 'Colaborador cadastrado!'); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome Completo</label>
              <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Nome do colaborador" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Cargo</label>
              <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Cargo" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <input type="email" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="email@empresa.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Departamento</label>
              <select className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option>Contabilidade</option>
                <option>Fiscal</option>
                <option>Departamento Pessoal</option>
                <option>Financeiro</option>
                <option>Diretoria</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Cadastrar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
