import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Building2, Mail, Phone, MapPin, Users as UsersIcon,
  Loader2, AlertCircle, Pencil, Trash2, ChevronRight, ChevronDown,
  Check, Zap, ArrowLeft, RefreshCw, Key, Network, Landmark, Wallet, Coins, Boxes,
  Link2, BarChart3, TrendingUp, Eye, EyeOff, Server, Database, Lock, CreditCard, X,
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
import { buscarCep } from '../services/viacepService';

// Mascara IP exibindo apenas o primeiro e o ultimo octeto (ex.: 187.***.***.45).
// Hostnames (sem 4 octetos) caem num fallback que mostra so primeiro/ultimo caractere.
// Mascara o endereço do servidor (IP ou DDNS/hostname) na exibição,
// preservando o suficiente para o admin reconhecer o cliente.
//   - IPv4 (4 octetos numéricos): "187.***.***.45"
//   - Hostname com domínio       : "***.ddns.net" (preserva os 2 últimos segmentos)
//   - Outros                     : "a***z"
function mascararIp(ip) {
  if (!ip) return '';
  const partes = ip.split('.');
  if (partes.length === 4 && partes.every(p => /^\d+$/.test(p))) {
    return `${partes[0]}.***.***.${partes[3]}`;
  }
  if (partes.length >= 2 && partes.some(p => /[a-zA-Z]/.test(p))) {
    const sufixo = partes.slice(-2).join('.');
    return `***.${sufixo}`;
  }
  if (ip.length <= 2) return ip;
  return `${ip[0]}***${ip[ip.length - 1]}`;
}

