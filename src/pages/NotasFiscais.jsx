import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, FileText, Download, ExternalLink, Settings,
  Loader2, RefreshCw, CheckCircle2, AlertCircle, XCircle,
  Ban, Key, Clock, Eye
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../utils/format';
import * as asaasApi from '../services/asaasApiService';
import * as asaasConfig from '../services/asaasConfigService';

const STATUS_CONFIG = {
  PENDING:                   { label: 'Aguardando', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  SCHEDULED:                 { label: 'Agendada',   color: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Clock },
  SYNCHRONIZED:              { label: 'Sincronizada', color: 'bg-blue-50 text-blue-700 border-blue-200',   icon: CheckCircle2 },
  AUTHORIZED:                { label: 'Autorizada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  PROCESSING_CANCELLATION:   { label: 'Cancelando', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: Loader2 },
  CANCELED:                  { label: 'Cancelada',  color: 'bg-gray-100 text-gray-600 border-gray-200',    icon: Ban },
  CANCELLATION_DENIED:       { label: 'Canc. Negado', color: 'bg-red-50 text-red-700 border-red-200',      icon: XCircle },
  ERROR:                     { label: 'Erro',       color: 'bg-red-50 text-red-700 border-red-200',        icon: XCircle },
  PROCESSING:                { label: 'Processando', color: 'bg-blue-50 text-blue-700 border-blue-200',    icon: Loader2 },
};

export default function NotasFiscais() {
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [notas, setNotas] = useState([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [modalEmit, setModalEmit] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalDetail, setModalDetail] = useState({ open: false, nota: null });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const carregarConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const data = await asaasConfig.buscarConfigAtiva();
      setConfig(data);
    } catch (err) {
      showToast('error', 'Erro ao carregar config: ' + err.message);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const carregarNotas = useCallback(async () => {
    if (!config) return;
    try {
      setLoadingNotas(true);
      const data = await asaasConfig.listarNotas(config.id);
      setNotas(data || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar notas');
    } finally {
      setLoadingNotas(false);
    }
  }, [config]);

  useEffect(() => { carregarConfig(); }, [carregarConfig]);
  useEffect(() => { if (config) carregarNotas(); }, [config, carregarNotas]);

  // Sincroniza com o Asaas (busca notas recentes e atualiza cache local)
  const sincronizarComAsaas = async () => {
    if (!config) return;
    try {
      setSyncing(true);
      const resp = await asaasApi.listarInvoices(config.ambiente, config.api_key, { limit: 100 });
      const invoices = resp?.data || [];
      for (const inv of invoices) {
        await asaasConfig.salvarNota(config.id, inv);
      }
      showToast('success', `${invoices.length} nota(s) sincronizada(s)`);
      await carregarNotas();
    } catch (err) {
      showToast('error', 'Erro na sincronizacao: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const emitirNota = async (form) => {
    try {
      // 1. Encontrar/criar customer no Asaas
      const customer = await asaasApi.encontrarOuCriarCustomer(config.ambiente, config.api_key, {
        name: form.cliente_nome,
        cpfCnpj: form.cliente_cnpj,
        email: form.cliente_email || undefined,
      });
      await asaasConfig.salvarCustomer(config.id, {
        asaas_customer_id: customer.id,
        cliente_nome: customer.name,
        cliente_cnpj: customer.cpfCnpj,
        email: customer.email,
      });

      // 2. Criar invoice
      const invoice = await asaasApi.criarInvoice(config.ambiente, config.api_key, {
        customer: customer.id,
        serviceDescription: form.descricao,
        observations: form.observacoes || config.observacoes_padrao || '',
        value: parseFloat(form.valor),
        deductions: parseFloat(form.deducoes || 0),
        effectiveDate: form.data_emissao,
        municipalServiceId: form.municipio_servico_id || config.municipio_servico_id,
        municipalServiceCode: form.municipio_servico_codigo || config.municipio_servico_codigo,
        municipalServiceName: form.municipio_servico_descricao || config.municipio_servico_descricao,
        taxes: {
          iss: parseFloat(form.aliquota_iss || config.aliquota_iss || 0),
          retainedIss: false,
        },
      });

      // 3. Salvar no cache local
      await asaasConfig.salvarNota(config.id, invoice);
      showToast('success', 'Nota fiscal agendada com sucesso!');
      setModalEmit(false);
      await carregarNotas();
    } catch (err) {
      showToast('error', 'Erro: ' + err.message);
      throw err;
    }
  };

  const cancelarNota = async (nota) => {
    try {
      await asaasApi.cancelarInvoice(config.ambiente, config.api_key, nota.asaas_invoice_id);
      showToast('success', 'Cancelamento solicitado');
      await sincronizarComAsaas();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const filtered = notas.filter(n => {
    if (statusFilter !== 'todos' && n.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!n.cliente_nome?.toLowerCase().includes(q) &&
          !n.numero?.toLowerCase().includes(q) &&
          !n.servico_descricao?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalAutorizadas = notas.filter(n => n.status === 'AUTHORIZED').reduce((s, n) => s + Number(n.valor), 0);
  const totalPendentes = notas.filter(n => ['PENDING', 'SCHEDULED', 'SYNCHRONIZED', 'PROCESSING'].includes(n.status)).reduce((s, n) => s + Number(n.valor), 0);

  // ─── Empty state: no config ─────────────────────────────
  if (loadingConfig) {
    return (
      <div>
        <PageHeader title="Notas Fiscais" description="Emissão de NFS-e via Asaas" />
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  if (!config) {
    return (
      <div>
        <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
        <PageHeader title="Notas Fiscais" description="Emissão de NFS-e via Asaas" />

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 p-10 text-center shadow-sm">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <Key className="h-7 w-7 text-amber-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Configure o Asaas</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
            Para emitir notas fiscais de serviço (NFS-e), cadastre suas credenciais da API do Asaas. Você pode usar o ambiente sandbox para testes.
          </p>
          <button onClick={() => setModalConfig(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Settings className="h-4 w-4" /> Configurar Asaas
          </button>
        </motion.div>

        <ModalConfig open={modalConfig} config={null}
          onClose={() => setModalConfig(false)}
          onSaved={() => { setModalConfig(false); carregarConfig(); }}
          showToast={showToast}
        />
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Notas Fiscais" description={`Emissão via Asaas ${config.ambiente === 'sandbox' ? '(Sandbox)' : ''}`}>
        <div className="flex items-center gap-2">
          <button onClick={() => setModalConfig(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Configurações">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={sincronizarComAsaas} disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar
          </button>
          <button onClick={() => setModalEmit(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Emitir Nota
          </button>
        </div>
      </PageHeader>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <KpiCard label="Total Emitidas" value={notas.filter(n => n.status === 'AUTHORIZED').length} icon={CheckCircle2} color="emerald" />
        <KpiCard label="Valor Autorizado" value={formatCurrency(totalAutorizadas)} icon={FileText} color="blue" />
        <KpiCard label="Valor Pendente" value={formatCurrency(totalPendentes)} icon={Clock} color="amber" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, número ou descrição..."
            className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
        {loadingNotas ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Nenhuma nota encontrada</p>
            <p className="text-xs text-gray-400">Clique em "Emitir Nota" para criar a primeira NFS-e</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left px-6 py-3 font-medium">Número</th>
                  <th className="text-left px-6 py-3 font-medium">Cliente</th>
                  <th className="text-left px-6 py-3 font-medium">Descrição</th>
                  <th className="text-right px-6 py-3 font-medium">Valor</th>
                  <th className="text-left px-6 py-3 font-medium">Emissão</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((n, i) => {
                  const statusConf = STATUS_CONFIG[n.status] || STATUS_CONFIG.PENDING;
                  const StatusIcon = statusConf.icon;
                  const isCancelavel = ['AUTHORIZED', 'SCHEDULED', 'PENDING'].includes(n.status);
                  return (
                    <motion.tr key={n.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-3">
                        <span className="font-mono text-xs text-gray-600">
                          {n.numero || <span className="italic text-gray-400">sem número</span>}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-900">{n.cliente_nome}</p>
                        {n.cliente_cnpj && <p className="text-xs text-gray-400 font-mono">{n.cliente_cnpj}</p>}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600 max-w-xs truncate">{n.servico_descricao}</td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatCurrency(Number(n.valor))}</td>
                      <td className="px-6 py-3 text-xs text-gray-600">{formatDate(n.data_emissao)}</td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusConf.color}`}>
                            <StatusIcon className={`h-3 w-3 ${n.status === 'PROCESSING_CANCELLATION' || n.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                            {statusConf.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModalDetail({ open: true, nota: n })}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Ver detalhes">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {n.pdf_url && (
                            <a href={n.pdf_url} target="_blank" rel="noopener noreferrer"
                              className="rounded-md p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Baixar PDF">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {isCancelavel && (
                            <button onClick={() => cancelarNota(n)}
                              className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancelar">
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
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

      {/* Modals */}
      <ModalEmitir open={modalEmit} config={config}
        onClose={() => setModalEmit(false)}
        onEmit={emitirNota}
      />
      <ModalConfig open={modalConfig} config={config}
        onClose={() => setModalConfig(false)}
        onSaved={() => { setModalConfig(false); carregarConfig(); }}
        showToast={showToast}
      />
      <ModalDetail open={modalDetail.open} nota={modalDetail.nota}
        onClose={() => setModalDetail({ open: false, nota: null })}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════
function KpiCard({ label, value, icon: Icon, color }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Emitir Nota
// ═══════════════════════════════════════════════════════════
function ModalEmitir({ open, config, onClose, onEmit }) {
  const [form, setForm] = useState({
    cliente_nome: '', cliente_cnpj: '', cliente_email: '',
    descricao: '', observacoes: '',
    valor: '', deducoes: '0',
    data_emissao: new Date().toISOString().split('T')[0],
    aliquota_iss: '',
    municipio_servico_id: '',
    municipio_servico_codigo: '',
    municipio_servico_descricao: '',
  });
  const [emitting, setEmitting] = useState(false);

  useEffect(() => {
    if (open && config) {
      setForm(f => ({
        ...f,
        cliente_nome: '', cliente_cnpj: '', cliente_email: '',
        descricao: '', observacoes: '',
        valor: '', deducoes: '0',
        data_emissao: new Date().toISOString().split('T')[0],
        aliquota_iss: config.aliquota_iss || '',
        municipio_servico_id: config.municipio_servico_id || '',
        municipio_servico_codigo: config.municipio_servico_codigo || '',
        municipio_servico_descricao: config.municipio_servico_descricao || '',
      }));
    }
  }, [open, config]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmitting(true);
    try {
      await onEmit(form);
    } catch (_) { /* handled by parent */ }
    finally { setEmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Emitir Nota Fiscal" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Cliente */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Tomador do Serviço</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome / Razão Social *</label>
              <input type="text" required value={form.cliente_nome}
                onChange={(e) => setForm(f => ({ ...f, cliente_nome: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CPF/CNPJ *</label>
              <input type="text" required value={form.cliente_cnpj}
                onChange={(e) => setForm(f => ({ ...f, cliente_cnpj: e.target.value }))}
                placeholder="apenas números"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.cliente_email}
                onChange={(e) => setForm(f => ({ ...f, cliente_email: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
        </div>

        {/* Servico */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Serviço</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descrição do serviço *</label>
              <textarea required value={form.descricao} rows={3}
                onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" required value={form.valor}
                onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data de emissão *</label>
              <input type="date" required value={form.data_emissao}
                onChange={(e) => setForm(f => ({ ...f, data_emissao: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Deducoes (R$)</label>
              <input type="number" step="0.01" value={form.deducoes}
                onChange={(e) => setForm(f => ({ ...f, deducoes: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Aliquota ISS (%)</label>
              <input type="number" step="0.01" value={form.aliquota_iss}
                onChange={(e) => setForm(f => ({ ...f, aliquota_iss: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
        </div>

        {/* Servico Municipal */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Serviço Municipal</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ID Serviço</label>
              <input type="text" value={form.municipio_servico_id}
                onChange={(e) => setForm(f => ({ ...f, municipio_servico_id: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
              <input type="text" value={form.municipio_servico_codigo}
                onChange={(e) => setForm(f => ({ ...f, municipio_servico_codigo: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
              <input type="text" value={form.municipio_servico_descricao}
                onChange={(e) => setForm(f => ({ ...f, municipio_servico_descricao: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Se deixar em branco, usa valores padrão da configuração.</p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" disabled={emitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {emitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Emitir Nota
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Configuracao Asaas
// ═══════════════════════════════════════════════════════════
function ModalConfig({ open, config, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    nome: 'Padrão', ambiente: 'sandbox', api_key: '',
    municipio_servico_id: '', municipio_servico_codigo: '', municipio_servico_descricao: '',
    aliquota_iss: '', observacoes_padrao: '', ativo: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(config || {
        nome: 'Padrão', ambiente: 'sandbox', api_key: '',
        municipio_servico_id: '', municipio_servico_codigo: '', municipio_servico_descricao: '',
        aliquota_iss: '', observacoes_padrao: '', ativo: true,
      });
    }
  }, [open, config]);

  const testarConexao = async () => {
    if (!form.api_key) return;
    try {
      setTesting(true);
      const res = await asaasApi.testarConexao(form.ambiente, form.api_key);
      showToast('success', `Conexão OK - saldo: ${formatCurrency(res?.balance || 0)}`);
    } catch (err) {
      showToast('error', 'Conexão falhou: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await asaasConfig.salvarConfig({
        ...form,
        aliquota_iss: form.aliquota_iss === '' ? 0 : parseFloat(form.aliquota_iss),
      });
      showToast('success', 'Configuração salva');
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Configuração Asaas" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nome da configuração</label>
          <input type="text" required value={form.nome}
            onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Ambiente</label>
          <div className="grid grid-cols-2 gap-2">
            {['sandbox', 'producao'].map(amb => (
              <button key={amb} type="button"
                onClick={() => setForm(f => ({ ...f, ambiente: amb }))}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  form.ambiente === amb
                    ? amb === 'producao' ? 'bg-red-50 border-2 border-red-300 text-red-700' : 'bg-blue-50 border-2 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-2 border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {amb === 'sandbox' ? 'Sandbox (teste)' : 'Produção'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Chave de API (access_token)</label>
          <div className="flex gap-2">
            <input type="text" required value={form.api_key}
              onChange={(e) => setForm(f => ({ ...f, api_key: e.target.value }))}
              placeholder="$aact_..."
              className="flex-1 h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <button type="button" onClick={testarConexao} disabled={testing || !form.api_key}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Testar
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Serviço Municipal Padrão</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input type="text" value={form.municipio_servico_id || ''}
              onChange={(e) => setForm(f => ({ ...f, municipio_servico_id: e.target.value }))}
              placeholder="ID" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <input type="text" value={form.municipio_servico_codigo || ''}
              onChange={(e) => setForm(f => ({ ...f, municipio_servico_codigo: e.target.value }))}
              placeholder="Código" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <input type="text" value={form.municipio_servico_descricao || ''}
              onChange={(e) => setForm(f => ({ ...f, municipio_servico_descricao: e.target.value }))}
              placeholder="Descrição" className="h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Aliquota ISS (%) padrão</label>
              <input type="number" step="0.01" value={form.aliquota_iss || ''}
                onChange={(e) => setForm(f => ({ ...f, aliquota_iss: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes padrão</label>
            <textarea rows={2} value={form.observacoes_padrao || ''}
              onChange={(e) => setForm(f => ({ ...f, observacoes_padrao: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar configuração
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Detalhes da Nota
// ═══════════════════════════════════════════════════════════
function ModalDetail({ open, nota, onClose }) {
  if (!nota) return null;
  const statusConf = STATUS_CONFIG[nota.status] || STATUS_CONFIG.PENDING;

  return (
    <Modal open={open} onClose={onClose} title="Detalhes da Nota" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusConf.color}`}>
            {statusConf.label}
          </span>
          {nota.numero && <span className="text-sm font-mono text-gray-600">#{nota.numero}</span>}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Cliente</p>
            <p className="font-medium text-gray-900">{nota.cliente_nome}</p>
            {nota.cliente_cnpj && <p className="text-xs text-gray-400 font-mono">{nota.cliente_cnpj}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Valor</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(nota.valor))}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Data Emissão</p>
            <p className="text-gray-900">{formatDate(nota.data_emissao)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">ISS ({formatCurrency(Number(nota.valor_iss))})</p>
            <p className="text-gray-900">PIS {formatCurrency(Number(nota.valor_pis))} · COFINS {formatCurrency(Number(nota.valor_cofins))}</p>
          </div>
        </div>

        {nota.servico_descricao && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Descrição</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{nota.servico_descricao}</p>
          </div>
        )}

        {nota.erro_mensagem && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{nota.erro_mensagem}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          {nota.pdf_url && (
            <a href={nota.pdf_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
          )}
          {nota.xml_url && (
            <a href={nota.xml_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> XML
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
