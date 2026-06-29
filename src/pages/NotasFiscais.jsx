import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, FileText, Download, ExternalLink, Settings,
  Loader2, RefreshCw, CheckCircle2, AlertCircle, XCircle,
  Ban, Key, Clock, Eye, Calendar, Pause, Play, Trash2, Pencil, Zap, MapPin,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import { formatCurrency, formatDate } from '../utils/format';
import * as asaasApi from '../services/asaasApiService';
import * as asaasConfig from '../services/asaasConfigService';
import * as clientesService from '../services/clientesService';
import * as agendamentosNf from '../services/agendamentosNfService';
import { buscarCep } from '../services/viacepService';
import { NBS_CODIGOS } from '../data/nbsCodigos';

const STATUS_CONFIG = {
  PENDING:                   { label: 'Aguardando', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  SCHEDULED:                 { label: 'Agendamento', color: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Clock },
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
  // Aba ativa — 'notas' (NFs emitidas, agendadas, canceladas) ou 'agendamento'
  // (feature futura: pré-preencher e agendar emissão automática para clientes).
  const [aba, setAba] = useState('notas');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [modalEmit, setModalEmit] = useState(false);
  const [modalConfig, setModalConfig] = useState(false);
  const [modalDetail, setModalDetail] = useState({ open: false, nota: null });
  const [modalAgendamento, setModalAgendamento] = useState({ open: false, agendamento: null });

  // ─── Agendamentos recorrentes ─────────────────────────────
  const [agendamentos, setAgendamentos] = useState([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

  const carregarAgendamentos = useCallback(async () => {
    if (!config) return;
    try {
      setLoadingAgendamentos(true);
      const data = await agendamentosNf.listarAgendamentos(config.id);
      setAgendamentos(data);
    } catch (err) {
      showToast('error', 'Erro ao carregar agendamentos: ' + err.message);
    } finally {
      setLoadingAgendamentos(false);
    }
  }, [config]);

  useEffect(() => { if (config && aba === 'agendamento') carregarAgendamentos(); }, [config, aba, carregarAgendamentos]);

  const salvarAgendamento = async (dados) => {
    try {
      await agendamentosNf.salvarAgendamento({ ...dados, config_id: config.id });
      showToast('success', dados.id ? 'Agendamento atualizado' : 'Agendamento criado');
      setModalAgendamento({ open: false, agendamento: null });
      await carregarAgendamentos();
    } catch (err) {
      showToast('error', 'Erro: ' + err.message);
      throw err;
    }
  };

  const togglerAgendamento = async (ag) => {
    try {
      await agendamentosNf.alternarAtivo(ag.id, !ag.ativo);
      await carregarAgendamentos();
    } catch (err) { showToast('error', err.message); }
  };

  const removerAgendamento = async (ag) => {
    if (!confirm(`Remover agendamento de "${ag.cliente_nome}"?`)) return;
    try {
      await agendamentosNf.excluirAgendamento(ag.id);
      showToast('success', 'Agendamento removido');
      await carregarAgendamentos();
    } catch (err) { showToast('error', err.message); }
  };

  // Monta o form de emissão a partir do snapshot do agendamento
  const formDeAgendamento = (ag) => ({
    cliente_nome:     ag.cliente_nome,
    cliente_cnpj:     ag.cliente_cnpj,
    cliente_email:    ag.cliente_email,
    cliente_cep:      ag.cliente_cep,
    cliente_endereco: ag.cliente_endereco,
    cliente_numero:   ag.cliente_numero,
    cliente_bairro:   ag.cliente_bairro,
    cliente_cidade:   ag.cliente_cidade,
    cliente_estado:   ag.cliente_estado,
    descricao:        ag.descricao,
    observacoes:      ag.observacoes,
    valor:            ag.valor,
    deducoes:         ag.deducoes,
    data_emissao:     new Date().toISOString().slice(0, 10),
    aliquota_iss:     ag.aliquota_iss,
    national_service_code: ag.national_service_code,
    serie:            ag.serie,
  });

  // Dispara emissão imediata a partir de um agendamento (sem esperar a data)
  const emitirAgora = async (ag) => {
    if (!confirm(`Emitir nota fiscal agora para "${ag.cliente_nome}"?`)) return;
    try {
      await emitirNota(formDeAgendamento(ag));
      // Marca como emitido pra recalcular a próxima data
      await agendamentosNf.registrarEmissao(ag.id, { sucesso: true });
      await carregarAgendamentos();
    } catch (err) {
      await agendamentosNf.registrarEmissao(ag.id, { sucesso: false, mensagemErro: err.message });
    }
  };

  // Emite TODAS as notas dos agendamentos ATIVOS de uma vez (sequencial pra
  // não estourar limite do Asaas). Cada falha é registrada e não para as demais.
  const [emitindoTodas, setEmitindoTodas] = useState(false);
  const emitirTodas = async () => {
    const ativos = agendamentos.filter(a => a.ativo);
    if (ativos.length === 0) { showToast('error', 'Nenhum agendamento ativo para emitir.'); return; }
    if (!confirm(`Emitir agora ${ativos.length} nota(s) fiscal(is) dos agendamentos ativos?\n\nIsso cria as notas no Asaas imediatamente.`)) return;
    setEmitindoTodas(true);
    let ok = 0, falhas = 0;
    for (const ag of ativos) {
      try {
        await emitirNota(formDeAgendamento(ag));
        await agendamentosNf.registrarEmissao(ag.id, { sucesso: true });
        ok++;
      } catch (err) {
        await agendamentosNf.registrarEmissao(ag.id, { sucesso: false, mensagemErro: err.message });
        falhas++;
      }
    }
    setEmitindoTodas(false);
    await carregarAgendamentos();
    await carregarNotas();
    showToast(falhas === 0 ? 'success' : 'error',
      `Emissão concluída: ${ok} emitida(s)${falhas ? `, ${falhas} com erro` : ''}.`);
  };

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

      // Cache de customers já vistos (evita N requests redundantes ao Asaas)
      const customersCache = new Map();
      for (const inv of invoices) {
        // Asaas retorna `customer` só como ID — buscamos nome/cnpj
        let customerName    = inv.customerName    || inv.customer?.name;
        let customerCpfCnpj = inv.customerCpfCnpj || inv.customer?.cpfCnpj;
        if ((!customerName || !customerCpfCnpj) && typeof inv.customer === 'string') {
          if (!customersCache.has(inv.customer)) {
            try {
              const c = await asaasApi.buscarCustomer?.(config.ambiente, config.api_key, inv.customer)
                     ?? null;
              customersCache.set(inv.customer, c);
            } catch { customersCache.set(inv.customer, null); }
          }
          const c = customersCache.get(inv.customer);
          customerName    = customerName    || c?.name    || '';
          customerCpfCnpj = customerCpfCnpj || c?.cpfCnpj || null;
        }
        await asaasConfig.salvarNota(config.id, { ...inv, customerName, customerCpfCnpj });
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
      // 1. Encontrar/criar customer no Asaas (com endereço — Asaas usa
      // pra emitir NFS-e em algumas prefeituras).
      const customer = await asaasApi.encontrarOuCriarCustomer(config.ambiente, config.api_key, {
        name: form.cliente_nome,
        cpfCnpj: form.cliente_cnpj,
        email: form.cliente_email || undefined,
        postalCode:    (form.cliente_cep || '').replace(/\D/g, '') || undefined,
        address:       form.cliente_endereco || undefined,
        addressNumber: form.cliente_numero   || undefined,
        province:      form.cliente_bairro   || undefined,
        city:          form.cliente_cidade   || undefined,
        state:         form.cliente_estado   || undefined,
      });
      await asaasConfig.salvarCustomer(config.id, {
        asaas_customer_id: customer.id,
        cliente_nome: customer.name,
        cliente_cnpj: customer.cpfCnpj,
        email: customer.email,
      });

      // 2. Criar invoice (Portal Nacional NFS-e — NBS).
      // Asaas ainda exige `municipalServiceDescription` mesmo no PNFS-e.
      const codigoNbs = (form.national_service_code || config.national_service_code || '').trim();
      const itemNbs = NBS_CODIGOS.find(c => c.codigo === codigoNbs);
      // Garante string não-vazia em municipalServiceDescription (Asaas obriga)
      const descricaoNbs = String(
        itemNbs?.descricao
        || config.municipio_servico_descricao
        || form.descricao
        || 'Serviços prestados'
      ).trim().slice(0, 250); // limite preventivo

      const payloadInvoice = {
        customer: customer.id,
        serviceDescription: form.descricao,
        observations: form.observacoes || config.observacoes_padrao || '',
        value: parseFloat(form.valor),
        deductions: parseFloat(form.deducoes || 0),
        effectiveDate: form.data_emissao,
        nationalServiceCode:         codigoNbs,
        municipalServiceCode:        codigoNbs,            // mesmo NBS — Asaas exige
        municipalServiceName:        descricaoNbs,
        municipalServiceDescription: descricaoNbs,
        serie: form.serie || config.serie || '1',
        taxes: {
          iss: parseFloat(form.aliquota_iss || config.aliquota_iss || 0),
          retainedIss: false,
        },
      };
      const invoice = await asaasApi.criarInvoice(config.ambiente, config.api_key, payloadInvoice);

      // 3. Salvar no cache local. A resposta do Asaas só traz `customer` como
      // string (ID) — então mesclamos o nome/cnpj que já temos pra não gravar vazio.
      await asaasConfig.salvarNota(config.id, {
        ...invoice,
        customerName:    invoice.customerName    || customer.name,
        customerCpfCnpj: invoice.customerCpfCnpj || customer.cpfCnpj,
      });
      // Mostra status real retornado pelo Asaas (SCHEDULED, AUTHORIZED, etc).
      // Asaas geralmente cria como SCHEDULED — emite em background quando
      // chega a effectiveDate. Use "Sincronizar" pra ver a transição.
      const labelStatus = STATUS_CONFIG[invoice?.status]?.label || invoice?.status || 'criada';
      showToast('success',
        `Nota fiscal ${labelStatus.toLowerCase()} com sucesso! `
        + 'Use "Sincronizar" pra atualizar o status quando o Asaas processar.'
      );
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

  const contadorNotas = notas.length;

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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex items-center gap-1">
        <button onClick={() => setAba('notas')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === 'notas' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notas Fiscais
            <span className={`text-[11px] font-bold tabular-nums rounded-full px-1.5 py-0.5 ${
              aba === 'notas' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{contadorNotas}</span>
          </span>
          {aba === 'notas' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
        </button>
        <button onClick={() => setAba('agendamento')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === 'agendamento' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Agendamento
            <span className={`text-[11px] font-bold tabular-nums rounded-full px-1.5 py-0.5 ${
              aba === 'agendamento' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{agendamentos.length}</span>
          </span>
          {aba === 'agendamento' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
        </button>
      </div>

      {aba === 'notas' && <>
      {/* KPIs compactos — inline */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-4 py-2.5 bg-white rounded-lg border border-gray-200/60">
        <KpiInline label="Emitidas"          value={notas.filter(n => n.status === 'AUTHORIZED').length} icon={CheckCircle2} color="emerald" />
        <span className="h-5 w-px bg-gray-200" />
        <KpiInline label="Valor autorizado"  value={formatCurrency(totalAutorizadas)}                    icon={FileText}     color="blue" />
        <span className="h-5 w-px bg-gray-200" />
        <KpiInline label="Valor pendente"    value={formatCurrency(totalPendentes)}                      icon={Clock}        color="amber" />
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
                        <p className="text-sm font-medium text-gray-900">
                          {n.cliente_nome
                            || n.raw_json?.customerName
                            || <span className="italic text-gray-400">sem nome</span>}
                        </p>
                        {(n.cliente_cnpj || n.raw_json?.customerCpfCnpj) &&
                          <p className="text-xs text-gray-400 font-mono">{n.cliente_cnpj || n.raw_json?.customerCpfCnpj}</p>
                        }
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

      </>}

      {aba === 'agendamento' && (
        <AgendamentoTab
          loading={loadingAgendamentos}
          agendamentos={agendamentos}
          onNovo={() => setModalAgendamento({ open: true, agendamento: null })}
          onEditar={(ag) => setModalAgendamento({ open: true, agendamento: ag })}
          onToggle={togglerAgendamento}
          onRemover={removerAgendamento}
          onEmitirAgora={emitirAgora}
          onEmitirTodas={emitirTodas}
          emitindoTodas={emitindoTodas}
        />
      )}

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
      <ModalAgendamento
        open={modalAgendamento.open}
        agendamento={modalAgendamento.agendamento}
        config={config}
        onClose={() => setModalAgendamento({ open: false, agendamento: null })}
        onSave={salvarAgendamento}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KPI Inline — versão compacta (icon + label + valor numa linha)
// ═══════════════════════════════════════════════════════════
function KpiInline({ label, value, icon: Icon, color }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
  };
  return (
    <div className="flex items-center gap-2.5">
      <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        <span className="text-base font-bold text-gray-900 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Emitir Nota
// ═══════════════════════════════════════════════════════════
function NacionalServicoPicker({ valor, onChange, padrao }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const selecionado = NBS_CODIGOS.find(c => c.codigo === valor);

  const filtrados = (() => {
    const t = busca.trim().toLowerCase();
    if (!t) return NBS_CODIGOS.slice(0, 20);
    return NBS_CODIGOS
      .filter(c =>
        c.codigo.toLowerCase().includes(t)
        || c.descricao.toLowerCase().includes(t)
      )
      .slice(0, 30);
  })();

  return (
    <div>
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        Código de Tributação Nacional (NBS) <span className="text-rose-500">*</span>
      </h4>
      {selecionado ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13px] font-bold text-blue-700">{selecionado.codigo}</p>
            <p className="text-[12px] text-gray-700 mt-0.5">{selecionado.descricao}</p>
          </div>
          <button type="button" onClick={() => { onChange(''); setBusca(''); }}
            className="text-[11px] text-rose-600 hover:text-rose-800 font-medium flex-shrink-0">
            Trocar
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input type="text"
              value={busca || valor}
              onChange={(e) => { setBusca(e.target.value); setAberto(true); onChange(''); }}
              onFocus={() => setAberto(true)}
              onBlur={() => setTimeout(() => setAberto(false), 200)}
              placeholder='Buscar por código (ex: "17.03.03") ou descrição...'
              className="w-full h-10 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          {aberto && filtrados.length > 0 && (
            <div className="mt-1 max-h-56 overflow-y-auto bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 shadow-sm">
              {filtrados.map(c => (
                <button key={c.codigo} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(c.codigo); setBusca(''); setAberto(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12.5px] font-bold text-blue-700">{c.codigo}</span>
                    <span className="text-[12px] text-gray-700 truncate">{c.descricao}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            {padrao
              ? <>Se deixar em branco, usa o padrão: <span className="font-mono font-semibold">{padrao}</span></>
              : 'Não encontrou o código? Digite o NBS exato (formato 00.00.00) que o Asaas aceita.'}
          </p>
        </>
      )}
    </div>
  );
}

function ModalEmitir({ open, config, onClose, onEmit }) {
  const [form, setForm] = useState({
    cliente_id: '',                                  // ref pro cliente cadastrado (opcional)
    cliente_nome: '', cliente_cnpj: '', cliente_email: '',
    // Endereço — preenchido automaticamente ao selecionar cliente.
    // Vai pro Asaas em /customers (algumas prefeituras exigem na NFS-e).
    cliente_cep: '', cliente_endereco: '', cliente_numero: '',
    cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
    descricao: '', observacoes: '',
    valor: '', deducoes: '0',
    data_emissao: new Date().toISOString().split('T')[0],
    aliquota_iss: '',
    // Portal Nacional NFS-e (NBS) — formato 17.03.03
    national_service_code: '',
    // Série da NF — alfanumérico até 6 chars (ex: "1", "NFS-E", "A")
    serie: '1',
  });
  const [emitting, setEmitting] = useState(false);

  // Catálogo de clientes — carrega 1x ao abrir
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Preenche endereço pelo CEP (ViaCEP) — só completa campos vazios
  const handleCepChange = async (raw) => {
    setForm(f => ({ ...f, cliente_cep: raw }));
    const limpo = (raw || '').replace(/\D/g, '');
    if (limpo.length !== 8) return;
    try {
      setBuscandoCep(true);
      const dados = await buscarCep(limpo);
      if (!dados) return;
      setForm(f => ({
        ...f,
        cliente_endereco: f.cliente_endereco || dados.endereco || '',
        cliente_bairro:   f.cliente_bairro   || dados.bairro   || '',
        cliente_cidade:   f.cliente_cidade   || dados.cidade   || '',
        cliente_estado:   f.cliente_estado   || dados.estado   || '',
      }));
    } catch { /* silencioso */ }
    finally { setBuscandoCep(false); }
  };

  useEffect(() => {
    if (open && config) {
      setForm(f => ({
        ...f,
        cliente_id: '',
        cliente_nome: '', cliente_cnpj: '', cliente_email: '',
        cliente_cep: '', cliente_endereco: '', cliente_numero: '',
        cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
        descricao: '', observacoes: '',
        valor: '', deducoes: '0',
        data_emissao: new Date().toISOString().split('T')[0],
        aliquota_iss: config.aliquota_iss || '',
        national_service_code: config.national_service_code || '',
        serie: config.serie || '1',
      }));
      setBuscaCliente('');
    }
  }, [open, config]);

  // Carrega clientes ao abrir o modal (1x — fica em cache)
  useEffect(() => {
    if (!open || clientes.length > 0) return;
    let cancelado = false;
    (async () => {
      setLoadingClientes(true);
      try {
        const data = await clientesService.listarClientes();
        if (!cancelado) setClientes((data || []).filter(c => c.status === 'ativo'));
      } catch { /* silencia — formulário ainda funciona manualmente */ }
      finally { if (!cancelado) setLoadingClientes(false); }
    })();
    return () => { cancelado = true; };
  }, [open, clientes.length]);

  // Filtra clientes pela busca (nome, razão social ou CNPJ)
  const clientesFiltrados = (() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes
      .filter(c =>
        (c.nome         || '').toLowerCase().includes(t)
        || (c.razao_social || '').toLowerCase().includes(t)
        || (c.cnpj         || '').toLowerCase().includes(t)
      )
      .slice(0, 30);
  })();

  // Aplica dados do cliente selecionado no form (inclui endereço — vai pra Asaas)
  const selecionarCliente = (c) => {
    setForm(f => ({
      ...f,
      cliente_id:       c.id,
      cliente_nome:     c.razao_social || c.nome,
      cliente_cnpj:     (c.cnpj || '').replace(/\D/g, ''),
      cliente_email:    c.contato_email || '',
      cliente_cep:      c.cep      || '',
      cliente_endereco: c.endereco || '',
      cliente_numero:   c.numero   || '',
      cliente_bairro:   c.bairro   || '',
      cliente_cidade:   c.cidade   || '',
      cliente_estado:   c.estado   || '',
    }));
    setBuscaCliente('');
  };

  const limparCliente = () => {
    setForm(f => ({
      ...f, cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '',
      cliente_cep: '', cliente_endereco: '', cliente_numero: '',
      cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Portal Nacional exige o Código de Tributação Nacional (NBS) — ex: 17.03.03
    const codigo = (form.national_service_code || '').trim() || (config?.national_service_code || '').trim();
    if (!codigo) {
      alert(
        'O Código de Tributação Nacional (NBS) é obrigatório.\n\n'
        + 'Preencha o campo "Código de Tributação Nacional" no formulário OU configure '
        + 'um padrão em Configurações Asaas (campo national_service_code).'
      );
      return;
    }
    setEmitting(true);
    try {
      await onEmit(form);
    } catch (_) { /* handled by parent */ }
    finally { setEmitting(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Emitir Nota Fiscal"
      size="lg"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button type="submit" form="form-emitir-nf" disabled={emitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {emitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Emitir Nota
          </button>
        </div>
      )}
    >
      <form id="form-emitir-nf" onSubmit={handleSubmit} className="space-y-5">
        {/* Buscar no cadastro de clientes — pré-popula o tomador */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> Buscar cliente cadastrado
            </h4>
            {form.cliente_id && (
              <button type="button" onClick={limparCliente}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-medium">
                Limpar
              </button>
            )}
          </div>
          {form.cliente_id ? (
            <div className="bg-white rounded-lg border border-blue-200 px-3 py-2">
              <p className="text-[13px] font-semibold text-gray-900">{form.cliente_nome}</p>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5 flex-wrap">
                {form.cliente_cnpj && <span className="font-mono">CNPJ {form.cliente_cnpj}</span>}
                {form.cliente_email && <span>· {form.cliente_email}</span>}
              </div>
              {(form.cliente_endereco || form.cliente_cidade) && (
                <p className="text-[10.5px] text-gray-400 mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[
                    form.cliente_endereco,
                    form.cliente_numero,
                    form.cliente_bairro,
                    form.cliente_cidade && `${form.cliente_cidade}${form.cliente_estado ? '/' + form.cliente_estado : ''}`,
                    form.cliente_cep && `CEP ${form.cliente_cep}`,
                  ].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input type="text" value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  placeholder={loadingClientes ? 'Carregando clientes…' : 'Buscar por nome, razão social ou CNPJ…'}
                  className="w-full h-10 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              {buscaCliente && clientesFiltrados.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                      <p className="text-[13px] font-medium text-gray-800">{c.razao_social || c.nome}</p>
                      <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-0.5">
                        {c.cnpj && <span className="font-mono">CNPJ {c.cnpj}</span>}
                        {c.cidade && <span>· {c.cidade}{c.estado ? `/${c.estado}` : ''}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10.5px] text-gray-500 mt-1.5">
                Ou preencha os campos abaixo manualmente.
              </p>
            </>
          )}
        </div>

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

            {/* Endereço — vai pro Asaas na emissão. Pré-preenchido ao selecionar
                cliente, editável aqui para ajustes pontuais. */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
              <div className="relative">
                <input type="text" inputMode="numeric" value={form.cliente_cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                {buscandoCep && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
              <input type="text" value={form.cliente_numero}
                onChange={(e) => setForm(f => ({ ...f, cliente_numero: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Endereço</label>
              <input type="text" value={form.cliente_endereco}
                onChange={(e) => setForm(f => ({ ...f, cliente_endereco: e.target.value }))}
                placeholder="Rua / Avenida"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
              <input type="text" value={form.cliente_bairro}
                onChange={(e) => setForm(f => ({ ...f, cliente_bairro: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
                <input type="text" value={form.cliente_cidade}
                  onChange={(e) => setForm(f => ({ ...f, cliente_cidade: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
                <input type="text" maxLength={2} value={form.cliente_estado}
                  onChange={(e) => setForm(f => ({ ...f, cliente_estado: e.target.value }))}
                  placeholder="ES"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm uppercase focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Série da NF <span className="text-rose-500">*</span>
              </label>
              <input type="text" required maxLength={6}
                value={form.serie}
                onChange={(e) => setForm(f => ({ ...f, serie: e.target.value.slice(0, 6) }))}
                placeholder="Ex: 1"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <p className="text-[10.5px] text-gray-400 mt-0.5">Até 6 caracteres (letras/números)</p>
            </div>
          </div>
        </div>

        {/* Código de Tributação Nacional (Portal Nacional NFS-e — NBS) */}
        <NacionalServicoPicker
          valor={form.national_service_code}
          onChange={(v) => setForm(f => ({ ...f, national_service_code: v }))}
          padrao={config?.national_service_code} />


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
    <Modal open={open} onClose={onClose} title="Configuração Asaas" size="md"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" form="form-config-asaas" disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar configuração
          </button>
        </div>
      )}>
      <form id="form-config-asaas" onSubmit={handleSubmit} className="space-y-4">
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

// ═══════════════════════════════════════════════════════════
// Aba: Agendamento — lista de regras recorrentes
// ═══════════════════════════════════════════════════════════
function AgendamentoTab({ loading, agendamentos, onNovo, onEditar, onToggle, onRemover, onEmitirAgora, onEmitirTodas, emitindoTodas }) {
  const [statusCron, setStatusCron] = useState(null);
  const [carregandoCron, setCarregandoCron] = useState(true);

  const verificarCron = useCallback(async () => {
    setCarregandoCron(true);
    try {
      const s = await agendamentosNf.verificarStatusCron();
      setStatusCron(s);
    } catch (e) {
      setStatusCron({ erro: e.message });
    } finally {
      setCarregandoCron(false);
    }
  }, []);

  useEffect(() => { verificarCron(); }, [verificarCron]);

  if (loading) return <TableSkeleton rows={4} cols={5} />;

  const totalAtivos = agendamentos.filter(a => a.ativo);
  const valorTotal = agendamentos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  const valorTotalAtivos = totalAtivos.reduce((s, a) => s + (Number(a.valor) || 0), 0);

  // Exporta a lista de agendamentos em CSV (separador ';' e vírgula decimal —
  // padrão do Excel pt-BR; BOM pra acentos abrirem certo).
  const exportarCsv = () => {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cabecalho = ['Cliente', 'CNPJ', 'Descrição', 'Valor', 'Recorrência', 'Próxima emissão', 'Última emissão', 'Status'];
    const linhas = agendamentos.map(a => [
      a.cliente_nome || '',
      a.cliente_cnpj || '',
      a.descricao || '',
      (Number(a.valor) || 0).toFixed(2).replace('.', ','),
      agendamentosNf.formatarRecorrencia(a),
      a.proxima_emissao ? formatDate(a.proxima_emissao) : '',
      a.ultima_emissao ? formatDate(a.ultima_emissao) : '',
      a.ativo ? 'Ativo' : 'Pausado',
    ]);
    const csv = [cabecalho, ...linhas].map(l => l.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agendamentos-nf-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header da aba */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Agendamentos recorrentes</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure emissões automáticas — o sistema dispara a NFS-e na data programada de cada mês.
          </p>
          {agendamentos.length > 0 && (
            <p className="text-xs text-gray-600 mt-1.5">
              <span className="font-semibold text-gray-900">{formatCurrency(valorTotalAtivos)}</span>
              {' '}em {totalAtivos.length} agendamento(s) ativo(s)
              {agendamentos.length !== totalAtivos.length && (
                <span className="text-gray-400"> · {formatCurrency(valorTotal)} no total ({agendamentos.length})</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {agendamentos.length > 0 && (
            <>
              <button onClick={exportarCsv}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Download className="h-4 w-4" /> CSV
              </button>
              <button onClick={onEmitirTodas} disabled={emitindoTodas || totalAtivos.length === 0}
                className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                title="Emite agora as notas de todos os agendamentos ativos">
                {emitindoTodas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {emitindoTodas ? 'Emitindo…' : 'Emitir todas'}
              </button>
            </>
          )}
          <button onClick={onNovo}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Novo agendamento
          </button>
        </div>
      </div>

      {agendamentos.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 p-10 text-center shadow-sm">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
            <Calendar className="h-6 w-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">Nenhum agendamento cadastrado</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Cadastre um agendamento por cliente — defina valor, descrição e dia do mês.
            A emissão acontece automaticamente na data programada.
          </p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left px-6 py-3 font-medium">Cliente</th>
                  <th className="text-left px-6 py-3 font-medium">Descrição</th>
                  <th className="text-right px-6 py-3 font-medium">Valor</th>
                  <th className="text-left px-6 py-3 font-medium">Recorrência</th>
                  <th className="text-left px-6 py-3 font-medium">Próxima</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agendamentos.map((ag, i) => {
                  const ativoStyle = ag.ativo
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-500 border-gray-200';
                  return (
                    <motion.tr key={ag.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-900">{ag.cliente_nome}</p>
                        {ag.cliente_cnpj && <p className="text-xs text-gray-400 font-mono">{ag.cliente_cnpj}</p>}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600 max-w-xs truncate">{ag.descricao}</td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatCurrency(Number(ag.valor))}</td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {agendamentosNf.formatarRecorrencia(ag)}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-700">
                        {ag.proxima_emissao ? formatDate(ag.proxima_emissao) : '—'}
                        {ag.ultima_emissao && (
                          <p className="text-[10.5px] text-gray-400 mt-0.5">Última: {formatDate(ag.ultima_emissao)}</p>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${ativoStyle}`}>
                            {ag.ativo ? <CheckCircle2 className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                            {ag.ativo ? 'Ativo' : 'Pausado'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEmitirAgora(ag)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Emitir agora">
                            <Zap className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => onToggle(ag)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title={ag.ativo ? 'Pausar' : 'Reativar'}>
                            {ag.ativo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => onEditar(ag)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => onRemover(ag)}
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
        </motion.div>
      )}

      {/* Status real da emissão automática (cron + edge function + Vault) */}
      <BannerStatusCron status={statusCron} carregando={carregandoCron} onReverificar={verificarCron} />
    </div>
  );
}

// ─── Banner de status da emissão automática ──────────────────
// Lê o resultado da RPC verificar_status_cron_nf e mostra verde/amarelo/
// vermelho conforme o estado real do cron, do secret e da última execução.
function infoStatusCron(status, carregando) {
  if (carregando) {
    return { cor: 'gray', spin: true, titulo: 'Verificando emissão automática…' };
  }
  if (!status || status.erro) {
    return {
      cor: 'amber', icon: AlertCircle, titulo: 'Não foi possível verificar a emissão automática',
      detalhe: status?.erro ? `Detalhe: ${status.erro}` : 'Tente reverificar em instantes.',
    };
  }
  if (!status.agendado) {
    return {
      cor: 'red', icon: XCircle, titulo: 'Cron não agendado',
      detalhe: 'O job não existe no pg_cron. Aplique a migration 089 (cron.schedule) no Supabase.',
      mostrarManual: true,
    };
  }
  if (!status.ativo) {
    return {
      cor: 'amber', icon: AlertCircle, titulo: 'Cron pausado',
      detalhe: 'O job existe mas está inativo (active = false). Reative no Supabase.',
      mostrarManual: true,
    };
  }
  if (status.secret_ok === false) {
    return {
      cor: 'red', icon: XCircle, titulo: 'Falta o secret service_role_key',
      detalhe: 'Sem ele o cron dispara mas não autentica na edge function. Crie o secret no Vault.',
      mostrarManual: true,
    };
  }
  // Agendado + ativo + secret ok (ou desconhecido) → olha a última execução
  if (!status.ultima_execucao) {
    return {
      cor: 'blue', icon: Clock, titulo: 'Emissão automática configurada',
      detalhe: 'Tudo pronto — aguardando a primeira execução (roda todo dia às 4h de Brasília).',
    };
  }
  const quando = new Date(status.ultima_execucao);
  const dataFmt = quando.toLocaleString('pt-BR');
  const horas = (Date.now() - quando.getTime()) / 36e5;
  if (status.ultimo_status === 'succeeded') {
    if (horas > 48) {
      return {
        cor: 'amber', icon: AlertCircle, titulo: 'Sem execução nas últimas 48h',
        detalhe: `A última execução foi bem-sucedida, mas faz tempo (${dataFmt}). Verifique se o cron continua ativo.`,
        mostrarManual: true,
      };
    }
    return {
      cor: 'green', icon: CheckCircle2, titulo: 'Emissão automática ativa',
      detalhe: `Última execução concluída com sucesso em ${dataFmt}.`,
    };
  }
  if (status.ultimo_status === 'failed') {
    return {
      cor: 'red', icon: XCircle, titulo: 'A última execução do cron falhou',
      detalhe: `${dataFmt} — ${status.ultima_mensagem || 'sem detalhe do erro'}`,
      mostrarManual: true,
    };
  }
  // running / starting / outro
  return {
    cor: 'blue', icon: Clock, titulo: `Execução em andamento (${status.ultimo_status})`,
    detalhe: `Iniciada em ${dataFmt}.`,
  };
}

const CORES_STATUS = {
  green: { box: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', titulo: 'text-emerald-900', txt: 'text-emerald-700' },
  amber: { box: 'bg-amber-50/60 border-amber-200',  icon: 'text-amber-600',   titulo: 'text-amber-900',   txt: 'text-amber-700' },
  red:   { box: 'bg-rose-50 border-rose-200',       icon: 'text-rose-600',    titulo: 'text-rose-900',    txt: 'text-rose-700' },
  blue:  { box: 'bg-blue-50 border-blue-200',       icon: 'text-blue-600',    titulo: 'text-blue-900',    txt: 'text-blue-700' },
  gray:  { box: 'bg-gray-50 border-gray-200',       icon: 'text-gray-400',    titulo: 'text-gray-700',    txt: 'text-gray-500' },
};

function BannerStatusCron({ status, carregando, onReverificar }) {
  const info = infoStatusCron(status, carregando);
  const c = CORES_STATUS[info.cor] || CORES_STATUS.gray;
  const Icon = info.spin ? Loader2 : (info.icon || AlertCircle);
  return (
    <div className={`mt-4 rounded-lg border p-3 flex gap-2.5 ${c.box}`}>
      <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${c.icon} ${info.spin ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11.5px] font-semibold ${c.titulo}`}>{info.titulo}</p>
          {!carregando && (
            <button onClick={onReverificar} title="Reverificar"
              className={`inline-flex items-center gap-1 text-[10.5px] font-medium ${c.txt} hover:underline flex-shrink-0`}>
              <RefreshCw className="h-3 w-3" /> Reverificar
            </button>
          )}
        </div>
        {info.detalhe && <p className={`mt-0.5 text-[11.5px] ${c.txt}`}>{info.detalhe}</p>}
        {info.mostrarManual && (
          <p className={`mt-0.5 text-[11.5px] ${c.txt}`}>
            Enquanto isso, use o botão <span className="font-mono bg-white/60 px-1 rounded">⚡ Emitir agora</span> pra disparar manualmente.
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Criar / Editar agendamento
// ═══════════════════════════════════════════════════════════
function ModalAgendamento({ open, agendamento, config, onClose, onSave }) {
  const [form, setForm] = useState({
    cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '',
    cliente_cep: '', cliente_endereco: '', cliente_numero: '',
    cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
    descricao: '', observacoes: '',
    valor: '', deducoes: '0',
    aliquota_iss: '',
    national_service_code: '',
    serie: '1',
    periodicidade: 'mensal',
    dia_emissao: 'ultimo',
    ativo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Preenche endereço pelo CEP (ViaCEP) — só completa campos vazios
  const handleCepChange = async (raw) => {
    setForm(f => ({ ...f, cliente_cep: raw }));
    const limpo = (raw || '').replace(/\D/g, '');
    if (limpo.length !== 8) return;
    try {
      setBuscandoCep(true);
      const dados = await buscarCep(limpo);
      if (!dados) return;
      setForm(f => ({
        ...f,
        cliente_endereco: f.cliente_endereco || dados.endereco || '',
        cliente_bairro:   f.cliente_bairro   || dados.bairro   || '',
        cliente_cidade:   f.cliente_cidade   || dados.cidade   || '',
        cliente_estado:   f.cliente_estado   || dados.estado   || '',
      }));
    } catch { /* silencioso — usuário pode preencher manual */ }
    finally { setBuscandoCep(false); }
  };

  useEffect(() => {
    if (!open) return;
    if (agendamento) {
      setForm({
        ...agendamento,
        valor:        String(agendamento.valor ?? ''),
        deducoes:     String(agendamento.deducoes ?? '0'),
        aliquota_iss: agendamento.aliquota_iss != null ? String(agendamento.aliquota_iss) : '',
      });
    } else {
      setForm({
        cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '',
        cliente_cep: '', cliente_endereco: '', cliente_numero: '',
        cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
        descricao: '', observacoes: '',
        valor: '', deducoes: '0',
        aliquota_iss: config?.aliquota_iss ? String(config.aliquota_iss) : '',
        national_service_code: config?.national_service_code || '',
        serie: config?.serie || '1',
        periodicidade: 'mensal',
        dia_emissao: 'ultimo',
        ativo: true,
      });
    }
    setBuscaCliente('');
  }, [open, agendamento, config]);

  // Catálogo de clientes
  useEffect(() => {
    if (!open || clientes.length > 0) return;
    let cancelado = false;
    (async () => {
      setLoadingClientes(true);
      try {
        const data = await clientesService.listarClientes();
        if (!cancelado) setClientes((data || []).filter(c => c.status === 'ativo'));
      } catch { /* form continua manual */ }
      finally { if (!cancelado) setLoadingClientes(false); }
    })();
    return () => { cancelado = true; };
  }, [open, clientes.length]);

  const clientesFiltrados = (() => {
    const t = buscaCliente.trim().toLowerCase();
    if (!t) return clientes.slice(0, 30);
    return clientes.filter(c =>
      (c.nome         || '').toLowerCase().includes(t)
      || (c.razao_social || '').toLowerCase().includes(t)
      || (c.cnpj         || '').toLowerCase().includes(t)
    ).slice(0, 30);
  })();

  const selecionarCliente = (c) => {
    setForm(f => ({
      ...f,
      cliente_id:       c.id,
      cliente_nome:     c.razao_social || c.nome,
      cliente_cnpj:     (c.cnpj || '').replace(/\D/g, ''),
      cliente_email:    c.contato_email || '',
      cliente_cep:      c.cep      || '',
      cliente_endereco: c.endereco || '',
      cliente_numero:   c.numero   || '',
      cliente_bairro:   c.bairro   || '',
      cliente_cidade:   c.cidade   || '',
      cliente_estado:   c.estado   || '',
    }));
    setBuscaCliente('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.national_service_code) {
      alert('O Código de Tributação Nacional (NBS) é obrigatório.');
      return;
    }
    setSalvando(true);
    try {
      await onSave({
        ...form,
        valor:        parseFloat(form.valor),
        deducoes:     parseFloat(form.deducoes || 0),
        aliquota_iss: form.aliquota_iss === '' ? null : parseFloat(form.aliquota_iss),
      });
    } catch {} finally { setSalvando(false); }
  };

  const isEdit = !!agendamento?.id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar agendamento' : 'Novo agendamento de emissão'}
      size="lg"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button type="submit" form="form-agendamento-nf" disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Criar agendamento'}
          </button>
        </div>
      )}
    >
      <form id="form-agendamento-nf" onSubmit={handleSubmit} className="space-y-5">
        {/* Busca cliente */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> Buscar cliente cadastrado
            </h4>
            {form.cliente_id && (
              <button type="button"
                onClick={() => setForm(f => ({
                  ...f, cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_email: '',
                  cliente_cep: '', cliente_endereco: '', cliente_numero: '',
                  cliente_bairro: '', cliente_cidade: '', cliente_estado: '',
                }))}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-medium">Limpar</button>
            )}
          </div>
          {form.cliente_id ? (
            <div className="bg-white rounded-lg border border-blue-200 px-3 py-2">
              <p className="text-[13px] font-semibold text-gray-900">{form.cliente_nome}</p>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                {form.cliente_cnpj && <span className="font-mono">CNPJ {form.cliente_cnpj}</span>}
                {form.cliente_email && <span>· {form.cliente_email}</span>}
              </div>
              {(form.cliente_endereco || form.cliente_cidade) && (
                <p className="text-[10.5px] text-gray-400 mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[
                    form.cliente_endereco,
                    form.cliente_numero,
                    form.cliente_bairro,
                    form.cliente_cidade && `${form.cliente_cidade}${form.cliente_estado ? '/' + form.cliente_estado : ''}`,
                    form.cliente_cep && `CEP ${form.cliente_cep}`,
                  ].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input type="text" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)}
                  placeholder={loadingClientes ? 'Carregando clientes…' : 'Buscar por nome, razão social ou CNPJ…'}
                  className="w-full h-10 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              {buscaCliente && clientesFiltrados.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {clientesFiltrados.map(c => (
                    <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                      <p className="text-[13px] font-medium text-gray-800">{c.razao_social || c.nome}</p>
                      <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-0.5">
                        {c.cnpj && <span className="font-mono">CNPJ {c.cnpj}</span>}
                        {c.cidade && <span>· {c.cidade}{c.estado ? `/${c.estado}` : ''}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Tomador */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Tomador</h4>
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

            {/* Endereço — usado na emissão da NF. Pré-preenchido ao selecionar o
                cliente, mas editável aqui para ajustes pontuais. */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
              <div className="relative">
                <input type="text" inputMode="numeric" value={form.cliente_cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                {buscandoCep && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
              <input type="text" value={form.cliente_numero}
                onChange={(e) => setForm(f => ({ ...f, cliente_numero: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Endereço</label>
              <input type="text" value={form.cliente_endereco}
                onChange={(e) => setForm(f => ({ ...f, cliente_endereco: e.target.value }))}
                placeholder="Rua / Avenida"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
              <input type="text" value={form.cliente_bairro}
                onChange={(e) => setForm(f => ({ ...f, cliente_bairro: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
                <input type="text" value={form.cliente_cidade}
                  onChange={(e) => setForm(f => ({ ...f, cliente_cidade: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
                <input type="text" maxLength={2} value={form.cliente_estado}
                  onChange={(e) => setForm(f => ({ ...f, cliente_estado: e.target.value }))}
                  placeholder="ES"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm uppercase focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>
        </div>

        {/* Serviço */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Serviço</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descrição *</label>
              <textarea required rows={2} value={form.descricao}
                onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
              <input type="text" value={form.observacoes || ''}
                onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" required value={form.valor}
                onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Deduções (R$)</label>
              <input type="number" step="0.01" value={form.deducoes}
                onChange={(e) => setForm(f => ({ ...f, deducoes: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Alíquota ISS (%)</label>
              <input type="number" step="0.01" value={form.aliquota_iss}
                onChange={(e) => setForm(f => ({ ...f, aliquota_iss: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Série *</label>
              <input type="text" required maxLength={6} value={form.serie}
                onChange={(e) => setForm(f => ({ ...f, serie: e.target.value.slice(0, 6) }))}
                placeholder="Ex: 1"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
        </div>

        {/* NBS */}
        <NacionalServicoPicker
          valor={form.national_service_code}
          onChange={(v) => setForm(f => ({ ...f, national_service_code: v }))}
          padrao={config?.national_service_code} />

        {/* Recorrência */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Recorrência
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frequência</label>
              <select value={form.periodicidade}
                onChange={(e) => setForm(f => ({ ...f, periodicidade: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="mensal">Mensal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dia da emissão</label>
              <select value={form.dia_emissao}
                onChange={(e) => setForm(f => ({ ...f, dia_emissao: e.target.value }))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="ultimo">Último dia do mês</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d)}>Dia {d}</option>
                ))}
              </select>
              {['29', '30', '31'].includes(form.dia_emissao) && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Nos meses sem o dia {form.dia_emissao}, a emissão ocorre no último dia do mês.
                </p>
              )}
            </div>
            <div className="col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.ativo}
                  onChange={(e) => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Ativo (o agendamento dispara automaticamente)
              </label>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