export default function Clientes({ embedded = false }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const [modalWizard, setModalWizard] = useState({ open: false, preRede: null, editandoRede: null });
  const [modalEdit, setModalEdit] = useState({ open: false, data: null });
  const [modalDetail, setModalDetail] = useState({ open: false, cliente: null });
  const [modalConfirm, setModalConfirm] = useState({ open: false, message: '', onConfirm: null });
  const [modalContas, setModalContas] = useState({ open: false, cliente: null });
  const [expandedRedes, setExpandedRedes] = useState(new Set());
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [modalEmpresasAS, setModalEmpresasAS] = useState({ open: false, rede: null });
  const [modalGruposAS, setModalGruposAS] = useState({ open: false, rede: null });
  const [modalContasAS, setModalContasAS] = useState({ open: false, rede: null });
  const [modalContasReceberAS, setModalContasReceberAS] = useState({ open: false, rede: null });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [data, redes] = await Promise.all([
        clientesService.listarClientes(),
        autosystemService.listarRedes().catch(() => []),
      ]);
      setClientes(data || []);
      setRedesAutosystem(redes || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar clientes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleExcluirRedeAS = async (rede) => {
    try {
      await autosystemService.excluirRede(rede.id);
      showToast('success', `Rede "${rede.nome}" excluída`);
      await carregar();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  // Toggle individual (carrega 1 toggle por vez por rede+flag)
  const [togglesAtivosAS, setTogglesAtivosAS] = useState(new Set());
  const handleToggleRelatorioAS = async (rede, campo) => {
    const key = `${rede.id}:${campo}`;
    if (togglesAtivosAS.has(key)) return;
    setTogglesAtivosAS(prev => new Set(prev).add(key));
    try {
      const novo = !rede[campo];
      await autosystemService.atualizarRede(rede.id, { [campo]: novo });
      setRedesAutosystem(prev => prev.map(r => r.id === rede.id ? { ...r, [campo]: novo } : r));
      const label = campo === 'exibir_dre' ? 'DRE' : 'Fluxo de Caixa';
      showToast('success', `${label} ${novo ? 'liberado' : 'bloqueado'} para a rede`);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setTogglesAtivosAS(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

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

  // Agrupa empresas por rede:
  //   - `chave_api_id` preenchido → rede Webposto (lookup via chaves_api join)
  //   - `as_rede_id` preenchido    → rede Autosystem (lookup via redesAutosystem)
  //   - nenhum dos dois            → grupo "Sem rede"
  const redes = useMemo(() => {
    const asRedeById = new Map((redesAutosystem || []).map(r => [r.id, r]));
    const map = new Map();
    filtered.forEach(c => {
      let key, tipoIntegracao, asRede = null;
      if (c.chave_api_id) {
        key = `wb:${c.chave_api_id}`;
        tipoIntegracao = 'webposto';
      } else if (c.as_rede_id) {
        key = `as:${c.as_rede_id}`;
        tipoIntegracao = 'autosystem';
        asRede = asRedeById.get(c.as_rede_id) || null;
      } else {
        key = '_sem_rede';
        tipoIntegracao = 'manual';
      }
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          tipoIntegracao,
          chaveApi: c.chaves_api || null,
          chaveApiId: c.chave_api_id || null,
          asRede,
          asRedeId: c.as_rede_id || null,
          empresas: [],
        });
      }
      map.get(key).empresas.push(c);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === '_sem_rede') return 1;
      if (b.id === '_sem_rede') return -1;
      const nomeA = a.chaveApi?.nome || a.asRede?.nome || '';
      const nomeB = b.chaveApi?.nome || b.asRede?.nome || '';
      return nomeA.localeCompare(nomeB);
    });
  }, [filtered, redesAutosystem]);

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

      {!embedded && (
        <PageHeader title="Clientes" description="Gestão de clientes e empresas atendidas">
          <button onClick={() => setModalWizard({ open: true, preRede: null, editandoRede: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Novo Cliente
          </button>
        </PageHeader>
      )}
      {embedded && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setModalWizard({ open: true, preRede: null, editandoRede: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Novo Cliente
          </button>
        </div>
      )}

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
                  const nomeRede = rede.chaveApi?.nome || rede.asRede?.nome || 'Sem rede';
                  const provedor = rede.chaveApi?.provedor || '—';
                  const redeAtiva = rede.tipoIntegracao === 'webposto'
                    ? rede.chaveApi?.ativo !== false
                    : rede.tipoIntegracao === 'autosystem'
                      ? rede.asRede?.ativo !== false
                      : null; // _sem_rede
                  return (
                    <React.Fragment key={rede.id}>
                      <tr onClick={() => toggleRede(rede.id)}
                        className={`cursor-pointer transition-colors group ${expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </motion.div>
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white flex-shrink-0">
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
                          ) : rede.tipoIntegracao === 'autosystem' ? (
                            <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 uppercase tracking-wide">
                              Autosystem
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {rede.tipoIntegracao === 'webposto' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium">
                              <Zap className="h-2.5 w-2.5" /> Webposto
                            </span>
                          ) : rede.tipoIntegracao === 'autosystem' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-medium">
                              <Zap className="h-2.5 w-2.5" /> Autosystem
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
                          {redeAtiva === null ? (
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
                                <button onClick={() => setModalWizard({ open: true, preRede: rede, editandoRede: null })}
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

      {/* Redes Autosystem */}
      <SecaoRedesAutosystem
        redes={redesAutosystem}
        loading={loading}
        togglesAtivos={togglesAtivosAS}
        onToggleRelatorio={handleToggleRelatorioAS}
        onNova={() => setModalWizard({ open: true, preRede: null, editandoRede: null })}
        onEditar={(rede) => setModalWizard({ open: true, preRede: null, editandoRede: rede })}
        onImportar={(rede) => setModalEmpresasAS({ open: true, rede })}
        onClassificarGrupos={(rede) => setModalGruposAS({ open: true, rede })}
        onClassificarContas={(rede) => setModalContasAS({ open: true, rede })}
        onClassificarContasReceber={(rede) => setModalContasReceberAS({ open: true, rede })}
        onExcluir={(rede) => setModalConfirm({
          open: true,
          message: `Excluir a rede "${rede.nome}"? Esta ação não pode ser desfeita.`,
          onConfirm: () => { handleExcluirRedeAS(rede); setModalConfirm({ open: false }); },
        })}
      />

      {/* Modals */}
      <WizardNovoCliente
        open={modalWizard.open}
        preRede={modalWizard.preRede}
        editandoRede={modalWizard.editandoRede}
        empresasJaVinculadas={modalWizard.preRede
          ? (clientes.filter(c => c.chave_api_id === modalWizard.preRede.chaveApiId)
              .map(c => c.empresa_codigo).filter(v => v != null))
          : []}
        onClose={() => setModalWizard({ open: false, preRede: null, editandoRede: null })}
        onSaved={() => { setModalWizard({ open: false, preRede: null, editandoRede: null }); carregar(); }}
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

      <ModalEmpresasAutosystem
        open={modalEmpresasAS.open}
        rede={modalEmpresasAS.rede}
        clientesExistentes={clientes}
        onClose={() => setModalEmpresasAS({ open: false, rede: null })}
        onSaved={() => { setModalEmpresasAS({ open: false, rede: null }); carregar(); }}
        showToast={showToast}
      />

      <ModalGruposProdutoAutosystem
        open={modalGruposAS.open}
        rede={modalGruposAS.rede}
        onClose={() => setModalGruposAS({ open: false, rede: null })}
        showToast={showToast}
      />

      <ModalContasCategoriaAutosystem
        open={modalContasAS.open}
        rede={modalContasAS.rede}
        onClose={() => setModalContasAS({ open: false, rede: null })}
        showToast={showToast}
      />

      <ModalContasReceberAutosystem
        open={modalContasReceberAS.open}
        rede={modalContasReceberAS.rede}
        onClose={() => setModalContasReceberAS({ open: false, rede: null })}
        showToast={showToast}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Seção: Redes Autosystem (listagem + ações)
// ═══════════════════════════════════════════════════════════
function SecaoRedesAutosystem({ redes, loading, togglesAtivos, onToggleRelatorio, onNova, onEditar, onImportar, onClassificarGrupos, onClassificarContas, onClassificarContasReceber, onExcluir }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900/40 rounded-xl border border-gray-200/60 dark:border-white/10 overflow-hidden shadow-sm mt-6">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Redes Autosystem</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {redes.length} {redes.length === 1 ? 'rede cadastrada' : 'redes cadastradas'}
            </p>
          </div>
        </div>
        <button onClick={onNova}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nova rede
        </button>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</div>
      ) : redes.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Network className="h-9 w-9 text-gray-300 dark:text-white/10 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Nenhuma rede Autosystem</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Clique em "Nova rede" para cadastrar a primeira rede com credenciais de conexão.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3 font-medium">Nome</th>
                <th className="text-left px-6 py-3 font-medium">Slug</th>
                <th className="text-center px-6 py-3 font-medium">Relatórios liberados</th>
                <th className="text-center px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {redes.map(rede => (
                <tr key={rede.id} className="hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex-shrink-0">
                        <Network className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rede.nome}</p>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-[12px] text-gray-600 dark:text-gray-400 font-mono">{rede.slug}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <ToggleRelatorioMini
                        icon={BarChart3}
                        label="DRE"
                        ativo={!!rede.exibir_dre}
                        loading={togglesAtivos?.has(`${rede.id}:exibir_dre`)}
                        onToggle={() => onToggleRelatorio?.(rede, 'exibir_dre')}
                      />
                      <ToggleRelatorioMini
                        icon={TrendingUp}
                        label="Fluxo"
                        ativo={!!rede.exibir_fluxo_caixa}
                        loading={togglesAtivos?.has(`${rede.id}:exibir_fluxo_caixa`)}
                        onToggle={() => onToggleRelatorio?.(rede, 'exibir_fluxo_caixa')}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {rede.ativo ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium">
                        <Check className="h-2.5 w-2.5" /> Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 px-2 py-0.5 text-[10px] font-medium">Inativa</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onImportar(rede)} title="Importar empresas"
                        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                        <Database className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onClassificarGrupos(rede)} title="Classificar grupos de produto"
                        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                        <Boxes className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onClassificarContas(rede)} title="Classificar contas (formas de recebimento)"
                        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                        <Wallet className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onClassificarContasReceber(rede)} title="Classificar contas a receber (cartões, cheques, notas, faturas)"
                        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
                        <CreditCard className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onEditar(rede)} title="Editar credenciais"
                        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onExcluir(rede)} title="Excluir rede"
                        className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
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
function WizardNovoCliente({ open, onClose, onSaved, showToast, preRede = null, editandoRede = null, empresasJaVinculadas = [] }) {
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
  const [redeIp, setRedeIp] = useState('');
  const [redeIpMascarado, setRedeIpMascarado] = useState(''); // valor mascarado original em modo edicao; usado pra detectar alteracao
  const [redePorta, setRedePorta] = useState('');
  const [redeBanco, setRedeBanco] = useState('');
  const [redeUsuario, setRedeUsuario] = useState('');
  const [redeSenha, setRedeSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

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
    setRedeIp('');
    setRedeIpMascarado('');
    setRedePorta('');
    setRedeBanco('');
    setRedeUsuario('');
    setRedeSenha('');
    setMostrarSenha(false);

    // Modo EDITAR rede Autosystem: pula choice, pre-popula tudo, vai pra rede-form
    if (editandoRede?.id) {
      setMethod('rede');
      setRedeNome(editandoRede.nome || '');
      setRedeSlug(editandoRede.slug || '');
      setRedeSlugEdited(true); // impede o auto-gerador de slug
      setStep('rede-form');
      (async () => {
        try {
          setBuscando(true);
          const cred = await autosystemService.obterCredenciais(editandoRede.id);
          // IP mascarado (so primeiro e ultimo octeto). Porta e banco intencionalmente
          // vazios — "deixe em branco para manter o atual" (mesmo padrao da senha).
          const ipMask = mascararIp(cred?.conexao_ip || '');
          setRedeIp(ipMask);
          setRedeIpMascarado(ipMask);
          setRedePorta('');
          setRedeBanco('');
          setRedeUsuario(cred?.conexao_usuario || '');
          setRedeSenha('');
        } catch (err) {
          showToast?.('error', 'Erro ao carregar credenciais: ' + err.message);
        } finally { setBuscando(false); }
      })();
    }
    // Modo vincular empresas em uma rede ja existente:
    // pula direto para o step de selecao, ja com a chave e empresas carregadas.
    else if (preRede?.chaveApiId) {
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
  }, [open, preRede?.chaveApiId, editandoRede?.id]);

  // auto-gerar slug enquanto o usuario nao tiver editado manualmente
  useEffect(() => {
    if (!redeSlugEdited) setRedeSlug(autosystemService.gerarSlug(redeNome));
  }, [redeNome, redeSlugEdited]);

  const salvarRede = async () => {
    try {
      setSaving(true);
      if (editandoRede?.id) {
        // Modo edicao: campos vazios ou inalterados (IP ainda mascarado) = manter atual.
        // Service preserva o valor quando recebemos undefined no payload.
        const payload = {
          nome: redeNome.trim(),
          slug: redeSlug.trim(),
          conexao_usuario: redeUsuario.trim(),
        };
        const ipTrim = redeIp.trim();
        if (ipTrim !== '' && ipTrim !== redeIpMascarado) payload.conexao_ip = ipTrim;
        if (redePorta !== '') payload.conexao_porta = redePorta;
        if (redeBanco.trim() !== '') payload.conexao_banco = redeBanco.trim();
        if (redeSenha) payload.senha = redeSenha;
        await autosystemService.atualizarRede(editandoRede.id, payload);
        showToast('success', 'Rede atualizada');
      } else {
        await autosystemService.criarRede({
          nome: redeNome.trim(),
          slug: redeSlug.trim(),
          conexao_ip: redeIp.trim() || null,
          conexao_porta: redePorta || null,
          conexao_banco: redeBanco.trim() || null,
          conexao_usuario: redeUsuario.trim() || null,
          senha: redeSenha || null,
        });
        showToast('success', 'Rede cadastrada');
      }
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
    <Modal open={open} onClose={onClose} title={titleFor(step, !!editandoRede)} size={step === 'webposto-select' ? 'lg' : 'md'}>
      <AnimatePresence mode="wait">
        {/* STEP 1: CHOICE */}
        {step === 'choice' && (
          <motion.div key="choice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Como deseja cadastrar o cliente?</p>

            <button onClick={() => escolherMetodo('webposto')}
              className="w-full text-left rounded-xl border-2 border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-500/50 dark:hover:bg-amber-500/15 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Integrar com Webposto</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cliente usa o sistema Webposto. Insira a chave API para importar os dados automaticamente.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors mt-3" />
              </div>
            </button>

            <button onClick={() => escolherMetodo('rede')}
              className="w-full text-left rounded-xl border-2 border-blue-200 bg-blue-50/40 dark:border-blue-500/30 dark:bg-blue-500/10 p-4 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/15 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Integrar com Autosystem</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cadastra apenas a rede de empresas que utiliza Autosystem, sem dados individuais.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors mt-3" />
              </div>
            </button>

            <button onClick={() => escolherMetodo('manual')}
              className="w-full text-left rounded-xl border-2 border-gray-200 dark:border-white/10 p-4 hover:border-blue-300 hover:bg-blue-50/40 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 transition-all group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Pencil className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Cadastro manual</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Preencha os dados do cliente manualmente.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors mt-3" />
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

        {/* STEP 5a: REDE AUTOSYSTEM — Identificação */}
        {step === 'rede-form' && (
          <motion.form key="rede" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
            onSubmit={(e) => { e.preventDefault(); setStep('rede-conexao'); }}
            className="space-y-5">
            <div className="flex items-center justify-between">
              {editandoRede ? <div /> : (
                <button type="button" onClick={() => setStep('choice')}
                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                  <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
              )}
              <PassoIndicador atual={1} total={2} />
            </div>

            <div className="rounded-xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3 flex gap-2">
              <Network className="h-4 w-4 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                {editandoRede ? (
                  <>Editando a rede <strong>{editandoRede.nome}</strong>. Atualize o nome/slug abaixo ou avance para alterar as credenciais.</>
                ) : (
                  <>Cadastre apenas a <strong>rede de empresas Autosystem</strong>. Esse cadastro é usado pelo sistema de sincronização de dados e não cria um cliente individual.</>
                )}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da rede *</label>
              <input type="text" required autoFocus value={redeNome}
                onChange={(e) => setRedeNome(e.target.value)}
                placeholder="Ex: Rede Trivela"
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug <span className="text-gray-400 dark:text-gray-500 font-normal">(identificador único)</span>
              </label>
              <input type="text" required value={redeSlug}
                onChange={(e) => { setRedeSlug(e.target.value); setRedeSlugEdited(true); }}
                placeholder="rede-trivela"
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Gerado automaticamente a partir do nome. Pode ser editado.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-white/10">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={!redeNome.trim() || !redeSlug.trim()}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.form>
        )}

        {/* STEP 5b: REDE AUTOSYSTEM — Conexão */}
        {step === 'rede-conexao' && (
          <motion.form key="rede-conexao" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
            onSubmit={(e) => { e.preventDefault(); salvarRede(); }}
            className="space-y-5">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep('rede-form')}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                <ArrowLeft className="h-3 w-3" /> Voltar
              </button>
              <PassoIndicador atual={2} total={2} />
            </div>

            <div className="rounded-xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3 flex gap-2">
              <Server className="h-4 w-4 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                  Credenciais de conexão ao servidor <strong>{redeNome}</strong>.
                  {editandoRede
                    ? ' Todos os campos são criptografados antes de serem armazenados. Por segurança, o IP aparece mascarado e os demais campos vêm em branco — preencha apenas o que desejar alterar.'
                    : ' Todos os campos são criptografados antes de serem armazenados.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Network className="inline h-3 w-3 mr-1" /> Endereço do servidor
                  <span className="ml-1 text-[10.5px] font-normal text-gray-400">(IP fixo ou DDNS)</span>
                </label>
                <input type="text" autoFocus value={redeIp}
                  onChange={(e) => setRedeIp(e.target.value)}
                  placeholder={editandoRede ? 'Deixe em branco para manter o atual' : '187.45.123.45  ou  meucliente.ddns.net'}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
                <p className="text-[10.5px] text-gray-400 dark:text-gray-500 mt-1">
                  Aceita IP fixo, hostname ou DDNS (ex: <code className="font-mono">no-ip</code>, <code className="font-mono">duckdns</code>). Resolvido a cada consulta.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Porta</label>
                <input type="number" min="1" max="65535" value={redePorta}
                  onChange={(e) => setRedePorta(e.target.value)}
                  placeholder={editandoRede ? 'Manter atual' : '5432'}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Database className="inline h-3 w-3 mr-1" /> Banco de dados
              </label>
              <input type="text" value={redeBanco}
                onChange={(e) => setRedeBanco(e.target.value)}
                placeholder={editandoRede ? 'Deixe em branco para manter o atual' : 'autosystem_prod'}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Usuário</label>
                <input type="text" value={redeUsuario} autoComplete="off"
                  onChange={(e) => setRedeUsuario(e.target.value)}
                  placeholder="usuario_db"
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Lock className="inline h-3 w-3 mr-1" /> Senha
                </label>
                <div className="relative">
                  <input type={mostrarSenha ? 'text' : 'password'} value={redeSenha} autoComplete="new-password"
                    onChange={(e) => setRedeSenha(e.target.value)}
                    placeholder={editandoRede ? 'Deixe em branco para manter' : '••••••••'}
                    className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 pr-10 text-sm font-mono focus:border-blue-400 dark:focus:border-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20" />
                  <button type="button" onClick={() => setMostrarSenha(o => !o)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 p-1.5">
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-white/10">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Network className="h-4 w-4" />
                {editandoRede ? 'Atualizar rede' : 'Cadastrar rede'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function titleFor(step, editando = false) {
  if (step === 'choice') return 'Novo Cliente';
  if (step === 'webposto-key') return 'Integração Webposto';
  if (step === 'webposto-select') return 'Selecionar empresas';
  if (step === 'form') return 'Cadastro manual';
  if (step === 'rede-form') return editando ? 'Editar Rede (Autosystem) — Identificação' : 'Cadastrar Rede (Autosystem) — Identificação';
  if (step === 'rede-conexao') return editando ? 'Editar Rede (Autosystem) — Conexão' : 'Cadastrar Rede (Autosystem) — Conexão';
  return 'Novo Cliente';
}

// Indicador de passos (1/N) usado em fluxos com múltiplas telas
function PassoIndicador({ atual, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const passo = i + 1;
        const ativo = passo === atual;
        const concluido = passo < atual;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold transition-colors ${
              ativo ? 'bg-blue-600 text-white' :
              concluido ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' :
              'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500'
            }`}>
              {concluido ? <Check className="h-3 w-3" /> : passo}
            </div>
            {passo < total && (
              <div className={`h-px w-6 ${concluido ? 'bg-blue-300 dark:bg-blue-500/40' : 'bg-gray-200 dark:bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState('');
  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  // Busca endereço no ViaCEP quando o CEP fica com 8 dígitos
  const handleCepChange = async (raw) => {
    setField('cep', raw);
    setErroCep('');
    const limpo = raw.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    try {
      setBuscandoCep(true);
      const dados = await buscarCep(limpo);
      if (!dados) { setErroCep('CEP não encontrado'); return; }
      // Preenche só campos vazios — não sobrescreve edição manual
      setForm(f => ({
        ...f,
        endereco: f.endereco || dados.endereco || '',
        bairro:   f.bairro   || dados.bairro   || '',
        cidade:   f.cidade   || dados.cidade   || '',
        estado:   f.estado   || dados.estado   || '',
      }));
    } catch (err) {
      setErroCep(err.message);
    } finally { setBuscandoCep(false); }
  };

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
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-2">
                  CEP
                  {buscandoCep && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                  {erroCep && <span className="text-rose-600 text-[10.5px] font-normal">{erroCep}</span>}
                </label>
                <input type="text" autoFocus value={form.cep || ''}
                  onChange={e => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                <p className="text-[10.5px] text-gray-400 mt-1">Digite o CEP completo e o restante do endereço será preenchido automaticamente.</p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Endereço (Rua, Av.)</label>
                  <input type="text" value={form.endereco || ''} onChange={e => setField('endereco', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                  <input type="text" value={form.numero || ''} onChange={e => setField('numero', e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
                <input type="text" value={form.bairro || ''} onChange={e => setField('bairro', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-4 gap-3">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 font-semibold flex-shrink-0">
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

// Versão compacta (pílula clicável) para usar dentro de células de tabela.
function ToggleRelatorioMini({ icon: Icon, label, ativo, loading, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      aria-pressed={ativo}
      title={`${ativo ? 'Liberado' : 'Bloqueado'} — clique para alternar`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50 ${
        ativo
          ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400'
      }`}
    >
      {loading
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Icon className="h-3 w-3" />}
      <span>{label}</span>
      <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${ativo ? 'bg-blue-500' : 'bg-gray-300 dark:bg-white/20'}`} />
    </button>
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
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 font-bold text-xl">
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

  const mudarSangrias = async (item, usar_em_sangrias) => {
    try {
      setSalvandoId(item.id);
      const atualizado = await contasBancariasService.atualizar(item.id, { usar_em_sangrias });
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
                  <th className="px-3 py-2 text-center" title="Marque para incluir os lançamentos desta conta na ferramenta de Sangrias do portal cliente">
                    Sangrias
                  </th>
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
                      <label className="inline-flex items-center cursor-pointer" title="Incluir esta conta nos lançamentos retornados pela tela de Sangrias do portal cliente">
                        <input type="checkbox" checked={!!item.usar_em_sangrias}
                          onChange={(e) => mudarSangrias(item, e.target.checked)}
                          disabled={salvandoId === item.id || item.ativo === false}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 disabled:opacity-40" />
                      </label>
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
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/40 text-[10.5px] text-gray-500">
              <strong className="text-gray-700">Sangrias:</strong> marque as contas cujos lançamentos devem aparecer na ferramenta de Sangrias do portal cliente. Contas inativas não podem ser marcadas.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Importar empresas do Autosystem
// ═══════════════════════════════════════════════════════════
function ModalEmpresasAutosystem({ open, rede, clientesExistentes, onClose, onSaved, showToast }) {
  const [modo, setModo] = useState('importar'); // 'importar' | 'manual'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const FORM_MANUAL_VAZIO = { nome: '', razao_social: '', cnpj: '', empresa_codigo: '' };
  const [formManual, setFormManual] = useState(FORM_MANUAL_VAZIO);
  const [salvandoManual, setSalvandoManual] = useState(false);

  // CNPJs já cadastrados nesta rede (para marcar como "já importada")
  const cnpjsExistentes = useMemo(() => {
    if (!rede) return new Set();
    return new Set(
      (clientesExistentes || [])
        .filter(c => c.as_rede_id === rede.id && c.cnpj)
        .map(c => normalizarCnpj(c.cnpj))
    );
  }, [clientesExistentes, rede]);

  useEffect(() => {
    if (!open || !rede) return;
    setModo('importar');
    setEmpresas([]);
    setSelecionadas(new Set());
    setErro('');
    setBusca('');
    setFormManual(FORM_MANUAL_VAZIO);
    (async () => {
      try {
        setLoading(true);
        const result = await autosystemService.buscarEmpresasAutosystem(rede.id);
        setEmpresas(result);
      } catch (err) {
        setErro(err.message || 'Falha ao buscar empresas');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, rede]);

  const empresasFiltradas = useMemo(() => {
    if (!busca.trim()) return empresas;
    const q = busca.trim().toLowerCase();
    return empresas.filter(e => {
      const nome = extrairNomeEmpresa(e)?.toLowerCase() || '';
      const cnpj = extrairCnpjEmpresa(e) || '';
      return nome.includes(q) || cnpj.includes(busca.trim());
    });
  }, [empresas, busca]);

  const toggleEmpresa = (key) => {
    setSelecionadas(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const toggleTodas = () => {
    const importaveis = empresasFiltradas.filter(e =>
      !cnpjsExistentes.has(normalizarCnpj(extrairCnpjEmpresa(e)))
    );
    if (selecionadas.size === importaveis.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(importaveis.map((_, i) => chaveEmpresa(empresasFiltradas[i], i))));
    }
  };

  const salvar = async () => {
    if (selecionadas.size === 0 || !rede) return;
    try {
      setSaving(true);
      const escolhidas = empresasFiltradas.filter((emp, i) => selecionadas.has(chaveEmpresa(emp, i)));
      const payload = escolhidas.map(emp => mapearEmpresaParaCliente(emp, rede.id));
      await clientesService.criarClientesBatch(payload);
      showToast('success', `${payload.length} ${payload.length === 1 ? 'empresa importada' : 'empresas importadas'}`);
      onSaved();
    } catch (err) {
      showToast('error', 'Erro ao importar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Cadastro manual — usado quando a empresa não consegue ser obtida via integração.
  // empresa_codigo é opcional: sem ele a empresa fica vinculada à rede mas
  // sem acesso a relatórios que dependem do banco remoto (contas a pagar,
  // vendas etc. filtram por empresa_codigo).
  const cnpjManualDuplicado = useMemo(() => {
    const n = normalizarCnpj(formManual.cnpj);
    return n && cnpjsExistentes.has(n);
  }, [formManual.cnpj, cnpjsExistentes]);

  const podeSalvarManual = formManual.nome.trim().length > 0 && !cnpjManualDuplicado;

  const salvarManual = async () => {
    if (!rede || !podeSalvarManual) return;
    setSalvandoManual(true);
    try {
      const ec = String(formManual.empresa_codigo || '').trim();
      const ecNum = ec ? Number(ec) : null;
      if (ec && !Number.isFinite(ecNum)) {
        showToast('error', 'Código da empresa deve ser numérico');
        setSalvandoManual(false);
        return;
      }
      await clientesService.criarCliente({
        nome: formManual.nome.trim(),
        razao_social: formManual.razao_social.trim() || null,
        cnpj: formManual.cnpj.trim() || null,
        empresa_codigo: ecNum,
        as_rede_id: rede.id,
        chave_api_id: null,
        status: 'ativo',
      });
      showToast('success', 'Empresa adicionada manualmente');
      setFormManual(FORM_MANUAL_VAZIO);
      onSaved();
    } catch (err) {
      const msg = err.message?.includes('duplicate') || err.message?.includes('unique')
        ? 'Já existe uma empresa com este CNPJ.'
        : 'Erro ao adicionar: ' + err.message;
      showToast('error', msg);
    } finally {
      setSalvandoManual(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`Empresas — ${rede?.nome || ''}`} size="xl">
      <div className="space-y-4">
        {/* Tabs: importar do servidor vs. cadastro manual */}
        <div className="inline-flex p-1 rounded-lg bg-gray-100 dark:bg-white/5">
          <button onClick={() => setModo('importar')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              modo === 'importar'
                ? 'bg-white dark:bg-white/10 text-blue-700 dark:text-blue-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
            }`}>
            <Server className="h-3.5 w-3.5" /> Importar do servidor
          </button>
          <button onClick={() => setModo('manual')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              modo === 'manual'
                ? 'bg-white dark:bg-white/10 text-blue-700 dark:text-blue-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
            }`}>
            <Plus className="h-3.5 w-3.5" /> Adicionar manualmente
          </button>
        </div>

        {modo === 'manual' ? (
          <FormManualEmpresa
            form={formManual}
            setForm={setFormManual}
            cnpjDuplicado={cnpjManualDuplicado}
            podeSalvar={podeSalvarManual}
            salvando={salvandoManual}
            onSalvar={salvarManual}
            onCancelar={onClose}
          />
        ) : (
          <ConteudoImportarServidor
            loading={loading} erro={erro} empresas={empresas}
            busca={busca} setBusca={setBusca}
            empresasFiltradas={empresasFiltradas}
            cnpjsExistentes={cnpjsExistentes}
            selecionadas={selecionadas}
            toggleEmpresa={toggleEmpresa}
            toggleTodas={toggleTodas}
            saving={saving}
            onCancelar={onClose}
            onSalvar={salvar}
          />
        )}
      </div>
    </Modal>
  );
}

// Conteúdo da aba "Importar do servidor" — extraído pra simplificar o
// componente pai que agora também tem a aba de cadastro manual.
function ConteudoImportarServidor({
  loading, erro, empresas, busca, setBusca, empresasFiltradas,
  cnpjsExistentes, selecionadas, toggleEmpresa, toggleTodas,
  saving, onCancelar, onSalvar,
}) {
  return (
    <>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Selecione as empresas do servidor Autosystem que deseja cadastrar como clientes nesta rede.
      </p>

      {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Conectando ao servidor e buscando empresas...</p>
          </div>
        ) : erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 dark:text-red-300">
              <p className="font-medium mb-1">Falha ao buscar empresas</p>
              <p className="text-xs">{erro}</p>
            </div>
          </div>
        ) : empresas.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma empresa retornada pelo servidor.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou CNPJ..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <button onClick={toggleTodas}
                className="text-xs font-medium text-blue-600 dark:text-blue-300 hover:underline whitespace-nowrap">
                {selecionadas.size > 0 ? 'Limpar seleção' : 'Selecionar todas'}
              </button>
            </div>

            <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-white/5 z-10">
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <th className="px-3 py-2 w-10"></th>
                    <th className="text-left px-3 py-2 font-medium">Nome / Razão social</th>
                    <th className="text-left px-3 py-2 font-medium">CNPJ</th>
                    <th className="text-center px-3 py-2 font-medium w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {empresasFiltradas.map((emp, i) => {
                    const nome = extrairNomeEmpresa(emp) || '(sem nome)';
                    const cnpj = extrairCnpjEmpresa(emp);
                    const cnpjNorm = normalizarCnpj(cnpj);
                    const jaImportada = cnpjNorm && cnpjsExistentes.has(cnpjNorm);
                    const key = chaveEmpresa(emp, i);
                    const isChecked = selecionadas.has(key);
                    return (
                      <tr key={key}
                        className={`${jaImportada ? 'bg-gray-50 dark:bg-white/5 opacity-60' : 'hover:bg-blue-50/40 dark:hover:bg-blue-500/5 cursor-pointer'} transition-colors`}
                        onClick={() => !jaImportada && toggleEmpresa(key)}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={jaImportada}
                            onChange={() => toggleEmpresa(key)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{nome}</p>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                          {formatarCnpj(cnpj) || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {jaImportada ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-2 py-0.5 text-[10px] font-medium">
                              <Check className="h-2.5 w-2.5" /> Importada
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium">
                              Disponível
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-white/10">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selecionadas.size} {selecionadas.size === 1 ? 'empresa selecionada' : 'empresas selecionadas'}
                {empresas.length > 0 && ` de ${empresas.length}`}
              </p>
              <div className="flex gap-3">
                <button onClick={onCancelar}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={onSalvar} disabled={selecionadas.size === 0 || saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Importar {selecionadas.size > 0 && `(${selecionadas.size})`}
                </button>
              </div>
            </div>
          </>
        )}
    </>
  );
}

// Formulário de cadastro manual de empresa numa rede Autosystem.
// Use quando a empresa não conseguir ser obtida via integração — preencha
// pelo menos o Nome. O Código da empresa (empresa_codigo) é opcional, mas
// sem ele a empresa fica vinculada à rede sem acesso aos relatórios que
// dependem do banco remoto (Contas a pagar/receber, Vendas, etc.).
function FormManualEmpresa({ form, setForm, cnpjDuplicado, podeSalvar, salvando, onSalvar, onCancelar }) {
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2.5 flex items-start gap-2.5 text-[12px] text-amber-800 dark:text-amber-200">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
        <div>
          Use este formulário só quando a empresa não puder ser obtida via
          integração. Sem o <strong>código da empresa</strong>, ela fica vinculada
          à rede mas não aparece nos relatórios que dependem do banco remoto
          (Contas a pagar/receber, Vendas, Dashboard etc.). Você pode preencher
          o código depois, quando a integração estiver disponível.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Nome (fantasia) <span className="text-rose-500">*</span>
          </label>
          <input type="text" value={form.nome} onChange={set('nome')} autoFocus
            placeholder="Ex: Posto Central"
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Razão social
          </label>
          <input type="text" value={form.razao_social} onChange={set('razao_social')}
            placeholder="Ex: Posto Central Combustíveis LTDA"
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            CNPJ
          </label>
          <input type="text" value={form.cnpj} onChange={set('cnpj')}
            placeholder="00.000.000/0000-00"
            className={`w-full h-10 rounded-lg border bg-white dark:bg-white/5 px-3 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 ${
              cnpjDuplicado
                ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/20'
                : 'border-gray-200 dark:border-white/10 focus:border-blue-400 focus:ring-blue-500/20'
            }`} />
          {cnpjDuplicado && (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
              Já existe uma empresa com este CNPJ nesta rede.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Código da empresa <span className="text-gray-400 normal-case font-normal tracking-normal">(opcional)</span>
          </label>
          <input type="text" inputMode="numeric" value={form.empresa_codigo} onChange={set('empresa_codigo')}
            placeholder="Ex: 1023"
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-mono text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <p className="mt-1 text-[10.5px] text-gray-400 dark:text-gray-500">
            ID interno da empresa no Autosystem. Sem isso, relatórios do banco remoto ficam indisponíveis.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-white/10">
        <button onClick={onCancelar}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
          Cancelar
        </button>
        <button onClick={onSalvar} disabled={!podeSalvar || salvando}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <Plus className="h-3.5 w-3.5" /> Adicionar empresa
        </button>
      </div>
    </div>
  );
}

// Mapeamento exato de colunas do Autosystem (tabela `empresa`) → colunas
// de `clientes` no Supabase. As correspondências foram fornecidas pelo
// cliente e refletem o schema real do servidor:
//
//   nome           → razao_social
//   nome_reduzido  → nome
//   grid           → empresa_codigo
//   cpf            → cnpj
//   inscr_est      → inscricao_estadual
//   logradouro     → endereco
//   numero, complemento, bairro, cidade, estado, cep → idem
function pickField(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function extrairNomeEmpresa(emp) {
  return pickField(emp, ['nome_reduzido', 'fantasia', 'nome_fantasia', 'nome']);
}

function extrairRazaoSocial(emp) {
  return pickField(emp, ['nome', 'razao_social', 'razao']);
}

function extrairCnpjEmpresa(emp) {
  return pickField(emp, ['cpf', 'cnpj', 'cnpj_cpf', 'cgc']);
}

function normalizarCnpj(cnpj) {
  if (!cnpj) return '';
  return String(cnpj).replace(/\D/g, '');
}

function formatarCnpj(cnpj) {
  const v = normalizarCnpj(cnpj);
  if (v.length !== 14) return cnpj || '';
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

function chaveEmpresa(emp, i) {
  const cnpj = normalizarCnpj(extrairCnpjEmpresa(emp));
  if (cnpj) return `cnpj:${cnpj}`;
  const id = pickField(emp, ['grid', 'codigo', 'cod_empresa', 'empresa_id', 'id']);
  if (id) return `id:${id}`;
  return `idx:${i}`;
}

function mapearEmpresaParaCliente(emp, redeId) {
  const cnpj = normalizarCnpj(extrairCnpjEmpresa(emp));
  // `grid` é o identificador interno da empresa no Autosystem (usado por
  // `movto.empresa` nas consultas de contas a pagar/receber etc.).
  // Reusamos a coluna `empresa_codigo` (integer) já existente em clientes.
  const gridRaw = pickField(emp, ['grid', 'codigo', 'cod_empresa', 'id']);
  const empresaCodigo = gridRaw != null && /^-?\d+$/.test(String(gridRaw))
    ? Number(gridRaw)
    : null;

  return {
    nome: extrairNomeEmpresa(emp) || extrairRazaoSocial(emp) || 'Empresa sem nome',
    razao_social: extrairRazaoSocial(emp) || null,
    cnpj: cnpj ? formatarCnpj(cnpj) : null,
    inscricao_estadual: pickField(emp, ['inscr_est', 'inscricao_estadual', 'ie']),
    inscricao_municipal: pickField(emp, ['inscr_mun', 'inscricao_municipal', 'im']),
    endereco: pickField(emp, ['logradouro', 'endereco', 'rua']),
    numero: pickField(emp, ['numero', 'num', 'nro']),
    complemento: pickField(emp, ['complemento', 'compl']),
    bairro: pickField(emp, ['bairro']),
    cidade: pickField(emp, ['cidade', 'municipio']),
    estado: pickField(emp, ['estado', 'uf']),
    cep: pickField(emp, ['cep']),
    status: 'ativo',
    as_rede_id: redeId,
    empresa_codigo: empresaCodigo,
  };
}

// ═══════════════════════════════════════════════════════════
// Modal: Classificar grupos de produto Autosystem
// ═══════════════════════════════════════════════════════════
// Lista todos os grupos vindos do servidor Autosystem (via Edge
// Function) e permite escolher, para cada um, a categoria interna
// (combustivel / automotivos / conveniencia). O estado inicial é
// hidratado de as_rede_grupo_produto (Supabase).
const CATEGORIAS_GRUPO = [
  { key: 'combustivel',  label: 'Combustível',  cor: 'amber'   },
  { key: 'automotivos',  label: 'Automotivos',  cor: 'blue'    },
  { key: 'conveniencia', label: 'Conveniência', cor: 'emerald' },
  { key: 'outros',       label: 'Outros',       cor: 'gray'    },
];
const CAT_CLASSES = {
  amber:   { ativa: 'bg-amber-100 text-amber-700 border-amber-300',     idle: 'border-gray-200 text-gray-500 hover:border-amber-300' },
  blue:    { ativa: 'bg-blue-100 text-blue-700 border-blue-300',         idle: 'border-gray-200 text-gray-500 hover:border-blue-300' },
  emerald: { ativa: 'bg-emerald-100 text-emerald-700 border-emerald-300', idle: 'border-gray-200 text-gray-500 hover:border-emerald-300' },
  gray:    { ativa: 'bg-gray-200 text-gray-700 border-gray-300',         idle: 'border-gray-200 text-gray-500 hover:border-gray-400' },
};

function ModalGruposProdutoAutosystem({ open, rede, onClose, showToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [grupos, setGrupos] = useState([]); // [{ codigo, grid, nome, categoria }]
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!open || !rede) return;
    setGrupos([]);
    setErro('');
    setBusca('');
    (async () => {
      try {
        setLoading(true);
        // Busca em paralelo: catálogo remoto + categorias já salvas
        const [remotos, salvos] = await Promise.all([
          autosystemService.buscarGruposProdutoAutosystem(rede.id),
          autosystemService.listarGruposProdutoRede(rede.id),
        ]);
        const porCodigo = new Map();
        (salvos || []).forEach(s => {
          if (s.codigo != null) porCodigo.set(Number(s.codigo), s.categoria);
        });
        setGrupos((remotos || []).map(g => ({
          codigo: g.codigo != null ? Number(g.codigo) : null,
          grid: g.grid != null ? Number(g.grid) : null,
          nome: g.nome || '—',
          categoria: g.codigo != null ? (porCodigo.get(Number(g.codigo)) || '') : '',
        })));
      } catch (err) {
        setErro(err.message || 'Falha ao buscar grupos');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, rede]);

  const gruposFiltrados = useMemo(() => {
    if (!busca.trim()) return grupos;
    const q = busca.trim().toLowerCase();
    return grupos.filter(g =>
      (g.nome || '').toLowerCase().includes(q)
      || String(g.codigo).includes(busca.trim()),
    );
  }, [grupos, busca]);

  const setCategoria = (codigo, categoria) => {
    setGrupos(prev => prev.map(g => g.codigo === codigo
      ? { ...g, categoria: g.categoria === categoria ? '' : categoria }
      : g
    ));
  };

  const contagem = useMemo(() => {
    const total = grupos.length;
    const classificados = grupos.filter(g => g.categoria).length;
    return { total, classificados, pendentes: total - classificados };
  }, [grupos]);

  const salvar = async () => {
    if (!rede) return;
    try {
      setSaving(true);
      await autosystemService.salvarGruposProdutoCategoria(rede.id, grupos);
      showToast('success', `${contagem.classificados} grupo(s) classificado(s) salvo(s)`);
      onClose();
    } catch (err) {
      showToast('error', 'Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`Classificar grupos de produto — ${rede?.nome || ''}`} size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Para cada grupo de produto trazido do servidor Autosystem, defina a categoria interna do Portal CCI.
          Grupos não classificados ficam sem categoria (e poderão ser ignorados em relatórios).
        </p>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Buscando grupos de produto do servidor...</p>
          </div>
        ) : erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 dark:text-red-300">
              <p className="font-medium mb-1">Falha ao buscar grupos</p>
              <p className="text-xs">{erro}</p>
            </div>
          </div>
        ) : grupos.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum grupo de produto retornado pelo servidor.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text"
                  placeholder="Buscar por nome ou código..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <p className="text-[11px] text-gray-500 whitespace-nowrap">
                {contagem.classificados}/{contagem.total} classificados
                {contagem.pendentes > 0 && <span className="text-amber-600 ml-1">· {contagem.pendentes} pendente(s)</span>}
              </p>
            </div>

            <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-white/5 z-10">
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-medium">Grupo</th>
                    <th className="px-3 py-2 text-center font-medium">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {gruposFiltrados.map((g) => (
                    <tr key={g.codigo ?? g.nome} className="hover:bg-gray-50/40 dark:hover:bg-white/5">
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{g.nome}</p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          cód {g.codigo ?? '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {CATEGORIAS_GRUPO.map(cat => {
                            const ativa = g.categoria === cat.key;
                            const cls = CAT_CLASSES[cat.cor];
                            return (
                              <button key={cat.key} type="button"
                                onClick={() => setCategoria(g.codigo, cat.key)}
                                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                                  ativa ? cls.ativa : `bg-white dark:bg-white/5 ${cls.idle}`
                                }`}>
                                {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-white/10">
              <p className="text-[11px] text-gray-500">Clique novamente em uma categoria para desmarcá-la.</p>
              <div className="flex gap-3">
                <button onClick={onClose} disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={salvar} disabled={saving || grupos.length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar classificações
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Classificar contas (formas de recebimento) Autosystem
// ═══════════════════════════════════════════════════════════
const CATEGORIAS_CONTA = [
  { key: 'dinheiro',    label: 'Dinheiro',        cor: 'emerald' },
  { key: 'cartao_pix',  label: 'Cartão / PIX',    cor: 'blue'    },
  { key: 'cheque',      label: 'Cheque',          cor: 'violet'  },
  { key: 'a_prazo',     label: 'A prazo',         cor: 'amber'   },
  { key: 'sobra_caixa', label: 'Sobra de caixa',  cor: 'teal'    },
  { key: 'falta_caixa', label: 'Falta de caixa',  cor: 'rose'    },
  { key: 'outros',      label: 'Outros',          cor: 'gray'    },
];
const CAT_CONTA_CLASSES = {
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  blue:    'bg-blue-100 text-blue-700 border-blue-300',
  violet:  'bg-blue-100 text-blue-700 border-blue-300',
  amber:   'bg-amber-100 text-amber-700 border-amber-300',
  teal:    'bg-teal-100 text-teal-700 border-teal-300',
  rose:    'bg-rose-100 text-rose-700 border-rose-300',
  gray:    'bg-gray-200 text-gray-700 border-gray-300',
};

// Constrói uma árvore a partir dos `codigo` (separados por ponto).
// Cada nó: { codigo, nome, filhos[], folha }.
function montarArvoreContas(contas) {
  const byCode = new Map();
  contas.forEach(c => {
    byCode.set(c.codigo, { ...c, filhos: [], folha: true });
  });

  // Garante que prefixos pais existam (mesmo se não vierem da query).
  contas.forEach(c => {
    const parts = String(c.codigo).split('.');
    for (let i = 1; i < parts.length; i++) {
      const pref = parts.slice(0, i).join('.');
      if (!byCode.has(pref)) {
        byCode.set(pref, { codigo: pref, nome: '—', filhos: [], folha: false, sintetico: true });
      }
    }
  });

  // Liga filhos
  const raizes = [];
  Array.from(byCode.values()).forEach(n => {
    const parts = String(n.codigo).split('.');
    if (parts.length === 1) {
      raizes.push(n);
    } else {
      const paiCode = parts.slice(0, -1).join('.');
      const pai = byCode.get(paiCode);
      if (pai) {
        pai.filhos.push(n);
        pai.folha = false;
      } else {
        raizes.push(n);
      }
    }
  });

  // Ordena recursivamente pelo codigo "natural" (parts numéricos quando possível)
  const sortByCode = (a, b) => {
    const pa = String(a.codigo).split('.');
    const pb = String(b.codigo).split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = Number(pa[i]); const nb = Number(pb[i]);
      const va = Number.isFinite(na) ? na : (pa[i] || '');
      const vb = Number.isFinite(nb) ? nb : (pb[i] || '');
      if (va < vb) return -1;
      if (va > vb) return 1;
    }
    return 0;
  };
  const ord = (nos) => {
    nos.sort(sortByCode);
    nos.forEach(n => { if (n.filhos.length > 0) ord(n.filhos); });
  };
  ord(raizes);
  return raizes;
}

// Retorna todos os códigos descendentes (recursivo) de um nó da árvore.
function descendentesDe(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    out.push(n.codigo);
    n.filhos.forEach(f => stack.push(f));
  }
  return out;
}

function ModalContasCategoriaAutosystem({ open, rede, onClose, showToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contas, setContas] = useState([]); // lista plana vinda do servidor
  const [categoriaLocal, setCategoriaLocal] = useState(new Map()); // codigo → categoria (draft)
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState(new Set()); // codigos marcados
  const [expandidos, setExpandidos] = useState(new Set());     // nós abertos
  const [aplicarOpen, setAplicarOpen] = useState(false);
  const aplicarRef = useRef(null);

  useEffect(() => {
    if (!open || !rede) return;
    setContas([]);
    setCategoriaLocal(new Map());
    setSelecionados(new Set());
    setExpandidos(new Set());
    setErro('');
    setBusca('');
    setAplicarOpen(false);
    (async () => {
      try {
        setLoading(true);
        const [remotas, salvas] = await Promise.all([
          autosystemService.buscarContasAutosystem(rede.id),
          autosystemService.listarContasCategorizadasRede(rede.id),
        ]);
        setContas(remotas || []);
        const m = new Map();
        (salvas || []).forEach(s => {
          if (s.codigo) m.set(String(s.codigo), s.categoria);
        });
        setCategoriaLocal(m);
        // Abre a raiz por padrão (top-level) para o usuário não começar tudo fechado
        const raizesInit = new Set();
        (remotas || []).forEach(c => {
          const parts = String(c.codigo).split('.');
          if (parts.length === 1) raizesInit.add(c.codigo);
        });
        setExpandidos(raizesInit);
      } catch (err) {
        setErro(err.message || 'Falha ao buscar contas');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, rede]);

  // Fecha dropdown "Aplicar" ao clicar fora
  useEffect(() => {
    const onClick = (e) => { if (aplicarRef.current && !aplicarRef.current.contains(e.target)) setAplicarOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Árvore montada (memo)
  const arvore = useMemo(() => montarArvoreContas(contas), [contas]);

  // Filtro de busca: marca quais nós devem ser visíveis (e seus ancestrais)
  const visiveis = useMemo(() => {
    if (!busca.trim()) return null; // null = sem filtro, mostra tudo
    const q = busca.trim().toLowerCase();
    const setVis = new Set();
    const marcar = (n) => {
      const bateu = (n.codigo || '').toLowerCase().includes(q) || (n.nome || '').toLowerCase().includes(q);
      const filhosBateu = (n.filhos || []).map(marcar).some(Boolean);
      if (bateu || filhosBateu) {
        setVis.add(n.codigo);
        return true;
      }
      return false;
    };
    arvore.forEach(marcar);
    return setVis;
  }, [arvore, busca]);

  const toggleExpand = (codigo) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
      return next;
    });
  };

  // Marca/desmarca um nó e propaga para os descendentes
  const toggleSelecionar = (node) => {
    const codigos = descendentesDe(node);
    setSelecionados(prev => {
      const next = new Set(prev);
      const todosMarcados = codigos.every(c => prev.has(c));
      codigos.forEach(c => { if (todosMarcados) next.delete(c); else next.add(c); });
      return next;
    });
  };

  // Aplica uma categoria a todos os selecionados (apenas folhas — sintéticos
  // não são salvos no Supabase, são só agrupadores). Passar `null` para remover.
  const aplicarCategoria = (categoria) => {
    setCategoriaLocal(prev => {
      const next = new Map(prev);
      selecionados.forEach(codigo => {
        // Não permite categorizar prefixo sintético (sem nome real)
        const conta = contas.find(c => c.codigo === codigo);
        if (!conta) return;
        if (categoria) next.set(codigo, categoria);
        else next.delete(codigo);
      });
      return next;
    });
    setSelecionados(new Set());
    setAplicarOpen(false);
  };

  const totalCategorizados = useMemo(() => {
    let n = 0;
    contas.forEach(c => { if (categoriaLocal.get(c.codigo)) n += 1; });
    return n;
  }, [contas, categoriaLocal]);

  const salvar = async () => {
    if (!rede) return;
    try {
      setSaving(true);
      // Monta payload para upsert (categorias preenchidas) e delete (vazias)
      const payload = contas.map(c => ({
        codigo: c.codigo,
        nome: c.nome,
        categoria: categoriaLocal.get(c.codigo) || null,
      }));
      await autosystemService.salvarContasCategoria(rede.id, payload);
      showToast('success', `${totalCategorizados} conta(s) classificada(s) salvas`);
      onClose();
    } catch (err) {
      showToast('error', 'Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`Classificar contas — ${rede?.nome || ''}`} size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Marque as contas que pertencem a uma mesma forma de recebimento e clique em
          <strong> "Atribuir categoria"</strong> para aplicar em lote. Você pode marcar um nó
          intermediário e todos os filhos serão selecionados juntos.
        </p>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Buscando contas do servidor...</p>
          </div>
        ) : erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1">Falha ao buscar contas</p>
              <p className="text-xs">{erro}</p>
            </div>
          </div>
        ) : contas.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Nenhuma conta retornada pelo servidor.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text"
                  placeholder="Buscar por código ou nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <p className="text-[11px] text-gray-500 whitespace-nowrap">
                {totalCategorizados}/{contas.length} classificadas
                {selecionados.size > 0 && <span className="text-blue-600 ml-1">· {selecionados.size} selecionada(s)</span>}
              </p>
              <div ref={aplicarRef} className="relative">
                <button onClick={() => setAplicarOpen(o => !o)}
                  disabled={selecionados.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  Atribuir categoria <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <AnimatePresence>
                  {aplicarOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-xl z-50 overflow-hidden">
                      {CATEGORIAS_CONTA.map(cat => (
                        <button key={cat.key} type="button"
                          onClick={() => aplicarCategoria(cat.key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-gray-50">
                          <span className={`inline-block w-3 h-3 rounded-sm border ${CAT_CONTA_CLASSES[cat.cor]}`} />
                          <span>{cat.label}</span>
                        </button>
                      ))}
                      <div className="border-t border-gray-100" />
                      <button type="button" onClick={() => aplicarCategoria(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" /> Remover categoria
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
              <ArvoreContas
                nodes={arvore}
                visiveis={visiveis}
                expandidos={expandidos}
                onToggleExpand={toggleExpand}
                selecionados={selecionados}
                onToggleSelecionar={toggleSelecionar}
                categoriaLocal={categoriaLocal}
                profundidade={0}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-500">
                Categorias: {CATEGORIAS_CONTA.map(c => c.label).join(' · ')}.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={salvar} disabled={saving || contas.length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar classificações
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ArvoreContas({ nodes, visiveis, expandidos, onToggleExpand, selecionados, onToggleSelecionar, categoriaLocal, profundidade }) {
  return (
    <>
      {nodes
        .filter(n => !visiveis || visiveis.has(n.codigo))
        .map(n => {
          const temFilhos = n.filhos && n.filhos.length > 0;
          const aberta = expandidos.has(n.codigo) || !!visiveis;
          const codigosDescendentes = descendentesDe(n);
          const todosMarcados = codigosDescendentes.every(c => selecionados.has(c));
          const algunsMarcados = !todosMarcados && codigosDescendentes.some(c => selecionados.has(c));
          const categoria = categoriaLocal.get(n.codigo);
          const cat = CATEGORIAS_CONTA.find(c => c.key === categoria);
          return (
            <div key={n.codigo}>
              <div
                className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 transition-colors ${
                  algunsMarcados ? 'bg-blue-50/40' : ''
                }`}
                style={{ paddingLeft: 8 + profundidade * 20 }}
              >
                {temFilhos ? (
                  <button type="button" onClick={() => onToggleExpand(n.codigo)}
                    className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded">
                    <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${aberta ? 'rotate-90' : ''}`} />
                  </button>
                ) : (
                  <span className="w-[18px] flex-shrink-0" />
                )}
                <input type="checkbox"
                  checked={todosMarcados}
                  ref={el => { if (el) el.indeterminate = algunsMarcados; }}
                  onChange={() => onToggleSelecionar(n)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400 flex-shrink-0" />
                <span className="text-[11px] text-gray-400 font-mono w-[90px] flex-shrink-0 truncate">{n.codigo}</span>
                <span className={`text-sm flex-1 truncate ${n.sintetico ? 'text-gray-400 italic' : 'text-gray-800'}`}>
                  {n.nome || '—'}
                </span>
                {cat && (
                  <span className={`text-[10px] rounded-full border px-2 py-0.5 ${CAT_CONTA_CLASSES[cat.cor]} flex-shrink-0`}>
                    {cat.label}
                  </span>
                )}
              </div>
              {aberta && temFilhos && (
                <ArvoreContas
                  nodes={n.filhos}
                  visiveis={visiveis}
                  expandidos={expandidos}
                  onToggleExpand={onToggleExpand}
                  selecionados={selecionados}
                  onToggleSelecionar={onToggleSelecionar}
                  categoriaLocal={categoriaLocal}
                  profundidade={profundidade + 1}
                />
              )}
            </div>
          );
        })}
    </>
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

// ═══════════════════════════════════════════════════════════
// Modal: Classificar contas a receber por PREFIXO (Autosystem)
// ═══════════════════════════════════════════════════════════
const CAT_CONTA_RECEBER = [
  { key: 'cartoes',     label: 'Cartões',           cor: 'blue'   },
  { key: 'cheques',     label: 'Cheques',           cor: 'teal'   },
  { key: 'notas_prazo', label: 'Notas a prazo',     cor: 'violet' },
  { key: 'faturas',     label: 'Faturas a receber', cor: 'amber'  },
];
const CAT_RECEBER_CLASSES = {
  blue:   'bg-blue-50  text-blue-700  border-blue-200',
  teal:   'bg-teal-50  text-teal-700  border-teal-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
};
const CAT_RECEBER_CHIP = {
  blue:   'bg-blue-100  text-blue-800  border-blue-300',
  teal:   'bg-teal-100  text-teal-800  border-teal-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  amber:  'bg-amber-100 text-amber-800 border-amber-300',
};

function ModalContasReceberAutosystem({ open, rede, onClose, showToast }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prefixos, setPrefixos] = useState([]);
  const [salvandoId, setSalvandoId] = useState(null);

  useEffect(() => {
    if (!open || !rede?.id) return;
    (async () => {
      try {
        setLoading(true); setError(null);
        const lista = await autosystemService.listarPrefixosCategoriaRede(rede.id);
        setPrefixos(lista);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [open, rede?.id]);

  const adicionarPrefixo = async (categoria, prefixo, descricao) => {
    if (!prefixo) return;
    const p = String(prefixo).trim();
    if (!p) return;
    if (!/^1\.3(\.|$)/.test(p)) {
      showToast?.('error', `Prefixo "${p}" inválido. Deve começar com "1.3".`);
      return;
    }
    if (prefixos.some(x => x.prefixo === p)) {
      showToast?.('error', `Prefixo "${p}" já está cadastrado.`);
      return;
    }
    try {
      const novo = await autosystemService.criarPrefixoCategoria({
        as_rede_id: rede.id, categoria, prefixo: p, descricao: descricao?.trim() || null,
      });
      setPrefixos(prev => [...prev, novo].sort((a, b) =>
        a.categoria.localeCompare(b.categoria) || a.prefixo.localeCompare(b.prefixo)
      ));
      showToast?.('success', `Prefixo "${p}" adicionado em ${CAT_CONTA_RECEBER.find(c => c.key === categoria)?.label}.`);
    } catch (err) {
      showToast?.('error', 'Erro ao adicionar: ' + err.message);
    }
  };

  const removerPrefixo = async (item) => {
    try {
      setSalvandoId(item.id);
      await autosystemService.excluirPrefixoCategoria(item.id);
      setPrefixos(prev => prev.filter(p => p.id !== item.id));
    } catch (err) {
      showToast?.('error', 'Erro ao remover: ' + err.message);
    } finally { setSalvandoId(null); }
  };

  const toggleAtivo = async (item) => {
    try {
      setSalvandoId(item.id);
      const atualizado = await autosystemService.atualizarPrefixoCategoria(item.id, { ativo: !item.ativo });
      setPrefixos(prev => prev.map(p => p.id === item.id ? atualizado : p));
    } catch (err) {
      showToast?.('error', 'Erro ao salvar: ' + err.message);
    } finally { setSalvandoId(null); }
  };

  const porCategoria = useMemo(() => {
    const mapa = new Map(CAT_CONTA_RECEBER.map(c => [c.key, []]));
    for (const p of prefixos) {
      if (mapa.has(p.categoria)) mapa.get(p.categoria).push(p);
    }
    return mapa;
  }, [prefixos]);

  if (!open || !rede) return null;
  const redeNome = rede.nome;

  return (
    <Modal open={open} onClose={onClose} title={`Classificar contas a receber por prefixo — ${redeNome}`} size="xl">
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3 text-[11.5px] text-blue-800 leading-relaxed">
          Cadastre os <strong>prefixos</strong> de cada categoria. Qualquer conta cujo código <em>comece</em> com
          um prefixo cadastrado será classificada naquela categoria. Ex.: o prefixo <code className="font-mono bg-white/60 px-1 rounded">1.3.01</code> classifica <code className="font-mono bg-white/60 px-1 rounded">1.3.01</code>, <code className="font-mono bg-white/60 px-1 rounded">1.3.01.05</code>, <code className="font-mono bg-white/60 px-1 rounded">1.3.01.06</code> etc.
          <br />Contas <code className="font-mono bg-white/60 px-1 rounded">1.3.*</code> que não casam com nenhum prefixo cadastrado caem em <strong>Outros</strong> automaticamente.
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CAT_CONTA_RECEBER.map(cat => (
              <CardCategoriaPrefixo
                key={cat.key}
                categoria={cat}
                prefixos={porCategoria.get(cat.key) || []}
                salvandoId={salvandoId}
                onAdicionar={(prefixo, descricao) => adicionarPrefixo(cat.key, prefixo, descricao)}
                onRemover={removerPrefixo}
                onToggleAtivo={toggleAtivo}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CardCategoriaPrefixo({ categoria, prefixos, salvandoId, onAdicionar, onRemover, onToggleAtivo }) {
  const [novoPrefixo, setNovoPrefixo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const classes = CAT_RECEBER_CLASSES[categoria.cor];
  const chipClasses = CAT_RECEBER_CHIP[categoria.cor];

  const submeter = (e) => {
    e?.preventDefault();
    if (!novoPrefixo.trim()) return;
    onAdicionar(novoPrefixo, novaDescricao);
    setNovoPrefixo(''); setNovaDescricao('');
  };

  return (
    <div className={`rounded-xl border p-3 ${classes}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold">{categoria.label}</h3>
        <span className="text-[10.5px] opacity-70">
          {prefixos.length} {prefixos.length === 1 ? 'prefixo' : 'prefixos'}
        </span>
      </div>

      {/* Chips de prefixos cadastrados */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[40px]">
        {prefixos.length === 0 ? (
          <p className="text-[11px] opacity-60 italic">Nenhum prefixo cadastrado.</p>
        ) : prefixos.map(p => (
          <div key={p.id}
            className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${chipClasses} ${!p.ativo ? 'opacity-50' : ''}`}>
            <button onClick={() => onToggleAtivo(p)} disabled={salvandoId === p.id}
              title={p.ativo ? 'Desativar' : 'Ativar'}
              className="font-mono hover:underline">
              {p.prefixo}
            </button>
            {p.descricao && <span className="opacity-70 text-[10px]">· {p.descricao}</span>}
            <button onClick={() => onRemover(p)} disabled={salvandoId === p.id}
              title="Remover"
              className="ml-0.5 opacity-50 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Form de adicionar */}
      <form onSubmit={submeter} className="flex items-center gap-1.5">
        <input type="text" value={novoPrefixo} onChange={e => setNovoPrefixo(e.target.value)}
          placeholder="1.3.XX" maxLength={20}
          className="w-20 h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <input type="text" value={novaDescricao} onChange={e => setNovaDescricao(e.target.value)}
          placeholder="Descrição (opcional)" maxLength={60}
          className="flex-1 min-w-0 h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <button type="submit"
          className="inline-flex items-center justify-center h-8 px-2.5 rounded-md bg-white border border-gray-200 text-[11px] font-medium hover:bg-gray-50">
          + Adicionar
        </button>
      </form>
    </div>
  );
}
