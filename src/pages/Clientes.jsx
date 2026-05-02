import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Building2, Mail, Phone, MapPin, Users as UsersIcon,
  Loader2, AlertCircle, Pencil, Trash2, ChevronRight, ChevronDown,
  Check, Zap, ArrowLeft, RefreshCw, Key, Network, Landmark, Wallet, Coins, Boxes,
  Link2, BarChart3, TrendingUp,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as autosystemService from '../services/autosystemService';
import * as contasBancariasService from '../services/clienteContasBancariasService';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [modalWizard, setModalWizard] = useState({ open: false, preRede: null });
  const [modalEdit, setModalEdit] = useState({ open: false, data: null });
  const [modalDetail, setModalDetail] = useState({ open: false, cliente: null });
  const [modalConfirm, setModalConfirm] = useState({ open: false, message: '', onConfirm: null });
  const [modalContas, setModalContas] = useState({ open: false, cliente: null });
  const [expandedRedes, setExpandedRedes] = useState(new Set());

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const data = await clientesService.listarClientes();
      setClientes(data || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar clientes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleDelete = async (cliente) => {
    try {
      await clientesService.excluirCliente(cliente.id);
      showToast('success', `${cliente.nome} excluido`);
      await carregar();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const filtered = clientes.filter(c => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return c.nome?.toLowerCase().includes(q)
        || c.cnpj?.includes(searchTerm)
        || c.razao_social?.toLowerCase().includes(q)
        || (c.chaves_api?.nome || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Agrupa empresas por rede (chave_api). Clientes sem chave viram grupo 'Sem rede'.
  const redes = useMemo(() => {
    const map = new Map();
    filtered.forEach(c => {
      const key = c.chave_api_id || '_sem_rede';
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          chaveApi: c.chaves_api || null,
          chaveApiId: c.chave_api_id || null,
          empresas: [],
        });
      }
      map.get(key).empresas.push(c);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === '_sem_rede') return 1;
      if (b.id === '_sem_rede') return -1;
      return (a.chaveApi?.nome || '').localeCompare(b.chaveApi?.nome || '');
    });
  }, [filtered]);

  const toggleRede = (redeId) => {
    setExpandedRedes(prev => {
      const next = new Set(prev);
      next.has(redeId) ? next.delete(redeId) : next.add(redeId);
      return next;
    });
  };

  const totalAtivos = clientes.filter(c => c.status === 'ativo').length;
  const totalInativos = clientes.filter(c => c.status === 'inativo').length;
  const totalWebposto = clientes.filter(c => c.usa_webposto).length;

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Clientes" description="Gestão de clientes e empresas atendidas">
        <button onClick={() => setModalWizard({ open: true, preRede: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Cliente
        </button>
      </PageHeader>

      {/* KPIs - sem Receita Mensal */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total" value={clientes.length} icon={Building2} color="blue" />
        <KpiCard label="Ativos" value={totalAtivos} icon={Check} color="emerald" />
        <KpiCard label="Com Webposto" value={totalWebposto} icon={Zap} color="amber" />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, razão social ou CNPJ..."
            className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      {/* Tabela agrupada por Rede */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200/60 overflow-hidden shadow-sm">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : redes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Network className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-800 mb-1">Nenhuma rede encontrada</p>
            <p className="text-xs text-gray-400 mb-4">
              {clientes.length === 0 ? 'Clique em "Novo Cliente" para cadastrar o primeiro' : 'Ajuste os filtros para ver mais resultados'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-medium">Rede</th>
                  <th className="text-left px-6 py-3 font-medium">Provedor</th>
                  <th className="text-center px-6 py-3 font-medium">Integração</th>
                  <th className="text-center px-6 py-3 font-medium">Empresas</th>
                  <th className="text-center px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {redes.map((rede) => {
                  const expanded = expandedRedes.has(rede.id);
                  const nomeRede = rede.chaveApi?.nome || 'Sem rede';
                  const provedor = rede.chaveApi?.provedor || '—';
                  const usaWebposto = rede.empresas.some(c => c.usa_webposto);
                  const redeAtiva = rede.chaveApi?.ativo !== false && rede.id !== '_sem_rede';
                  return (
                    <React.Fragment key={rede.id}>
                      <tr onClick={() => toggleRede(rede.id)}
                        className={`cursor-pointer transition-colors group ${expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </motion.div>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex-shrink-0">
                              <Network className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{nomeRede}</p>
                              <p className="text-[11px] text-gray-400">
                                {rede.empresas.length} empresa{rede.empresas.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-600">
                          {rede.chaveApi?.provedor ? (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 uppercase tracking-wide">
                              {provedor}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {usaWebposto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium">
                              <Zap className="h-2.5 w-2.5" /> Webposto
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[10px] font-medium">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-center text-sm font-semibold text-gray-700 tabular-nums">
                          {rede.empresas.length}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {rede.id === '_sem_rede' ? (
                            <span className="text-[10px] text-gray-400">—</span>
                          ) : redeAtiva ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium">
                              <Check className="h-2.5 w-2.5" /> Ativa
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[10px] font-medium">Inativa</span>
                          )}
                        </td>
                        <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {rede.chaveApiId && (
                              <>
                                <button onClick={() => setModalWizard({ open: true, preRede: rede })}
                                  className="rounded-md p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Vincular empresas">
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setModalContas({ open: true, cliente: rede.empresas[0] })}
                                  className="rounded-md p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Classificar contas bancárias">
                                  <Landmark className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Linhas expandidas: empresas da rede */}
                      {expanded && rede.empresas.map((cliente) => (
                        <tr key={cliente.id}
                          onClick={() => setModalDetail({ open: true, cliente })}
                          className="bg-gray-50/30 hover:bg-blue-50/40 transition-colors group cursor-pointer">
                          <td className="pl-16 pr-6 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white border border-gray-200 text-blue-700 font-semibold text-[11px] flex-shrink-0">
                                {(cliente.nome || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-gray-900 truncate">{cliente.nome}</p>
                                {cliente.razao_social && cliente.razao_social !== cliente.nome && (
                                  <p className="text-[10px] text-gray-400 truncate">{cliente.razao_social}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-2.5 text-[11px] font-mono text-gray-600">{cliente.cnpj || '—'}</td>
                          <td className="px-6 py-2.5 text-[11px] text-gray-600 text-center">{cliente.segmento || '—'}</td>
                          <td className="px-6 py-2.5 text-center">
                            {cliente.empresa_codigo != null ? (
                              <span className="text-[10px] text-gray-500 font-mono">#{cliente.empresa_codigo}</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-2.5 text-center">
                            <StatusBadge status={cliente.status} />
                          </td>
                          <td className="px-6 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setModalEdit({ open: true, data: cliente })}
                                className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setModalConfirm({
                                open: true,
                                message: `Excluir "${cliente.nome}"?`,
                                onConfirm: () => { handleDelete(cliente); setModalConfirm({ open: false }); },
                              })}
                                className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Modals */}
      <WizardNovoCliente
        open={modalWizard.open}
        preRede={modalWizard.preRede}
        empresasJaVinculadas={modalWizard.preRede
          ? (clientes.filter(c => c.chave_api_id === modalWizard.preRede.chaveApiId)
              .map(c => c.empresa_codigo).filter(v => v != null))
          : []}
        onClose={() => setModalWizard({ open: false, preRede: null })}
        onSaved={() => { setModalWizard({ open: false, preRede: null }); carregar(); }}
        showToast={showToast}
      />

      <ModalEditar
        open={modalEdit.open} cliente={modalEdit.data}
        onClose={() => setModalEdit({ open: false, data: null })}
        onSaved={() => { setModalEdit({ open: false, data: null }); carregar(); }}
        showToast={showToast}
      />

      <ModalDetail
        open={modalDetail.open} cliente={modalDetail.cliente}
        onClose={() => setModalDetail({ open: false, cliente: null })}
        onClassificarContas={(cli) => {
          setModalDetail({ open: false, cliente: null });
          setModalContas({ open: true, cliente: cli });
        }}
      />

      <ModalContasBancarias
        open={modalContas.open} cliente={modalContas.cliente}
        onClose={() => setModalContas({ open: false, cliente: null })}
        showToast={showToast}
      />

      <ModalConfirm open={modalConfirm.open} message={modalConfirm.message}
        onClose={() => setModalConfirm({ open: false })} onConfirm={modalConfirm.onConfirm} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════
function KpiCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
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
// Wizard: Novo Cliente (Manual ou Webposto)
// ═══════════════════════════════════════════════════════════
function WizardNovoCliente({ open, onClose, onSaved, showToast, preRede = null, empresasJaVinculadas = [] }) {
  const [step, setStep] = useState('choice');  // choice | webposto-key | webposto-select | form
  const [method, setMethod] = useState(null);

  // Webposto flow
  const [chaveNome, setChaveNome] = useState('');
  const [chaveValor, setChaveValor] = useState('');
  const [urlBase, setUrlBase] = useState('https://web.qualityautomacao.com.br/INTEGRACAO');
  const [buscando, setBuscando] = useState(false);
  const [empresasWebposto, setEmpresasWebposto] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [chaveApiRecord, setChaveApiRecord] = useState(null);

  // Manual form (also used after Webposto fetch)
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Rede form (Autosystem)
  const [redeNome, setRedeNome] = useState('');
  const [redeSlug, setRedeSlug] = useState('');
  const [redeSlugEdited, setRedeSlugEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset padrao
    setMethod(null);
    setChaveNome('');
    setChaveValor('');
    setUrlBase('https://web.qualityautomacao.com.br/INTEGRACAO');
    setEmpresasWebposto([]);
    setSelecionadas(new Set());
    setChaveApiRecord(null);
    setForm(emptyForm());
    setRedeNome('');
    setRedeSlug('');
    setRedeSlugEdited(false);

    // Modo vincular empresas em uma rede ja existente:
    // pula direto para o step de selecao, ja com a chave e empresas carregadas.
    if (preRede?.chaveApiId) {
      (async () => {
        try {
          setBuscando(true);
          setMethod('webposto');
          const chaves = await mapService.listarChavesApi();
          const chave = chaves.find(c => c.id === preRede.chaveApiId);
          if (!chave) throw new Error('Chave API não encontrada');
          setChaveApiRecord(chave);
          setChaveNome(chave.nome);
          setChaveValor(chave.chave);
          setUrlBase(chave.url_base || 'https://web.qualityautomacao.com.br/INTEGRACAO');
          const empresas = await qualityApi.buscarEmpresas(chave.chave);
          setEmpresasWebposto(empresas || []);
          setStep('webposto-select');
        } catch (err) {
          showToast?.('error', 'Erro ao carregar empresas da rede: ' + err.message);
          setStep('choice');
        } finally { setBuscando(false); }
      })();
    } else {
      setStep('choice');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preRede?.chaveApiId]);

  // auto-gerar slug enquanto o usuario nao tiver editado manualmente
  useEffect(() => {
    if (!redeSlugEdited) setRedeSlug(autosystemService.gerarSlug(redeNome));
  }, [redeNome, redeSlugEdited]);

  const salvarRede = async () => {
    try {
      setSaving(true);
      await autosystemService.criarRede({ nome: redeNome.trim(), slug: redeSlug.trim() });
      showToast('success', 'Rede cadastrada');
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const escolherMetodo = (m) => {
    setMethod(m);
    if (m === 'webposto') {
      setStep('webposto-key');
    } else if (m === 'rede') {
      setStep('rede-form');
    } else {
      setStep('form');
    }
  };

  const buscarEmpresasWebposto = async () => {
    if (!chaveValor.trim()) return;
    try {
      setBuscando(true);
      // Salva a chave API no Supabase
      const chave = await mapService.criarChaveApi({
        nome: chaveNome || 'Webposto',
        provedor: 'quality',
        chave: chaveValor.trim(),
        url_base: urlBase,
      });
      setChaveApiRecord(chave);

      // Busca empresas
      const empresas = await qualityApi.buscarEmpresas(chaveValor.trim());
      await mapService.salvarEmpresasApi(chave.id, empresas);
      setEmpresasWebposto(empresas);
      setStep('webposto-select');
    } catch (err) {
      showToast('error', 'Erro ao buscar empresas: ' + err.message);
    } finally {
      setBuscando(false);
    }
  };

  const importarEmpresasSelecionadas = async () => {
    if (selecionadas.size === 0) return;
    try {
      setSaving(true);
      const empresas = empresasWebposto.filter(e => selecionadas.has(e.codigo || e.empresaCodigo));
      const clientesBatch = empresas.map(e => ({
        nome: e.fantasia || e.razao,
        razao_social: e.razao,
        cnpj: e.cnpj,
        endereco: e.endereco,
        numero: e.numero,
        bairro: e.bairro,
        cidade: e.cidade,
        estado: e.estado,
        cep: e.cep,
        segmento: 'Posto de Combustível',
        status: 'ativo',
        chave_api_id: chaveApiRecord.id,
        empresa_codigo: e.empresaCodigo || e.codigo,
        usa_webposto: true,
      }));
      await clientesService.criarClientesBatch(clientesBatch);
      showToast('success', `${clientesBatch.length} cliente(s) importado(s)`);
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const salvarManual = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await clientesService.criarCliente({ ...form, usa_webposto: false });
      showToast('success', 'Cliente cadastrado');
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEmpresa = (codigo) => {
    setSelecionadas(prev => {
      const next = new Set(prev);
      next.has(codigo) ? next.delete(codigo) : next.add(codigo);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={titleFor(step)} size={step === 'webposto-select' ? 'lg' : 'md'}>
      <AnimatePresence mode="wait">
        {/* STEP 1: CHOICE */}
        {step === 'choice' && (
          <motion.div key="choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">Como deseja cadastrar o cliente?</p>

            <button onClick={() => escolherMetodo('webposto')}
              className="w-full text-left rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4 hover:border-amber-300 hover:bg-amber-50 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">Integrar com Webposto</p>
                  <p className="text-xs text-gray-500">Cliente usa o sistema Webposto. Insira a chave API para importar os dados automaticamente.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-amber-600 transition-colors mt-3" />
              </div>
            </button>

            <button onClick={() => escolherMetodo('manual')}
              className="w-full text-left rounded-xl border-2 border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/40 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Pencil className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">Cadastro manual</p>
                  <p className="text-xs text-gray-500">Preencha os dados do cliente manualmente.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors mt-3" />
              </div>
            </button>

            <button onClick={() => escolherMetodo('rede')}
              className="w-full text-left rounded-xl border-2 border-violet-200 bg-violet-50/40 p-4 hover:border-violet-300 hover:bg-violet-50 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Network className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">Cadastrar Rede (Autosystem)</p>
                  <p className="text-xs text-gray-500">Cadastra apenas a rede de empresas que utiliza Autosystem, sem dados individuais.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-violet-600 transition-colors mt-3" />
              </div>
            </button>
          </motion.div>
        )}

        {/* STEP 2: WEBPOSTO KEY */}
        {step === 'webposto-key' && (
          <motion.div key="key" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
            className="space-y-4">
            <button onClick={() => setStep('choice')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>

            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 flex gap-2">
              <Key className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Forneca a <strong>chave de integração Webposto</strong> do cliente. Vamos buscar todas as empresas vinculadas a essa chave e você podera escolher quais cadastrar.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome da chave (identificação)</label>
              <input type="text" value={chaveNome} onChange={e => setChaveNome(e.target.value)}
                placeholder="Ex: Rede Trivela"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Chave API *</label>
              <input type="text" required value={chaveValor} onChange={e => setChaveValor(e.target.value)}
                placeholder="f89021bf-d9e5-481d-b6a0-..."
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">URL base</label>
              <input type="text" value={urlBase} onChange={e => setUrlBase(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono text-[11px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
              <button onClick={buscarEmpresasWebposto} disabled={buscando || !chaveValor.trim()}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Buscar empresas
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: WEBPOSTO SELECT */}
        {step === 'webposto-select' && (
          <motion.div key="select" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
            className="space-y-4">
            <button onClick={() => setStep('webposto-key')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{empresasWebposto.length} empresa(s) encontrada(s)</p>
                <p className="text-xs text-gray-400">Selecione as que deseja cadastrar como clientes</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelecionadas(new Set(empresasWebposto
                    .map(e => e.codigo || e.empresaCodigo)
                    .filter(c => !(empresasJaVinculadas || []).includes(c))))}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700">Selecionar todas</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setSelecionadas(new Set())}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-700">Limpar</button>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
              {empresasWebposto.map(e => {
                const codigo = e.codigo || e.empresaCodigo;
                const jaVinculada = (empresasJaVinculadas || []).includes(codigo);
                const isSelected = !jaVinculada && selecionadas.has(codigo);
                return (
                  <label key={codigo}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      jaVinculada ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                        : isSelected ? 'bg-amber-50/60 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'
                    }`}>
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      jaVinculada ? 'bg-emerald-500 border-emerald-500'
                        : isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                    }`}>
                      {(isSelected || jaVinculada) && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={isSelected} disabled={jaVinculada}
                      onChange={() => !jaVinculada && toggleEmpresa(codigo)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{e.fantasia || e.razao}</p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                        <span className="font-mono">{e.cnpj}</span>
                        <span className="text-gray-300">•</span>
                        <span>{e.cidade}/{e.estado}</span>
                      </div>
                    </div>
                    {jaVinculada && (
                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 flex-shrink-0">
                        Já vinculada
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-50 rounded px-1.5 py-0.5 flex-shrink-0">
                      #{codigo}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
              <button onClick={importarEmpresasSelecionadas} disabled={saving || selecionadas.size === 0}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Importar {selecionadas.size > 0 ? `(${selecionadas.size})` : ''}
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 4: MANUAL STEPPED FORM */}
        {step === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <ClienteSteppedForm
              form={form} setForm={setForm}
              saving={saving}
              onCancel={() => setStep('choice')}
              onSubmit={salvarManual}
              submitLabel="Cadastrar"
            />
          </motion.div>
        )}

        {/* STEP 5: REDE AUTOSYSTEM */}
        {step === 'rede-form' && (
          <motion.form key="rede" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
            onSubmit={(e) => { e.preventDefault(); salvarRede(); }}
            className="space-y-5">
            <button type="button" onClick={() => setStep('choice')}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>

            <div className="rounded-xl bg-violet-50/60 border border-violet-200 p-3 flex gap-2">
              <Network className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-violet-900 leading-relaxed">
                Cadastre apenas a <strong>rede de empresas Autosystem</strong>. Esse cadastro e usado pelo sistema de sincronizacao de dados e não cria um cliente individual.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome da rede *</label>
              <input type="text" required autoFocus value={redeNome}
                onChange={(e) => setRedeNome(e.target.value)}
                placeholder="Ex: Rede Trivela"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Slug <span className="text-gray-400 font-normal">(identificador unico)</span>
              </label>
              <input type="text" required value={redeSlug}
                onChange={(e) => { setRedeSlug(e.target.value); setRedeSlugEdited(true); }}
                placeholder="rede-trivela"
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
              <p className="text-[11px] text-gray-400 mt-1">Gerado automaticamente a partir do nome. Pode ser editado.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving || !redeNome.trim() || !redeSlug.trim()}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Network className="h-4 w-4" /> Cadastrar rede
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function titleFor(step) {
  if (step === 'choice') return 'Novo Cliente';
  if (step === 'webposto-key') return 'Integração Webposto';
  if (step === 'webposto-select') return 'Selecionar empresas';
  if (step === 'form') return 'Cadastro manual';
  if (step === 'rede-form') return 'Cadastrar Rede (Autosystem)';
  return 'Novo Cliente';
}

function emptyForm() {
  return {
    nome: '', razao_social: '', cnpj: '',
    inscricao_estadual: '', inscricao_municipal: '',
    regime_tributario: '', segmento: '', status: 'ativo',
    contato_nome: '', contato_email: '', contato_telefone: '',
    endereco: '', numero: '', bairro: '', cidade: '', estado: '', cep: '',
    observacoes: '',
  };
}

// ═══════════════════════════════════════════════════════════
// Stepped Form (3 passos sem rolagem)
// ═══════════════════════════════════════════════════════════
const STEPS = [
  { id: 1, label: 'Empresa', fields: ['nome', 'razao_social', 'cnpj', 'regime_tributario', 'segmento', 'status'] },
  { id: 2, label: 'Contato', fields: ['contato_nome', 'contato_email', 'contato_telefone'] },
  { id: 3, label: 'Endereço', fields: ['endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep'] },
];

function ClienteSteppedForm({ form, setForm, saving, onCancel, onSubmit, submitLabel = 'Salvar' }) {
  const [stepIndex, setStepIndex] = useState(0);
  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const isLast = stepIndex === STEPS.length - 1;
  const canAdvance = stepIndex === 0 ? !!form.nome?.trim() : true;

  const handleNext = (e) => {
    e?.preventDefault?.();
    if (isLast) {
      onSubmit({ preventDefault: () => {} });
    } else {
      setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      onCancel();
    } else {
      setStepIndex(i => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={s.id} className="flex items-center flex-1 gap-2">
              <button
                onClick={() => i <= stepIndex && setStepIndex(i)}
                disabled={i > stepIndex}
                className={`flex items-center gap-2 text-left ${i <= stepIndex ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? <Check className="h-3 w-3" /> : s.id}
                </div>
                <span className={`text-[12px] font-medium transition-colors ${isActive ? 'text-gray-900' : isDone ? 'text-gray-700' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px transition-colors ${i < stepIndex ? 'bg-blue-200' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <form onSubmit={handleNext}>
        <AnimatePresence mode="wait">
          {stepIndex === 0 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome / Fantasia *</label>
                <input type="text" required autoFocus value={form.nome || ''} onChange={e => setField('nome', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Razão Social</label>
                <input type="text" value={form.razao_social || ''} onChange={e => setField('razao_social', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CNPJ</label>
                  <input type="text" value={form.cnpj || ''} onChange={e => setField('cnpj', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Regime Tributário</label>
                  <select value={form.regime_tributario || ''} onChange={e => setField('regime_tributario', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">—</option>
                    <option value="Simples Nacional">Simples Nacional</option>
                    <option value="Lucro Presumido">Lucro Presumido</option>
                    <option value="Lucro Real">Lucro Real</option>
                    <option value="MEI">MEI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Segmento</label>
                  <input type="text" value={form.segmento || ''} onChange={e => setField('segmento', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status || 'ativo'} onChange={e => setField('status', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {stepIndex === 1 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome do contato</label>
                <input type="text" autoFocus value={form.contato_nome || ''} onChange={e => setField('contato_nome', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.contato_email || ''} onChange={e => setField('contato_email', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
                <input type="text" value={form.contato_telefone || ''} onChange={e => setField('contato_telefone', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </motion.div>
          )}

          {stepIndex === 2 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Endereço</label>
                <input type="text" autoFocus value={form.endereco || ''} onChange={e => setField('endereco', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                  <input type="text" value={form.numero || ''} onChange={e => setField('numero', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
                  <input type="text" value={form.bairro || ''} onChange={e => setField('bairro', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
                  <input type="text" value={form.cidade || ''} onChange={e => setField('cidade', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
                  <input type="text" maxLength={2} value={form.estado || ''} onChange={e => setField('estado', e.target.value.toUpperCase())}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm uppercase focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
                  <input type="text" value={form.cep || ''} onChange={e => setField('cep', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex justify-between gap-3 pt-5 mt-5 border-t border-gray-100">
          <button type="button" onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {stepIndex === 0 ? 'Voltar' : 'Anterior'}
          </button>
          <button type="submit" disabled={saving || !canAdvance}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && isLast && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLast ? submitLabel : 'Próximo'}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal Editar Cliente
// ═══════════════════════════════════════════════════════════
function ModalEditar({ open, cliente, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState(null); // 'exibir_dre' | 'exibir_fluxo_caixa' | null

  useEffect(() => {
    if (open && cliente) setForm(cliente);
  }, [open, cliente]);

  const toggleRelatorioFlag = async (campo) => {
    if (!cliente) return;
    const novo = !form[campo];
    setForm(f => ({ ...f, [campo]: novo }));
    try {
      setTogglingFlag(campo);
      await clientesService.atualizarCliente(cliente.id, { [campo]: novo });
      showToast('success', novo ? 'Relatório liberado para o cliente' : 'Relatório bloqueado para o cliente');
      onSaved?.();
    } catch (err) {
      setForm(f => ({ ...f, [campo]: !novo })); // rollback
      showToast('error', err.message);
    } finally {
      setTogglingFlag(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await clientesService.atualizarCliente(cliente.id, form);
      showToast('success', 'Cliente atualizado');
      onSaved();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const atualizarWebposto = async () => {
    try {
      setAtualizando(true);
      // Busca a chave API do cliente
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) {
        showToast('error', 'Chave API não encontrada');
        return;
      }

      // Busca empresas atualizadas
      const empresas = await qualityApi.buscarEmpresas(chave.chave);
      const empresa = empresas.find(e => (e.empresaCodigo || e.codigo) === cliente.empresa_codigo);

      if (!empresa) {
        showToast('error', 'Empresa não encontrada na API');
        return;
      }

      // Atualiza com dados frescos
      await clientesService.atualizarCliente(cliente.id, {
        nome: empresa.fantasia || empresa.razao,
        razao_social: empresa.razao,
        cnpj: empresa.cnpj,
        endereco: empresa.endereco,
        numero: empresa.numero,
        bairro: empresa.bairro,
        cidade: empresa.cidade,
        estado: empresa.estado,
        cep: empresa.cep,
      });

      // Atualiza cache
      await mapService.salvarEmpresasApi(chave.id, empresas);

      showToast('success', 'Dados atualizados do Webposto');
      onSaved();
    } catch (err) {
      showToast('error', 'Erro ao atualizar: ' + err.message);
    } finally {
      setAtualizando(false);
    }
  };

  if (!cliente) return null;

  // ─── Cliente com Webposto: tela simplificada ──────────
  if (cliente.usa_webposto) {
    return (
      <Modal open={open} onClose={onClose} title="Editar Cliente" size="sm">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 font-semibold flex-shrink-0">
              {(cliente.nome || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{cliente.nome}</p>
              <p className="text-xs text-gray-500 font-mono truncate">{cliente.cnpj}</p>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 mb-0.5">Cliente integrado com Webposto</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Os dados cadastrais deste cliente são sincronizados automaticamente com a API Webposto. Para atualizar, clique no botão abaixo.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoBlock label="Empresa" value={`#${cliente.empresa_codigo}`} mono />
            <InfoBlock label="Cidade" value={cliente.cidade ? `${cliente.cidade}/${cliente.estado}` : '—'} />
          </div>

          {/* Relatorios liberados pro portal do cliente */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-900">Relatórios no portal do cliente</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Controle o que este cliente pode visualizar ao acessar o portal.
              </p>
            </div>
            <ToggleRelatorio
              icon={BarChart3}
              label="DRE"
              desc="Demonstração do resultado do exercicio"
              ativo={!!form.exibir_dre}
              loading={togglingFlag === 'exibir_dre'}
              disabled={togglingFlag !== null}
              onToggle={() => toggleRelatorioFlag('exibir_dre')}
            />
            <ToggleRelatorio
              icon={TrendingUp}
              label="Fluxo de Caixa"
              desc="Entradas e saídas por período"
              ativo={!!form.exibir_fluxo_caixa}
              loading={togglingFlag === 'exibir_fluxo_caixa'}
              disabled={togglingFlag !== null}
              onToggle={() => toggleRelatorioFlag('exibir_fluxo_caixa')}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Fechar
            </button>
            <button onClick={atualizarWebposto} disabled={atualizando}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
              {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar dados do Webposto
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ─── Cliente manual: wizard de 3 passos ───────────────
  return (
    <Modal open={open} onClose={onClose} title="Editar Cliente" size="md">
      <ClienteSteppedForm
        form={form} setForm={setForm}
        saving={saving}
        onCancel={onClose}
        onSubmit={handleSave}
        submitLabel="Salvar alteracoes"
      />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Toggle de relatorio (usado no ModalEditar)
// ═══════════════════════════════════════════════════════════
function ToggleRelatorio({ icon: Icon, label, desc, ativo, loading, disabled, onToggle }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
      ativo ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
    }`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
        ativo ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-gray-900">{label}</p>
        <p className="text-[11px] text-gray-500 truncate">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
          ativo ? 'bg-blue-600' : 'bg-gray-300'
        }`}
        aria-pressed={ativo}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          ativo ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`} />
        {loading && (
          <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 text-white animate-spin" />
        )}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal Detalhes
// ═══════════════════════════════════════════════════════════
function ModalDetail({ open, cliente, onClose, onClassificarContas }) {
  if (!cliente) return null;

  const endereco = [cliente.endereco, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(', ');

  return (
    <Modal open={open} onClose={onClose} title="Detalhes do Cliente" size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 font-bold text-xl">
            {(cliente.nome || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{cliente.nome}</h3>
            {cliente.razao_social && <p className="text-xs text-gray-500 truncate">{cliente.razao_social}</p>}
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={cliente.status} />
              {cliente.usa_webposto && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium">
                  <Zap className="h-2.5 w-2.5" /> Webposto
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoBlock label="CNPJ" value={cliente.cnpj} mono />
          <InfoBlock label="Regime" value={cliente.regime_tributario} />
          <InfoBlock label="Segmento" value={cliente.segmento} />
          <InfoBlock label="Inscricao Estadual" value={cliente.inscricao_estadual} mono />
        </div>

        {(cliente.contato_nome || cliente.contato_email || cliente.contato_telefone) && (
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Contato</h4>
            <div className="space-y-2">
              {cliente.contato_nome && <ContactLine icon={UsersIcon}>{cliente.contato_nome}</ContactLine>}
              {cliente.contato_email && <ContactLine icon={Mail}>{cliente.contato_email}</ContactLine>}
              {cliente.contato_telefone && <ContactLine icon={Phone}>{cliente.contato_telefone}</ContactLine>}
            </div>
          </div>
        )}

        {endereco && (
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Endereço</h4>
            <ContactLine icon={MapPin}>{endereco} {cliente.cep && <span className="text-gray-400">· CEP {cliente.cep}</span>}</ContactLine>
          </div>
        )}

        {cliente.usa_webposto && (
          <div className="rounded-lg bg-amber-50/40 dark:bg-amber-500/10 border border-amber-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-600" />
              <p className="text-xs font-semibold text-amber-900">Integração Webposto</p>
            </div>
            {cliente.chaves_api && (
              <p className="text-[11px] text-amber-700">
                Chave: <span className="font-mono">{cliente.chaves_api.nome}</span>
                {cliente.empresa_codigo != null && <> · Empresa #{cliente.empresa_codigo}</>}
              </p>
            )}
            {onClassificarContas && (
              <button type="button" onClick={() => onClassificarContas(cliente)}
                className="flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50 transition-colors">
                <Landmark className="h-3.5 w-3.5" /> Classificar contas bancárias
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InfoBlock({ label, value, mono }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-medium text-gray-900 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function ContactLine({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-gray-600">
      <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal Classificar Contas Bancarias
// ═══════════════════════════════════════════════════════════
function ModalContasBancarias({ open, cliente, onClose, showToast }) {
  const [loading, setLoading] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState(null);
  const [itens, setItens] = useState([]); // classificacoes do banco local
  const [salvandoId, setSalvandoId] = useState(null);

  useEffect(() => {
    if (!open || !cliente?.chave_api_id) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const existentes = await contasBancariasService.listarPorRede(cliente.chave_api_id);
        setItens(existentes);
        // Se nao ha classificacoes ainda, sincroniza automaticamente na primeira abertura
        if (existentes.length === 0 && cliente.usa_webposto) {
          await executarSincronizacao();
        }
      } catch (err) {
        setError(err.message);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente?.chave_api_id]);

  const executarSincronizacao = async () => {
    if (!cliente?.chave_api_id) return;
    try {
      setSincronizando(true);
      setError(null);
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada');
      const contasQuality = await qualityApi.buscarContas(chave.chave);
      const atualizados = await contasBancariasService.sincronizarComQuality(cliente.chave_api_id, contasQuality || []);
      setItens(atualizados);
      showToast?.('success', `${atualizados.length} conta(s) sincronizada(s) com Quality`);
    } catch (err) {
      setError('Erro ao sincronizar: ' + err.message);
    } finally { setSincronizando(false); }
  };

  const mudarTipo = async (item, novoTipo) => {
    try {
      setSalvandoId(item.id);
      const atualizado = await contasBancariasService.atualizar(item.id, { tipo: novoTipo });
      setItens(prev => prev.map(i => i.id === item.id ? atualizado : i));
    } catch (err) {
      showToast?.('error', 'Erro ao salvar: ' + err.message);
    } finally { setSalvandoId(null); }
  };

  const mudarAtivo = async (item, ativo) => {
    try {
      setSalvandoId(item.id);
      const atualizado = await contasBancariasService.atualizar(item.id, { ativo });
      setItens(prev => prev.map(i => i.id === item.id ? atualizado : i));
    } catch (err) {
      showToast?.('error', 'Erro ao salvar: ' + err.message);
    } finally { setSalvandoId(null); }
  };

  const iconeTipo = (tipo) => {
    if (tipo === 'bancaria') return <Landmark className="h-3.5 w-3.5 text-blue-600" />;
    if (tipo === 'aplicacao') return <Wallet className="h-3.5 w-3.5 text-emerald-600" />;
    if (tipo === 'caixa') return <Coins className="h-3.5 w-3.5 text-amber-600" />;
    return <Boxes className="h-3.5 w-3.5 text-gray-500" />;
  };

  if (!open || !cliente) return null;

  const redeNome = cliente.chaves_api?.nome || 'Rede';
  return (
    <Modal open={open} onClose={onClose} title={`Classificar contas - ${redeNome}`} size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 p-3 text-[11px] text-blue-800">
          Classificação por <strong>rede</strong>: configure uma vez e vale para todas as empresas da {redeNome}.
          No Quality todas as contas vem como <strong>bancária</strong> — apenas as classificadas como
          <strong> Conta bancária</strong> ou <strong>Conta aplicação</strong> aparecem na Conciliação Bancária.
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            {itens.length} conta{itens.length === 1 ? '' : 's'} classificada{itens.length === 1 ? '' : 's'}
          </p>
          <button type="button" onClick={executarSincronizacao} disabled={sincronizando || loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar com Quality
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          </div>
        ) : itens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
            <Landmark className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Nenhuma conta classificada.</p>
            <p className="text-[11px] text-gray-400 mt-1">Clique em "Sincronizar com Quality" para puxar as contas disponíveis.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-center">Ativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {iconeTipo(item.tipo)}
                        <div>
                          <p className="text-[13px] text-gray-800">{item.descricao || `Conta #${item.conta_codigo}`}</p>
                          <p className="text-[10px] text-gray-400 font-mono">#{item.conta_codigo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={item.tipo}
                        onChange={(e) => mudarTipo(item, e.target.value)}
                        disabled={salvandoId === item.id}
                        className="h-8 rounded-md border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50">
                        {contasBancariasService.TIPOS_CONTA.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {contasBancariasService.TIPOS_CONTA.find(t => t.key === item.tipo)?.hint}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <label className="inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={item.ativo !== false}
                          onChange={(e) => mudarAtivo(item, e.target.checked)}
                          disabled={salvandoId === item.id}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-400" />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal Confirmar
// ═══════════════════════════════════════════════════════════
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
