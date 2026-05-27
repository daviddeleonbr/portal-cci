import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, ChevronRight, ChevronDown, Layers, Key,
  Loader2, AlertCircle, Search, Link2, Unlink, Building2,
  ArrowLeft, RefreshCw, FolderOpen, Check, GripVertical,
  Zap, Pencil, FileBarChart, Wallet,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as dreService from '../services/mascaraDreService';
import * as fluxoService from '../services/mascaraFluxoCaixaService';
import * as clientesService from '../services/clientesService';
import * as manualService from '../services/mapeamentoManualService';
import * as autosystemService from '../services/autosystemService';
import * as vendasMapService from '../services/mapeamentoVendasService';
import * as vendasAutosystemMapService from '../services/mapeamentoVendasAutosystemService';
import { CATEGORIAS_VENDA } from '../services/mapeamentoVendasAutosystemService';
import { TIPOS_VENDA } from '../services/mapeamentoVendasService';
import { ShoppingCart, Fuel, DollarSign } from 'lucide-react';

// ─── Adapter: seleciona services/campos conforme tipo de mapeamento ───
function makeAdapter(tipoMapeamento) {
  if (tipoMapeamento === 'fluxo') {
    return {
      tipo: 'fluxo',
      label: 'Fluxo de Caixa',
      grupoIdField: 'grupo_fluxo_id',
      grupoRelField: 'grupos_fluxo_caixa',
      // Mascaras + grupos
      listarMascaras: fluxoService.listarMascaras,
      listarGrupos: fluxoService.listarGrupos,
      // Webposto mapping
      listarMapeamentos: fluxoService.listarMapeamentosEmpresa,
      criarMapeamentosBatch: fluxoService.criarMapeamentosEmpresaBatch,
      excluirMapeamento: fluxoService.excluirMapeamentoEmpresa,
      // Manual por rede Autosystem
      listarContasManualPorRede: fluxoService.listarContasManualPorRede,
      criarContaManualPorRede: fluxoService.criarContaManualPorRede,
      atualizarContaManual: fluxoService.atualizarContaManual,
      excluirContaManual: fluxoService.excluirContaManual,
    };
  }
  return {
    tipo: 'dre',
    label: 'DRE',
    grupoIdField: 'grupo_dre_id',
    grupoRelField: 'grupos_dre',
    listarMascaras: dreService.listarMascaras,
    listarGrupos: dreService.listarGrupos,
    listarMapeamentos: mapService.listarMapeamentos,
    criarMapeamentosBatch: mapService.criarMapeamentosBatch,
    excluirMapeamento: mapService.excluirMapeamento,
    listarContasManualPorRede: manualService.listarContasPorRede,
    criarContaManualPorRede: manualService.criarContaPorRede,
    atualizarContaManual: manualService.atualizarConta,
    excluirContaManual: manualService.excluirConta,
  };
}

