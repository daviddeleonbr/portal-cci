import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Search, Building2, ChevronRight, ArrowLeft,
  TrendingUp, BarChart3, PieChart, FileBarChart, Wallet,
  Loader2, Zap, Lock, Sparkles, FlaskConical, Network,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import * as clientesService from '../services/clientesService';
import * as autosystemService from '../services/autosystemService';
import { useAnonimizador } from '../services/anonimizarService';
import { useAdminSession } from '../hooks/useAuth';

// Catalogo de relatorios disponiveis
const RELATORIOS = [
  {
    id: 'dre',
    nome: 'DRE Gerencial',
    descricao: 'Demonstrativo de Resultado por máscara configurada',
    icon: FileBarChart,
    color: 'blue',
    disponivel: true,
  },
  {
    id: 'analise-lancamentos',
    nome: 'Análise de Lançamentos',
    descricao: 'Duplicatas, picos e quedas nas contas marcadas',
    icon: FlaskConical,
    color: 'blue',
    disponivel: true,
  },
  {
    id: 'fluxo-caixa',
    nome: 'Fluxo de Caixa',
    descricao: 'Entradas, saídas e saldo por período',
    icon: Wallet,
    color: 'emerald',
    disponivel: true,
  },
  {
    id: 'indicadores',
    nome: 'Indicadores',
    descricao: 'KPIs e metricas operacionais',
    icon: TrendingUp,
    color: 'amber',
    disponivel: false,
  },
  {
    id: 'composicao',
    nome: 'Composição de Receitas',
    descricao: 'Análise por tipo de receita',
    icon: PieChart,
    color: 'violet',
    disponivel: false,
  },
  {
    id: 'evolucao',
    nome: 'Evolucao Mensal',
    descricao: 'Vendas, margens e insights estrategicos mês a mês',
    icon: BarChart3,
    color: 'cyan',
    disponivel: true,
  },
  {
    id: 'analise-ia',
    nome: 'Análise de Vendas (IA)',
    descricao: 'Diagnóstico comercial com IA: mix, margens, oportunidades',
    icon: Sparkles,
    color: 'violet',
    disponivel: true,
  },
];

// ═══════════════════════════════════════════════════════════
// Hub - lista de clientes
// ═══════════════════════════════════════════════════════════
export default function RelatoriosCliente() {
  const { labelEmpresa, labelRede, labelCnpj } = useAnonimizador();
  const session = useAdminSession();
  const podeUsarIA = (session?.usuario?.permissoes || []).includes('analise_ia');
  const [clientes, setClientes] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRedes, setExpandedRedes] = useState(new Set());

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const [data, redesAS] = await Promise.all([
        clientesService.listarClientes(),
        autosystemService.listarRedes().catch(() => []),
      ]);
      setClientes((data || []).filter(c => c.status === 'ativo'));
      setRedesAutosystem(redesAS || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mapa: as_rede_id → { id, nome } pra resolver o nome da rede Autosystem
  // (clientesService.listarClientes só faz JOIN em chaves_api, então pra
  // Autosystem precisamos da lista separada de redes).
  const mapaRedesAS = useMemo(() => {
    const m = new Map();
    (redesAutosystem || []).forEach(r => { if (r?.id) m.set(r.id, r); });
    return m;
  }, [redesAutosystem]);

  // Filtro empresa-level (busca cobre nome, CNPJ e nome da rede webposto OU autosystem)
  const filtrados = useMemo(() => {
    if (!search) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(c => {
      if (c.nome?.toLowerCase().includes(q)) return true;
      if (c.cnpj?.includes(search)) return true;
      if ((c.chaves_api?.nome || '').toLowerCase().includes(q)) return true;
      const nomeAS = c.as_rede_id ? (mapaRedesAS.get(c.as_rede_id)?.nome || '') : '';
      if (nomeAS.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [clientes, search, mapaRedesAS]);

  // Agrupa empresas por rede. Considera tanto Webposto (chave_api_id) quanto
  // Autosystem (as_rede_id). Chaves compostas com prefixo evitam colisão
  // entre uuids dos dois sistemas.
  const redes = useMemo(() => {
    const map = new Map();
    filtrados.forEach(c => {
      let key, info;
      if (c.chave_api_id) {
        key = `wb:${c.chave_api_id}`;
        info = {
          id: key,
          tipo: 'webposto',
          nome: c.chaves_api?.nome || '',
          provedor: c.chaves_api?.provedor || '',
          chaveApi: c.chaves_api || null,
          chaveApiId: c.chave_api_id,
          asRede: null,
          asRedeId: null,
        };
      } else if (c.as_rede_id) {
        const r = mapaRedesAS.get(c.as_rede_id);
        key = `as:${c.as_rede_id}`;
        info = {
          id: key,
          tipo: 'autosystem',
          nome: r?.nome || '',
          provedor: 'autosystem',
          chaveApi: null,
          chaveApiId: null,
          asRede: r || null,
          asRedeId: c.as_rede_id,
        };
      } else {
        key = '_sem_rede';
        info = {
          id: key, tipo: 'sem_rede', nome: '', provedor: '',
          chaveApi: null, chaveApiId: null, asRede: null, asRedeId: null,
        };
      }
      if (!map.has(key)) map.set(key, { ...info, empresas: [] });
      map.get(key).empresas.push(c);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === '_sem_rede') return 1;
      if (b.id === '_sem_rede') return -1;
      return (a.nome || '').localeCompare(b.nome || '');
    });
  }, [filtrados, mapaRedesAS]);

  // Expande automaticamente quando ha apenas 1 rede OU quando o usuario busca algo
  useEffect(() => {
    if (search) {
      setExpandedRedes(new Set(redes.map(r => r.id)));
    } else if (redes.length === 1) {
      setExpandedRedes(new Set([redes[0].id]));
    }
  }, [search, redes]);

  const toggleRede = (redeId) => {
    setExpandedRedes(prev => {
      const next = new Set(prev);
      next.has(redeId) ? next.delete(redeId) : next.add(redeId);
      return next;
    });
  };

  return (
    <div>
      <PageHeader title="Relatórios do Cliente" description="Escolha a rede e a empresa para abrir as análises gerenciais" />

      {/* Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por rede, empresa ou CNPJ..."
            className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
              <div className="h-5 w-40 bg-gray-100 rounded mb-3" />
              <div className="h-4 w-60 bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      ) : redes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100">
          <Network className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-800">Nenhuma rede encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {redes.map((rede, i) => {
            const expanded = expandedRedes.has(rede.id);
            const nomeRede = labelRede(rede.nome || 'Sem rede', rede.id);
            const provedor = rede.provedor || '';
            const usaWebposto = rede.tipo === 'webposto' && rede.empresas.some(c => c.usa_webposto);
            return (
              <motion.div key={rede.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabecalho da rede (clicavel) */}
                <button onClick={() => toggleRede(rede.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                    expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'
                  }`}>
                  <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </motion.div>
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
                    <Network className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{nomeRede}</p>
                    <p className="text-[11px] text-gray-400">
                      {rede.empresas.length} empresa{rede.empresas.length === 1 ? '' : 's'}
                      {provedor && <> · {provedor}</>}
                    </p>
                  </div>
                  {usaWebposto && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-medium flex-shrink-0">
                      <Zap className="h-2.5 w-2.5" /> Webposto
                    </span>
                  )}
                  {rede.tipo === 'autosystem' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-medium flex-shrink-0">
                      <Network className="h-2.5 w-2.5" /> Autosystem
                    </span>
                  )}
                  {rede.tipo === 'autosystem' && rede.asRedeId && (
                    <>
                      <Link
                        to={`/admin/relatorios-cliente/rede-as/${rede.asRedeId}/dre`}
                        onClick={(e) => e.stopPropagation()}
                        title="DRE consolidada da rede Autosystem"
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-colors shadow-sm"
                      >
                        <FileBarChart className="h-3 w-3" />
                        DRE da Rede
                      </Link>
                      <Link
                        to={`/admin/relatorios-cliente/rede-as/${rede.asRedeId}/fluxo-caixa`}
                        onClick={(e) => e.stopPropagation()}
                        title="Fluxo de Caixa consolidado da rede Autosystem"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-colors shadow-sm"
                      >
                        <Wallet className="h-3 w-3" />
                        Fluxo da Rede
                      </Link>
                    </>
                  )}
                  {usaWebposto && rede.chaveApiId && (
                    <>
                      <Link
                        to={`/admin/relatorios-cliente/rede/${rede.chaveApiId}/dre`}
                        onClick={(e) => e.stopPropagation()}
                        title="DRE consolidada da rede"
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-colors shadow-sm"
                      >
                        <FileBarChart className="h-3 w-3" />
                        DRE da Rede
                      </Link>
                      <Link
                        to={`/admin/relatorios-cliente/rede/${rede.chaveApiId}/fluxo-caixa`}
                        onClick={(e) => e.stopPropagation()}
                        title="Fluxo de Caixa consolidado da rede"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-colors shadow-sm"
                      >
                        <Wallet className="h-3 w-3" />
                        Fluxo da Rede
                      </Link>
                      <Link
                        to={`/admin/relatorios-cliente/rede/${rede.chaveApiId}/analise-lancamentos`}
                        onClick={(e) => e.stopPropagation()}
                        title="Análise de lançamentos consolidada de todas as empresas da rede"
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-colors shadow-sm"
                      >
                        <FlaskConical className="h-3 w-3" />
                        Lanc. da Rede
                      </Link>
                      {podeUsarIA && (
                        <Link
                          to={`/admin/relatorios-cliente/rede/${rede.chaveApiId}/analise-ia`}
                          onClick={(e) => e.stopPropagation()}
                          title="Análise de vendas da rede com IA"
                          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white px-3 py-1.5 text-[11px] font-semibold flex-shrink-0 transition-all shadow-sm"
                        >
                          <Sparkles className="h-3 w-3" />
                          Análise IA da Rede
                        </Link>
                      )}
                    </>
                  )}
                </button>

                {/* Grid de empresas (expansivel) */}
                {expanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {rede.empresas.map((c) => (
                        <Link key={c.id} to={`/admin/relatorios-cliente/${c.id}`}
                          className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-md bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center flex-shrink-0">
                              {(labelEmpresa(c) || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-gray-900 truncate">{labelEmpresa(c)}</p>
                              {c.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{labelCnpj(c.cnpj)}</p>}
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Hub do cliente - cards de relatorios disponiveis
// ═══════════════════════════════════════════════════════════
export function ClienteRelatoriosHub() {
  const { clienteId } = useParams();
  const navigate = useNavigate();
  const { labelEmpresa, labelCnpj } = useAnonimizador();
  const session = useAdminSession();
  const podeUsarIA = (session?.usuario?.permissoes || []).includes('analise_ia');
  const relatoriosVisiveis = useMemo(
    () => RELATORIOS.filter(r => r.id !== 'analise-ia' || podeUsarIA),
    [podeUsarIA]
  );
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await clientesService.buscarCliente(clienteId);
        setCliente(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [clienteId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }
  if (!cliente) {
    return <div className="text-center py-20 text-gray-500">Cliente não encontrado</div>;
  }

  return (
    <div>
      {/* Breadcrumb header */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/relatorios-cliente')}
          className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {(labelEmpresa(cliente) || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{labelEmpresa(cliente)}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {cliente.cnpj && <span className="font-mono">{labelCnpj(cliente.cnpj)}</span>}
              {cliente.usa_webposto && (
                <>
                  <span>&middot;</span>
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Zap className="h-2.5 w-2.5" /> Webposto
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Section title */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-900">Análises disponíveis</h3>
      </div>

      {/* Reports grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatoriosVisiveis.map((r, i) => {
          const Icon = r.icon;
          const colors = {
            blue: 'from-blue-500 to-blue-600',
            emerald: 'from-emerald-500 to-teal-600',
            amber: 'from-amber-500 to-orange-600',
            violet: 'from-blue-500 to-blue-600',
            cyan: 'from-blue-500 to-blue-500',
          };

          const card = (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`relative bg-white rounded-xl border border-gray-100 p-5 transition-all ${
                r.disponivel ? 'hover:border-blue-200 hover:shadow-md cursor-pointer group' : 'opacity-60 cursor-not-allowed'
              }`}>
              <div className="flex items-start gap-3 mb-3">
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${colors[r.color]} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.nome}</p>
                  <p className="text-xs text-gray-500 leading-snug mt-0.5">{r.descricao}</p>
                </div>
              </div>
              {r.disponivel ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
                  <span>Abrir relatório</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                  <Lock className="h-3 w-3" /> Em breve
                </div>
              )}
            </motion.div>
          );

          return r.disponivel ? (
            <Link key={r.id} to={`/admin/relatorios-cliente/${clienteId}/${r.id}`}>{card}</Link>
          ) : (
            <div key={r.id}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