// ═══════════════════════════════════════════════════════════
export default function Mapeamento() {
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [tipoMapeamento, setTipoMapeamento] = useState('dre'); // 'dre' | 'fluxo'
  const [tab, setTab] = useState('webposto');
  const adapter = useMemo(() => makeAdapter(tipoMapeamento), [tipoMapeamento]);

  // Webposto state
  const [chaves, setChaves] = useState([]);
  const [chaveSelecionada, setChaveSelecionada] = useState(null);
  const [loadingChaves, setLoadingChaves] = useState(true);
  const [modalChave, setModalChave] = useState({ open: false, data: null });

  // Autosystem (manual por rede) state
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [redeSelecionada, setRedeSelecionada] = useState(null);
  const [loadingRedes, setLoadingRedes] = useState(true);

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const carregarChaves = useCallback(async () => {
    try {
      setLoadingChaves(true);
      const data = await mapService.listarChavesApi();
      setChaves(data || []);
    } catch (err) {
      showToast('error', 'Erro ao carregar chaves: ' + err.message);
    } finally {
      setLoadingChaves(false);
    }
  }, []);

  const carregarRedes = useCallback(async () => {
    try {
      setLoadingRedes(true);
      const [redes, todosClientes] = await Promise.all([
        autosystemService.listarRedes(),
        clientesService.listarClientes(),
      ]);
      // Agrupa empresas (clientes) por rede, igual ao padrão Webposto
      const empresasPorRede = new Map();
      (todosClientes || []).forEach(c => {
        if (!c.as_rede_id) return;
        if (!empresasPorRede.has(c.as_rede_id)) empresasPorRede.set(c.as_rede_id, []);
        empresasPorRede.get(c.as_rede_id).push(c);
      });
      const enriquecidas = (redes || []).map(r => ({
        ...r,
        clientes: empresasPorRede.get(r.id) || [],
      }));
      setRedesAutosystem(enriquecidas);
    } catch (err) {
      showToast('error', 'Erro ao carregar redes: ' + err.message);
    } finally {
      setLoadingRedes(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'webposto') carregarChaves();
    if (tab === 'autosystem') carregarRedes();
  }, [tab, carregarChaves, carregarRedes]);

  const salvarChave = async (form) => {
    try {
      if (form.id) {
        await mapService.atualizarChaveApi(form.id, { nome: form.nome, chave: form.chave });
      } else {
        await mapService.criarChaveApi({ nome: form.nome, chave: form.chave });
      }
      setModalChave({ open: false, data: null });
      showToast('success', 'Chave salva');
      await carregarChaves();
    } catch (err) { showToast('error', err.message); }
  };

  const excluirChave = async (id) => {
    try {
      await mapService.excluirChaveApi(id);
      if (chaveSelecionada?.id === id) setChaveSelecionada(null);
      showToast('success', 'Chave excluida');
      await carregarChaves();
    } catch (err) { showToast('error', err.message); }
  };

  const inWebpostoWorkspace = tab === 'webposto' && chaveSelecionada;
  const inAutosystemWorkspace = tab === 'autosystem' && redeSelecionada;
  const inAnyWorkspace = inWebpostoWorkspace || inAutosystemWorkspace;

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Mapeamento" description={`Vincule contas ao ${adapter.label} (Webposto ou Autosystem)`}>
        {tab === 'webposto' && !chaveSelecionada && (
          <button onClick={() => setModalChave({ open: true, data: null })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Nova Chave API
          </button>
        )}
      </PageHeader>

      {/* Tipo de mapeamento (DRE | Fluxo) */}
      {!inAnyWorkspace && (
        <div className="flex items-center gap-1 mb-4 bg-gray-100/80 rounded-lg p-0.5 w-fit">
          <button onClick={() => { setTipoMapeamento('dre'); setChaveSelecionada(null); setRedeSelecionada(null); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
              tipoMapeamento === 'dre' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <FileBarChart className="h-3.5 w-3.5" /> DRE
          </button>
          <button onClick={() => { setTipoMapeamento('fluxo'); setChaveSelecionada(null); setRedeSelecionada(null); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
              tipoMapeamento === 'fluxo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Wallet className="h-3.5 w-3.5" /> Fluxo de Caixa
          </button>
        </div>
      )}

      {/* Tabs Webposto | Autosystem (hidden when inside a workspace) */}
      {!inAnyWorkspace && (
        <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('webposto')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === 'webposto' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Zap className="h-4 w-4" /> Webposto
          </button>
          <button onClick={() => setTab('autosystem')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === 'autosystem' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Building2 className="h-4 w-4" /> Autosystem
          </button>
        </div>
      )}

      {/* WEBPOSTO flow */}
      {tab === 'webposto' && (
        !chaveSelecionada ? (
          <ChavesList chaves={chaves} loading={loadingChaves}
            onSelect={setChaveSelecionada}
            onEdit={(c) => setModalChave({ open: true, data: c })}
            onDelete={excluirChave}
          />
        ) : (
          <MapeamentoWorkspace
            key={`wp-${tipoMapeamento}`}
            chave={chaveSelecionada}
            adapter={adapter}
            onBack={() => setChaveSelecionada(null)}
            showToast={showToast}
          />
        )
      )}

      {/* AUTOSYSTEM flow (por rede) */}
      {tab === 'autosystem' && (
        !redeSelecionada ? (
          <RedesAutosystemList redes={redesAutosystem} loading={loadingRedes}
            onSelect={setRedeSelecionada} />
        ) : (
          <MapeamentoManualWorkspace
            key={`as-${tipoMapeamento}`}
            rede={redeSelecionada}
            adapter={adapter}
            onBack={() => setRedeSelecionada(null)}
            showToast={showToast}
          />
        )
      )}

      <ModalChave open={modalChave.open} data={modalChave.data}
        onClose={() => setModalChave({ open: false, data: null })}
        onSave={salvarChave} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chaves List
// ═══════════════════════════════════════════════════════════
function ChavesList({ chaves, loading, onSelect, onEdit, onDelete }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-5 w-40 bg-gray-100 rounded mb-3" />
            <div className="h-4 w-60 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (chaves.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
          <Key className="h-8 w-8 text-amber-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma chave API cadastrada</h3>
        <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
          Cadastre uma chave API para buscar empresas e plano de contas do sistema integrado.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {chaves.map((c, i) => {
        const clientes = c.clientes || [];
        const ativos = clientes.filter(cl => cl.status === 'ativo').length;

        return (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl border border-gray-100 p-5 hover:border-amber-200 hover:shadow-sm transition-all cursor-pointer group"
            onClick={() => onSelect(c)}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{c.nome}</h3>
                  <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">
                    {c.chave.slice(0, 8)}...{c.chave.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onEdit(c)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onDelete(c.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Empresas da rede */}
            {clientes.length > 0 ? (
              <div className="rounded-lg bg-gray-50/80 border border-gray-100 p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Empresas da rede</p>
                  <span className="text-[10px] text-gray-400 font-medium">{clientes.length}</span>
                </div>
                <div className="space-y-1.5">
                  {clientes.slice(0, 3).map(cl => (
                    <div key={cl.id} className="flex items-center gap-2 text-[11px]">
                      <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 truncate flex-1">{cl.nome}</span>
                      {cl.status === 'inativo' && (
                        <span className="text-[9px] text-gray-400">(inativo)</span>
                      )}
                    </div>
                  ))}
                  {clientes.length > 3 && (
                    <p className="text-[10px] text-gray-400 pl-5">+ {clientes.length - 3} outra(s)</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-3 mb-3 text-center">
                <p className="text-[11px] text-gray-400">Nenhum cliente cadastrado com esta chave</p>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  {ativos} ativo{ativos !== 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 uppercase">
                  {c.provedor}
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-amber-500 transition-colors" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Mapeamento Workspace
// ═══════════════════════════════════════════════════════════
function MapeamentoWorkspace({ chave, onBack, showToast, adapter }) {
  const grupoIdField = adapter?.grupoIdField || 'grupo_dre_id';
  const grupoRelField = adapter?.grupoRelField || 'grupos_dre';
  const isFluxo = adapter?.tipo === 'fluxo';
  const [empresas, setEmpresas] = useState([]);
  const [planoContas, setPlanoContas] = useState([]);
  const [mascaras, setMascaras] = useState([]);
  const [mascaraSelecionada, setMascaraSelecionada] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [mapeamentos, setMapeamentos] = useState([]);
  const [loadingApi, setLoadingApi] = useState(false);
  const [loadingMascaras, setLoadingMascaras] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [grupoAtivo, setGrupoAtivo] = useState(null); // grupo selecionado como destino
  const [planoExpanded, setPlanoExpanded] = useState(new Set());
  const [mapeamentoVendas, setMapeamentoVendas] = useState([]); // vendas → grupos

  useEffect(() => {
    (async () => {
      try {
        const data = await adapter.listarMascaras();
        setMascaras(data || []);
      } catch (err) { showToast('error', 'Erro ao carregar máscaras'); }
      finally { setLoadingMascaras(false); }
    })();
  }, [showToast, adapter]);

  // Auto-fetch plano de contas e empresas ao abrir (chave ja esta disponivel)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingApi(true);
        const [emps, plano] = await Promise.all([
          qualityApi.buscarEmpresas(chave.chave),
          qualityApi.buscarPlanoContasGerencial(chave.chave),
        ]);
        if (cancelled) return;
        setEmpresas(emps);
        setPlanoContas(plano);
        // Auto-expandir primeiro nivel (hierarquia com 1 segmento)
        const raizes = plano.filter(p => p.hierarquia && p.hierarquia.split('.').length === 1);
        setPlanoExpanded(new Set(raizes.map(r => r.hierarquia)));
        await mapService.salvarEmpresasApi(chave.id, emps);
      } catch (err) {
        if (!cancelled) showToast('error', 'Erro ao buscar API: ' + err.message);
      } finally {
        if (!cancelled) setLoadingApi(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave.id]);

  const togglePlanoNode = (hierarquia) => {
    setPlanoExpanded(prev => {
      const next = new Set(prev);
      next.has(hierarquia) ? next.delete(hierarquia) : next.add(hierarquia);
      return next;
    });
  };

  // Quando ha busca, auto-expande todos os nodes com resultados
  useEffect(() => {
    if (search) {
      const allHier = new Set();
      planoContas
        .filter(c => c.descricao.toLowerCase().includes(search.toLowerCase()) || c.hierarquia.includes(search))
        .forEach(c => {
          // Expande todos os ancestrais
          const parts = (c.hierarquia || '').split('.');
          for (let i = 1; i < parts.length; i++) {
            allHier.add(parts.slice(0, i).join('.'));
          }
        });
      setPlanoExpanded(prev => new Set([...prev, ...allHier]));
    }
  }, [search, planoContas]);

  useEffect(() => {
    if (mascaraSelecionada) {
      (async () => {
        try {
          const tasks = [
            adapter.listarGrupos(mascaraSelecionada.id),
            adapter.listarMapeamentos(chave.id),
          ];
          // Mapeamento de vendas so existe no DRE
          if (!isFluxo) tasks.push(vendasMapService.listarMapeamentoVendas(mascaraSelecionada.id));
          const [grps, maps, mapVendas] = await Promise.all(tasks);
          setGrupos(grps || []);
          // Filtra mapeamentos para incluir apenas os vinculados a grupos da MASCARA atual.
          // (a tabela mapeamento_empresa_contas(_fluxo) guarda tudo da chave_api — sem isso
          // o plano aparece marcado com vinculos de outras mascaras).
          const mapsDaMascara = (maps || []).filter(m => {
            const rel = m[grupoRelField];
            return rel && rel.mascara_id === mascaraSelecionada.id;
          });
          setMapeamentos(mapsDaMascara);
          setMapeamentoVendas(mapVendas || []);
          // Para mascaras de fluxo de caixa, auto-expande somente ate a 3a hierarquia
          // (depth 0 e 1 expandidos -> mostra ate a depth 2 = 3o nivel visivel).
          // DRE mantem o comportamento antigo (expande tudo).
          if (isFluxo) {
            const byId = new Map((grps || []).map(g => [g.id, g]));
            const depthCache = new Map();
            const getDepth = (g) => {
              if (depthCache.has(g.id)) return depthCache.get(g.id);
              if (!g.parent_id) { depthCache.set(g.id, 0); return 0; }
              const parent = byId.get(g.parent_id);
              const d = parent ? getDepth(parent) + 1 : 0;
              depthCache.set(g.id, d);
              return d;
            };
            const expand = new Set(
              (grps || [])
                .filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo))
                .filter(g => getDepth(g) < 2)
                .map(g => g.id)
            );
            setExpandedGrupos(expand);
          } else {
            setExpandedGrupos(new Set((grps || []).filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo)).map(g => g.id)));
          }
        } catch (err) {
          console.error('[Mapeamento] listarGrupos/listarMapeamentos erro:', err);
          showToast('error', `Erro ao carregar dados: ${err?.message || 'veja console'}`);
        }
      })();
    }
  }, [mascaraSelecionada, chave.id, showToast, adapter, isFluxo, grupoRelField]);

  const salvarVendaMap = async (tipo, grupoId) => {
    try {
      await vendasMapService.salvarMapeamentoVenda({
        mascara_id: mascaraSelecionada.id,
        tipo,
        grupo_dre_id: grupoId || null,
      });
      const refresh = await vendasMapService.listarMapeamentoVendas(mascaraSelecionada.id);
      setMapeamentoVendas(refresh);
    } catch (err) { showToast('error', err.message); }
  };

  const refreshMapeamentos = async () => {
    const maps = await adapter.listarMapeamentos(chave.id);
    const mapsDaMascara = (maps || []).filter(m => {
      const rel = m[grupoRelField];
      return rel && mascaraSelecionada && rel.mascara_id === mascaraSelecionada.id;
    });
    setMapeamentos(mapsDaMascara);
  };

  const buscarDadosApi = async () => {
    try {
      setLoadingApi(true);
      const [emps, plano] = await Promise.all([
        qualityApi.buscarEmpresas(chave.chave),
        qualityApi.buscarPlanoContasGerencial(chave.chave),
      ]);
      setEmpresas(emps);
      setPlanoContas(plano);
      await mapService.salvarEmpresasApi(chave.id, emps);
      showToast('success', `${emps.length} empresa(s) e ${plano.length} conta(s) carregada(s)`);
    } catch (err) {
      showToast('error', 'Erro ao buscar API: ' + err.message);
    } finally {
      setLoadingApi(false);
    }
  };

  const vincularConta = async (conta) => {
    if (!grupoAtivo) {
      showToast('warning', 'Selecione um grupo na máscara primeiro');
      return;
    }
    try {
      await adapter.criarMapeamentosBatch(chave.id, [{
        [grupoIdField]: grupoAtivo,
        plano_conta_codigo: conta.planoContaCodigo || conta.codigo,
        plano_conta_descricao: conta.descricao,
        plano_conta_hierarquia: conta.hierarquia,
        plano_conta_natureza: conta.natureza,
      }]);
      await refreshMapeamentos();
    } catch (err) { showToast('error', err.message); }
  };

  const desvincularConta = async (mapId) => {
    try {
      await adapter.excluirMapeamento(mapId);
      await refreshMapeamentos();
    } catch (err) { showToast('error', err.message); }
  };

  const toggleExpand = (id) => {
    setExpandedGrupos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Normalize para string: DRE guarda plano_conta_codigo como integer, Fluxo como text.
  // O node da API vem com codigo numerico, entao chave e consulta usam String(codigo) nos dois fluxos.
  const contasVinculadasMap = new Map(mapeamentos.map(m => [String(m.plano_conta_codigo), m]));
  const getChildren = (parentId) => grupos.filter(g => g.parent_id === parentId).sort((a, b) => a.ordem - b.ordem);
  const getMapsDoGrupo = (grupoId) => mapeamentos.filter(m => m[grupoIdField] === grupoId);
  const topLevelGrupos = grupos.filter(g => !g.parent_id).sort((a, b) => a.ordem - b.ordem);

  const contasFiltradas = planoContas.filter(c =>
    !search || c.descricao.toLowerCase().includes(search.toLowerCase()) || c.hierarquia.includes(search)
  );

  // Construir arvore hierarquica respeitando o campo "hierarquia" da API
  const planoTree = buildPlanoTree(contasFiltradas);

  const grupoAtivoObj = grupoAtivo ? grupos.find(g => g.id === grupoAtivo) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{chave.nome}</h2>
            <p className="text-xs text-gray-400">
              {loadingApi ? 'Carregando dados da API...' : empresas.length > 0 ? `${empresas.length} empresa(s)` : 'Aguarde o carregamento'}
              {planoContas.length > 0 && ` \u00b7 ${planoContas.length} contas`}
            </p>
          </div>
        </div>
        <button onClick={buscarDadosApi} disabled={loadingApi} title="Atualizar dados da API"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          {loadingApi ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </motion.div>

      {/* Select mascara */}
      {!mascaraSelecionada ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Selecione a máscara DRE para mapear</h3>
          {loadingMascaras ? (
            <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /><span className="text-sm text-gray-400">Carregando...</span></div>
          ) : mascaras.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma máscara criada. Crie uma em Parametrizações &gt; Máscaras.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mascaras.map(m => (
                <button key={m.id} onClick={() => setMascaraSelecionada(m)}
                  className="text-left rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold text-gray-900">{m.nome}</span>
                  </div>
                  {m.descricao && <p className="text-xs text-gray-400 line-clamp-1">{m.descricao}</p>}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        <>
          {/* Active group indicator */}
          <AnimatePresence>
            {grupoAtivoObj && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div className="h-6 w-6 rounded-md bg-blue-500 flex items-center justify-center">
                  <Link2 className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-600 font-medium">Destino selecionado</p>
                  <p className="text-sm font-semibold text-blue-900 truncate uppercase">{grupoAtivoObj.nome}</p>
                </div>
                <p className="text-xs text-blue-500">Clique nas contas a esquerda para vincular</p>
                <button onClick={() => setGrupoAtivo(null)}
                  className="text-xs text-blue-400 hover:text-blue-600 font-medium transition-colors ml-2 flex-shrink-0">
                  Limpar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mapeamento de Vendas (somente DRE) */}
          {!isFluxo && (
            <MapeamentoVendasSection
              grupos={grupos}
              mapeamentoVendas={mapeamentoVendas}
              onSave={salvarVendaMap}
            />
          )}

          {/* Two-panel layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Plano de Contas */}
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl border border-gray-200/60 shadow-sm flex flex-col max-h-[70vh]">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-amber-100 flex items-center justify-center">
                    <Key className="h-3 w-3 text-amber-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Plano de Contas</span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">{contasFiltradas.length}</span>
                </div>
              </div>
              <div className="px-3 py-2 border-b border-gray-50 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="Buscar conta..." />
                </div>
              </div>
              {!grupoAtivo && planoContas.length > 0 && (
                <div className="px-4 py-2 bg-amber-50/50 border-b border-amber-100/50 flex-shrink-0">
                  <p className="text-[11px] text-amber-700">Selecione um grupo na máscara (painel direito) para comecar a vincular.</p>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {loadingApi && planoContas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 text-blue-500 animate-spin mb-3" />
                    <p className="text-xs text-gray-500 text-center px-4">Carregando plano de contas da API...</p>
                  </div>
                ) : planoContas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Key className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 text-center px-4 mb-3">Não foi possível carregar o plano de contas</p>
                    <button onClick={buscarDadosApi}
                      className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors">
                      <RefreshCw className="h-3 w-3" /> Tentar novamente
                    </button>
                  </div>
                ) : (
                  <div className="py-1">
                    {planoTree.map(node => (
                      <PlanoContaTreeNode
                        key={node.hierarquia}
                        node={node}
                        depth={0}
                        expanded={planoExpanded}
                        onToggle={togglePlanoNode}
                        contasVinculadasMap={contasVinculadasMap}
                        grupoAtivo={grupoAtivo}
                        grupoRelField={grupoRelField}
                        onVincular={vincularConta}
                        onDesvincular={desvincularConta}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* RIGHT: Mascara DRE */}
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl border border-gray-200/60 shadow-sm flex flex-col max-h-[70vh]">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                    <Layers className="h-3 w-3 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{mascaraSelecionada.nome}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">{mapeamentos.length} vinculadas</span>
                </div>
                <button onClick={() => { setMascaraSelecionada(null); setGrupoAtivo(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Trocar</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="py-1">
                  {topLevelGrupos.map((grupo) => (
                    <GrupoMapeamentoRow key={grupo.id} grupo={grupo} depth={0}
                      children={getChildren(grupo.id)}
                      mapeamentos={getMapsDoGrupo(grupo.id)}
                      expandedGrupos={expandedGrupos}
                      grupoAtivo={grupoAtivo}
                      onToggleExpand={toggleExpand}
                      onSelectGrupo={setGrupoAtivo}
                      onDesvincular={desvincularConta}
                      getChildren={getChildren}
                      getMapsDoGrupo={getMapsDoGrupo}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Grupo row in mascara panel (shows mapped accounts) ─────
function GrupoMapeamentoRow({ grupo, depth, children, mapeamentos, expandedGrupos, grupoAtivo, onToggleExpand, onSelectGrupo, onDesvincular, getChildren, getMapsDoGrupo }) {
  // 'grupo' agrupa sem vinculo direto; 'entrada'/'saida' (Fluxo) sao destinos validos para mapeamento
  const isGrupo = grupo.tipo === 'grupo' || grupo.tipo === 'entrada' || grupo.tipo === 'saida';
  const isCalc = grupo.tipo === 'subtotal' || grupo.tipo === 'resultado';
  const isExpanded = expandedGrupos.has(grupo.id);
  const isActive = grupoAtivo === grupo.id;
  const isSelectable = isGrupo;
  const indent = depth * 20;

  return (
    <>
      <div
        onClick={() => isSelectable && onSelectGrupo(isActive ? null : grupo.id)}
        className={`flex items-center gap-2 pr-3 transition-all cursor-pointer ${
          isActive
            ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
            : isGrupo && depth === 0
              ? 'bg-gray-50/50 hover:bg-blue-50/30'
              : isCalc
                ? 'bg-slate-50/50'
                : 'hover:bg-blue-50/30'
        }`}
        style={{ paddingLeft: (isActive ? 9 : 12) + indent, minHeight: isGrupo && depth === 0 ? 42 : 36 }}>
        <div className="w-4 flex items-center justify-center flex-shrink-0">
          {isGrupo ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(grupo.id); }} className="text-gray-400 hover:text-gray-600">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : isCalc ? (
            <span className="text-[9px] font-bold text-gray-400">=</span>
          ) : (
            <div className="h-1 w-1 rounded-full bg-gray-300" />
          )}
        </div>
        <span className={`text-xs flex-1 truncate ${
          isActive ? 'font-bold text-blue-700 uppercase'
            : isGrupo && depth === 0 ? 'font-bold text-gray-900 uppercase tracking-wide'
              : isGrupo ? 'font-semibold text-gray-800 uppercase'
                : isCalc ? 'font-semibold text-gray-600 uppercase'
                  : 'text-gray-500'
        }`}>
          {grupo.nome}
        </span>
        {isActive && (
          <span className="text-[9px] bg-blue-500 text-white rounded-full px-2 py-0.5 font-medium flex-shrink-0 animate-pulse">
            ativo
          </span>
        )}
        {!isActive && mapeamentos.length > 0 && (
          <span className="text-[9px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
            {mapeamentos.length}
          </span>
        )}
      </div>

      {isGrupo && isExpanded && (
        <div>
          {children.map(c => (
            <GrupoMapeamentoRow key={c.id} grupo={c} depth={depth + 1}
              children={getChildren(c.id)} mapeamentos={getMapsDoGrupo(c.id)}
              expandedGrupos={expandedGrupos} grupoAtivo={grupoAtivo}
              onToggleExpand={onToggleExpand} onSelectGrupo={onSelectGrupo}
              onDesvincular={onDesvincular} getChildren={getChildren} getMapsDoGrupo={getMapsDoGrupo}
            />
          ))}
          {mapeamentos.length > 0 && (
            <div style={{ paddingLeft: 12 + indent + 24 }} className="py-0.5">
              {mapeamentos.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded group/mp hover:bg-red-50/50 transition-colors">
                  <div className="h-1 w-1 rounded-full bg-blue-300 flex-shrink-0" />
                  <span className="font-mono text-[9px] text-blue-400 bg-blue-50 rounded px-1 py-0.5 flex-shrink-0">
                    {m.plano_conta_hierarquia}
                  </span>
                  <span className="text-[11px] text-gray-500 truncate">{m.plano_conta_descricao}</span>
                  <button onClick={(e) => { e.stopPropagation(); onDesvincular(m.id); }}
                    className="ml-auto rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-100 opacity-0 group-hover/mp:opacity-100 transition-all flex-shrink-0"
                    title="Desvincular">
                    <Unlink className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Modal: Chave API
// ═══════════════════════════════════════════════════════════
function ModalChave({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ nome: '', chave: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(data ? { id: data.id, nome: data.nome, chave: data.chave } : { nome: '', chave: '' });
  }, [open, data]);

  return (
    <Modal open={open} onClose={onClose} title={data ? 'Editar Chave API' : 'Nova Chave API'} size="sm">
      <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(form); setSaving(false); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome (identificação)</label>
          <input type="text" required value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Ex: Rede Trivela" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Chave API</label>
          <input type="text" required value={form.chave} onChange={(e) => setForm(f => ({ ...f, chave: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="f89021bf-d9e5-481d-b6a0-..." />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving || !form.nome.trim() || !form.chave.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {data ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// Redes Autosystem List (uma config por rede, igual ao Webposto)
// ═══════════════════════════════════════════════════════════
function RedesAutosystemList({ redes, loading, onSelect }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
            <div className="h-5 w-40 bg-gray-100 rounded mb-3" />
            <div className="h-4 w-60 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (redes.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100">
        <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <Building2 className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma rede Autosystem</h3>
        <p className="text-sm text-gray-500 mb-3 text-center max-w-sm">
          Cadastre uma rede Autosystem em <strong>Cadastros &gt; Redes Autosystem</strong> para mapear contas.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {redes.map((r, i) => {
        const clientes = r.clientes || [];
        const ativos = clientes.filter(cl => cl.status === 'ativo').length;
        return (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl border border-gray-100 p-5 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer group"
            onClick={() => onSelect(r)}>
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{r.nome}</h3>
                <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{r.slug}</p>
              </div>
            </div>

            {clientes.length > 0 ? (
              <div className="rounded-lg bg-gray-50/80 border border-gray-100 p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Empresas da rede</p>
                  <span className="text-[10px] text-gray-400 font-medium">{clientes.length}</span>
                </div>
                <div className="space-y-1.5">
                  {clientes.slice(0, 3).map(cl => (
                    <div key={cl.id} className="flex items-center gap-2 text-[11px]">
                      <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 truncate flex-1">{cl.nome}</span>
                      {cl.status === 'inativo' && (
                        <span className="text-[9px] text-gray-400">(inativo)</span>
                      )}
                    </div>
                  ))}
                  {clientes.length > 3 && (
                    <p className="text-[10px] text-gray-400 pl-5">+ {clientes.length - 3} outra(s)</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-3 mb-3 text-center">
                <p className="text-[11px] text-gray-400">Nenhuma empresa vinculada a esta rede</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  {ativos} ativo{ativos !== 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 uppercase">
                  Autosystem
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Manual Mapeamento Workspace (rede Autosystem)
// Layout 2 colunas (igual Webposto): plano de contas Autosystem
// à esquerda, máscara DRE/Fluxo à direita. Clica num grupo, vincula
// a conta clicada. Vincula em mapeamento_manual_contas por as_rede_id.
// ═══════════════════════════════════════════════════════════
function MapeamentoManualWorkspace({ rede, onBack, showToast, adapter }) {
  const grupoIdField = adapter?.grupoIdField || 'grupo_dre_id';
  const grupoRelField = adapter?.grupoRelField || 'grupos_dre';
  const isFluxo = adapter?.tipo === 'fluxo';
  const [mascaras, setMascaras] = useState([]);
  const [mascaraSelecionada, setMascaraSelecionada] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [contas, setContas] = useState([]);
  const [planoContas, setPlanoContas] = useState([]);
  const [mapeamentoVendas, setMapeamentoVendas] = useState([]);
  // Contas caixa/banco da rede (só usado quando modo Fluxo)
  const [contasCaixaBanco, setContasCaixaBanco] = useState([]);
  const [loadingApi, setLoadingApi] = useState(false);
  const [loadingMascaras, setLoadingMascaras] = useState(true);
  const [expandedGrupos, setExpandedGrupos] = useState(new Set());
  const [planoExpanded, setPlanoExpanded] = useState(new Set());
  const [grupoAtivo, setGrupoAtivo] = useState(null);
  const [search, setSearch] = useState('');
  const [modalConta, setModalConta] = useState({ open: false, data: null });
  const [modalConfirm, setModalConfirm] = useState({ open: false });

  // Carrega máscaras
  useEffect(() => {
    (async () => {
      try {
        const data = await adapter.listarMascaras();
        setMascaras(data || []);
      } catch (err) { showToast('error', 'Erro ao carregar máscaras'); }
      finally { setLoadingMascaras(false); }
    })();
  }, [showToast, adapter]);

  // Auto-carrega plano de contas + contas caixa/banco da rede Autosystem
  const carregarPlanoContas = useCallback(async () => {
    try {
      setLoadingApi(true);
      const [plano, caixaBanco] = await Promise.all([
        autosystemService.buscarContasAutosystem(rede.id),
        autosystemService.listarContasCaixaBancoRede(rede.id).catch(() => []),
      ]);
      setPlanoContas(plano || []);
      setContasCaixaBanco(caixaBanco || []);
      // Auto-expande primeiro nível (1 segmento na hierarquia do código)
      const raizes = (plano || []).filter(c => String(c.codigo || '').split('.').length === 1);
      setPlanoExpanded(new Set(raizes.map(r => String(r.codigo))));
    } catch (err) {
      showToast('error', 'Erro ao buscar dados Autosystem: ' + err.message);
    } finally {
      setLoadingApi(false);
    }
  }, [rede.id, showToast]);

  useEffect(() => { carregarPlanoContas(); }, [carregarPlanoContas]);

  // Quando há busca, auto-expande ancestrais dos resultados
  useEffect(() => {
    if (search) {
      const q = search.toLowerCase();
      const allHier = new Set();
      planoContas
        .filter(c => (c.nome || '').toLowerCase().includes(q) || String(c.codigo).includes(search))
        .forEach(c => {
          const parts = String(c.codigo || '').split('.');
          for (let i = 1; i < parts.length; i++) {
            allHier.add(parts.slice(0, i).join('.'));
          }
        });
      setPlanoExpanded(prev => new Set([...prev, ...allHier]));
    }
  }, [search, planoContas]);

  const carregarDados = useCallback(async () => {
    if (!mascaraSelecionada) return;
    try {
      const [grps, cts, vendasMaps] = await Promise.all([
        adapter.listarGrupos(mascaraSelecionada.id),
        adapter.listarContasManualPorRede(rede.id, mascaraSelecionada.id),
        vendasAutosystemMapService.listarMapeamentos(rede.id, mascaraSelecionada.id).catch(() => []),
      ]);
      setGrupos(grps || []);
      setContas(cts || []);
      setMapeamentoVendas(vendasMaps || []);
      // Auto-expande grupos (depth menor para fluxo, full para DRE)
      if (isFluxo) {
        const byId = new Map((grps || []).map(g => [g.id, g]));
        const depthCache = new Map();
        const getDepth = (g) => {
          if (depthCache.has(g.id)) return depthCache.get(g.id);
          if (!g.parent_id) { depthCache.set(g.id, 0); return 0; }
          const parent = byId.get(g.parent_id);
          const d = parent ? getDepth(parent) + 1 : 0;
          depthCache.set(g.id, d);
          return d;
        };
        const expand = new Set(
          (grps || [])
            .filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo))
            .filter(g => getDepth(g) < 2)
            .map(g => g.id)
        );
        setExpandedGrupos(expand);
      } else {
        setExpandedGrupos(new Set((grps || []).filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo)).map(g => g.id)));
      }
    } catch (err) { showToast('error', 'Erro ao carregar dados'); }
  }, [rede.id, mascaraSelecionada, showToast, adapter, isFluxo]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const refreshContas = async () => {
    if (!mascaraSelecionada) return;
    try {
      const cts = await adapter.listarContasManualPorRede(rede.id, mascaraSelecionada.id);
      setContas(cts || []);
    } catch (err) { showToast('error', err.message); }
  };

  const vincularConta = async (node) => {
    if (!grupoAtivo) {
      showToast('warning', 'Selecione um grupo na máscara primeiro');
      return;
    }
    try {
      await adapter.criarContaManualPorRede({
        as_rede_id: rede.id,
        mascara_id: mascaraSelecionada.id,
        [grupoIdField]: grupoAtivo,
        conta_codigo: String(node.codigo),
        conta_descricao: node.nome || node.descricao || '—',
        conta_natureza: null,
      });
      await refreshContas();
    } catch (err) { showToast('error', err.message); }
  };

  const desvincularConta = async (id) => {
    try {
      await adapter.excluirContaManual(id);
      await refreshContas();
    } catch (err) { showToast('error', err.message); }
  };

  const salvarConta = async (form) => {
    try {
      if (form.id) {
        await adapter.atualizarContaManual(form.id, form);
        showToast('success', 'Conta atualizada');
      } else {
        await adapter.criarContaManualPorRede({
          ...form,
          as_rede_id: rede.id,
          mascara_id: mascaraSelecionada.id,
        });
        showToast('success', 'Conta adicionada');
      }
      setModalConta({ open: false, data: null });
      await refreshContas();
    } catch (err) { showToast('error', err.message); }
  };

  const excluirConta = async (id) => {
    try {
      await adapter.excluirContaManual(id);
      showToast('success', 'Conta removida');
      setModalConfirm({ open: false });
      await refreshContas();
    } catch (err) { showToast('error', err.message); }
  };

  // Marca/desmarca uma conta do plano como caixa/banco (toggle).
  const toggleContaCaixaBanco = async (conta) => {
    const codigo = String(conta.codigo);
    const jaIncluida = contasCaixaBanco.some(c => String(c.codigo) === codigo);
    const proxima = jaIncluida
      ? contasCaixaBanco.filter(c => String(c.codigo) !== codigo)
      : [...contasCaixaBanco, { codigo, nome: conta.nome || '' }];
    try {
      await autosystemService.salvarContasCaixaBanco(rede.id, proxima);
      setContasCaixaBanco(proxima);
    } catch (err) { showToast('error', err.message); }
  };

  // Salva (ou remove) o mapeamento de venda/custo de uma categoria
  // (combustivel/automotivos/conveniencia).
  const salvarVendaCustoMap = async (categoria, tipo, grupoDestinoId) => {
    try {
      await vendasAutosystemMapService.salvarMapeamento({
        as_rede_id: rede.id,
        mascara_id: mascaraSelecionada.id,
        categoria,
        tipo,
        grupoIdField,
        grupoDestinoId: grupoDestinoId || null,
      });
      const refresh = await vendasAutosystemMapService.listarMapeamentos(rede.id, mascaraSelecionada.id);
      setMapeamentoVendas(refresh || []);
    } catch (err) { showToast('error', err.message); }
  };

  const toggleExpand = (id) => {
    setExpandedGrupos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePlanoNode = (hierarquia) => {
    setPlanoExpanded(prev => {
      const next = new Set(prev);
      next.has(hierarquia) ? next.delete(hierarquia) : next.add(hierarquia);
      return next;
    });
  };

  // Mapa codigo→registro (chave normalizada string)
  const contasVinculadasMap = new Map(contas.map(c => [String(c.conta_codigo), c]));
  const getChildren = (parentId) => grupos.filter(g => g.parent_id === parentId).sort((a, b) => a.ordem - b.ordem);
  const getContasDoGrupo = (grupoId) => contas.filter(c => c[grupoIdField] === grupoId);
  const topLevelGrupos = grupos.filter(g => !g.parent_id).sort((a, b) => a.ordem - b.ordem);

  const contasFiltradas = planoContas.filter(c =>
    !search || (c.nome || '').toLowerCase().includes(search.toLowerCase()) || String(c.codigo).includes(search)
  );

  // Adapta { codigo, nome } → { hierarquia, descricao, natureza } pra reutilizar buildPlanoTree/PlanoContaTreeNode
  const planoAdaptado = contasFiltradas.map(c => ({
    codigo: String(c.codigo),
    hierarquia: String(c.codigo),
    descricao: c.nome || '—',
    natureza: '',
  }));
  const planoTree = buildPlanoTree(planoAdaptado);

  const grupoAtivoObj = grupoAtivo ? grupos.find(g => g.id === grupoAtivo) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{rede.nome}</h2>
            <p className="text-xs text-gray-400">
              Rede Autosystem
              {loadingApi ? ' · carregando plano...' : planoContas.length > 0 ? ` · ${planoContas.length} contas no plano` : ''}
              {contas.length > 0 && ` · ${contas.length} vinculada(s)`}
            </p>
          </div>
        </div>
        <button onClick={carregarPlanoContas} disabled={loadingApi} title="Atualizar plano de contas do Autosystem"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          {loadingApi ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </motion.div>

      {!mascaraSelecionada ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Selecione a máscara {adapter.label} para mapear</h3>
          {loadingMascaras ? (
            <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /><span className="text-sm text-gray-400">Carregando...</span></div>
          ) : mascaras.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma máscara criada. Crie uma em Parametrizações &gt; Máscaras.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mascaras.map(m => (
                <button key={m.id} onClick={() => setMascaraSelecionada(m)}
                  className="text-left rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold text-gray-900">{m.nome}</span>
                  </div>
                  {m.descricao && <p className="text-xs text-gray-400 line-clamp-1">{m.descricao}</p>}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        <>
          {/* Active group indicator */}
          <AnimatePresence>
            {grupoAtivoObj && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div className="h-6 w-6 rounded-md bg-blue-500 flex items-center justify-center">
                  <Link2 className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-600 font-medium">Destino selecionado</p>
                  <p className="text-sm font-semibold text-blue-900 truncate uppercase">{grupoAtivoObj.nome}</p>
                </div>
                <p className="text-xs text-blue-500">Clique nas contas à esquerda para vincular</p>
                <button onClick={() => setGrupoAtivo(null)}
                  className="text-xs text-blue-400 hover:text-blue-600 font-medium transition-colors ml-2 flex-shrink-0">
                  Limpar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Contas Caixa/Banco — base do Fluxo de Caixa (só modo fluxo) */}
          {isFluxo && (
            <ContasCaixaBancoSection
              planoContas={planoContas}
              contasCaixaBanco={contasCaixaBanco}
              onToggle={toggleContaCaixaBanco}
            />
          )}

          {/* Mapeamento de Vendas/Custo por categoria (combustivel/automotivos/conveniencia) */}
          {!isFluxo && (
            <MapeamentoVendasAutosystemSection
              grupos={grupos}
              mapeamentoVendas={mapeamentoVendas}
              onSave={salvarVendaCustoMap}
            />
          )}

          {/* Two-panel layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Plano de Contas Autosystem */}
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl border border-gray-200/60 shadow-sm flex flex-col max-h-[70vh]">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                    <Building2 className="h-3 w-3 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Plano de Contas Autosystem</span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">{contasFiltradas.length}</span>
                </div>
                <button onClick={() => setModalConta({ open: true, data: null })}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  title="Adicionar conta manual (fora do plano)">
                  <Plus className="h-3 w-3" /> Manual
                </button>
              </div>
              <div className="px-3 py-2 border-b border-gray-50 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="Buscar conta..." />
                </div>
              </div>
              {!grupoAtivo && planoContas.length > 0 && (
                <div className="px-4 py-2 bg-blue-50/50 border-b border-blue-100/50 flex-shrink-0">
                  <p className="text-[11px] text-blue-700">Selecione um grupo na máscara (painel direito) para começar a vincular.</p>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {loadingApi && planoContas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 text-blue-500 animate-spin mb-3" />
                    <p className="text-xs text-gray-500 text-center px-4">Carregando plano de contas...</p>
                  </div>
                ) : planoContas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Building2 className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 text-center px-4 mb-3">Não foi possível carregar o plano de contas</p>
                    <button onClick={carregarPlanoContas}
                      className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors">
                      <RefreshCw className="h-3 w-3" /> Tentar novamente
                    </button>
                  </div>
                ) : (
                  <div className="py-1">
                    {planoTree.map(node => (
                      <PlanoContaTreeNode
                        key={node.hierarquia}
                        node={node}
                        depth={0}
                        expanded={planoExpanded}
                        onToggle={togglePlanoNode}
                        contasVinculadasMap={contasVinculadasMap}
                        grupoAtivo={grupoAtivo}
                        grupoRelField={grupoRelField}
                        onVincular={vincularConta}
                        onDesvincular={desvincularConta}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* RIGHT: Máscara */}
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl border border-gray-200/60 shadow-sm flex flex-col max-h-[70vh]">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                    <Layers className="h-3 w-3 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{mascaraSelecionada.nome}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">{contas.length} vinculadas</span>
                </div>
                <button onClick={() => { setMascaraSelecionada(null); setGrupoAtivo(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Trocar</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="py-1">
                  {topLevelGrupos.map((grupo) => (
                    <GrupoManualMapeamentoRow key={grupo.id} grupo={grupo} depth={0}
                      children={getChildren(grupo.id)}
                      contas={getContasDoGrupo(grupo.id)}
                      expandedGrupos={expandedGrupos}
                      grupoAtivo={grupoAtivo}
                      onToggleExpand={toggleExpand}
                      onSelectGrupo={setGrupoAtivo}
                      onDesvincular={desvincularConta}
                      onEditarConta={(c) => setModalConta({ open: true, data: c })}
                      getChildren={getChildren}
                      getContasDoGrupo={getContasDoGrupo}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}

      <ModalContaManual
        open={modalConta.open}
        data={modalConta.data}
        grupos={grupos}
        grupoIdField={grupoIdField}
        onClose={() => setModalConta({ open: false, data: null })}
        onSave={salvarConta}
      />

      <ModalConfirmManual open={modalConfirm.open}
        message={modalConfirm.message}
        onClose={() => setModalConfirm({ open: false })}
        onConfirm={modalConfirm.onConfirm}
      />
    </div>
  );
}

// ─── Grupo row (mascara com contas vinculadas via plano Autosystem) ─
// Análogo a GrupoMapeamentoRow (Webposto), mas usa conta_codigo/
// conta_descricao no lugar de plano_conta_*.
function GrupoManualMapeamentoRow({ grupo, depth, children, contas, expandedGrupos, grupoAtivo, onToggleExpand, onSelectGrupo, onDesvincular, onEditarConta, getChildren, getContasDoGrupo }) {
  const isGrupo = grupo.tipo === 'grupo' || grupo.tipo === 'entrada' || grupo.tipo === 'saida';
  const isCalc = grupo.tipo === 'subtotal' || grupo.tipo === 'resultado';
  const isExpanded = expandedGrupos.has(grupo.id);
  const isActive = grupoAtivo === grupo.id;
  const isSelectable = isGrupo;
  const indent = depth * 20;

  return (
    <>
      <div
        onClick={() => isSelectable && onSelectGrupo(isActive ? null : grupo.id)}
        className={`flex items-center gap-2 pr-3 transition-all cursor-pointer ${
          isActive
            ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
            : isGrupo && depth === 0
              ? 'bg-gray-50/50 hover:bg-blue-50/30'
              : isCalc
                ? 'bg-slate-50/50'
                : 'hover:bg-blue-50/30'
        }`}
        style={{ paddingLeft: (isActive ? 9 : 12) + indent, minHeight: isGrupo && depth === 0 ? 42 : 36 }}>
        <div className="w-4 flex items-center justify-center flex-shrink-0">
          {isGrupo ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(grupo.id); }} className="text-gray-400 hover:text-gray-600">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : isCalc ? (
            <span className="text-[9px] font-bold text-gray-400">=</span>
          ) : (
            <div className="h-1 w-1 rounded-full bg-gray-300" />
          )}
        </div>
        <span className={`text-xs flex-1 truncate ${
          isActive ? 'font-bold text-blue-700 uppercase'
            : isGrupo && depth === 0 ? 'font-bold text-gray-900 uppercase tracking-wide'
              : isGrupo ? 'font-semibold text-gray-800 uppercase'
                : isCalc ? 'font-semibold text-gray-600 uppercase'
                  : 'text-gray-500'
        }`}>
          {grupo.nome}
        </span>
        {isActive && (
          <span className="text-[9px] bg-blue-500 text-white rounded-full px-2 py-0.5 font-medium flex-shrink-0 animate-pulse">
            ativo
          </span>
        )}
        {!isActive && contas.length > 0 && (
          <span className="text-[9px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
            {contas.length}
          </span>
        )}
      </div>

      {isGrupo && isExpanded && (
        <div>
          {children.map(c => (
            <GrupoManualMapeamentoRow key={c.id} grupo={c} depth={depth + 1}
              children={getChildren(c.id)} contas={getContasDoGrupo(c.id)}
              expandedGrupos={expandedGrupos} grupoAtivo={grupoAtivo}
              onToggleExpand={onToggleExpand} onSelectGrupo={onSelectGrupo}
              onDesvincular={onDesvincular} onEditarConta={onEditarConta}
              getChildren={getChildren} getContasDoGrupo={getContasDoGrupo}
            />
          ))}
          {contas.length > 0 && (
            <div style={{ paddingLeft: 12 + indent + 24 }} className="py-0.5">
              {contas.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded group/mp hover:bg-red-50/50 transition-colors">
                  <div className="h-1 w-1 rounded-full bg-blue-300 flex-shrink-0" />
                  {m.conta_codigo && (
                    <span className="font-mono text-[9px] text-blue-400 bg-blue-50 rounded px-1 py-0.5 flex-shrink-0">
                      {m.conta_codigo}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500 truncate">{m.conta_descricao}</span>
                  <button onClick={(e) => { e.stopPropagation(); onEditarConta(m); }}
                    className="ml-auto rounded p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-100 opacity-0 group-hover/mp:opacity-100 transition-all flex-shrink-0"
                    title="Editar">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDesvincular(m.id); }}
                    className="rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-100 opacity-0 group-hover/mp:opacity-100 transition-all flex-shrink-0"
                    title="Desvincular">
                    <Unlink className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Modal Nova/Editar Conta Manual ─────────────────────────
function ModalContaManual({ open, data, grupos, grupoIdField = 'grupo_dre_id', onClose, onSave }) {
  const [form, setForm] = useState({
    conta_codigo: '', conta_descricao: '', conta_natureza: 'D', [grupoIdField]: '', observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (data?.id) {
        setForm(data);
      } else {
        setForm({
          conta_codigo: '', conta_descricao: '', conta_natureza: 'D',
          [grupoIdField]: data?.[grupoIdField] || '', observacoes: '',
        });
      }
    }
  }, [open, data, grupoIdField]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } catch (_) { /* handled by parent */ }
    finally { setSaving(false); }
  };

  // Seleciona grupos (DRE) + entradas/saidas (Fluxo de Caixa) como destinos validos
  const gruposSelecionaveis = grupos.filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo));

  return (
    <Modal open={open} onClose={onClose} title={data?.id ? 'Editar Conta' : 'Nova Conta Manual'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descrição *</label>
          <input type="text" required autoFocus value={form.conta_descricao}
            onChange={e => setForm(f => ({ ...f, conta_descricao: e.target.value }))}
            placeholder="Ex: Aluguel do escritório"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
            <input type="text" value={form.conta_codigo || ''}
              onChange={e => setForm(f => ({ ...f, conta_codigo: e.target.value }))}
              placeholder="Ex: 01.01"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Natureza *</label>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => setForm(f => ({ ...f, conta_natureza: 'C' }))}
                className={`h-10 rounded-lg text-xs font-medium transition-all ${
                  form.conta_natureza === 'C' ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700' : 'bg-gray-50 border-2 border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Receita
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, conta_natureza: 'D' }))}
                className={`h-10 rounded-lg text-xs font-medium transition-all ${
                  form.conta_natureza === 'D' ? 'bg-orange-50 border-2 border-orange-300 text-orange-700' : 'bg-gray-50 border-2 border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                Despesa
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Vincular ao grupo *</label>
          <select required value={form[grupoIdField] || ''}
            onChange={e => setForm(f => ({ ...f, [grupoIdField]: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">Selecione um grupo...</option>
            {gruposSelecionaveis.map(g => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observacoes</label>
          <textarea rows={2} value={form.observacoes || ''}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving || !form.conta_descricao?.trim() || !form[grupoIdField]}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {data?.id ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal confirmar (reutilizavel) ─────────────────────────
function ModalConfirmManual({ open, message, onClose, onConfirm }) {
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
// Tree builder + Tree node para Plano de Contas (Webposto)
// ═══════════════════════════════════════════════════════════

// Constroi arvore a partir da lista flat baseada no campo "hierarquia" (ex: "1", "1.01", "1.01.01")
// Mantem a ordem natural da hierarquia numerica (ordem do sistema)
function buildPlanoTree(flatList) {
  // Ordena por hierarquia numerica
  const sorted = [...flatList].sort((a, b) => {
    const aParts = (a.hierarquia || '').split('.').map(Number);
    const bParts = (b.hierarquia || '').split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const ai = aParts[i] ?? 0;
      const bi = bParts[i] ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });

  const byHier = new Map();
  sorted.forEach(item => byHier.set(item.hierarquia, { ...item, children: [] }));

  const roots = [];
  sorted.forEach(item => {
    const node = byHier.get(item.hierarquia);
    const parts = (item.hierarquia || '').split('.');
    if (parts.length <= 1) {
      roots.push(node);
    } else {
      const parentHier = parts.slice(0, -1).join('.');
      const parent = byHier.get(parentHier);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orfao: pai nao esta no resultado (ex: por filtro) - coloca como raiz
        roots.push(node);
      }
    }
  });

  return roots;
}

function PlanoContaTreeNode({ node, depth, expanded, onToggle, contasVinculadasMap, grupoAtivo, grupoRelField = 'grupos_dre', onVincular, onDesvincular }) {
  const codigo = String(node.planoContaCodigo || node.codigo);
  const mapExistente = contasVinculadasMap.get(codigo);
  const jaVinculada = !!mapExistente;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.hierarquia);
  const isDisabled = !grupoAtivo && !jaVinculada;

  // Alguma descendente vinculada? (para highlight visual do pai)
  const temVinculadoAbaixo = hasChildren && countVinculadasNaSubtree(node, contasVinculadasMap) > 0;

  return (
    <>
      <div
        className={`relative flex items-center gap-1.5 pr-3 group/conta transition-all ${
          jaVinculada ? 'bg-emerald-50/60 hover:bg-red-50/60'
            : grupoAtivo ? 'hover:bg-blue-50'
              : 'opacity-70'
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}>
        {/* Chevron expand/collapse */}
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.hierarquia)}
            className="flex items-center justify-center h-5 w-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0">
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3 w-3" />
            </motion.div>
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Botao linha (clicavel para vincular/desvincular) */}
        <button
          onClick={() => {
            if (jaVinculada) onDesvincular(mapExistente.id);
            else if (!isDisabled) onVincular(node);
          }}
          disabled={isDisabled}
          className={`flex-1 flex items-center gap-2 py-1.5 text-left min-w-0 ${isDisabled ? 'cursor-default' : 'cursor-pointer'}`}>
          {/* Checkbox */}
          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            jaVinculada
              ? 'bg-emerald-500 border-emerald-500'
              : grupoAtivo
                ? 'border-gray-300 group-hover/conta:border-blue-400'
                : 'border-gray-200'
          }`}>
            {jaVinculada && <Check className="h-2.5 w-2.5 text-white" />}
          </div>

          {/* Codigo hierarquico */}
          <span className={`font-mono text-[10px] flex-shrink-0 ${
            hasChildren ? 'text-gray-500 font-semibold' : 'text-gray-400'
          }`}>
            {node.hierarquia}
          </span>

          {/* Descricao */}
          <span className={`text-xs flex-1 truncate ${
            hasChildren || node.apuraDre
              ? 'font-semibold text-gray-800'
              : 'text-gray-600'
          }`}>
            {node.descricao}
          </span>

          {/* Natureza badge */}
          <span className={`text-[9px] font-mono rounded px-1 py-0.5 flex-shrink-0 ${
            node.natureza === 'C' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'
          }`}>
            {node.natureza}
          </span>

          {/* Grupo destino (quando vinculada) */}
          {jaVinculada && mapExistente[grupoRelField] && (
            <span className="text-[9px] text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[110px]">
              {mapExistente[grupoRelField].nome}
            </span>
          )}

          {/* Contador de descendentes vinculadas */}
          {!jaVinculada && temVinculadoAbaixo && (
            <span className="text-[9px] text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 flex-shrink-0" title="Contas filhas vinculadas">
              {countVinculadasNaSubtree(node, contasVinculadasMap)}
            </span>
          )}
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => (
            <PlanoContaTreeNode
              key={child.hierarquia}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              contasVinculadasMap={contasVinculadasMap}
              grupoAtivo={grupoAtivo}
              grupoRelField={grupoRelField}
              onVincular={onVincular}
              onDesvincular={onDesvincular}
            />
          ))}
        </div>
      )}
    </>
  );
}

function countVinculadasNaSubtree(node, contasVinculadasMap) {
  let count = 0;
  const codigo = String(node.planoContaCodigo || node.codigo);
  if (contasVinculadasMap.has(codigo)) count++;
  if (node.children) {
    node.children.forEach(c => { count += countVinculadasNaSubtree(c, contasVinculadasMap); });
  }
  return count;
}

// ═══════════════════════════════════════════════════════════
// Mapeamento de Vendas - configuracao por mascara
// ═══════════════════════════════════════════════════════════
function MapeamentoVendasSection({ grupos, mapeamentoVendas, onSave }) {
  const [expanded, setExpanded] = useState(false);

  // Apenas grupos podem ser destino - achatados na ordem hierarquica da mascara
  const gruposDisponiveis = useMemo(() => {
    const onlyGrupos = grupos.filter(g => g.tipo === 'grupo');
    const byParent = new Map();
    onlyGrupos.forEach(g => {
      const key = g.parent_id || 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(g);
    });
    byParent.forEach(list => list.sort((a, b) => a.ordem - b.ordem));

    const flat = [];
    function walk(parentId, depth) {
      const filhos = byParent.get(parentId) || [];
      filhos.forEach(g => {
        flat.push({ ...g, _depth: depth });
        walk(g.id, depth + 1);
      });
    }
    walk('root', 0);
    return flat;
  }, [grupos]);

  const getGrupoMapeado = (tipo) => {
    const m = mapeamentoVendas.find(x => x.tipo === tipo);
    return m?.grupo_dre_id || '';
  };

  const totalConfigurados = TIPOS_VENDA.filter(t => getGrupoMapeado(t.id)).length;

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Mapeamento de Vendas (Webposto)</p>
            <p className="text-[11px] text-gray-400">
              {totalConfigurados} de {TIPOS_VENDA.length} configurados
              {' \u00b7 '}
              valores agregados das vendas alimentam estes grupos no DRE
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalConfigurados === TIPOS_VENDA.length && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200">
              Tudo configurado
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-4 space-y-4">
              {/* Agrupado por secao */}
              {['Receitas', 'CMV', 'Outros'].map(secaoNome => {
                const tiposDaSecao = TIPOS_VENDA.filter(t => t.secao === secaoNome);
                const corClass = secaoNome === 'Receitas' ? 'text-emerald-600'
                  : secaoNome === 'CMV' ? 'text-orange-600' : 'text-gray-600';
                return (
                  <div key={secaoNome}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 px-1 ${corClass}`}>
                      {secaoNome}
                    </p>
                    <div className="space-y-1.5">
                      {tiposDaSecao.map(tipo => {
                        const grupoId = getGrupoMapeado(tipo.id);
                        return (
                          <div key={tipo.id}
                            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/40 px-3 py-2.5">
                            <div className={`flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold ${
                              tipo.sinal === 1
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {tipo.sinal === 1 ? '+' : '\u2212'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-gray-900 truncate">{tipo.label}</p>
                              <p className="text-[10px] text-gray-400 truncate">{tipo.desc}</p>
                            </div>
                            <select value={grupoId}
                              onChange={(e) => onSave(tipo.id, e.target.value)}
                              className="h-9 min-w-[260px] rounded-lg border border-gray-200 bg-white px-3 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                              <option value="">— não mapeado —</option>
                              {gruposDisponiveis.map(g => (
                                <option key={g.id} value={g.id}>
                                  {`${'\u00a0\u00a0'.repeat(g._depth)}${g._depth > 0 ? '\u2514 ' : ''}${g.nome}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                Os valores das vendas (VENDA_ITEM) são classificados em <strong>Combustível</strong> (tipoProduto=C),
                {' '}<strong>Automotivos</strong> (tipoGrupo=Pista não-combustível) e <strong>Conveniência</strong> (tipoGrupo=Conveniência),
                {' '}usando os catalogos PRODUTO + GRUPO da API.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Contas Caixa/Banco (base do Fluxo de Caixa Autosystem)
// ═══════════════════════════════════════════════════════════
// Marca quais contas do plano Autosystem são caixa/banco.
// O relatório de fluxo só considera lançamentos onde uma delas
// aparece em debito ou credito; a contraparte é classificada na máscara.
function ContasCaixaBancoSection({ planoContas, contasCaixaBanco, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const selecionadasSet = useMemo(
    () => new Set((contasCaixaBanco || []).map(c => String(c.codigo))),
    [contasCaixaBanco],
  );

  const planoFiltrado = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lista = (planoContas || []).map(c => ({
      codigo: String(c.codigo),
      nome: c.nome || '—',
    }));
    if (!q) return lista;
    return lista.filter(c =>
      c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q)
    );
  }, [planoContas, search]);

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Contas Caixa / Banco</p>
            <p className="text-[11px] text-gray-400">
              {selecionadasSet.size} conta(s) marcada(s)
              {' · '}
              base do fluxo de caixa (a contraparte do lançamento é classificada na máscara)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selecionadasSet.size > 0 && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200">
              {selecionadasSet.size}
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar por código ou nome..."
                  className="w-full h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>

              {planoContas.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">
                  Plano de contas ainda não carregado.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
                  {planoFiltrado.map(c => {
                    const marcada = selecionadasSet.has(c.codigo);
                    return (
                      <label key={c.codigo}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                          marcada ? 'bg-emerald-50/40' : ''
                        }`}>
                        <input type="checkbox"
                          checked={marcada}
                          onChange={() => onToggle(c)}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400" />
                        <span className="font-mono text-[10px] text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
                          {c.codigo}
                        </span>
                        <span className="text-[12px] text-gray-700 truncate">{c.nome}</span>
                      </label>
                    );
                  })}
                  {planoFiltrado.length === 0 && (
                    <p className="text-xs text-gray-400 py-3 text-center">
                      Nenhuma conta encontrada.
                    </p>
                  )}
                </div>
              )}

              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                Quando uma conta marcada aparece em <strong>conta_debitar</strong> ou
                {' '}<strong>conta_creditar</strong> de um lançamento, a outra conta (contraparte)
                {' '}é classificada na máscara de fluxo. Transferências entre duas contas
                {' '}caixa/banco são ignoradas.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Mapeamento Vendas/Custo Autosystem por grupo de produto
// ═══════════════════════════════════════════════════════════
// Cada grupo de produto retornado pelo Autosystem gera duas linhas
// mapeáveis (Vendas + Custo) que apontam para um grupo da máscara.
// No DRE, os valores vêm de `buscarVendasAutosystem` agregados pelo
// `grupo_produto_codigo` do produto.
function MapeamentoVendasAutosystemSection({ grupos, mapeamentoVendas, onSave }) {
  const [expanded, setExpanded] = useState(false);

  // Achata grupos selecionáveis (DRE) em ordem hierárquica
  const gruposDisponiveis = useMemo(() => {
    const onlyGrupos = grupos.filter(g => ['grupo', 'entrada', 'saida'].includes(g.tipo));
    const byParent = new Map();
    onlyGrupos.forEach(g => {
      const key = g.parent_id || 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(g);
    });
    byParent.forEach(list => list.sort((a, b) => a.ordem - b.ordem));
    const flat = [];
    function walk(parentId, depth) {
      const filhos = byParent.get(parentId) || [];
      filhos.forEach(g => {
        flat.push({ ...g, _depth: depth });
        walk(g.id, depth + 1);
      });
    }
    walk('root', 0);
    return flat;
  }, [grupos]);

  // Indexa por (categoria, tipo) p/ leitura rápida
  const mapPorChave = useMemo(() => {
    const m = new Map();
    (mapeamentoVendas || []).forEach(x => {
      m.set(`${x.categoria}::${x.tipo}`, x);
    });
    return m;
  }, [mapeamentoVendas]);

  const getGrupoMapeado = (categoria, tipo) => {
    const m = mapPorChave.get(`${categoria}::${tipo}`);
    return m?.grupo_dre_id || m?.grupo_fluxo_id || '';
  };

  const totalMapeaveis = CATEGORIAS_VENDA.length * 2;
  const totalConfigurados = CATEGORIAS_VENDA.reduce((acc, cat) =>
    acc + (getGrupoMapeado(cat.key, 'venda') ? 1 : 0) + (getGrupoMapeado(cat.key, 'custo') ? 1 : 0)
  , 0);

  const CAT_CORES = {
    combustivel:  { bg: 'bg-amber-100',   txt: 'text-amber-700',   ico: Fuel },
    automotivos:  { bg: 'bg-blue-100',    txt: 'text-blue-700',    ico: DollarSign },
    conveniencia: { bg: 'bg-emerald-100', txt: 'text-emerald-700', ico: ShoppingCart },
  };

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Fuel className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Vendas / Custo por categoria</p>
            <p className="text-[11px] text-gray-400">
              {totalConfigurados} de {totalMapeaveis} configurados
              {' · '}
              categorias herdadas de Cliente &gt; Configurações
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalConfigurados === totalMapeaveis && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200">
              Tudo configurado
            </span>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-4 space-y-3">
              {CATEGORIAS_VENDA.map(cat => {
                  const cor = CAT_CORES[cat.key] || CAT_CORES.conveniencia;
                  const Icon = cor.ico;
                  const grupoVenda = getGrupoMapeado(cat.key, 'venda');
                  const grupoCusto = getGrupoMapeado(cat.key, 'custo');
                  return (
                    <div key={cat.key}
                      className="rounded-lg border border-gray-100 bg-gray-50/40 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-md ${cor.bg} ${cor.txt} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[13px] font-semibold text-gray-800">{cat.label}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Venda */}
                        <div className="flex items-center gap-2 rounded-md bg-white border border-gray-100 px-2 py-1.5">
                          <div className="flex-shrink-0 h-6 w-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <DollarSign className="h-3 w-3" />
                          </div>
                          <span className="text-[11px] font-medium text-gray-700 flex-shrink-0">Venda</span>
                          <select value={grupoVenda}
                            onChange={(e) => onSave(cat.key, 'venda', e.target.value)}
                            className="h-7 flex-1 rounded border border-gray-200 bg-white px-2 text-[11px] focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100">
                            <option value="">— não mapeado —</option>
                            {gruposDisponiveis.map(g => (
                              <option key={g.id} value={g.id}>
                                {`${'  '.repeat(g._depth)}${g._depth > 0 ? '└ ' : ''}${g.nome}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        {/* Custo */}
                        <div className="flex items-center gap-2 rounded-md bg-white border border-gray-100 px-2 py-1.5">
                          <div className="flex-shrink-0 h-6 w-6 rounded bg-orange-100 text-orange-700 flex items-center justify-center">
                            <DollarSign className="h-3 w-3" />
                          </div>
                          <span className="text-[11px] font-medium text-gray-700 flex-shrink-0">Custo</span>
                          <select value={grupoCusto}
                            onChange={(e) => onSave(cat.key, 'custo', e.target.value)}
                            className="h-7 flex-1 rounded border border-gray-200 bg-white px-2 text-[11px] focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100">
                            <option value="">— não mapeado —</option>
                            {gruposDisponiveis.map(g => (
                              <option key={g.id} value={g.id}>
                                {`${'  '.repeat(g._depth)}${g._depth > 0 ? '└ ' : ''}${g.nome}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                Valores vêm de <strong>buscarVendasAutosystem</strong>, agregando os grupos categorizados em
                {' '}<strong>as_rede_grupo_produto</strong>. Venda = SUM(valor); Custo = SUM(valor_custo).
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
