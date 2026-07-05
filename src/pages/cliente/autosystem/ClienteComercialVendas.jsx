import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Fuel, Package, Store, MoreHorizontal,
  Loader2, AlertCircle, RefreshCw, Calendar, Search,
  Building2, ChevronDown, ChevronRight, LayoutGrid,
  TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon,
  Percent, Coins, CalendarDays, Droplet, CalendarRange, Construction,
  BarChart3, Clock, DollarSign, PieChart,
} from 'lucide-react';

// Sub-abas exibidas dentro da aba "Combustíveis".
const SUB_ABAS_COMBUSTIVEL = [
  { key: 'dia',     label: 'Realizado dia a dia',      icone: CalendarDays  },
  { key: 'tipo',    label: 'Realizado · Por combustível', icone: Droplet    },
  { key: 'doze',    label: 'Últimos 12 meses',         icone: LineChartIcon },
  { key: 'semana',  label: 'Análise semanal',          icone: CalendarRange },
];

// Sub-abas exibidas dentro da aba "Automotivos".
const SUB_ABAS_AUTOMOTIVOS = [
  { key: 'dia',            label: 'Realizado dia a dia', icone: CalendarDays  },
  { key: 'grupo',          label: 'Realizado por grupo', icone: Package       },
  { key: 'pareto',         label: 'Análise de pareto',   icone: BarChart3     },
  { key: 'analise_margem', label: 'Análise de margem',   icone: Percent       },
  { key: 'tempo',          label: 'Linha do tempo',      icone: Clock         },
  { key: 'carrinho',       label: 'Carrinho de compras', icone: ShoppingCart  },
];
// Sub-abas exibidas dentro da aba "Conveniência". Mesma estrutura de Automotivos.
const SUB_ABAS_CONVENIENCIA = [
  { key: 'dia',            label: 'Realizado dia a dia', icone: CalendarDays  },
  { key: 'grupo',          label: 'Realizado por grupo', icone: Package       },
  { key: 'pareto',         label: 'Análise de pareto',   icone: BarChart3     },
  { key: 'analise_margem', label: 'Análise de margem',   icone: Percent       },
  { key: 'tempo',          label: 'Linha do tempo',      icone: Clock         },
  { key: 'carrinho',       label: 'Carrinho de compras', icone: ShoppingCart  },
];

// Paleta de cores por categoria. Classes Tailwind explicitas para o JIT.
const TREE_PALETAS_CATEGORIA = {
  blue: {
    bgHeader: 'bg-blue-50/40', hoverHeader: 'hover:bg-blue-50/70',
    borderTop: 'border-blue-100',
    chevron: 'text-blue-600', icon: 'text-blue-600', iconSub: 'text-blue-500',
    hoverLeaf: 'hover:bg-blue-50/30',
    kpiText: 'text-blue-700', kpiRing: 'ring-blue-200',
    kpiBg: 'bg-blue-50', kpiBorder: 'border-blue-100', kpiBorderStrong: 'border-blue-300',
    kpiGradient: 'bg-gradient-to-br from-blue-50/60 to-blue-50/40',
    chartIcon: 'text-blue-500', chartBar: '#99f6e4',
    spinner: 'text-blue-600', emptyBg: 'bg-blue-50', emptyIcon: 'text-blue-600',
    focusBorder: 'focus:border-blue-400', focusRing: 'focus:ring-blue-100',
    checkText: 'text-blue-600', checkRing: 'focus:ring-blue-500',
    dropdownBorder: 'border-blue-400', dropdownRing: 'ring-blue-100',
    btnSelectedRing: 'ring-blue-200',
  },
  emerald: {
    bgHeader: 'bg-emerald-50/40', hoverHeader: 'hover:bg-emerald-50/70',
    borderTop: 'border-emerald-100',
    chevron: 'text-emerald-600', icon: 'text-emerald-600', iconSub: 'text-emerald-500',
    hoverLeaf: 'hover:bg-emerald-50/30',
    kpiText: 'text-emerald-700', kpiRing: 'ring-emerald-200',
    kpiBg: 'bg-emerald-50', kpiBorder: 'border-emerald-100', kpiBorderStrong: 'border-emerald-300',
    kpiGradient: 'bg-gradient-to-br from-emerald-50/60 to-teal-50/40',
    chartIcon: 'text-emerald-500', chartBar: '#a7f3d0',
    spinner: 'text-emerald-600', emptyBg: 'bg-emerald-50', emptyIcon: 'text-emerald-600',
    focusBorder: 'focus:border-emerald-400', focusRing: 'focus:ring-emerald-100',
    checkText: 'text-emerald-600', checkRing: 'focus:ring-emerald-500',
    dropdownBorder: 'border-emerald-400', dropdownRing: 'ring-emerald-100',
    btnSelectedRing: 'ring-emerald-200',
  },
};
import {
  AreaChart, Area, ComposedChart, Bar, Line, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const MESES_PT_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function diaSemanaCurto(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return DIAS_SEMANA_CURTO[new Date(y, m - 1, d).getDay()];
}
function subtrairDias(iso, dias) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dias);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
// Abas exibidas no topo da página. "geral" agrega todas as categorias.
const ABAS = [
  { key: 'geral',        label: 'Visão geral',   labelCurto: 'Geral',       icone: LayoutGrid, categoria: null          },
  { key: 'combustivel',  label: 'Combustíveis',  labelCurto: 'Combustível', icone: Fuel,       categoria: 'combustivel' },
  { key: 'automotivos',  label: 'Automotivos',   labelCurto: 'Auto',        icone: Package,    categoria: 'automotivos' },
  { key: 'conveniencia', label: 'Conveniências', labelCurto: 'Conveniência',icone: Store,      categoria: 'conveniencia'},
];
import PageHeader from '../../../components/ui/PageHeader';
import Modal from '../../../components/ui/Modal';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import SeletorMesAno from '../../../components/vendas/SeletorMesAno';
import { primeiroDiaMesIso, ultimoDiaMesIso } from '../../../utils/periodoMes';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

// ─── Helpers ─────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
// Mesma data 1 ano atrás; se cair em 29/02 num ano não-bissexto, usa 28/02.
function subtrairUmAno(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const tentativa = new Date(y - 1, m - 1, d);
  if (tentativa.getMonth() !== m - 1) {
    const ultimo = new Date(y - 1, m, 0).getDate();
    return `${y - 1}-${pad(m)}-${pad(ultimo)}`;
  }
  return `${y - 1}-${pad(m)}-${pad(d)}`;
}
// Mesma data 1 mês atrás. Se o dia não existe no mês anterior (ex: 31/03→fev),
// clampa para o último dia do mês anterior.
function subtrairUmMes(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const ano = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  const dia = Math.min(d, ultimo);
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}
function diasNoMes(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function diasDecorridos(dataDe, dataAte) {
  const [y1, m1, d1] = String(dataDe).split('-').map(Number);
  const [y2, m2, d2] = String(dataAte).split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
function ontemIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minIso(a, b) { return a < b ? a : b; }
function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
function formatNumero(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// Categorias suportadas (espelha as_rede_grupo_produto.categoria)
const CATEGORIAS = [
  { key: 'combustivel',  label: 'Combustível',  icone: Fuel,    cor: 'amber'   },
  { key: 'automotivos',  label: 'Automotivos',  icone: Package, cor: 'blue'    },
  { key: 'conveniencia', label: 'Conveniência', icone: Store,   cor: 'emerald' },
  { key: 'outros',       label: 'Outros',       icone: MoreHorizontal, cor: 'gray' },
  { key: 'sem_categoria',label: 'Sem categoria', icone: AlertCircle, cor: 'red' },
];
const CAT_PALETA = {
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: 'text-amber-600',   border: 'border-amber-200' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'text-blue-600',    border: 'border-blue-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600', border: 'border-emerald-200' },
  gray:    { bg: 'bg-gray-50',    text: 'text-gray-700',    icon: 'text-gray-600',    border: 'border-gray-200' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     icon: 'text-red-600',     border: 'border-red-200' },
};

// ─── Componente ──────────────────────────────────────────────
export default function ClienteComercialVendas() {
  const session = useClienteSession();
  const asRede = session?.asRede;

  // Empresa ativa compartilhada com outras páginas Autosystem.
  const { empresaId, setEmpresaId, empresasDisponiveis } = useEmpresaAtiva();
  const empresaAtual = useMemo(
    () => empresasDisponiveis.find(c => c.id === empresaId) || null,
    [empresasDisponiveis, empresaId],
  );
  const empresasSel = useMemo(
    () => empresaAtual ? [empresaAtual] : [],
    [empresaAtual],
  );
  const empresasSelIds = useMemo(
    () => new Set(empresaId ? [empresaId] : []),
    [empresaId],
  );

  // Filtros — período por MÊS + ANO (mês fechado)
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [apenasFechados, setApenasFechados] = useState(true);

  const dataDe  = useMemo(() => primeiroDiaMesIso(ano, mes), [ano, mes]);
  const dataAte = useMemo(() => ultimoDiaMesIso(ano, mes), [ano, mes]);

  // Data limite real usada nas consultas — clamp em ontem quando "apenas fechados"
  const dataAteEfetivo = useMemo(
    () => apenasFechados ? minIso(dataAte, ontemIso()) : dataAte,
    [dataAte, apenasFechados],
  );

  const [loading, setLoading] = useState(false);
  const [vendas, setVendas] = useState([]);
  const [vendasAnoAnterior, setVendasAnoAnterior] = useState([]);
  const [vendasMesAnterior, setVendasMesAnterior] = useState([]);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('geral');
  const [subAbaCombustivel, setSubAbaCombustivel] = useState('dia');
  const [subAbaAutomotivos, setSubAbaAutomotivos] = useState('dia');
  const [subAbaConveniencia, setSubAbaConveniencia] = useState('dia');
  const [expandidos, setExpandidos] = useState(new Set());

  // Modal de detalhe ao clicar numa categoria do resumo Posto × Categoria
  // (mostra realizado + projeções em cards)
  const [detalheCatModal, setDetalheCatModal] = useState(null);

  // Evolução dos últimos 12 meses (independente do período selecionado)
  const [evolucao12m, setEvolucao12m] = useState([]);
  const [loadingEvolucao, setLoadingEvolucao] = useState(false);

  // Realizado diário (aba Combustíveis → "Realizado dia a dia"). Estende o
  // range em 7 dias antes do data_de para conseguir calcular a variação semanal.
  const [realizadoDiario, setRealizadoDiario] = useState([]);
  const [loadingDiario, setLoadingDiario] = useState(false);
  const [erroDiario, setErroDiario] = useState('');
  const [expandidosDia, setExpandidosDia] = useState(new Set());
  const [expandidosProd, setExpandidosProd] = useState(new Set());

  // Evolução 12 meses POR combustível — usado pela sub-aba "Últimos 12 meses"
  // da aba Combustíveis. Cada linha tem ano_mes + produto.
  const [evolucao12mPorProduto, setEvolucao12mPorProduto] = useState([]);
  const [loadingEvolProd, setLoadingEvolProd] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);

  // Realizado diário (Automotivos · Realizado dia a dia).
  const [realizadoDiarioAuto, setRealizadoDiarioAuto] = useState([]);
  const [loadingDiarioAuto, setLoadingDiarioAuto] = useState(false);
  const [erroDiarioAuto, setErroDiarioAuto] = useState('');
  const [expandidosAuto, setExpandidosAuto] = useState(new Set());

  // Análise de pareto (Automotivos): meta % + grupos a analisar (multi-seleção).
  // Set vazio == nenhum filtro (todos os grupos).
  const [paretoMeta, setParetoMeta] = useState(80);
  const [paretoGrupos, setParetoGrupos] = useState(new Set());

  // Linha do tempo (Automotivos): evolução 12m + filtros multi-seleção de
  // grupos e produtos. Set vazio = sem filtro nesse nível.
  const [evolucao12mAuto, setEvolucao12mAuto] = useState([]);
  const [loadingEvol12mAuto, setLoadingEvol12mAuto] = useState(false);
  const [tempoGruposSel, setTempoGruposSel] = useState(new Set());
  const [tempoProdutosSel, setTempoProdutosSel] = useState(new Set());

  // Carrinho de compras (Automotivos): pares de produtos vendidos juntos.
  // Tem janela própria (30/60/90/180 dias) — não obedece o filtro de data.
  const [paresCarrinho, setParesCarrinho] = useState([]);
  const [totalTransacoesCarrinho, setTotalTransacoesCarrinho] = useState(0);
  const [loadingCarrinho, setLoadingCarrinho] = useState(false);
  const [erroCarrinho, setErroCarrinho] = useState('');
  const [carrinhoGruposSel, setCarrinhoGruposSel] = useState(new Set());
  const [carrinhoMinTransacoes, setCarrinhoMinTransacoes] = useState(2);
  const [carrinhoBusca, setCarrinhoBusca] = useState('');
  const [carrinhoPeriodoDias, setCarrinhoPeriodoDias] = useState(90);

  // Estado equivalente para Conveniência.
  const [realizadoDiarioConv, setRealizadoDiarioConv] = useState([]);
  const [loadingDiarioConv, setLoadingDiarioConv] = useState(false);
  const [erroDiarioConv, setErroDiarioConv] = useState('');
  const [expandidosConv, setExpandidosConv] = useState(new Set());
  const [paretoMetaConv, setParetoMetaConv] = useState(80);
  const [paretoGruposConv, setParetoGruposConv] = useState(new Set());
  const [evolucao12mConv, setEvolucao12mConv] = useState([]);
  const [loadingEvol12mConv, setLoadingEvol12mConv] = useState(false);
  const [tempoGruposSelConv, setTempoGruposSelConv] = useState(new Set());
  const [tempoProdutosSelConv, setTempoProdutosSelConv] = useState(new Set());

  // Carrinho de compras (Conveniência) — janela própria (30/60/90/180 dias).
  const [paresCarrinhoConv, setParesCarrinhoConv] = useState([]);
  const [totalTransacoesCarrinhoConv, setTotalTransacoesCarrinhoConv] = useState(0);
  const [loadingCarrinhoConv, setLoadingCarrinhoConv] = useState(false);
  const [erroCarrinhoConv, setErroCarrinhoConv] = useState('');
  const [carrinhoGruposSelConv, setCarrinhoGruposSelConv] = useState(new Set());
  const [carrinhoMinTransacoesConv, setCarrinhoMinTransacoesConv] = useState(2);
  const [carrinhoBuscaConv, setCarrinhoBuscaConv] = useState('');
  const [carrinhoPeriodoDiasConv, setCarrinhoPeriodoDiasConv] = useState(90);

  // Mapas vindos de as_rede_grupo_produto: grid → categoria e grid → nome.
  const [mapaGrupos, setMapaGrupos] = useState(new Map());
  const [mapaNomeGrupos, setMapaNomeGrupos] = useState(new Map());

  const redeId = asRede?.id;

  // Carrega o mapa de categorias/nomes (uma vez por rede). Indexa por `grid`,
  // pois é o identificador que `produto.grupo` no Autosystem referencia.
  useEffect(() => {
    if (!redeId) {
      setMapaGrupos(new Map());
      setMapaNomeGrupos(new Map());
      return;
    }
    (async () => {
      try {
        const lista = await autosystemService.listarGruposProdutoRede(redeId);
        const mCat = new Map();
        const mNome = new Map();
        (lista || []).forEach(g => {
          if (g.grid != null) {
            mCat.set(Number(g.grid), g.categoria);
            mNome.set(Number(g.grid), g.nome || '');
          }
        });
        setMapaGrupos(mCat);
        setMapaNomeGrupos(mNome);
      } catch {
        setMapaGrupos(new Map());
        setMapaNomeGrupos(new Map());
      }
    })();
  }, [redeId]);

  const carregar = useCallback(async () => {
    if (!redeId) return;
    if (empresasSel.length === 0) {
      setErro('Selecione ao menos uma empresa.');
      setVendas([]);
      return;
    }
    setLoading(true);
    setErro('');
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      // Três requisições em paralelo: período atual, mesmo intervalo do mês
      // anterior e mesmo intervalo do ano anterior. Falhas em MA/AA caem em []
      // (não bloqueiam o relatório principal).
      const [rows, rowsMA, rowsAA] = await Promise.all([
        autosystemService.buscarVendasAutosystem(redeId, codigos, {
          data_de: dataDe,
          data_ate: dataAteEfetivo,
          agregado: true,
        }),
        autosystemService.buscarVendasAutosystem(redeId, codigos, {
          data_de: subtrairUmMes(dataDe),
          data_ate: subtrairUmMes(dataAteEfetivo),
          agregado: true,
        }).catch(() => []),
        autosystemService.buscarVendasAutosystem(redeId, codigos, {
          data_de: subtrairUmAno(dataDe),
          data_ate: subtrairUmAno(dataAteEfetivo),
          agregado: true,
        }).catch(() => []),
      ]);
      setVendas(rows);
      setVendasMesAnterior(rowsMA);
      setVendasAnoAnterior(rowsAA);
    } catch (err) {
      setErro(err.message || 'Falha ao buscar vendas');
      setVendas([]);
      setVendasMesAnterior([]);
      setVendasAnoAnterior([]);
    } finally {
      setLoading(false);
    }
  }, [redeId, empresasSel, dataDe, dataAteEfetivo]);

  useEffect(() => { carregar(); }, [carregar]);

  // Realizado dia a dia (combustíveis). Busca quando a aba Combustíveis está
  // ativa e nas sub-abas "dia", "tipo" ou "semana" — todas usam a mesma
  // base de dados (vendas agregadas por dia × produto). Estende o range em
  // 7 dias antes para conseguir calcular a variação semanal na tela "dia".
  useEffect(() => {
    if (aba !== 'combustivel') return;
    if (!['dia', 'tipo', 'semana'].includes(subAbaCombustivel)) return;
    if (!redeId || empresasSel.length === 0) { setRealizadoDiario([]); return; }
    // Lista de grids de grupos de combustível (vem da categorização salva).
    const gruposComb = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'combustivel') gruposComb.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const dataDeEstendido = subtrairDias(dataDe, 7);
    let cancelado = false;
    setLoadingDiario(true);
    setErroDiario('');
    autosystemService.buscarVendasDiariasAutosystem(redeId, codigos, {
      data_de: dataDeEstendido,
      data_ate: dataAteEfetivo,
      grupos_filtro: gruposComb,
    })
      .then(rows => { if (!cancelado) setRealizadoDiario(rows || []); })
      .catch(err => { if (!cancelado) { setErroDiario(err.message || 'Falha ao buscar realizado'); setRealizadoDiario([]); } })
      .finally(() => { if (!cancelado) setLoadingDiario(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaCombustivel, redeId, empresasSel, dataDe, dataAteEfetivo, mapaGrupos]);

  // Realizado dia a dia (Automotivos). Mesmo padrão do combustível, filtrando
  // por grupos da categoria automotivos. Não estende o range (não há variação
  // semanal neste relatório). Carrega também na sub-aba "grupo" — mesma base.
  useEffect(() => {
    if (aba !== 'automotivos') return;
    if (!['dia', 'grupo', 'pareto', 'analise_margem'].includes(subAbaAutomotivos)) return;
    if (!redeId || empresasSel.length === 0) { setRealizadoDiarioAuto([]); return; }
    const gruposAuto = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'automotivos') gruposAuto.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    let cancelado = false;
    setLoadingDiarioAuto(true);
    setErroDiarioAuto('');
    autosystemService.buscarVendasDiariasAutosystem(redeId, codigos, {
      data_de: dataDe,
      data_ate: dataAteEfetivo,
      grupos_filtro: gruposAuto,
    })
      .then(rows => { if (!cancelado) setRealizadoDiarioAuto(rows || []); })
      .catch(err => { if (!cancelado) { setErroDiarioAuto(err.message || 'Falha ao buscar realizado'); setRealizadoDiarioAuto([]); } })
      .finally(() => { if (!cancelado) setLoadingDiarioAuto(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaAutomotivos, redeId, empresasSel, dataDe, dataAteEfetivo, mapaGrupos]);

  // Realizado dia a dia (Conveniência).
  useEffect(() => {
    if (aba !== 'conveniencia') return;
    if (!['dia', 'grupo', 'pareto', 'analise_margem'].includes(subAbaConveniencia)) return;
    if (!redeId || empresasSel.length === 0) { setRealizadoDiarioConv([]); return; }
    const gruposCat = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'conveniencia') gruposCat.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    let cancelado = false;
    setLoadingDiarioConv(true);
    setErroDiarioConv('');
    autosystemService.buscarVendasDiariasAutosystem(redeId, codigos, {
      data_de: dataDe,
      data_ate: dataAteEfetivo,
      grupos_filtro: gruposCat,
    })
      .then(rows => { if (!cancelado) setRealizadoDiarioConv(rows || []); })
      .catch(err => { if (!cancelado) { setErroDiarioConv(err.message || 'Falha ao buscar realizado'); setRealizadoDiarioConv([]); } })
      .finally(() => { if (!cancelado) setLoadingDiarioConv(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaConveniencia, redeId, empresasSel, dataDe, dataAteEfetivo, mapaGrupos]);

  // Carrinho de compras (Conveniência): mesma lógica do automotivos.
  useEffect(() => {
    if (aba !== 'conveniencia' || subAbaConveniencia !== 'carrinho') return;
    if (!redeId || empresasSel.length === 0) {
      setParesCarrinhoConv([]); setTotalTransacoesCarrinhoConv(0); return;
    }
    const gruposCat = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'conveniencia') gruposCat.push(grid); });
    const gruposEscolhidos = carrinhoGruposSelConv.size > 0
      ? Array.from(carrinhoGruposSelConv).map(Number).filter(g => gruposCat.includes(g))
      : gruposCat;
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const dataAteStr = ontemIso();
    const dataDeStr  = subtrairDias(dataAteStr, carrinhoPeriodoDiasConv - 1);
    let cancelado = false;
    setLoadingCarrinhoConv(true);
    setErroCarrinhoConv('');
    autosystemService.buscarParesCarrinhoAutosystem(redeId, codigos, {
      data_de: dataDeStr,
      data_ate: dataAteStr,
      grupos_filtro: gruposEscolhidos,
    })
      .then(({ pares, total_transacoes }) => {
        if (cancelado) return;
        setParesCarrinhoConv(pares || []);
        setTotalTransacoesCarrinhoConv(total_transacoes || 0);
      })
      .catch(err => {
        if (cancelado) return;
        setErroCarrinhoConv(err.message || 'Falha ao buscar pares');
        setParesCarrinhoConv([]); setTotalTransacoesCarrinhoConv(0);
      })
      .finally(() => { if (!cancelado) setLoadingCarrinhoConv(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaConveniencia, redeId, empresasSel, mapaGrupos, carrinhoGruposSelConv, carrinhoPeriodoDiasConv]);

  // Evolução 12m POR produto (Conveniência · Linha do tempo).
  // Carrega também na Visão geral pra alimentar o sparkline de margem
  // nos cards de Lucro bruto.
  useEffect(() => {
    if (aba !== 'conveniencia' && aba !== 'geral') return;
    if (aba === 'conveniencia' && subAbaConveniencia !== 'tempo') return;
    if (!redeId || empresasSel.length === 0) { setEvolucao12mConv([]); return; }
    const gruposCat = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'conveniencia') gruposCat.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const de  = new Date(ano, mes - 11, 1);
    const ate = new Date(ano, mes + 1, 0);
    const dataDeStr  = `${de.getFullYear()}-${pad(de.getMonth() + 1)}-01`;
    const dataAteStr = `${ate.getFullYear()}-${pad(ate.getMonth() + 1)}-${pad(ate.getDate())}`;
    let cancelado = false;
    setLoadingEvol12mConv(true);
    autosystemService.buscarVendasMensalPorProdutoAutosystem(redeId, codigos, {
      data_de: dataDeStr, data_ate: dataAteStr, grupos_filtro: gruposCat,
    })
      .then(rows => { if (!cancelado) setEvolucao12mConv(rows || []); })
      .catch(() => { if (!cancelado) setEvolucao12mConv([]); })
      .finally(() => { if (!cancelado) setLoadingEvol12mConv(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaConveniencia, redeId, empresasSel, mapaGrupos]);

  // Carrinho de compras (Automotivos): janela própria de N dias.
  // dataAte = ontem (sempre exclui o dia corrente em aberto). dataDe = ontem − (N−1).
  useEffect(() => {
    if (aba !== 'automotivos' || subAbaAutomotivos !== 'carrinho') return;
    if (!redeId || empresasSel.length === 0) {
      setParesCarrinho([]); setTotalTransacoesCarrinho(0); return;
    }
    const gruposAuto = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'automotivos') gruposAuto.push(grid); });
    const gruposEscolhidos = carrinhoGruposSel.size > 0
      ? Array.from(carrinhoGruposSel).map(Number).filter(g => gruposAuto.includes(g))
      : gruposAuto;
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const dataAteStr = ontemIso();
    const dataDeStr  = subtrairDias(dataAteStr, carrinhoPeriodoDias - 1);
    let cancelado = false;
    setLoadingCarrinho(true);
    setErroCarrinho('');
    autosystemService.buscarParesCarrinhoAutosystem(redeId, codigos, {
      data_de: dataDeStr,
      data_ate: dataAteStr,
      grupos_filtro: gruposEscolhidos,
    })
      .then(({ pares, total_transacoes }) => {
        if (cancelado) return;
        setParesCarrinho(pares || []);
        setTotalTransacoesCarrinho(total_transacoes || 0);
      })
      .catch(err => {
        if (cancelado) return;
        setErroCarrinho(err.message || 'Falha ao buscar pares');
        setParesCarrinho([]); setTotalTransacoesCarrinho(0);
      })
      .finally(() => { if (!cancelado) setLoadingCarrinho(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaAutomotivos, redeId, empresasSel, mapaGrupos, carrinhoGruposSel, carrinhoPeriodoDias]);

  // Evolução 12m POR produto (Automotivos · Linha do tempo).
  // Filtra grupos de automotivos via `grupos_filtro`. Independente do
  // filtro de período (sempre últimos 12 meses).
  // Carrega também na Visão geral pra alimentar o sparkline de margem
  // nos cards de Lucro bruto.
  useEffect(() => {
    if (aba !== 'automotivos' && aba !== 'geral') return;
    if (aba === 'automotivos' && subAbaAutomotivos !== 'tempo') return;
    if (!redeId || empresasSel.length === 0) { setEvolucao12mAuto([]); return; }
    const gruposAuto = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'automotivos') gruposAuto.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const de  = new Date(ano, mes - 11, 1);
    const ate = new Date(ano, mes + 1, 0);
    const dataDeStr  = `${de.getFullYear()}-${pad(de.getMonth() + 1)}-01`;
    const dataAteStr = `${ate.getFullYear()}-${pad(ate.getMonth() + 1)}-${pad(ate.getDate())}`;
    let cancelado = false;
    setLoadingEvol12mAuto(true);
    autosystemService.buscarVendasMensalPorProdutoAutosystem(redeId, codigos, {
      data_de: dataDeStr, data_ate: dataAteStr, grupos_filtro: gruposAuto,
    })
      .then(rows => { if (!cancelado) setEvolucao12mAuto(rows || []); })
      .catch(() => { if (!cancelado) setEvolucao12mAuto([]); })
      .finally(() => { if (!cancelado) setLoadingEvol12mAuto(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaAutomotivos, redeId, empresasSel, mapaGrupos]);

  // Evolução 12m POR combustível (sub-aba "Últimos 12 meses" em Combustíveis).
  // Independente do filtro de período — sempre busca os últimos 12 meses.
  useEffect(() => {
    if (aba !== 'combustivel' || subAbaCombustivel !== 'doze') return;
    if (!redeId || empresasSel.length === 0) { setEvolucao12mPorProduto([]); return; }
    const gruposComb = [];
    mapaGrupos.forEach((cat, grid) => { if (cat === 'combustivel') gruposComb.push(grid); });
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const de  = new Date(ano, mes - 11, 1);
    const ate = new Date(ano, mes + 1, 0);
    const dataDeStr  = `${de.getFullYear()}-${pad(de.getMonth() + 1)}-01`;
    const dataAteStr = `${ate.getFullYear()}-${pad(ate.getMonth() + 1)}-${pad(ate.getDate())}`;
    let cancelado = false;
    setLoadingEvolProd(true);
    autosystemService.buscarVendasMensalPorProdutoAutosystem(redeId, codigos, {
      data_de: dataDeStr, data_ate: dataAteStr, grupos_filtro: gruposComb,
    })
      .then(rows => { if (!cancelado) setEvolucao12mPorProduto(rows || []); })
      .catch(() => { if (!cancelado) setEvolucao12mPorProduto([]); })
      .finally(() => { if (!cancelado) setLoadingEvolProd(false); });
    return () => { cancelado = true; };
  }, [aba, subAbaCombustivel, redeId, empresasSel, mapaGrupos]);

  // Evolução dos últimos 12 meses. Refaz sempre que a rede ou as empresas
  // selecionadas mudarem (não depende do período do filtro).
  useEffect(() => {
    if (!redeId || empresasSel.length === 0) { setEvolucao12m([]); return; }
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const de  = new Date(ano, mes - 11, 1);
    const ate = new Date(ano, mes + 1, 0); // último dia do mês atual
    const dataDeStr  = `${de.getFullYear()}-${pad(de.getMonth() + 1)}-01`;
    const dataAteStr = `${ate.getFullYear()}-${pad(ate.getMonth() + 1)}-${pad(ate.getDate())}`;
    const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
    let cancelado = false;
    setLoadingEvolucao(true);
    autosystemService.buscarVendasMensalAutosystem(redeId, codigos, {
      data_de: dataDeStr, data_ate: dataAteStr,
    })
      .then(rows => { if (!cancelado) setEvolucao12m(rows || []); })
      .catch(() => { if (!cancelado) setEvolucao12m([]); })
      .finally(() => { if (!cancelado) setLoadingEvolucao(false); });
    return () => { cancelado = true; };
  }, [redeId, empresasSel]);

  const abaAtiva = useMemo(() => ABAS.find(a => a.key === aba) || ABAS[0], [aba]);

  // Totais panorama (sem filtro de categoria nem busca) — função pura
  // reutilizada para período atual e ano anterior.
  function calcularTotais(linhas) {
    const porCat = {};
    CATEGORIAS.forEach(c => { porCat[c.key] = { valor: 0, qtd: 0, itens: 0, custo: 0, lucro: 0 }; });
    let totalValor = 0, totalQtd = 0, totalItens = 0, totalCusto = 0;
    (linhas || []).forEach(v => {
      const grupoCod = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
      const categoria = grupoCod != null ? (mapaGrupos.get(grupoCod) || 'sem_categoria') : 'sem_categoria';
      const valor = Number(v.valor) || 0;
      const qtd = Number(v.quantidade) || 0;
      const itens = Number(v.itens) || 1;
      const custo = Number(v.valor_custo) || 0;
      const c = porCat[categoria];
      if (c) { c.valor += valor; c.qtd += qtd; c.itens += itens; c.custo += custo; }
      totalValor += valor; totalQtd += qtd; totalItens += itens; totalCusto += custo;
    });
    Object.values(porCat).forEach(c => { c.lucro = c.valor - c.custo; });
    const totalLucro = totalValor - totalCusto;
    return { porCat, totalValor, totalQtd, totalItens, totalCusto, totalLucro };
  }

  const totaisGerais = useMemo(() => calcularTotais(vendas), [vendas, mapaGrupos]);
  const totaisAnoAnterior = useMemo(() => calcularTotais(vendasAnoAnterior), [vendasAnoAnterior, mapaGrupos]);
  const totaisMesAnterior = useMemo(() => calcularTotais(vendasMesAnterior), [vendasMesAnterior, mapaGrupos]);

  // Parâmetros para projeção: dias decorridos e dias totais do mês em cada cenário.
  // Usa `dataAteEfetivo` para alinhar com o range realmente buscado.
  const projParams = useMemo(() => ({
    dec: diasDecorridos(dataDe, dataAteEfetivo),
    diasAtual: diasNoMes(dataAteEfetivo),
    diasMA: diasNoMes(subtrairUmMes(dataAteEfetivo)),
    diasAA: diasNoMes(subtrairUmAno(dataAteEfetivo)),
  }), [dataDe, dataAteEfetivo]);

  // Mapa empresa_codigo → nome das empresas marcadas. Usado para o nível
  // raiz da árvore quando há mais de uma empresa em análise.
  const mapaEmpresas = useMemo(() => {
    const m = new Map();
    empresasSel.forEach(e => {
      const cod = Number(e.empresa_codigo);
      if (Number.isFinite(cod)) m.set(cod, e.nome || `Empresa ${cod}`);
    });
    return m;
  }, [empresasSel]);

  const multiEmpresa = empresasSel.length > 1;

  // Constrói árvore Empresa → Categoria → Grupo → Produto, agregando os 3 períodos.
  // O nível de empresa fica sempre presente na estrutura; quem decide se ele aparece
  // na UI é o componente da árvore (via `multiEmpresa`).
  const arvore = useMemo(() => {
    // Indexa cada período por (empresa_codigo, produto_codigo).
    function indexar(linhas) {
      const m = new Map();
      (linhas || []).forEach(v => {
        const empCod = v.empresa != null ? Number(v.empresa) : null;
        const k = `${empCod}::${v.produto_codigo}`;
        if (!m.has(k)) {
          m.set(k, {
            empresa_codigo: empCod,
            codigo: v.produto_codigo,
            nome: v.produto_nome || '',
            grupoCod: v.grupo_produto_codigo,
            qtd: 0, valor: 0, custo: 0,
          });
        }
        const p = m.get(k);
        p.qtd += Number(v.quantidade) || 0;
        p.valor += Number(v.valor) || 0;
        p.custo += Number(v.valor_custo) || 0;
        if (!p.nome && v.produto_nome) p.nome = v.produto_nome;
        if (p.grupoCod == null && v.grupo_produto_codigo != null) p.grupoCod = v.grupo_produto_codigo;
      });
      return m;
    }
    const atual = indexar(vendas);
    const ma    = indexar(vendasMesAnterior);
    const aaIdx = indexar(vendasAnoAnterior);

    const keys = new Set([...atual.keys(), ...ma.keys(), ...aaIdx.keys()]);

    const novoStats = () => ({
      qtd:   { atual: 0, ma: 0, aa: 0 },
      fat:   { atual: 0, ma: 0, aa: 0 },
      lucro: { atual: 0, ma: 0, aa: 0 },
    });
    const acumStats = (s, a, m, an) => {
      s.qtd.atual += a.qtd;     s.qtd.ma += m.qtd;     s.qtd.aa += an.qtd;
      s.fat.atual += a.valor;   s.fat.ma += m.valor;   s.fat.aa += an.valor;
      s.lucro.atual += (a.valor - a.custo);
      s.lucro.ma    += (m.valor - m.custo);
      s.lucro.aa    += (an.valor - an.custo);
    };

    const empresas = new Map();
    keys.forEach(k => {
      const a  = atual.get(k)  || { qtd: 0, valor: 0, custo: 0 };
      const m  = ma.get(k)     || { qtd: 0, valor: 0, custo: 0 };
      const an = aaIdx.get(k)  || { qtd: 0, valor: 0, custo: 0 };
      const meta = atual.get(k) || ma.get(k) || aaIdx.get(k);

      const empCod = meta.empresa_codigo;
      const empKey = String(empCod);
      if (!empresas.has(empKey)) {
        empresas.set(empKey, {
          empresa_codigo: empCod,
          nome: mapaEmpresas.get(empCod) || `Empresa ${empCod ?? '—'}`,
          stats: novoStats(),
          categorias: new Map(),
        });
      }
      const empNode = empresas.get(empKey);
      acumStats(empNode.stats, a, m, an);

      const grupoCod = meta.grupoCod;
      const grupoN = grupoCod != null ? Number(grupoCod) : null;
      const catKey = grupoN != null ? (mapaGrupos.get(grupoN) || 'sem_categoria') : 'sem_categoria';
      const catObj = CATEGORIAS.find(c => c.key === catKey) || CATEGORIAS[CATEGORIAS.length - 1];

      if (!empNode.categorias.has(catKey)) {
        empNode.categorias.set(catKey, { categoria: catObj, stats: novoStats(), grupos: new Map() });
      }
      const catNode = empNode.categorias.get(catKey);
      acumStats(catNode.stats, a, m, an);

      const gKey = grupoN != null ? String(grupoN) : 'sem_grupo';
      if (!catNode.grupos.has(gKey)) {
        catNode.grupos.set(gKey, {
          codigo: grupoN,
          nome: grupoN != null ? (mapaNomeGrupos.get(grupoN) || `Grupo ${grupoN}`) : 'Sem grupo',
          stats: novoStats(),
          produtos: [],
        });
      }
      const grupoNode = catNode.grupos.get(gKey);
      acumStats(grupoNode.stats, a, m, an);
      grupoNode.produtos.push({
        codigo: meta.codigo,
        nome: meta.nome || `Produto #${meta.codigo}`,
        qtd:   { atual: a.qtd,   ma: m.qtd,   aa: an.qtd },
        fat:   { atual: a.valor, ma: m.valor, aa: an.valor },
        lucro: {
          atual: a.valor  - a.custo,
          ma:    m.valor  - m.custo,
          aa:    an.valor - an.custo,
        },
      });
    });

    // Ordena empresas por faturamento, categorias na ordem fixa do CATEGORIAS,
    // grupos por faturamento, produtos por faturamento.
    return Array.from(empresas.values())
      .sort((a, b) => b.stats.fat.atual - a.stats.fat.atual)
      .map(empNode => {
        const cats = [];
        CATEGORIAS.forEach(c => {
          const catNode = empNode.categorias.get(c.key);
          if (!catNode) return;
          const grupos = Array.from(catNode.grupos.values())
            .sort((a, b) => b.stats.fat.atual - a.stats.fat.atual);
          grupos.forEach(g => g.produtos.sort((a, b) => b.fat.atual - a.fat.atual));
          cats.push({ ...catNode, grupos });
        });
        return { ...empNode, categorias: cats };
      });
  }, [vendas, vendasMesAnterior, vendasAnoAnterior, mapaGrupos, mapaNomeGrupos, mapaEmpresas]);

  // Filtra a árvore conforme a aba ativa (mantendo a estrutura por empresa).
  const arvoreVisivel = useMemo(() => {
    if (!abaAtiva.categoria) return arvore;
    return arvore
      .map(emp => ({
        ...emp,
        categorias: emp.categorias.filter(c => c.categoria.key === abaAtiva.categoria),
      }))
      .filter(emp => emp.categorias.length > 0);
  }, [arvore, abaAtiva]);

  function toggleExpandido(key) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleDia(key) {
    setExpandidosDia(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleProd(key) {
    setExpandidosProd(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleAuto(key) {
    setExpandidosAuto(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleConv(key) {
    setExpandidosConv(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Constrói árvore Data → Produto (somente combustíveis) com totais por dia
  // e variação semanal (qtd_atual vs qtd_7_dias_atrás) por produto e por dia.
  const arvoreDia = useMemo(() => {
    // Indexa cada (data, produto) → { qtd, valor, custo, acresc, desc, nome }
    const porDiaProduto = new Map();
    (realizadoDiario || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const k = `${dia}::${r.produto_codigo}`;
      if (!porDiaProduto.has(k)) {
        porDiaProduto.set(k, {
          dia,
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
          acresc: 0, desc: 0,
        });
      }
      const p = porDiaProduto.get(k);
      p.qtd    += Number(r.quantidade) || 0;
      p.valor  += Number(r.valor) || 0;
      p.custo  += Number(r.valor_custo) || 0;
      p.acresc += Number(r.valor_acrescimo) || 0;
      p.desc   += Number(r.valor_descontos) || 0;
      if ((!p.nome || /^Produto #/.test(p.nome)) && r.produto_nome) p.nome = r.produto_nome;
    });

    // Função: variação % entre 2 quantidades (null se a base for 0/inválida)
    const variacao = (atual, base) => {
      if (!Number.isFinite(base) || base === 0) return null;
      return (atual - base) / Math.abs(base);
    };

    // Agrupa por dia, com lista de produtos. Calcula totais e variação semanal
    // confrontando a chave `(dia-7, produto)`.
    const dias = new Map();
    porDiaProduto.forEach((p, k) => {
      // Filtro: só linhas dentro do range exibido (>= dataDe)
      if (p.dia < dataDe) return;
      if (!dias.has(p.dia)) {
        dias.set(p.dia, {
          dia: p.dia,
          stats: { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 },
          produtos: [],
        });
      }
      const dNode = dias.get(p.dia);
      // Variação semanal do produto
      const diaAnt = subtrairDias(p.dia, 7);
      const ant = porDiaProduto.get(`${diaAnt}::${p.codigo}`);
      const varSem = ant ? variacao(p.qtd, ant.qtd) : null;
      dNode.produtos.push({ ...p, varSemana: varSem, qtdAnt: ant?.qtd ?? null });
      // Acumula no nível do dia
      dNode.stats.qtd    += p.qtd;
      dNode.stats.valor  += p.valor;
      dNode.stats.custo  += p.custo;
      dNode.stats.acresc += p.acresc;
      dNode.stats.desc   += p.desc;
    });

    // Variação semanal por dia (soma dos litros do dia vs dia-7)
    const litrosPorDia = new Map();
    porDiaProduto.forEach(p => {
      litrosPorDia.set(p.dia, (litrosPorDia.get(p.dia) || 0) + p.qtd);
    });

    const result = Array.from(dias.values()).sort((a, b) => b.dia.localeCompare(a.dia));
    result.forEach(d => {
      const diaAnt = subtrairDias(d.dia, 7);
      const litrosAnt = litrosPorDia.get(diaAnt) ?? null;
      d.varSemana = litrosAnt != null ? variacao(d.stats.qtd, litrosAnt) : null;
      d.qtdAnt = litrosAnt;
      d.produtos.sort((a, b) => b.qtd - a.qtd);
    });
    return result;
  }, [realizadoDiario, dataDe]);

  // Produtos disponíveis nos dados de evolução 12m (ordenados por volume total).
  const produtosEvolucao = useMemo(() => {
    const m = new Map();
    (evolucao12mPorProduto || []).forEach(r => {
      const k = String(r.produto_codigo);
      if (!m.has(k)) m.set(k, { codigo: r.produto_codigo, nome: r.produto_nome || `#${r.produto_codigo}`, qtdTotal: 0 });
      m.get(k).qtdTotal += Number(r.quantidade) || 0;
      if (r.produto_nome && !/^#/.test(m.get(k).nome) === false && r.produto_nome) m.get(k).nome = r.produto_nome;
    });
    return Array.from(m.values()).sort((a, b) => b.qtdTotal - a.qtdTotal);
  }, [evolucao12mPorProduto]);

  // Seleciona o primeiro produto automaticamente quando os dados chegam.
  useEffect(() => {
    if (!produtoSelecionado && produtosEvolucao.length > 0) {
      setProdutoSelecionado(String(produtosEvolucao[0].codigo));
    }
    if (produtoSelecionado && produtoSelecionado !== '__todos' &&
        !produtosEvolucao.some(p => String(p.codigo) === String(produtoSelecionado))) {
      // Produto selecionado não existe mais nos dados — volta para o primeiro disponível
      setProdutoSelecionado(produtosEvolucao[0] ? String(produtosEvolucao[0].codigo) : null);
    }
  }, [produtosEvolucao, produtoSelecionado]);

  // Série de 12 buckets para o produto selecionado (ou agregado de todos).
  const serieEvolucaoProduto = useMemo(() => {
    const filtro = produtoSelecionado === '__todos' || !produtoSelecionado
      ? null
      : String(produtoSelecionado);
    const idx = new Map();
    (evolucao12mPorProduto || []).forEach(r => {
      if (filtro && String(r.produto_codigo) !== filtro) return;
      const ym = String(r.ano_mes);
      const valor = Number(r.valor) || 0;
      const custo = Number(r.valor_custo) || 0;
      const qtd   = Number(r.quantidade) || 0;
      if (!idx.has(ym)) idx.set(ym, { valor: 0, custo: 0, qtd: 0 });
      const cur = idx.get(ym);
      cur.valor += valor; cur.custo += custo; cur.qtd += qtd;
    });
    const hoje = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || { valor: 0, custo: 0, qtd: 0 };
      const lucro = row.valor - row.custo;
      const lucroL = row.qtd > 0 ? lucro / row.qtd : 0;
      const margemPct = row.valor > 0 ? (lucro / row.valor) * 100 : 0;
      out.push({
        ano_mes: ym,
        rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        litros: row.qtd,
        faturamento: row.valor,
        lucro,
        lucroL,
        margemPct,
      });
    }
    // Variação % vs mês anterior, calculada após preencher os 12 buckets.
    // Usa |prev| no denominador para o sinal refletir a direção da mudança.
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur  = out[i];
      cur.litrosVarMA = (prev.litros !== 0)
        ? ((cur.litros - prev.litros) / Math.abs(prev.litros)) * 100
        : null;
      cur.lucroLVarMA = (prev.lucroL !== 0)
        ? ((cur.lucroL - prev.lucroL) / Math.abs(prev.lucroL)) * 100
        : null;
    }
    return out;
  }, [evolucao12mPorProduto, produtoSelecionado]);

  // Conta quantas vezes cada dia da semana aparece no período visível.
  // Usado pelo heatmap para calcular a média por ocorrência (litros/dia).
  const contagemDiasSemana = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    if (!dataDe || !dataAteEfetivo || dataDe > dataAteEfetivo) return { porDia: counts, total: 0 };
    const [y1, m1, d1] = dataDe.split('-').map(Number);
    const [y2, m2, d2] = dataAteEfetivo.split('-').map(Number);
    const ini = new Date(y1, m1 - 1, d1);
    const fim = new Date(y2, m2 - 1, d2);
    let total = 0;
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      counts[d.getDay()]++;
      total++;
    }
    return { porDia: counts, total };
  }, [dataDe, dataAteEfetivo]);

  // Árvore Automotivos · Realizado dia a dia: Data → Grupo → Produto.
  // Linhas vindas de `realizadoDiarioAuto` (já filtradas para grupos automotivos).
  const arvoreAutoDia = useMemo(() => {
    const dias = new Map();
    (realizadoDiarioAuto || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const grupoCod = r.grupo_produto_codigo;
      const grupoN = grupoCod != null ? Number(grupoCod) : null;
      const gKey = grupoN != null ? String(grupoN) : 'sem_grupo';
      const pKey = String(r.produto_codigo);

      if (!dias.has(dia)) {
        dias.set(dia, {
          dia,
          stats: { qtd: 0, valor: 0, custo: 0 },
          grupos: new Map(),
        });
      }
      const dNode = dias.get(dia);

      if (!dNode.grupos.has(gKey)) {
        dNode.grupos.set(gKey, {
          codigo: grupoN,
          nome: grupoN != null ? (mapaNomeGrupos.get(grupoN) || `Grupo ${grupoN}`) : 'Sem grupo',
          stats: { qtd: 0, valor: 0, custo: 0 },
          produtos: new Map(),
        });
      }
      const gNode = dNode.grupos.get(gKey);

      if (!gNode.produtos.has(pKey)) {
        gNode.produtos.set(pKey, {
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const pNode = gNode.produtos.get(pKey);

      const qtd = Number(r.quantidade) || 0;
      const valor = Number(r.valor) || 0;
      const custo = Number(r.valor_custo) || 0;
      pNode.qtd += qtd; pNode.valor += valor; pNode.custo += custo;
      gNode.stats.qtd += qtd; gNode.stats.valor += valor; gNode.stats.custo += custo;
      dNode.stats.qtd += qtd; dNode.stats.valor += valor; dNode.stats.custo += custo;
      if (r.produto_nome && /^Produto #/.test(pNode.nome)) pNode.nome = r.produto_nome;
    });

    const result = Array.from(dias.values()).sort((a, b) => b.dia.localeCompare(a.dia));
    result.forEach(d => {
      d.grupos = Array.from(d.grupos.values()).sort((a, b) => b.stats.valor - a.stats.valor);
      d.grupos.forEach(g => {
        g.produtos = Array.from(g.produtos.values()).sort((a, b) => b.valor - a.valor);
      });
    });
    return result;
  }, [realizadoDiarioAuto, mapaNomeGrupos]);

  // Árvore Automotivos · Realizado por grupo: Grupo → Data → Produto.
  // Mesma base de `realizadoDiarioAuto`, hierarquia invertida em relação à
  // árvore "dia a dia".
  const arvoreAutoGrupo = useMemo(() => {
    const grupos = new Map();
    (realizadoDiarioAuto || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const grupoCod = r.grupo_produto_codigo;
      const grupoN = grupoCod != null ? Number(grupoCod) : null;
      const gKey = grupoN != null ? String(grupoN) : 'sem_grupo';
      const pKey = String(r.produto_codigo);

      if (!grupos.has(gKey)) {
        grupos.set(gKey, {
          codigo: grupoN,
          nome: grupoN != null ? (mapaNomeGrupos.get(grupoN) || `Grupo ${grupoN}`) : 'Sem grupo',
          stats: { qtd: 0, valor: 0, custo: 0 },
          dias: new Map(),
        });
      }
      const gNode = grupos.get(gKey);

      if (!gNode.dias.has(dia)) {
        gNode.dias.set(dia, {
          dia,
          stats: { qtd: 0, valor: 0, custo: 0 },
          produtos: new Map(),
        });
      }
      const dNode = gNode.dias.get(dia);

      if (!dNode.produtos.has(pKey)) {
        dNode.produtos.set(pKey, {
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const pNode = dNode.produtos.get(pKey);

      const qtd = Number(r.quantidade) || 0;
      const valor = Number(r.valor) || 0;
      const custo = Number(r.valor_custo) || 0;
      pNode.qtd += qtd; pNode.valor += valor; pNode.custo += custo;
      dNode.stats.qtd += qtd; dNode.stats.valor += valor; dNode.stats.custo += custo;
      gNode.stats.qtd += qtd; gNode.stats.valor += valor; gNode.stats.custo += custo;
      if (r.produto_nome && /^Produto #/.test(pNode.nome)) pNode.nome = r.produto_nome;
    });

    const result = Array.from(grupos.values()).sort((a, b) => b.stats.valor - a.stats.valor);
    result.forEach(g => {
      g.dias = Array.from(g.dias.values()).sort((a, b) => b.dia.localeCompare(a.dia));
      g.dias.forEach(d => {
        d.produtos = Array.from(d.produtos.values()).sort((a, b) => b.valor - a.valor);
      });
    });
    return result;
  }, [realizadoDiarioAuto, mapaNomeGrupos]);

  // Pares de carrinho filtrados (busca por nome + min de transações).
  const paresCarrinhoFiltrados = useMemo(() => {
    const q = carrinhoBusca.trim().toLowerCase();
    return (paresCarrinho || []).filter(p => {
      if (Number(p.transacoes_juntas) < carrinhoMinTransacoes) return false;
      if (!q) return true;
      return (p.produto_a_nome || '').toLowerCase().includes(q)
          || (p.produto_b_nome || '').toLowerCase().includes(q);
    });
  }, [paresCarrinho, carrinhoBusca, carrinhoMinTransacoes]);

  // Lista de grupos de automotivos disponíveis para o filtro do carrinho.
  // Vem direto do `mapaGrupos` (classificação salva), independente do período.
  const gruposCarrinhoDisponiveis = useMemo(() => {
    const result = [];
    mapaGrupos.forEach((cat, grid) => {
      if (cat === 'automotivos') {
        result.push({
          codigo: String(grid),
          nome: mapaNomeGrupos.get(grid) || `Grupo ${grid}`,
        });
      }
    });
    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [mapaGrupos, mapaNomeGrupos]);

  // Carrinho Conveniência: pares filtrados e grupos disponíveis.
  const paresCarrinhoConvFiltrados = useMemo(() => {
    const q = carrinhoBuscaConv.trim().toLowerCase();
    return (paresCarrinhoConv || []).filter(p => {
      if (Number(p.transacoes_juntas) < carrinhoMinTransacoesConv) return false;
      if (!q) return true;
      return (p.produto_a_nome || '').toLowerCase().includes(q)
          || (p.produto_b_nome || '').toLowerCase().includes(q);
    });
  }, [paresCarrinhoConv, carrinhoBuscaConv, carrinhoMinTransacoesConv]);

  const gruposCarrinhoConvDisponiveis = useMemo(() => {
    const result = [];
    mapaGrupos.forEach((cat, grid) => {
      if (cat === 'conveniencia') {
        result.push({
          codigo: String(grid),
          nome: mapaNomeGrupos.get(grid) || `Grupo ${grid}`,
        });
      }
    });
    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [mapaGrupos, mapaNomeGrupos]);

// Conveniência · Realizado dia a dia: Data → Grupo → Produto.
  const arvoreConvDia = useMemo(() => {
    const dias = new Map();
    (realizadoDiarioConv || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const grupoCod = r.grupo_produto_codigo;
      const grupoN = grupoCod != null ? Number(grupoCod) : null;
      const gKey = grupoN != null ? String(grupoN) : 'sem_grupo';
      const pKey = String(r.produto_codigo);
      if (!dias.has(dia)) dias.set(dia, { dia, stats: { qtd: 0, valor: 0, custo: 0 }, grupos: new Map() });
      const dNode = dias.get(dia);
      if (!dNode.grupos.has(gKey)) {
        dNode.grupos.set(gKey, {
          codigo: grupoN,
          nome: grupoN != null ? (mapaNomeGrupos.get(grupoN) || `Grupo ${grupoN}`) : 'Sem grupo',
          stats: { qtd: 0, valor: 0, custo: 0 }, produtos: new Map(),
        });
      }
      const gNode = dNode.grupos.get(gKey);
      if (!gNode.produtos.has(pKey)) {
        gNode.produtos.set(pKey, {
          codigo: r.produto_codigo, nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const pNode = gNode.produtos.get(pKey);
      const qtd = Number(r.quantidade) || 0;
      const valor = Number(r.valor) || 0;
      const custo = Number(r.valor_custo) || 0;
      pNode.qtd += qtd; pNode.valor += valor; pNode.custo += custo;
      gNode.stats.qtd += qtd; gNode.stats.valor += valor; gNode.stats.custo += custo;
      dNode.stats.qtd += qtd; dNode.stats.valor += valor; dNode.stats.custo += custo;
      if (r.produto_nome && /^Produto #/.test(pNode.nome)) pNode.nome = r.produto_nome;
    });
    const result = Array.from(dias.values()).sort((a, b) => b.dia.localeCompare(a.dia));
    result.forEach(d => {
      d.grupos = Array.from(d.grupos.values()).sort((a, b) => b.stats.valor - a.stats.valor);
      d.grupos.forEach(g => { g.produtos = Array.from(g.produtos.values()).sort((a, b) => b.valor - a.valor); });
    });
    return result;
  }, [realizadoDiarioConv, mapaNomeGrupos]);

  // Conveniência · Realizado por grupo: Grupo → Data → Produto.
  const arvoreConvGrupo = useMemo(() => {
    const grupos = new Map();
    (realizadoDiarioConv || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const grupoCod = r.grupo_produto_codigo;
      const grupoN = grupoCod != null ? Number(grupoCod) : null;
      const gKey = grupoN != null ? String(grupoN) : 'sem_grupo';
      const pKey = String(r.produto_codigo);
      if (!grupos.has(gKey)) {
        grupos.set(gKey, {
          codigo: grupoN,
          nome: grupoN != null ? (mapaNomeGrupos.get(grupoN) || `Grupo ${grupoN}`) : 'Sem grupo',
          stats: { qtd: 0, valor: 0, custo: 0 }, dias: new Map(),
        });
      }
      const gNode = grupos.get(gKey);
      if (!gNode.dias.has(dia)) gNode.dias.set(dia, { dia, stats: { qtd: 0, valor: 0, custo: 0 }, produtos: new Map() });
      const dNode = gNode.dias.get(dia);
      if (!dNode.produtos.has(pKey)) {
        dNode.produtos.set(pKey, {
          codigo: r.produto_codigo, nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const pNode = dNode.produtos.get(pKey);
      const qtd = Number(r.quantidade) || 0;
      const valor = Number(r.valor) || 0;
      const custo = Number(r.valor_custo) || 0;
      pNode.qtd += qtd; pNode.valor += valor; pNode.custo += custo;
      dNode.stats.qtd += qtd; dNode.stats.valor += valor; dNode.stats.custo += custo;
      gNode.stats.qtd += qtd; gNode.stats.valor += valor; gNode.stats.custo += custo;
      if (r.produto_nome && /^Produto #/.test(pNode.nome)) pNode.nome = r.produto_nome;
    });
    const result = Array.from(grupos.values()).sort((a, b) => b.stats.valor - a.stats.valor);
    result.forEach(g => {
      g.dias = Array.from(g.dias.values()).sort((a, b) => b.dia.localeCompare(a.dia));
      g.dias.forEach(d => { d.produtos = Array.from(d.produtos.values()).sort((a, b) => b.valor - a.valor); });
    });
    return result;
  }, [realizadoDiarioConv, mapaNomeGrupos]);

  // Análise de margem (Conveniência): agrega o realizado por produto, calcula
  // lucro bruto e margem %. Lista plana ordenada por faturamento desc, com
  // grupo associado pra permitir filtro multi-select e busca por nome/código.
  const analiseMargemConvProdutos = useMemo(() => {
    const m = new Map();
    (realizadoDiarioConv || []).forEach(r => {
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, {
          produto_codigo: r.produto_codigo,
          produto_nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          grupo_codigo: r.grupo_produto_codigo != null ? Number(r.grupo_produto_codigo) : null,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const p = m.get(k);
      p.qtd   += Number(r.quantidade) || 0;
      p.valor += Number(r.valor) || 0;
      p.custo += Number(r.valor_custo) || 0;
      if (r.produto_nome && /^Produto #/.test(p.produto_nome)) p.produto_nome = r.produto_nome;
    });
    const out = Array.from(m.values()).map(p => {
      const lucro = p.valor - p.custo;
      return {
        ...p,
        grupo_nome: p.grupo_codigo != null
          ? (mapaNomeGrupos.get(p.grupo_codigo) || `Grupo ${p.grupo_codigo}`)
          : 'Sem grupo',
        lucro,
        margem: p.valor > 0 ? (lucro / p.valor) * 100 : 0,
      };
    });
    return out.sort((a, b) => b.valor - a.valor);
  }, [realizadoDiarioConv, mapaNomeGrupos]);

  // Grupos disponíveis para o multi-select da análise de margem
  const analiseMargemConvGrupos = useMemo(() => {
    const m = new Map();
    analiseMargemConvProdutos.forEach(p => {
      if (p.grupo_codigo == null) return;
      if (!m.has(p.grupo_codigo)) m.set(p.grupo_codigo, { codigo: p.grupo_codigo, nome: p.grupo_nome });
    });
    return Array.from(m.values()).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [analiseMargemConvProdutos]);

  // Pareto Conveniência: grupos disponíveis + dados ordenados.
  const gruposConvDisponiveis = useMemo(() => {
    const m = new Map();
    (realizadoDiarioConv || []).forEach(r => {
      const cod = r.grupo_produto_codigo;
      if (cod == null) return;
      const k = String(cod);
      if (!m.has(k)) {
        const grupoN = Number(cod);
        m.set(k, { codigo: k, nome: mapaNomeGrupos.get(grupoN) || `Grupo ${cod}`, total: 0 });
      }
      m.get(k).total += Number(r.valor) || 0;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [realizadoDiarioConv, mapaNomeGrupos]);

  const dadosParetoConv = useMemo(() => {
    const m = new Map();
    (realizadoDiarioConv || []).forEach(r => {
      if (paretoGruposConv.size > 0 && !paretoGruposConv.has(String(r.grupo_produto_codigo))) return;
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, {
          codigo: r.produto_codigo, nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          grupoCod: r.grupo_produto_codigo,
          grupoNome: r.grupo_produto_codigo != null
            ? (mapaNomeGrupos.get(Number(r.grupo_produto_codigo)) || '')
            : '',
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const p = m.get(k);
      p.qtd += Number(r.quantidade) || 0;
      p.valor += Number(r.valor) || 0;
      p.custo += Number(r.valor_custo) || 0;
      if (r.produto_nome && /^Produto #/.test(p.nome)) p.nome = r.produto_nome;
    });
    const list = Array.from(m.values()).sort((a, b) => b.valor - a.valor);
    const total = list.reduce((s, p) => s + p.valor, 0);
    let acc = 0;
    list.forEach(p => {
      p.pct = total > 0 ? (p.valor / total) * 100 : 0;
      acc += p.pct; p.pctAcum = acc;
    });
    return { list, total };
  }, [realizadoDiarioConv, paretoGruposConv, mapaNomeGrupos]);

  // Linha do tempo Conveniência: grupos / produtos disponíveis + série 12m.
  const gruposEvol12mConv = useMemo(() => {
    const m = new Map();
    (evolucao12mConv || []).forEach(r => {
      const cod = r.grupo_produto_codigo;
      if (cod == null) return;
      const k = String(cod);
      if (!m.has(k)) {
        const grupoN = Number(cod);
        m.set(k, { codigo: k, nome: mapaNomeGrupos.get(grupoN) || `Grupo ${cod}`, total: 0 });
      }
      m.get(k).total += Number(r.valor) || 0;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [evolucao12mConv, mapaNomeGrupos]);

  const produtosEvol12mConv = useMemo(() => {
    const m = new Map();
    (evolucao12mConv || []).forEach(r => {
      if (tempoGruposSelConv.size > 0 && !tempoGruposSelConv.has(String(r.grupo_produto_codigo))) return;
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, { codigo: k, nome: r.produto_nome || `Produto #${r.produto_codigo}`, total: 0 });
      }
      const p = m.get(k);
      p.total += Number(r.valor) || 0;
      if (r.produto_nome && /^Produto #/.test(p.nome)) p.nome = r.produto_nome;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [evolucao12mConv, tempoGruposSelConv]);

  const serieTempoConv = useMemo(() => {
    const idx = new Map();
    (evolucao12mConv || []).forEach(r => {
      if (tempoGruposSelConv.size > 0 && !tempoGruposSelConv.has(String(r.grupo_produto_codigo))) return;
      if (tempoProdutosSelConv.size > 0 && !tempoProdutosSelConv.has(String(r.produto_codigo))) return;
      const ym = String(r.ano_mes);
      if (!idx.has(ym)) idx.set(ym, { valor: 0, custo: 0, qtd: 0 });
      const cur = idx.get(ym);
      cur.valor += Number(r.valor) || 0;
      cur.custo += Number(r.valor_custo) || 0;
      cur.qtd   += Number(r.quantidade) || 0;
    });
    const hoje = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || { valor: 0, custo: 0, qtd: 0 };
      const lucro = row.valor - row.custo;
      const margemPct = row.valor > 0 ? (lucro / row.valor) * 100 : 0;
      out.push({
        ano_mes: ym,
        rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        faturamento: row.valor, lucro, margemPct,
      });
    }
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur  = out[i];
      cur.fatVarMA = (prev.faturamento !== 0)
        ? ((cur.faturamento - prev.faturamento) / Math.abs(prev.faturamento)) * 100
        : null;
    }
    return out;
  }, [evolucao12mConv, tempoGruposSelConv, tempoProdutosSelConv]);

  // Linha do tempo (Automotivos): grupos disponíveis nos dados, produtos
  // disponíveis (filtrados pelos grupos selecionados) e a série de 12 buckets
  // já agregada conforme grupos+produtos selecionados.
  const gruposEvol12mAuto = useMemo(() => {
    const m = new Map();
    (evolucao12mAuto || []).forEach(r => {
      const cod = r.grupo_produto_codigo;
      if (cod == null) return;
      const k = String(cod);
      if (!m.has(k)) {
        const grupoN = Number(cod);
        m.set(k, {
          codigo: k,
          nome: mapaNomeGrupos.get(grupoN) || `Grupo ${cod}`,
          total: 0,
        });
      }
      m.get(k).total += Number(r.valor) || 0;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [evolucao12mAuto, mapaNomeGrupos]);

  const produtosEvol12mAuto = useMemo(() => {
    const m = new Map();
    (evolucao12mAuto || []).forEach(r => {
      if (tempoGruposSel.size > 0 && !tempoGruposSel.has(String(r.grupo_produto_codigo))) return;
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, {
          codigo: k,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          total: 0,
        });
      }
      const p = m.get(k);
      p.total += Number(r.valor) || 0;
      if (r.produto_nome && /^Produto #/.test(p.nome)) p.nome = r.produto_nome;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [evolucao12mAuto, tempoGruposSel]);

  const serieTempoAuto = useMemo(() => {
    const idx = new Map();
    (evolucao12mAuto || []).forEach(r => {
      if (tempoGruposSel.size > 0 && !tempoGruposSel.has(String(r.grupo_produto_codigo))) return;
      if (tempoProdutosSel.size > 0 && !tempoProdutosSel.has(String(r.produto_codigo))) return;
      const ym = String(r.ano_mes);
      if (!idx.has(ym)) idx.set(ym, { valor: 0, custo: 0, qtd: 0 });
      const cur = idx.get(ym);
      cur.valor += Number(r.valor) || 0;
      cur.custo += Number(r.valor_custo) || 0;
      cur.qtd   += Number(r.quantidade) || 0;
    });
    const hoje = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || { valor: 0, custo: 0, qtd: 0 };
      const lucro = row.valor - row.custo;
      const margemPct = row.valor > 0 ? (lucro / row.valor) * 100 : 0;
      out.push({
        ano_mes: ym,
        rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        faturamento: row.valor,
        lucro,
        margemPct,
      });
    }
    // Variação % vs mês anterior (apenas para o faturamento, mostrado na barra)
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur  = out[i];
      cur.fatVarMA = (prev.faturamento !== 0)
        ? ((cur.faturamento - prev.faturamento) / Math.abs(prev.faturamento)) * 100
        : null;
    }
    return out;
  }, [evolucao12mAuto, tempoGruposSel, tempoProdutosSel]);

  // Análise de margem (Automotivos): agrega o realizado por produto, calcula
  // lucro bruto e margem %. Mesmo padrão usado em Conveniência —
  // ver `analiseMargemConvProdutos`.
  const analiseMargemAutoProdutos = useMemo(() => {
    const m = new Map();
    (realizadoDiarioAuto || []).forEach(r => {
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, {
          produto_codigo: r.produto_codigo,
          produto_nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          grupo_codigo: r.grupo_produto_codigo != null ? Number(r.grupo_produto_codigo) : null,
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const p = m.get(k);
      p.qtd   += Number(r.quantidade) || 0;
      p.valor += Number(r.valor) || 0;
      p.custo += Number(r.valor_custo) || 0;
      if (r.produto_nome && /^Produto #/.test(p.produto_nome)) p.produto_nome = r.produto_nome;
    });
    const out = Array.from(m.values()).map(p => {
      const lucro = p.valor - p.custo;
      return {
        ...p,
        grupo_nome: p.grupo_codigo != null
          ? (mapaNomeGrupos.get(p.grupo_codigo) || `Grupo ${p.grupo_codigo}`)
          : 'Sem grupo',
        lucro,
        margem: p.valor > 0 ? (lucro / p.valor) * 100 : 0,
      };
    });
    return out.sort((a, b) => b.valor - a.valor);
  }, [realizadoDiarioAuto, mapaNomeGrupos]);

  // Grupos disponíveis para o multi-select da análise de margem (Automotivos)
  const analiseMargemAutoGrupos = useMemo(() => {
    const m = new Map();
    analiseMargemAutoProdutos.forEach(p => {
      if (p.grupo_codigo == null) return;
      if (!m.has(p.grupo_codigo)) m.set(p.grupo_codigo, { codigo: p.grupo_codigo, nome: p.grupo_nome });
    });
    return Array.from(m.values()).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [analiseMargemAutoProdutos]);

  // Lista de grupos de automotivos disponíveis nos dados (para o seletor do pareto).
  const gruposAutoDisponiveis = useMemo(() => {
    const m = new Map();
    (realizadoDiarioAuto || []).forEach(r => {
      const cod = r.grupo_produto_codigo;
      if (cod == null) return;
      const k = String(cod);
      if (!m.has(k)) {
        const grupoN = Number(cod);
        m.set(k, {
          codigo: k,
          nome: mapaNomeGrupos.get(grupoN) || `Grupo ${cod}`,
          total: 0,
        });
      }
      m.get(k).total += Number(r.valor) || 0;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [realizadoDiarioAuto, mapaNomeGrupos]);

  // Dados do pareto: agrega por produto (com filtro multi-grupo opcional),
  // ordena por faturamento desc e calcula % e % acumulado. Set vazio = sem filtro.
  const dadosPareto = useMemo(() => {
    const m = new Map();
    (realizadoDiarioAuto || []).forEach(r => {
      if (paretoGrupos.size > 0 && !paretoGrupos.has(String(r.grupo_produto_codigo))) return;
      const k = String(r.produto_codigo);
      if (!m.has(k)) {
        m.set(k, {
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          grupoCod: r.grupo_produto_codigo,
          grupoNome: r.grupo_produto_codigo != null
            ? (mapaNomeGrupos.get(Number(r.grupo_produto_codigo)) || '')
            : '',
          qtd: 0, valor: 0, custo: 0,
        });
      }
      const p = m.get(k);
      p.qtd += Number(r.quantidade) || 0;
      p.valor += Number(r.valor) || 0;
      p.custo += Number(r.valor_custo) || 0;
      if (r.produto_nome && /^Produto #/.test(p.nome)) p.nome = r.produto_nome;
    });
    const list = Array.from(m.values()).sort((a, b) => b.valor - a.valor);
    const total = list.reduce((s, p) => s + p.valor, 0);
    let acc = 0;
    list.forEach(p => {
      p.pct = total > 0 ? (p.valor / total) * 100 : 0;
      acc += p.pct;
      p.pctAcum = acc;
    });
    return { list, total };
  }, [realizadoDiarioAuto, paretoGrupos, mapaNomeGrupos]);

  // Heatmap semanal: produto × dia da semana → soma de litros (apenas linhas
  // dentro do período exibido). Linhas ordenadas por total descendente.
  const dadosHeatmap = useMemo(() => {
    const map = new Map();
    (realizadoDiario || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      if (dia < dataDe) return;
      const [y, m, d] = dia.split('-').map(Number);
      const idxDia = new Date(y, m - 1, d).getDay(); // 0=Dom .. 6=Sáb
      const k = String(r.produto_codigo);
      if (!map.has(k)) {
        map.set(k, {
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          porDia: [0, 0, 0, 0, 0, 0, 0],
          total: 0,
        });
      }
      const p = map.get(k);
      const qtd = Number(r.quantidade) || 0;
      p.porDia[idxDia] += qtd;
      p.total += qtd;
      if (r.produto_nome && /^Produto #/.test(p.nome)) p.nome = r.produto_nome;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [realizadoDiario, dataDe]);

  // Mesma base de dados do `arvoreDia`, mas invertida: Produto → Data.
  // Reaproveita a indexação por (data, produto) para calcular variação semanal
  // em cada dia-leaf. No nível do produto não há variação semanal (é a soma
  // de vários dias).
  const arvorePorProduto = useMemo(() => {
    const porDiaProduto = new Map();
    (realizadoDiario || []).forEach(r => {
      const dia = String(r.data || '').slice(0, 10);
      const k = `${dia}::${r.produto_codigo}`;
      if (!porDiaProduto.has(k)) {
        porDiaProduto.set(k, {
          dia,
          codigo: r.produto_codigo,
          nome: r.produto_nome || `Produto #${r.produto_codigo}`,
          qtd: 0, valor: 0, custo: 0,
          acresc: 0, desc: 0,
        });
      }
      const p = porDiaProduto.get(k);
      p.qtd    += Number(r.quantidade) || 0;
      p.valor  += Number(r.valor) || 0;
      p.custo  += Number(r.valor_custo) || 0;
      p.acresc += Number(r.valor_acrescimo) || 0;
      p.desc   += Number(r.valor_descontos) || 0;
      if ((!p.nome || /^Produto #/.test(p.nome)) && r.produto_nome) p.nome = r.produto_nome;
    });
    const variacao = (atual, base) => {
      if (!Number.isFinite(base) || base === 0) return null;
      return (atual - base) / Math.abs(base);
    };
    const produtos = new Map();
    porDiaProduto.forEach((p) => {
      if (p.dia < dataDe) return;
      if (!produtos.has(p.codigo)) {
        produtos.set(p.codigo, {
          codigo: p.codigo,
          nome: p.nome,
          stats: { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 },
          dias: [],
        });
      }
      const node = produtos.get(p.codigo);
      const diaAnt = subtrairDias(p.dia, 7);
      const ant = porDiaProduto.get(`${diaAnt}::${p.codigo}`);
      const varSem = ant ? variacao(p.qtd, ant.qtd) : null;
      node.dias.push({ ...p, varSemana: varSem });
      node.stats.qtd    += p.qtd;
      node.stats.valor  += p.valor;
      node.stats.custo  += p.custo;
      node.stats.acresc += p.acresc;
      node.stats.desc   += p.desc;
      if ((!node.nome || /^Produto #/.test(node.nome)) && p.nome) node.nome = p.nome;
    });
    const result = Array.from(produtos.values()).sort((a, b) => b.stats.qtd - a.stats.qtd);
    result.forEach(prod => prod.dias.sort((a, b) => b.dia.localeCompare(a.dia)));
    return result;
  }, [realizadoDiario, dataDe]);

  // Monta 12 buckets fixos (mais antigo → atual). Meses sem venda viram 0.
  const serieEvolucao = useMemo(() => {
    const idx = new Map();
    (evolucao12m || []).forEach(r => idx.set(String(r.ano_mes), r));
    const hoje = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym);
      const fat = row ? Number(row.valor) || 0 : 0;
      const custo = row ? Number(row.valor_custo) || 0 : 0;
      const litros = row ? Number(row.quantidade) || 0 : 0;
      const lucro = fat - custo;
      const margem = fat > 0 ? lucro / fat : 0;
      const lucroPorLitro = litros > 0 ? lucro / litros : 0;
      out.push({
        ano_mes: ym,
        rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        lucro,
        margemPct: margem * 100,
        faturamento: fat,
        litros,
        lucroPorLitro,
      });
    }
    // Variação % de litros vs mês anterior (label sobre as barras)
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur  = out[i];
      cur.litrosVarMA = (prev.litros !== 0)
        ? ((cur.litros - prev.litros) / Math.abs(prev.litros)) * 100
        : null;
    }
    return out;
  }, [evolucao12m]);

  // Séries de evolução (12m) por categoria — alimentam o sparkline do modal.
  // Reutilizamos os states já carregados: evolucao12m (combustíveis), Auto, Conv.
  // Cada série é normalizada para 12 meses com lucro, margem% e faturamento.
  const seriesEvolucaoPorCategoria = useMemo(() => {
    // `rows` pode vir agregado por (ano_mes, produto) — então somamos
    // valor e valor_custo no mesmo ano_mes em vez de sobrescrever.
    const buildSerie = (rows) => {
      const idx = new Map();
      (rows || []).forEach(r => {
        const k = String(r.ano_mes);
        const cur = idx.get(k) || { valor: 0, valor_custo: 0 };
        cur.valor       += Number(r.valor)       || 0;
        cur.valor_custo += Number(r.valor_custo) || 0;
        idx.set(k, cur);
      });
      const hoje = new Date();
      const out = [];
      for (let i = 11; i >= 0; i--) {
        const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
        const row = idx.get(ym);
        const fat   = row ? Number(row.valor) || 0 : 0;
        const custo = row ? Number(row.valor_custo) || 0 : 0;
        const lucro = fat - custo;
        out.push({
          ano_mes: ym,
          rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
          faturamento: fat,
          lucro,
          margemPct: fat > 0 ? (lucro / fat) * 100 : 0,
        });
      }
      return out;
    };
    return {
      combustivel:  serieEvolucao,
      automotivos:  buildSerie(evolucao12mAuto),
      conveniencia: buildSerie(evolucao12mConv),
    };
  }, [serieEvolucao, evolucao12mAuto, evolucao12mConv]);

  // Sem empresas Autosystem
  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Vendas" description="Itens vendidos no período" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Sua rede ainda não tem <strong>empresas Autosystem</strong> com
            <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code>
            vinculado. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Vendas" description={asRede?.nome ? `${asRede.nome}` : 'Itens vendidos no período'}>
        <SeletorMesAno mes={mes} ano={ano} onChange={(m, a) => { setMes(m); setAno(a); }} />
        <label className="hidden md:inline-flex items-center gap-1.5 h-9 px-2 cursor-pointer select-none"
          title="Limita o período a ontem (exclui o dia corrente, ainda em aberto)">
          <input type="checkbox" checked={apenasFechados}
            onChange={e => setApenasFechados(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">Apenas dias fechados</span>
        </label>
        {empresasDisponiveis.length > 1 && (
          <EmpresaSeletorCompartilhado
            single
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresaId(id)}
          />
        )}
        <button onClick={carregar} disabled={loading || empresasSel.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {/* Abas */}
      <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
        {/* Mobile: grid 2x2 sem scroll */}
        <div className="sm:hidden grid grid-cols-2 gap-1 p-1.5">
          {ABAS.map(a => {
            const Icon = a.icone;
            const ativo = aba === a.key;
            const qtd = a.categoria
              ? (totaisGerais.porCat[a.categoria]?.itens || 0)
              : totaisGerais.totalItens;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-left transition-all min-h-[44px] ${
                  ativo
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                    : 'bg-gray-50/60 text-gray-600 active:bg-gray-100'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-[12px] font-medium truncate flex-1">{a.labelCurto}</span>
                <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  ativo ? 'bg-white/70' : 'bg-white text-gray-500'
                }`}>
                  {formatNumero(qtd)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Desktop (sm+): linha horizontal */}
        <div className="hidden sm:flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {ABAS.map(a => {
            const Icon = a.icone;
            const ativo = aba === a.key;
            const qtd = a.categoria
              ? (totaisGerais.porCat[a.categoria]?.itens || 0)
              : totaisGerais.totalItens;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-center gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{a.label}</span>
                <span className={`text-[10.5px] tabular-nums ${ativo ? 'text-blue-500' : 'text-gray-400'}`}>· {formatNumero(qtd)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards de lucro bruto + Projeção (apenas na Visão geral) */}
      {aba === 'geral' && (() => {
        const projetar = (total) => {
          if (!projParams?.dec || projParams.dec <= 0) return total;
          return total * (projParams.diasAtual / projParams.dec);
        };
        const cats3 = CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key));
        // Série Global de margem 12m: agrega fat e lucro das 3 categorias
        // por ano_mes e recalcula margem (não dá pra somar margens).
        const serieGlobalMargem = (() => {
          const mapa = new Map();
          ['combustivel', 'automotivos', 'conveniencia'].forEach(k => {
            (seriesEvolucaoPorCategoria?.[k] || []).forEach(p => {
              const cur = mapa.get(p.ano_mes) || { ano_mes: p.ano_mes, rotulo: p.rotulo, faturamento: 0, lucro: 0 };
              cur.faturamento += Number(p.faturamento) || 0;
              cur.lucro       += Number(p.lucro)       || 0;
              mapa.set(p.ano_mes, cur);
            });
          });
          return Array.from(mapa.values())
            .sort((a, b) => a.ano_mes.localeCompare(b.ano_mes))
            .map(p => ({ ...p, margemPct: p.faturamento > 0 ? (p.lucro / p.faturamento) * 100 : 0 }));
        })();
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {cats3.map(c => {
              const dados = totaisGerais.porCat[c.key] || { lucro: 0, valor: 0, custo: 0 };
              const dadosAA = totaisAnoAnterior.porCat[c.key] || { lucro: 0, valor: 0, custo: 0 };
              const margem = dados.valor > 0 ? dados.lucro / dados.valor : 0;
              return (
                <KpiLucro key={c.key} cat={c}
                  lucro={dados.lucro}
                  lucroProjecao={projetar(dados.lucro)}
                  margem={margem}
                  lucroAnoAnterior={dadosAA.lucro}
                  faturamento={dados.valor}
                  faturamentoProjecao={projetar(dados.valor)}
                  qtd={c.key === 'combustivel' ? dados.qtd : (dados.itens || dados.qtd)}
                  serieMargem={seriesEvolucaoPorCategoria?.[c.key]}
                />
              );
            })}
            <KpiLucroGlobal
              lucro={totaisGerais.totalLucro}
              lucroProjecao={projetar(totaisGerais.totalLucro)}
              margem={totaisGerais.totalValor > 0 ? totaisGerais.totalLucro / totaisGerais.totalValor : 0}
              lucroAnoAnterior={totaisAnoAnterior.totalLucro}
              faturamento={totaisGerais.totalValor}
              faturamentoProjecao={projetar(totaisGerais.totalValor)}
              serieMargem={serieGlobalMargem}
            />
          </div>
        );
      })()}

      {/* Resumo por posto (apenas Realizado) — só Visão geral */}
      {aba === 'geral' && arvoreVisivel.length > 0 && (
        <TabelaPostoCategoria
          arvore={arvoreVisivel}
          multiEmpresa={multiEmpresa}
          onAbrirDetalhe={(empresa) => setDetalheCatModal({ empresa })}
        />
      )}

      {/* Detalhamento de informações por setor — só Visão geral.
          Toggle entre Combustíveis / Automotivos / Conveniência,
          tabela ranqueada por posto com KPIs lado a lado. */}
      {aba === 'geral' && arvoreVisivel.length > 0 && (
        <DetalhamentoSetor arvore={arvoreVisivel} />
      )}

      {/* Cards específicos da aba Combustíveis — layout estilo dashboard:
          4 KPIs + card lateral "Resumo geral do mês" com tabela de
          combustíveis (Litros, Lucro bruto, L.B./litro). */}
      {aba === 'combustivel' && (() => {
        const d  = totaisGerais.porCat.combustivel       || { qtd: 0, valor: 0, lucro: 0 };
        const aa = totaisAnoAnterior.porCat.combustivel  || { qtd: 0, valor: 0, lucro: 0 };
        const margem      = d.valor  > 0 ? d.lucro  / d.valor  : 0;
        const margemAA    = aa.valor > 0 ? aa.lucro / aa.valor : 0;
        const luPorL      = d.qtd    > 0 ? d.lucro  / d.qtd    : 0;
        const luPorLAA    = aa.qtd   > 0 ? aa.lucro / aa.qtd   : 0;
        // Projeção do mês (mesmo fator usado na Visão geral) — escopo local
        // pra esse IIFE.
        const projetar = (total) => {
          if (!projParams?.dec || projParams.dec <= 0) return total;
          return total * (projParams.diasAtual / projParams.dec);
        };

        // Resumo por produto de combustível — agrega todos os produtos da
        // categoria 'combustivel' a partir da árvore (todas as empresas).
        const produtosCombustivel = (() => {
          const mapa = new Map();
          arvoreVisivel.forEach(emp => {
            (emp.categorias || []).forEach(cat => {
              if (cat.categoria.key !== 'combustivel') return;
              (cat.grupos || []).forEach(grupo => {
                (grupo.produtos || []).forEach(p => {
                  const cur = mapa.get(p.codigo) || { codigo: p.codigo, nome: p.nome, qtd: 0, valor: 0, lucro: 0 };
                  cur.qtd   += Number(p.qtd?.atual)   || 0;
                  cur.valor += Number(p.fat?.atual)   || 0;
                  cur.lucro += Number(p.lucro?.atual) || 0;
                  mapa.set(p.codigo, cur);
                });
              });
            });
          });
          return Array.from(mapa.values())
            .filter(p => p.qtd > 0 || p.valor > 0)
            .map(p => ({
              ...p,
              margem: p.valor > 0 ? p.lucro / p.valor : 0,
              lbL:    p.qtd   > 0 ? p.lucro / p.qtd   : 0,
              nomeCurto: abreviarCombustivel(p.nome),
            }));
        })();

        // Top 3 produtos ordenados por cada métrica (cada KPI tem seu pódio).
        const topPorLitros  = [...produtosCombustivel].sort((a, b) => b.qtd    - a.qtd   ).slice(0, 3);
        const topPorLucro   = [...produtosCombustivel].sort((a, b) => b.lucro  - a.lucro ).slice(0, 3);
        const topPorMargem  = [...produtosCombustivel].sort((a, b) => b.margem - a.margem).slice(0, 3);
        const topPorLbL     = [...produtosCombustivel].sort((a, b) => b.lbL    - a.lbL   ).slice(0, 3);

        // Séries 12m extraídas do serieEvolucao (já carregado pra Combustível).
        const serieLitros   = (serieEvolucao || []).map(p => p.litros);
        const serieLucroBr  = (serieEvolucao || []).map(p => p.lucro);
        const serieMargemPct= (serieEvolucao || []).map(p => p.margemPct);
        const serieLbL      = (serieEvolucao || []).map(p => p.lucroPorLitro);

        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCombustivelDashboard
                label="Litros vendidos" icone={Fuel} cor="amber"
                valor={formatNumero(d.qtd, 0)}
                valorAA={formatNumero(aa.qtd, 0)}
                valorProj={formatNumero(projetar(d.qtd), 0)}
                atual={d.qtd} anoAnterior={aa.qtd}
                temProj={Math.abs(projetar(d.qtd) - d.qtd) > 1}
                serie={serieLitros}
              />
              <KpiCombustivelDashboard
                label="Lucro bruto" icone={DollarSign} cor="emerald"
                valor={formatCurrency(d.lucro)}
                valorAA={formatCurrency(aa.lucro)}
                valorProj={formatCurrency(projetar(d.lucro))}
                negativo={d.lucro < 0}
                atual={d.lucro} anoAnterior={aa.lucro}
                temProj={Math.abs(projetar(d.lucro) - d.lucro) > 0.01}
                serie={serieLucroBr}
              />
              <KpiCombustivelDashboard
                label="Margem" icone={PieChart} cor="violet"
                valor={`${(margem * 100).toFixed(2)}%`}
                valorAA={`${(margemAA * 100).toFixed(2)}%`}
                atual={margem} anoAnterior={margemAA}
                serie={serieMargemPct}
              />
              <KpiCombustivelDashboard
                label="Lucro bruto por litro" icone={Droplet} cor="rose"
                valor={formatCurrency(luPorL)}
                valorAA={formatCurrency(luPorLAA)}
                negativo={luPorL < 0}
                atual={luPorL} anoAnterior={luPorLAA}
                serie={serieLbL}
              />
            </div>
            <TabelaProjecaoCombustivel
              produtos={produtosCombustivel}
              totais={{ qtd: d.qtd, valor: d.valor, lucro: d.lucro, margem, luPorL }}
              projetar={projetar}
            />
          </>
        );
      })()}

      {/* Cards específicos da aba Automotivos — mesmo estilo dos Combustíveis */}
      {aba === 'automotivos' && (() => {
        const d   = totaisGerais.porCat.automotivos       || { valor: 0, lucro: 0, itens: 0 };
        const aa  = totaisAnoAnterior.porCat.automotivos  || { valor: 0, lucro: 0, itens: 0 };
        const margem    = d.valor   > 0 ? d.lucro  / d.valor   : 0;
        const margemAA  = aa.valor  > 0 ? aa.lucro / aa.valor  : 0;
        const ticket    = d.itens   > 0 ? d.valor  / d.itens   : 0;
        const ticketAA  = aa.itens  > 0 ? aa.valor / aa.itens  : 0;
        const projetar  = (total) => {
          if (!projParams?.dec || projParams.dec <= 0) return total;
          return total * (projParams.diasAtual / projParams.dec);
        };
        const serieCat = seriesEvolucaoPorCategoria?.automotivos || [];
        const serieFat    = serieCat.map(p => p.faturamento);
        const serieLucro  = serieCat.map(p => p.lucro);
        const serieMargem = serieCat.map(p => p.margemPct);
        // Agrega por GRUPO (Lubrificantes, Aditivos, etc) pra alimentar a tabela
        const gruposAuto = agregarGruposDaCategoria(arvoreVisivel, 'automotivos');
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCombustivelDashboard
                label="Faturamento" icone={ShoppingCart} cor="amber"
                valor={formatCurrency(d.valor)}
                valorAA={formatCurrency(aa.valor)}
                valorProj={formatCurrency(projetar(d.valor))}
                atual={d.valor} anoAnterior={aa.valor}
                temProj={Math.abs(projetar(d.valor) - d.valor) > 0.01}
                serie={serieFat}
              />
              <KpiCombustivelDashboard
                label="Lucro bruto" icone={DollarSign} cor="emerald"
                valor={formatCurrency(d.lucro)}
                valorAA={formatCurrency(aa.lucro)}
                valorProj={formatCurrency(projetar(d.lucro))}
                negativo={d.lucro < 0}
                atual={d.lucro} anoAnterior={aa.lucro}
                temProj={Math.abs(projetar(d.lucro) - d.lucro) > 0.01}
                serie={serieLucro}
              />
              <KpiCombustivelDashboard
                label="Margem" icone={PieChart} cor="violet"
                valor={`${(margem * 100).toFixed(2)}%`}
                valorAA={`${(margemAA * 100).toFixed(2)}%`}
                atual={margem} anoAnterior={margemAA}
                serie={serieMargem}
              />
              <KpiCombustivelDashboard
                label="Ticket médio" icone={Coins} cor="rose"
                valor={formatCurrency(ticket)}
                valorAA={formatCurrency(ticketAA)}
                atual={ticket} anoAnterior={ticketAA}
              />
            </div>
          </>
        );
      })()}

      {/* Cards específicos da aba Conveniência — mesmo estilo dos Combustíveis */}
      {aba === 'conveniencia' && (() => {
        const d   = totaisGerais.porCat.conveniencia       || { valor: 0, lucro: 0, itens: 0 };
        const aa  = totaisAnoAnterior.porCat.conveniencia  || { valor: 0, lucro: 0, itens: 0 };
        const margem    = d.valor   > 0 ? d.lucro  / d.valor   : 0;
        const margemAA  = aa.valor  > 0 ? aa.lucro / aa.valor  : 0;
        const ticket    = d.itens   > 0 ? d.valor  / d.itens   : 0;
        const ticketAA  = aa.itens  > 0 ? aa.valor / aa.itens  : 0;
        const projetar  = (total) => {
          if (!projParams?.dec || projParams.dec <= 0) return total;
          return total * (projParams.diasAtual / projParams.dec);
        };
        const serieCat = seriesEvolucaoPorCategoria?.conveniencia || [];
        const serieFat    = serieCat.map(p => p.faturamento);
        const serieLucro  = serieCat.map(p => p.lucro);
        const serieMargem = serieCat.map(p => p.margemPct);
        const gruposConv = agregarGruposDaCategoria(arvoreVisivel, 'conveniencia');
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <KpiCombustivelDashboard
                label="Faturamento" icone={ShoppingCart} cor="amber"
                valor={formatCurrency(d.valor)}
                valorAA={formatCurrency(aa.valor)}
                valorProj={formatCurrency(projetar(d.valor))}
                atual={d.valor} anoAnterior={aa.valor}
                temProj={Math.abs(projetar(d.valor) - d.valor) > 0.01}
                serie={serieFat}
              />
              <KpiCombustivelDashboard
                label="Lucro bruto" icone={DollarSign} cor="emerald"
                valor={formatCurrency(d.lucro)}
                valorAA={formatCurrency(aa.lucro)}
                valorProj={formatCurrency(projetar(d.lucro))}
                negativo={d.lucro < 0}
                atual={d.lucro} anoAnterior={aa.lucro}
                temProj={Math.abs(projetar(d.lucro) - d.lucro) > 0.01}
                serie={serieLucro}
              />
              <KpiCombustivelDashboard
                label="Margem" icone={PieChart} cor="violet"
                valor={`${(margem * 100).toFixed(2)}%`}
                valorAA={`${(margemAA * 100).toFixed(2)}%`}
                atual={margem} anoAnterior={margemAA}
                serie={serieMargem}
              />
              <KpiCombustivelDashboard
                label="Ticket médio" icone={Coins} cor="rose"
                valor={formatCurrency(ticket)}
                valorAA={formatCurrency(ticketAA)}
                atual={ticket} anoAnterior={ticketAA}
              />
            </div>
          </>
        );
      })()}

      {/* Sub-abas da aba Conveniência (mesma estrutura de Automotivos, paleta emerald) */}
      {aba === 'conveniencia' && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm mb-4 overflow-visible">
          <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto rounded-t-2xl">
            {SUB_ABAS_CONVENIENCIA.map(sa => {
              const Icon = sa.icone;
              const ativo = subAbaConveniencia === sa.key;
              return (
                <button key={sa.key} onClick={() => setSubAbaConveniencia(sa.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    ativo
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                  }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{sa.label}</span>
                </button>
              );
            })}
          </div>
          <div>
            {(subAbaConveniencia === 'dia' || subAbaConveniencia === 'grupo') ? (
              loadingDiarioConv ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                  <span className="text-sm">Carregando realizado...</span>
                </div>
              ) : erroDiarioConv ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar o realizado</p>
                    <p className="text-red-700 mt-1">{erroDiarioConv}</p>
                  </div>
                </div>
              ) : (subAbaConveniencia === 'dia' ? arvoreConvDia : arvoreConvGrupo).length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
                    <Store className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Nenhuma venda de conveniência no período</p>
                  <p className="text-xs text-gray-500 mt-1">Verifique se os grupos de conveniência estão classificados.</p>
                </div>
              ) : subAbaConveniencia === 'dia' ? (
                <TreeRealizadoAutoDia
                  arvore={arvoreConvDia}
                  expandidos={expandidosConv}
                  onToggle={toggleConv}
                  cor="emerald"
                />
              ) : (
                <TreeRealizadoAutoGrupo
                  arvore={arvoreConvGrupo}
                  expandidos={expandidosConv}
                  onToggle={toggleConv}
                  cor="emerald"
                />
              )
            ) : subAbaConveniencia === 'pareto' ? (
              loadingDiarioConv ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                  <span className="text-sm">Carregando análise de pareto...</span>
                </div>
              ) : erroDiarioConv ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar os dados</p>
                    <p className="text-red-700 mt-1">{erroDiarioConv}</p>
                  </div>
                </div>
              ) : (
                <AnalisePareto
                  dados={dadosParetoConv}
                  grupos={gruposConvDisponiveis}
                  meta={paretoMetaConv}
                  onChangeMeta={setParetoMetaConv}
                  gruposSel={paretoGruposConv}
                  onToggleGrupo={(codigo) => setParetoGruposConv(prev => {
                    const next = new Set(prev);
                    if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
                    return next;
                  })}
                  onToggleTodos={() => setParetoGruposConv(prev =>
                    prev.size === gruposConvDisponiveis.length
                      ? new Set()
                      : new Set(gruposConvDisponiveis.map(g => g.codigo))
                  )}
                  onLimpar={() => setParetoGruposConv(new Set())}
                  cor="emerald"
                />
              )
            ) : subAbaConveniencia === 'analise_margem' ? (
              erroDiarioConv ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar a análise de margem</p>
                    <p className="text-red-700 mt-1">{erroDiarioConv}</p>
                  </div>
                </div>
              ) : (
                <AnaliseMargemConv
                  loading={loadingDiarioConv}
                  produtos={analiseMargemConvProdutos}
                  grupos={analiseMargemConvGrupos}
                />
              )
            ) : subAbaConveniencia === 'carrinho' ? (
              <CarrinhoCompras
                cor="emerald"
                loading={loadingCarrinhoConv}
                erro={erroCarrinhoConv}
                pares={paresCarrinhoConvFiltrados}
                totalPares={paresCarrinhoConv.length}
                totalTransacoes={totalTransacoesCarrinhoConv}
                grupos={gruposCarrinhoConvDisponiveis}
                gruposSel={carrinhoGruposSelConv}
                onToggleGrupo={(c) => setCarrinhoGruposSelConv(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodos={() => setCarrinhoGruposSelConv(prev =>
                  prev.size === gruposCarrinhoConvDisponiveis.length
                    ? new Set()
                    : new Set(gruposCarrinhoConvDisponiveis.map(g => g.codigo))
                )}
                onLimparGrupos={() => setCarrinhoGruposSelConv(new Set())}
                minTransacoes={carrinhoMinTransacoesConv}
                onChangeMin={setCarrinhoMinTransacoesConv}
                busca={carrinhoBuscaConv}
                onChangeBusca={setCarrinhoBuscaConv}
                periodoDias={carrinhoPeriodoDiasConv}
                onChangePeriodoDias={setCarrinhoPeriodoDiasConv}
              />
            ) : subAbaConveniencia === 'tempo' ? (
              <LinhaDoTempoAuto
                cor="emerald"
                loading={loadingEvol12mConv}
                serie={serieTempoConv}
                grupos={gruposEvol12mConv}
                produtos={produtosEvol12mConv}
                gruposSel={tempoGruposSelConv}
                onToggleGrupo={(c) => setTempoGruposSelConv(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodosGrupos={() => setTempoGruposSelConv(prev =>
                  prev.size === gruposEvol12mConv.length ? new Set() : new Set(gruposEvol12mConv.map(g => g.codigo))
                )}
                onLimparGrupos={() => { setTempoGruposSelConv(new Set()); setTempoProdutosSelConv(new Set()); }}
                produtosSel={tempoProdutosSelConv}
                onToggleProduto={(c) => setTempoProdutosSelConv(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodosProdutos={() => setTempoProdutosSelConv(prev =>
                  prev.size === produtosEvol12mConv.length ? new Set() : new Set(produtosEvol12mConv.map(p => p.codigo))
                )}
                onLimparProdutos={() => setTempoProdutosSelConv(new Set())}
              />
            ) : (
              <div className="p-6">
                <PlaceholderEmConstrucao
                  titulo={SUB_ABAS_CONVENIENCIA.find(s => s.key === subAbaConveniencia)?.label || ''}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-abas da aba Automotivos
          (overflow-visible para permitir que dropdowns absolutos escapem do
          contêiner — multi-selects de grupo/produto seriam clipados sem isso) */}
      {aba === 'automotivos' && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm mb-4 overflow-visible">
          <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto rounded-t-2xl">
            {SUB_ABAS_AUTOMOTIVOS.map(sa => {
              const Icon = sa.icone;
              const ativo = subAbaAutomotivos === sa.key;
              return (
                <button key={sa.key} onClick={() => setSubAbaAutomotivos(sa.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    ativo
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                  }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{sa.label}</span>
                </button>
              );
            })}
          </div>
          <div>
            {(subAbaAutomotivos === 'dia' || subAbaAutomotivos === 'grupo') ? (
              loadingDiarioAuto ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-sm">Carregando realizado...</span>
                </div>
              ) : erroDiarioAuto ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar o realizado</p>
                    <p className="text-red-700 mt-1">{erroDiarioAuto}</p>
                  </div>
                </div>
              ) : (subAbaAutomotivos === 'dia' ? arvoreAutoDia : arvoreAutoGrupo).length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Nenhuma venda de automotivos no período</p>
                  <p className="text-xs text-gray-500 mt-1">Verifique se os grupos de automotivos estão classificados.</p>
                </div>
              ) : subAbaAutomotivos === 'dia' ? (
                <TreeRealizadoAutoDia
                  arvore={arvoreAutoDia}
                  expandidos={expandidosAuto}
                  onToggle={toggleAuto}
                />
              ) : (
                <TreeRealizadoAutoGrupo
                  arvore={arvoreAutoGrupo}
                  expandidos={expandidosAuto}
                  onToggle={toggleAuto}
                />
              )
            ) : subAbaAutomotivos === 'pareto' ? (
              loadingDiarioAuto ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-sm">Carregando análise de pareto...</span>
                </div>
              ) : erroDiarioAuto ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar os dados</p>
                    <p className="text-red-700 mt-1">{erroDiarioAuto}</p>
                  </div>
                </div>
              ) : (
                <AnalisePareto
                  dados={dadosPareto}
                  grupos={gruposAutoDisponiveis}
                  meta={paretoMeta}
                  onChangeMeta={setParetoMeta}
                  gruposSel={paretoGrupos}
                  onToggleGrupo={(codigo) => setParetoGrupos(prev => {
                    const next = new Set(prev);
                    if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
                    return next;
                  })}
                  onToggleTodos={() => setParetoGrupos(prev =>
                    prev.size === gruposAutoDisponiveis.length
                      ? new Set()
                      : new Set(gruposAutoDisponiveis.map(g => g.codigo))
                  )}
                  onLimpar={() => setParetoGrupos(new Set())}
                />
              )
            ) : subAbaAutomotivos === 'analise_margem' ? (
              erroDiarioAuto ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar a análise de margem</p>
                    <p className="text-red-700 mt-1">{erroDiarioAuto}</p>
                  </div>
                </div>
              ) : (
                <AnaliseMargemConv
                  loading={loadingDiarioAuto}
                  produtos={analiseMargemAutoProdutos}
                  grupos={analiseMargemAutoGrupos}
                />
              )
            ) : subAbaAutomotivos === 'carrinho' ? (
              <CarrinhoCompras
                loading={loadingCarrinho}
                erro={erroCarrinho}
                pares={paresCarrinhoFiltrados}
                totalPares={paresCarrinho.length}
                totalTransacoes={totalTransacoesCarrinho}
                grupos={gruposCarrinhoDisponiveis}
                gruposSel={carrinhoGruposSel}
                onToggleGrupo={(c) => setCarrinhoGruposSel(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodos={() => setCarrinhoGruposSel(prev =>
                  prev.size === gruposCarrinhoDisponiveis.length
                    ? new Set()
                    : new Set(gruposCarrinhoDisponiveis.map(g => g.codigo))
                )}
                onLimparGrupos={() => setCarrinhoGruposSel(new Set())}
                minTransacoes={carrinhoMinTransacoes}
                onChangeMin={setCarrinhoMinTransacoes}
                busca={carrinhoBusca}
                onChangeBusca={setCarrinhoBusca}
                periodoDias={carrinhoPeriodoDias}
                onChangePeriodoDias={setCarrinhoPeriodoDias}
              />
            ) : subAbaAutomotivos === 'tempo' ? (
              <LinhaDoTempoAuto
                loading={loadingEvol12mAuto}
                serie={serieTempoAuto}
                grupos={gruposEvol12mAuto}
                produtos={produtosEvol12mAuto}
                gruposSel={tempoGruposSel}
                onToggleGrupo={(c) => setTempoGruposSel(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodosGrupos={() => setTempoGruposSel(prev =>
                  prev.size === gruposEvol12mAuto.length ? new Set() : new Set(gruposEvol12mAuto.map(g => g.codigo))
                )}
                onLimparGrupos={() => { setTempoGruposSel(new Set()); setTempoProdutosSel(new Set()); }}
                produtosSel={tempoProdutosSel}
                onToggleProduto={(c) => setTempoProdutosSel(prev => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c); else next.add(c);
                  return next;
                })}
                onToggleTodosProdutos={() => setTempoProdutosSel(prev =>
                  prev.size === produtosEvol12mAuto.length ? new Set() : new Set(produtosEvol12mAuto.map(p => p.codigo))
                )}
                onLimparProdutos={() => setTempoProdutosSel(new Set())}
              />
            ) : (
              <div className="p-6">
                <PlaceholderEmConstrucao
                  titulo={SUB_ABAS_AUTOMOTIVOS.find(s => s.key === subAbaAutomotivos)?.label || ''}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-abas da aba Combustíveis */}
      {aba === 'combustivel' && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
          <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
            {SUB_ABAS_COMBUSTIVEL.map(sa => {
              const Icon = sa.icone;
              const ativo = subAbaCombustivel === sa.key;
              return (
                <button key={sa.key} onClick={() => setSubAbaCombustivel(sa.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    ativo
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                  }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{sa.label}</span>
                </button>
              );
            })}
          </div>
          <div>
            {(subAbaCombustivel === 'dia' || subAbaCombustivel === 'tipo') ? (
              loadingDiario ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                  <span className="text-sm">Carregando realizado...</span>
                </div>
              ) : erroDiario ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar o realizado</p>
                    <p className="text-red-700 mt-1">{erroDiario}</p>
                  </div>
                </div>
              ) : (subAbaCombustivel === 'dia' ? arvoreDia : arvorePorProduto).length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
                    <Fuel className="h-6 w-6 text-amber-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Nenhuma venda de combustível no período</p>
                  <p className="text-xs text-gray-500 mt-1">Verifique se os grupos de combustível estão classificados.</p>
                </div>
              ) : subAbaCombustivel === 'dia' ? (
                <TreeRealizadoDia
                  arvore={arvoreDia}
                  expandidos={expandidosDia}
                  onToggle={toggleDia}
                />
              ) : (
                <TreeRealizadoPorCombustivel
                  arvore={arvorePorProduto}
                  expandidos={expandidosProd}
                  onToggle={toggleProd}
                />
              )
            ) : subAbaCombustivel === 'doze' ? (
              <Evolucao12mCombustivel
                loading={loadingEvolProd}
                serie={serieEvolucaoProduto}
                produtos={produtosEvolucao}
                produtoSelecionado={produtoSelecionado}
                onChangeProduto={setProdutoSelecionado}
              />
            ) : subAbaCombustivel === 'semana' ? (
              loadingDiario ? (
                <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                  <span className="text-sm">Carregando análise semanal...</span>
                </div>
              ) : erroDiario ? (
                <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Não foi possível carregar a análise semanal</p>
                    <p className="text-red-700 mt-1">{erroDiario}</p>
                  </div>
                </div>
              ) : dadosHeatmap.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
                    <Fuel className="h-6 w-6 text-amber-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Nenhuma venda de combustível no período</p>
                </div>
              ) : (
                <HeatmapSemanal dados={dadosHeatmap} contagemDias={contagemDiasSemana} />
              )
            ) : (
              <div className="p-6">
                <PlaceholderEmConstrucao
                  titulo={SUB_ABAS_COMBUSTIVEL.find(s => s.key === subAbaCombustivel)?.label || ''}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aviso sobre categorização */}
      {(totaisGerais.porCat.sem_categoria?.itens || 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 mb-4 flex items-start gap-2.5 text-[12px]">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">
            <strong>{totaisGerais.porCat.sem_categoria.itens}</strong> ite{totaisGerais.porCat.sem_categoria.itens === 1 ? 'm' : 'ns'} sem categoria
            (totalizando <strong>{formatCurrency(totaisGerais.porCat.sem_categoria.valor)}</strong>).
            Classifique os grupos de produto correspondentes em <em>Configurações → Classificação de grupos</em>.
          </p>
        </div>
      )}

      {/* Evolução 12 meses (acima da tree) */}
      {aba === 'geral' && (
        <>
          <GraficoEvolucao12m serie={serieEvolucao} loading={loadingEvolucao} />
          <GraficoLucroMargem12m serie={serieEvolucao} loading={loadingEvolucao} />
        </>
      )}

      {/* Estados de carregamento / erro / vazio das vendas — alimentam KPIs,
          resumo por posto e gráficos da Visão geral. */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando vendas...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar as vendas</p>
            <p className="text-red-700 mt-1">{erro}</p>
          </div>
        </div>
      ) : aba === 'geral' && arvoreVisivel.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma venda no período selecionado</p>
          <p className="text-xs text-gray-500 mt-1">
            Tente ajustar o intervalo de datas ou as empresas selecionadas.
          </p>
        </div>
      ) : null}

      {/* Modal de detalhe do posto (acionado pelo resumo Posto) */}
      <ModalDetalhePosto
        aberto={!!detalheCatModal}
        onClose={() => setDetalheCatModal(null)}
        empresa={detalheCatModal?.empresa}
        projParams={projParams}
        seriesEvolucaoPorCategoria={seriesEvolucaoPorCategoria}
      />
    </div>
  );
}

// ─── Componentes ──────────────────────────────────────────────
// Compara dois valores e retorna {pct, Icone, tone}. Se o ano anterior for 0/null
// devolve null (não tem base de comparação confiável).
function compararLucro(atual, anoAnterior) {
  if (!Number.isFinite(anoAnterior) || anoAnterior === 0) return null;
  const pct = (atual - anoAnterior) / Math.abs(anoAnterior);
  if (Math.abs(pct) < 0.0005) return { pct: 0, Icone: Minus, tone: 'flat' };
  return pct > 0
    ? { pct, Icone: TrendingUp, tone: 'up' }
    : { pct, Icone: TrendingDown, tone: 'down' };
}
const COMP_STYLE = {
  up:   'text-emerald-700 bg-emerald-50 ring-emerald-200',
  down: 'text-red-700 bg-red-50 ring-red-200',
  flat: 'text-gray-600 bg-gray-50 ring-gray-200',
};

function BadgeComparacaoAA({ atual, anoAnterior, rotulo = 'AA' }) {
  const cmp = compararLucro(atual, anoAnterior);
  if (!cmp) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 text-gray-500 bg-gray-50 ring-gray-200">
        sem dados {rotulo}
      </span>
    );
  }
  const Icone = cmp.Icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${COMP_STYLE[cmp.tone]}`}>
      <Icone className="h-2.5 w-2.5" />
      {cmp.tone === 'flat' ? '0,0%' : `${cmp.pct > 0 ? '+' : ''}${(cmp.pct * 100).toFixed(1)}%`}
      <span className="text-gray-400 font-normal">vs {rotulo}</span>
    </span>
  );
}

// Chip de delta — só texto + seta, sem background. Compacto para a tree.
function ChipDelta({ atual, base, rotulo }) {
  const cmp = compararLucro(atual, base);
  if (!cmp) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-300 tabular-nums">
        <span>—</span>
        <span className="text-gray-300 font-normal">{rotulo}</span>
      </span>
    );
  }
  const Icone = cmp.Icone;
  const cor =
    cmp.tone === 'up'   ? 'text-emerald-600' :
    cmp.tone === 'down' ? 'text-red-600' :
                          'text-gray-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${cor}`}>
      <Icone className="h-3 w-3" />
      <span>
        {cmp.tone === 'flat' ? '0%' : `${cmp.pct > 0 ? '+' : ''}${(cmp.pct * 100).toFixed(0)}%`}
      </span>
      <span className="text-gray-400 font-normal text-[9px] ml-0.5">{rotulo}</span>
    </span>
  );
}

// Célula compacta: 1 valor + chips MA/AA, fonte reduzida para caber mais colunas.
// `sub` é um texto pequeno opcional abaixo (ex: margem%).
// `divisor`:
//   'forte' → borda à esquerda em gray-300 (separa blocos de métricas diferentes)
//   'leve'  → borda à esquerda em gray-200 (separa sub-colunas dentro da métrica)
//   undef.  → sem borda
// `tomProj` quando true aplica um leve tom de fundo (zebrar projeção vs atual).
// ─── Card de Projeção ──────────────────────────────────────
// Tabela compacta lateral (5o card da Visão geral) mostrando a projeção
// pro fechamento do mês: Faturamento, Lucro bruto e Margem por setor +
// linha de Total. Os valores são projetados a partir do realizado no
// período usando o mesmo fator do KpiLucro (diasAtual / diasDecorridos).
function CardProjecao({ linhas, total }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200/60 p-3 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] font-semibold text-gray-800">Projeção do mês</p>
        <LineChartIcon className="h-3.5 w-3.5 text-gray-400" />
      </div>
      {/* Cada linha: nome do setor + 3 métricas empilhadas em pares pra caber */}
      <div className="flex flex-col divide-y divide-gray-100">
        {linhas.map((l) => (
          <LinhaProjecao key={l.label} label={l.label} {...l} />
        ))}
        <LinhaProjecao label="Total" total {...total} />
      </div>
    </div>
  );
}

function LinhaProjecao({ label, faturamento, lucro, margem, total }) {
  return (
    <div className={`py-1.5 ${total ? 'border-t-2 border-gray-300 mt-1 pt-2' : ''}`}>
      <p className={`text-[11px] truncate ${total ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{label}</p>
      <div className="grid grid-cols-3 gap-1 mt-0.5">
        <MetricaProj label="Fat" valor={formatCurrencyCompact(faturamento)} negrito={total} />
        <MetricaProj label="LB"  valor={formatCurrencyCompact(lucro)}        negrito={total} />
        <MetricaProj label="MG"  valor={`${(margem * 100).toFixed(1)}%`}     negrito={total} />
      </div>
    </div>
  );
}

function MetricaProj({ label, valor, negrito }) {
  return (
    <div className="min-w-0">
      <p className="text-[8.5px] uppercase tracking-wider text-gray-400 leading-tight">{label}</p>
      <p className={`text-[10.5px] font-mono tabular-nums truncate ${negrito ? 'font-bold text-gray-900' : 'text-gray-800'}`}
        title={valor}>{valor}</p>
    </div>
  );
}

// Formato monetário compacto (R$ 8,5M / R$ 549k) — preserva legibilidade
// em colunas estreitas como o card de Projeção.
function formatCurrencyCompact(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')}k`;
  return formatCurrency(n);
}

// ─── Resumo por posto (Lucro bruto por categoria) ─────────────
// Tabela compacta com Posto + Lucro bruto realizado em Combustível,
// Automotivos e Conveniência. Cada célula traz o valor e a variação
// vs o mesmo período do ano anterior (AA). Clique no posto abre o
// modal de detalhes por categoria.
function TabelaPostoCategoria({ arvore, multiEmpresa, onAbrirDetalhe }) {
  // Categorias fixas (mesmas exibidas nos cards / no modal).
  const CATEGORIAS_TABELA = useMemo(
    () => CATEGORIAS.filter(c =>
      ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)
    ),
    [],
  );

  // Resolve o catNode da categoria pedida; se não existir, retorna stats zerados.
  const getCatStats = (empNode, key) => {
    const cat = (empNode.categorias || []).find(c => c.categoria.key === key);
    if (!cat) return { atual: 0, aa: 0 };
    return {
      atual: cat.stats.lucro.atual || 0,
      aa:    cat.stats.lucro.aa    || 0,
    };
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <LayoutGrid className="h-4 w-4 text-blue-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Lucro bruto por posto</h3>
        <span className="text-[11px] text-gray-400">· valor realizado + variação vs mesmo período do ano anterior · clique num posto pra ver detalhes</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">{multiEmpresa ? 'Posto' : 'Geral'}</th>
              {CATEGORIAS_TABELA.map(cat => {
                const Pal = CAT_PALETA[cat.cor];
                const Icone = cat.icone;
                return (
                  <th key={cat.key} className="px-3 py-2 text-right">
                    <span className={`inline-flex items-center gap-1.5 ${Pal.text}`}>
                      <Icone className={`h-3 w-3 ${Pal.icon}`} />
                      {cat.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {arvore.map((empNode) => (
              <tr
                key={`emp:${empNode.empresa_codigo}`}
                className="cursor-pointer hover:bg-blue-50/40 border-t border-gray-100 transition-colors"
                onClick={() => onAbrirDetalhe(empNode)}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                      <Building2 className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-gray-900 truncate leading-tight">
                        {empNode.nome}
                      </p>
                      {empNode.empresa_codigo != null && (
                        <p className="text-[9.5px] text-gray-500 font-mono leading-tight">
                          cód {empNode.empresa_codigo}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                {CATEGORIAS_TABELA.map(cat => {
                  const s = getCatStats(empNode, cat.key);
                  return (
                    <td key={cat.key} className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-mono tabular-nums text-[12.5px] font-semibold ${s.atual < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(s.atual)}
                        </span>
                        <BadgeComparacaoAA atual={s.atual} anoAnterior={s.aa} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detalhamento de informações por setor ────────────────────
// Bloco da Visão geral com tabs (Combustíveis / Automotivos / Conveniência)
// e tabela ranqueada por posto com KPIs comparados ao ano anterior.
// Cada linha mostra: Qtd, AA, Var · Lucro, AA, Var · Margem · Preço venda,
// Preço custo, L.B./un — calculados a partir da árvore agregada por categoria.
function DetalhamentoSetor({ arvore }) {
  const SETORES = useMemo(
    () => CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)),
    [],
  );
  const [setorAtivo, setSetorAtivo] = useState('combustivel');
  const setor = SETORES.find(s => s.key === setorAtivo) || SETORES[0];
  const sufixoQtd = setorAtivo === 'combustivel' ? ' L' : '';
  const labelQtd  = setorAtivo === 'combustivel' ? 'Litros' : 'Quantidade';
  const labelLbUn = setorAtivo === 'combustivel' ? 'L.B. por litro' : 'L.B. por un.';

  // Linhas: 1 por posto, agregando apenas o setor ativo.
  const linhas = useMemo(() => {
    return arvore.map(emp => {
      const cat = (emp.categorias || []).find(c => c.categoria.key === setorAtivo);
      const s = cat?.stats || { qtd: { atual: 0, aa: 0 }, fat: { atual: 0, aa: 0 }, lucro: { atual: 0, aa: 0 } };
      // Custo derivado: Fat - Lucro (em cada período).
      const custoAtual = s.fat.atual - s.lucro.atual;
      return {
        empresa_codigo: emp.empresa_codigo,
        nome: emp.nome,
        qtdAtual:   s.qtd.atual,
        qtdAA:      s.qtd.aa,
        fatAtual:   s.fat.atual,
        fatAA:      s.fat.aa,
        lucroAtual: s.lucro.atual,
        lucroAA:    s.lucro.aa,
        margem:     s.fat.atual > 0 ? s.lucro.atual / s.fat.atual : 0,
        precoVenda: s.qtd.atual > 0 ? s.fat.atual   / s.qtd.atual : 0,
        precoCusto: s.qtd.atual > 0 ? custoAtual    / s.qtd.atual : 0,
        lbUn:       s.qtd.atual > 0 ? s.lucro.atual / s.qtd.atual : 0,
      };
    })
    .filter(l => l.fatAtual > 0 || l.lucroAtual !== 0)
    .sort((a, b) => b.lucroAtual - a.lucroAtual);
  }, [arvore, setorAtivo]);

  const totais = useMemo(() => {
    const tot = linhas.reduce((acc, l) => {
      acc.qtdAtual += l.qtdAtual; acc.qtdAA += l.qtdAA;
      acc.fatAtual += l.fatAtual; acc.fatAA += l.fatAA;
      acc.lucroAtual += l.lucroAtual; acc.lucroAA += l.lucroAA;
      return acc;
    }, { qtdAtual: 0, qtdAA: 0, fatAtual: 0, fatAA: 0, lucroAtual: 0, lucroAA: 0 });
    const custo = tot.fatAtual - tot.lucroAtual;
    return {
      ...tot,
      margem:     tot.fatAtual > 0 ? tot.lucroAtual / tot.fatAtual : 0,
      precoVenda: tot.qtdAtual > 0 ? tot.fatAtual   / tot.qtdAtual : 0,
      precoCusto: tot.qtdAtual > 0 ? custo          / tot.qtdAtual : 0,
      lbUn:       tot.qtdAtual > 0 ? tot.lucroAtual / tot.qtdAtual : 0,
    };
  }, [linhas]);

  // Max de qtd e margem pra barras de proporção (referência visual).
  const maxQtd = Math.max(...linhas.map(l => l.qtdAtual), 0);
  const maxMargem = Math.max(...linhas.map(l => l.margem), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-800">Detalhamento de informações por setor</h3>
          <p className="text-[10.5px] text-gray-500 mt-0.5">Vendas setorizadas com maior nível de detalhes — clique no setor para alternar</p>
        </div>
        <div className="ml-auto inline-flex items-center rounded-lg border border-blue-200 bg-blue-50/40 p-0.5">
          {SETORES.map(s => {
            const Icone = s.icone;
            const ativo = setorAtivo === s.key;
            return (
              <button key={s.key} onClick={() => setSetorAtivo(s.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  ativo
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                }`}>
                <Icone className="h-3 w-3" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[1100px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Fantasia</th>
              <th className="px-2 py-2 text-right">{labelQtd}</th>
              <th className="px-2 py-2 text-right">Ano anterior</th>
              <th className="px-2 py-2 text-right">Variação</th>
              <th className="px-2 py-2 text-right border-l border-gray-200">Lucro Bruto</th>
              <th className="px-2 py-2 text-right">Ano anterior</th>
              <th className="px-2 py-2 text-right">Variação</th>
              <th className="px-2 py-2 text-right border-l border-gray-200">Margem</th>
              <th className="px-2 py-2 text-right border-l border-gray-200">Preço venda</th>
              <th className="px-2 py-2 text-right">Preço custo</th>
              <th className="px-2 py-2 text-right">{labelLbUn}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-[12px] text-gray-400">Sem vendas de {setor.label} no período.</td></tr>
            ) : linhas.map((l) => (
              <tr key={`emp:${l.empresa_codigo}`} className="border-t border-gray-100 hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-2 text-[12.5px] text-gray-800 font-medium">{l.nome}</td>
                <td className="px-2 py-2 text-right relative pb-3">
                  <span className="font-mono tabular-nums">{formatNumero(l.qtdAtual, setorAtivo === 'combustivel' ? 0 : 2)}{sufixoQtd}</span>
                  {maxQtd > 0 && l.qtdAtual > 0 && (
                    <div className="absolute left-2 right-2 bottom-0.5 h-1 rounded-full overflow-hidden bg-blue-50">
                      <div className="h-full bg-blue-400/70" style={{ width: `${Math.min(100, (l.qtdAtual / maxQtd) * 100)}%` }} />
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-500">{formatNumero(l.qtdAA, setorAtivo === 'combustivel' ? 0 : 2)}{sufixoQtd}</td>
                <td className="px-2 py-2 text-right"><ChipVarPct atual={l.qtdAtual} aa={l.qtdAA} /></td>
                <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 border-l border-gray-100">{formatCurrency(l.lucroAtual)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-500">{formatCurrency(l.lucroAA)}</td>
                <td className="px-2 py-2 text-right"><ChipVarPct atual={l.lucroAtual} aa={l.lucroAA} /></td>
                <td className="px-2 py-2 text-right relative pb-3 border-l border-gray-100">
                  <span className="font-mono tabular-nums text-gray-800">{(l.margem * 100).toFixed(2)}%</span>
                  {maxMargem > 0 && l.margem > 0 && (
                    <div className="absolute left-2 right-2 bottom-0.5 h-1 rounded-full overflow-hidden bg-amber-50">
                      <div className="h-full bg-amber-400/70" style={{ width: `${Math.min(100, (l.margem / maxMargem) * 100)}%` }} />
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{formatCurrency(l.precoVenda)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(l.precoCusto)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(l.lbUn)}</td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900">{formatNumero(totais.qtdAtual, setorAtivo === 'combustivel' ? 0 : 2)}{sufixoQtd}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{formatNumero(totais.qtdAA, setorAtivo === 'combustivel' ? 0 : 2)}{sufixoQtd}</td>
                <td className="px-2 py-2 text-right"><ChipVarPct atual={totais.qtdAtual} aa={totais.qtdAA} /></td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-100">{formatCurrency(totais.lucroAtual)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(totais.lucroAA)}</td>
                <td className="px-2 py-2 text-right"><ChipVarPct atual={totais.lucroAtual} aa={totais.lucroAA} /></td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-100">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-100">{formatCurrency(totais.precoVenda)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900">{formatCurrency(totais.precoCusto)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-gray-900">{formatCurrency(totais.lbUn)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Chip de variação percentual (atual vs AA), com seta e cor por sinal.
function ChipVarPct({ atual, aa }) {
  if (!aa || aa === 0) {
    return <span className="text-[10px] text-gray-400 tabular-nums">—</span>;
  }
  const pct = (atual - aa) / Math.abs(aa);
  const positivo = pct > 0;
  const Icone = positivo ? TrendingUp : TrendingDown;
  const cor = positivo ? 'text-emerald-700' : 'text-red-600';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10.5px] font-semibold tabular-nums ${cor}`}>
      <span>{positivo ? '+' : ''}{(pct * 100).toFixed(2)}%</span>
      <Icone className="h-3 w-3" />
    </span>
  );
}

// Modal com abas Combustível / Automotivos / Conveniência —
// cada aba mostra: cards de Qtd/Fat/Lucro (Realizado+Proj),
// KPIs extras (Margem, Ticket médio, Lucro/litro), Top 5 grupos e
// mini-gráfico de evolução 12m.
function ModalDetalhePosto({ aberto, onClose, empresa, projParams, seriesEvolucaoPorCategoria }) {
  // Abas fixas (mesmas categorias da página principal).
  const abasCategorias = React.useMemo(
    () => CATEGORIAS.filter(c =>
      ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)
    ),
    [],
  );
  const [abaKey, setAbaKey] = useState(abasCategorias[0]?.key || 'combustivel');

  // Reseta aba ao reabrir
  useEffect(() => {
    if (aberto) setAbaKey(abasCategorias[0]?.key || 'combustivel');
  }, [aberto, abasCategorias]);

  if (!empresa) {
    return <Modal open={aberto} onClose={onClose} title="" size="xl">{null}</Modal>;
  }

  // Indexa as categorias do empNode por key pra olhar rápido
  const mapaCat = new Map();
  (empresa.categorias || []).forEach(c => mapaCat.set(c.categoria.key, c));
  const catNode = mapaCat.get(abaKey);

  const projetar = (total, dias) => {
    if (!projParams?.dec || projParams.dec <= 0) return total;
    return total * (dias / projParams.dec);
  };

  const serie = seriesEvolucaoPorCategoria?.[abaKey] || [];

  return (
    <Modal open={aberto} onClose={onClose} title="" size="xl">
      <div className="space-y-5">
        {/* Cabeçalho do posto */}
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Detalhe do posto</p>
            <h3 className="text-base font-semibold text-gray-900">
              {empresa.nome}
              {empresa.empresa_codigo != null && (
                <span className="text-gray-400 font-normal ml-2 text-sm font-mono">cód {empresa.empresa_codigo}</span>
              )}
            </h3>
          </div>
        </div>

        {/* Abas das categorias */}
        <div className="flex items-center gap-1 border-b border-gray-100 -mb-px overflow-x-auto">
          {abasCategorias.map(cat => {
            const Pal = CAT_PALETA[cat.cor];
            const Icone = cat.icone;
            const ativo = abaKey === cat.key;
            return (
              <button key={cat.key}
                onClick={() => setAbaKey(cat.key)}
                className={`flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? `${Pal.text} border-current`
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icone className={`h-4 w-4 ${ativo ? Pal.icon : 'text-gray-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo da aba ativa */}
        {catNode ? (
          <ConteudoCategoriaModal catNode={catNode} projetar={projetar} projParams={projParams} serie={serie} />
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">
            Sem dados nesta categoria para o posto selecionado.
          </div>
        )}

        {projParams?.dec > 0 && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Projeção calculada multiplicando o realizado pelo fator
            <span className="font-mono mx-1">{projParams.diasAtual}/{projParams.dec}</span>
            (dias do mês / dias decorridos).
          </p>
        )}
      </div>
    </Modal>
  );
}

function ConteudoCategoriaModal({ catNode, projetar, projParams, serie }) {
  const stats = catNode.stats;
  const isCombustivel = catNode.categoria?.key === 'combustivel';
  const Pal = CAT_PALETA[catNode.categoria.cor];

  const qtdProj   = projetar(stats.qtd.atual,   projParams?.diasAtual);
  const fatProj   = projetar(stats.fat.atual,   projParams?.diasAtual);
  const lucroProj = projetar(stats.lucro.atual, projParams?.diasAtual);
  const margemAtual = stats.fat.atual > 0 ? (stats.lucro.atual / stats.fat.atual) * 100 : 0;
  const margemProj  = fatProj > 0 ? (lucroProj / fatProj) * 100 : 0;
  // Ticket médio = faturamento / quantidade. Para combustível "qtd" = litros.
  const ticketAtual = stats.qtd.atual > 0 ? stats.fat.atual / stats.qtd.atual : 0;
  const ticketProj  = qtdProj > 0 ? fatProj / qtdProj : 0;
  // Lucro por litro só faz sentido pra combustível.
  const luPorLAtual = stats.qtd.atual > 0 ? stats.lucro.atual / stats.qtd.atual : 0;
  const luPorLProj  = qtdProj > 0 ? lucroProj / qtdProj : 0;
  // Margem do mês anterior (referência alternativa quando não é combustível).
  const margemMA = stats.fat.ma > 0 ? (stats.lucro.ma / stats.fat.ma) * 100 : 0;

  // Top 5 grupos da categoria (já vêm ordenados na construção da árvore).
  const top5 = (catNode.grupos || []).slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Cards principais (Qtd, Fat, Lucro) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CardMetricaDetalhe
          label="Quantidade"
          valorRealizado={formatNumero(stats.qtd.atual, 2)}
          valorProjecao={formatNumero(qtdProj, 2)}
          corAcento="blue"
        />
        <CardMetricaDetalhe
          label="Faturamento"
          valorRealizado={formatCurrency(stats.fat.atual)}
          valorProjecao={formatCurrency(fatProj)}
          corAcento="emerald"
        />
        <CardMetricaDetalhe
          label="Lucro bruto"
          valorRealizado={formatCurrency(stats.lucro.atual)}
          valorProjecao={formatCurrency(lucroProj)}
          sub={`margem ${margemAtual.toFixed(1)}%`}
          subProj={`margem ${margemProj.toFixed(1)}%`}
          corAcento={stats.lucro.atual < 0 ? 'red' : 'amber'}
        />
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCompacto
          label="Margem"
          valorRealizado={`${margemAtual.toFixed(1)}%`}
          valorProjecao={`${margemProj.toFixed(1)}%`}
          corAcento="amber"
        />
        <KpiCompacto
          label="Ticket médio"
          valorRealizado={formatCurrency(ticketAtual)}
          valorProjecao={formatCurrency(ticketProj)}
          sub={isCombustivel ? 'por litro' : 'por item'}
          corAcento="blue"
        />
        {isCombustivel ? (
          <KpiCompacto
            label="Lucro por litro"
            valorRealizado={formatCurrency(luPorLAtual)}
            valorProjecao={formatCurrency(luPorLProj)}
            corAcento={luPorLAtual < 0 ? 'red' : 'emerald'}
          />
        ) : (
          <KpiCompacto
            label="Margem (mês anterior)"
            valorRealizado={`${margemMA.toFixed(1)}%`}
            valorProjecao="—"
            sub="comparativo MA"
            corAcento="gray"
          />
        )}
      </div>

      {/* Top 5 grupos + mini-gráfico em 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TopGruposTabela grupos={top5} paleta={Pal} />
        <SparklineEvolucao serie={serie} paleta={Pal} />
      </div>

      {/* Referências (MA / AA) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CardReferencia
          label="Mês anterior"
          qtd={stats.qtd.ma}
          fat={stats.fat.ma}
          lucro={stats.lucro.ma}
        />
        <CardReferencia
          label="Ano anterior"
          qtd={stats.qtd.aa}
          fat={stats.fat.aa}
          lucro={stats.lucro.aa}
        />
      </div>
    </div>
  );
}

// KPI compacto com Realizado + Proj. mês (versão enxuta do CardMetricaDetalhe)
function KpiCompacto({ label, valorRealizado, valorProjecao, sub, corAcento = 'blue' }) {
  const acentoCls = {
    blue:    'border-blue-200 bg-blue-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    amber:   'border-amber-200 bg-amber-50/40',
    red:     'border-red-200 bg-red-50/40',
    gray:    'border-gray-200 bg-gray-50/40',
  }[corAcento];
  return (
    <div className={`rounded-xl border ${acentoCls} p-3`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <div className="flex items-baseline gap-3 mt-1.5">
        <div className="min-w-0">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Realizado</p>
          <p className="font-mono tabular-nums text-sm font-bold text-gray-900 mt-0.5 truncate">{valorRealizado}</p>
        </div>
        <div className="min-w-0 border-l border-gray-200/80 pl-3">
          <p className="text-[9px] text-blue-600 uppercase tracking-wider">Proj.</p>
          <p className="font-mono tabular-nums text-sm font-bold text-blue-900 mt-0.5 truncate">{valorProjecao}</p>
        </div>
      </div>
      {sub && <p className="text-[10px] text-gray-500 mt-1.5">{sub}</p>}
    </div>
  );
}

// Top 5 grupos da categoria
function TopGruposTabela({ grupos, paleta }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className={`px-3 py-2 ${paleta?.bg || 'bg-gray-50'} border-b border-gray-100 flex items-center gap-2`}>
        <p className={`text-[10.5px] uppercase tracking-wider font-semibold ${paleta?.text || 'text-gray-600'}`}>
          Top 5 grupos
        </p>
        <span className="text-[10px] text-gray-400">· por faturamento</span>
      </div>
      {grupos.length === 0 ? (
        <p className="px-3 py-6 text-[11px] text-gray-400 text-center">Sem grupos nessa categoria.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium uppercase text-[9px] tracking-wider">Grupo</th>
              <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Qtd</th>
              <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Fat.</th>
              <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Lucro</th>
              <th className="text-right px-2 py-1.5 font-medium uppercase text-[9px] tracking-wider">Margem</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => {
              const fat = g.stats.fat.atual || 0;
              const lucro = g.stats.lucro.atual || 0;
              const margem = fat > 0 ? (lucro / fat) * 100 : 0;
              return (
                <tr key={`g:${g.codigo ?? 'none'}`} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-[180px]" title={g.nome}>
                    {g.nome || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-600">
                    {formatNumero(g.stats.qtd.atual || 0, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-800 font-semibold">
                    {formatCurrency(fat)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums font-semibold ${lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {formatCurrency(lucro)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${margem < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {margem.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Mini-gráfico de evolução 12 meses (barras de lucro + linha de margem%)
// SVG inline (sem dependência nova). viewBox responsivo.
function SparklineEvolucao({ serie, paleta }) {
  const pontos = Array.isArray(serie) ? serie : [];
  const temDados = pontos.length >= 2 && pontos.some(p => Math.abs(p.lucro || 0) > 0.01);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className={`px-3 py-2 ${paleta?.bg || 'bg-gray-50'} border-b border-gray-100 flex items-center gap-2`}>
        <p className={`text-[10.5px] uppercase tracking-wider font-semibold ${paleta?.text || 'text-gray-600'}`}>
          Evolução 12 meses
        </p>
        <span className="text-[10px] text-gray-400">· lucro (barras) e margem % (linha)</span>
      </div>

      {!temDados ? (
        <p className="px-3 py-6 text-[11px] text-gray-400 text-center">Sem dados de evolução disponíveis.</p>
      ) : (
        <div className="px-3 py-3">
          {(() => {
            const W = 280, H = 80, pad = 4;
            const barW = (W - pad * 2) / pontos.length - 1;
            const lucros = pontos.map(p => p.lucro || 0);
            const margens = pontos.map(p => p.margemPct || 0);
            const lucroMax = Math.max(...lucros, 0.0001);
            const lucroMin = Math.min(...lucros, 0);
            const lucroRange = lucroMax - lucroMin || 1;
            // Eixo do lucro (barras) ocupa H - 18 (deixa espaço pro eixo X)
            const baseY = H - 18;
            const altPlot = H - 22;
            const margemMin = Math.min(...margens);
            const margemMax = Math.max(...margens);
            const margemRange = (margemMax - margemMin) || 1;
            const pontosLinha = pontos.map((p, i) => {
              const cx = pad + i * (barW + 1) + barW / 2;
              const cy = 2 + (1 - ((p.margemPct || 0) - margemMin) / margemRange) * (altPlot - 4);
              return `${cx},${cy}`;
            }).join(' ');
            const corBar  = paleta?.icon ? paleta.icon.replace('text-', 'fill-') : 'fill-blue-400';
            const corLine = paleta?.icon ? paleta.icon.replace('text-', 'stroke-') : 'stroke-blue-600';

            return (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[80px]" preserveAspectRatio="none">
                  {/* Barras de lucro */}
                  {pontos.map((p, i) => {
                    const v = p.lucro || 0;
                    const hBar = (Math.abs(v) / Math.max(Math.abs(lucroMax), Math.abs(lucroMin), 0.0001)) * (altPlot - 4) * 0.85;
                    const y = v >= 0 ? baseY - hBar : baseY;
                    const x = pad + i * (barW + 1);
                    return (
                      <rect key={i} x={x} y={y} width={barW} height={hBar || 0.5}
                        className={`${corBar} ${v < 0 ? 'opacity-50' : 'opacity-90'}`} />
                    );
                  })}
                  {/* Linha base */}
                  <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} className="stroke-gray-300" strokeWidth="0.5" />
                  {/* Polilinha da margem */}
                  <polyline points={pontosLinha} fill="none" className={`${corLine}`} strokeWidth="1.5" strokeLinejoin="round" />
                  {/* Pontos da margem */}
                  {pontos.map((p, i) => {
                    const cx = pad + i * (barW + 1) + barW / 2;
                    const cy = 2 + (1 - ((p.margemPct || 0) - margemMin) / margemRange) * (altPlot - 4);
                    return <circle key={`pt-${i}`} cx={cx} cy={cy} r="1.5" className={corLine.replace('stroke-', 'fill-')} />;
                  })}
                </svg>
                {/* Rótulos extremos */}
                <div className="flex justify-between text-[9px] text-gray-400 font-mono mt-0.5 px-1">
                  <span>{pontos[0]?.rotulo}</span>
                  <span>{pontos[pontos.length - 1]?.rotulo}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function CardMetricaDetalhe({ label, valorRealizado, valorProjecao, sub, subProj, corAcento = 'blue' }) {
  const acentoCls = {
    blue:    'border-blue-200 bg-blue-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    amber:   'border-amber-200 bg-amber-50/40',
    red:     'border-red-200 bg-red-50/40',
  }[corAcento];
  return (
    <div className={`rounded-xl border ${acentoCls} p-3`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <div className="mt-2 space-y-2">
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Realizado</p>
          <p className="font-mono tabular-nums text-base font-bold text-gray-900 mt-0.5">{valorRealizado}</p>
          {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className="pt-2 border-t border-gray-200/80">
          <p className="text-[9px] text-blue-600 uppercase tracking-wider">Proj. mês</p>
          <p className="font-mono tabular-nums text-base font-bold text-blue-900 mt-0.5">{valorProjecao}</p>
          {subProj && <p className="text-[10px] text-blue-700/80 mt-0.5">{subProj}</p>}
        </div>
      </div>
    </div>
  );
}

function CardReferencia({ label, qtd, fat, lucro }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Qtd</p>
          <p className="font-mono tabular-nums text-[12.5px] font-semibold text-gray-700 mt-0.5">{formatNumero(qtd, 2)}</p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Faturamento</p>
          <p className="font-mono tabular-nums text-[12.5px] font-semibold text-gray-700 mt-0.5">{formatCurrency(fat)}</p>
        </div>
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Lucro</p>
          <p className={`font-mono tabular-nums text-[12.5px] font-semibold mt-0.5 ${lucro < 0 ? 'text-red-700' : 'text-gray-700'}`}>
            {formatCurrency(lucro)}
          </p>
        </div>
      </div>
    </div>
  );
}

function CelulaUnica({ valor, ma, aa, moeda = true, decimais = 0, sub, divisor, tomProj = false }) {
  const negativo = moeda && valor < 0;
  const txt = moeda ? formatCurrency(valor) : formatNumero(valor, decimais);
  const cls = [
    'px-2.5 py-2 text-right align-top',
    divisor === 'forte' ? 'border-l-2 border-gray-300' : '',
    divisor === 'leve'  ? 'border-l border-gray-200'   : '',
    tomProj ? 'bg-blue-50/30' : '',
  ].filter(Boolean).join(' ');
  return (
    <td className={cls}>
      <p className={`font-mono tabular-nums whitespace-nowrap text-[12px] font-semibold leading-tight ${negativo ? 'text-red-700' : 'text-gray-900'}`}>
        {txt}
      </p>
      {ma != null && aa != null && (
        <div className="mt-0.5 flex items-center justify-end gap-1.5 leading-none">
          <ChipDelta atual={valor} base={ma} rotulo="MA" />
          <ChipDelta atual={valor} base={aa} rotulo="AA" />
        </div>
      )}
      {sub && <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
    </td>
  );
}

// Gráfico de barras + linha — evolução dos últimos 12 meses:
//   - Bar: Litros vendidos (eixo esquerdo, em L)
//   - Line com marcadores: Lucro bruto por litro OU Margem % (eixo direito,
//     conforme seletor no cabeçalho)
//   - Labels acima das barras: variação % de litros vs mês anterior
const METRICAS_EVOL = [
  { key: 'lucroPorLitro', label: 'Lucro / litro', formato: (v) => formatCurrency(v),
    tickFmt: (v) => `R$ ${Number(v).toFixed(2)}` },
  { key: 'margemPct',     label: 'Margem %',      formato: (v) => `${Number(v).toFixed(1)}%`,
    tickFmt: (v) => `${Number(v).toFixed(1)}%` },
];
function GraficoEvolucao12m({ serie, loading }) {
  const [metricaKey, setMetricaKey] = useState('lucroPorLitro');
  const metrica = METRICAS_EVOL.find(m => m.key === metricaKey) || METRICAS_EVOL[0];
  const temDados = (serie || []).some(p => p.litros > 0 || p.faturamento > 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <LineChartIcon className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-800">Evolução · últimos 12 meses</h3>
        <span className="text-[11px] text-gray-400">· Litros vendidos e {metrica.label.toLowerCase()}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {METRICAS_EVOL.map(m => {
            const ativo = m.key === metricaKey;
            return (
              <button key={m.key} type="button" onClick={() => setMetricaKey(m.key)}
                className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                  ativo ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'
                        : 'text-gray-500 hover:text-gray-800'
                }`}>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <div className="h-72 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          Carregando evolução...
        </div>
      ) : !temDados ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-500">
          Sem dados nos últimos 12 meses.
        </div>
      ) : (
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                tickFormatter={(v) => Math.abs(v) >= 1000
                  ? `${(v / 1000).toFixed(0)}k L`
                  : `${v.toFixed(0)} L`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                tickFormatter={metrica.tickFmt} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Litros')      return [`${formatNumero(value, 2)} L`, name];
                  if (name === metrica.label) return [metrica.formato(value), name];
                  return [value, name];
                }}
                labelStyle={{ fontSize: 12, fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="litros" name="Litros"
                fill="#c4b5fd" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="litrosVarMA" content={<LabelVariacaoMA />} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey={metrica.key} name={metrica.label}
                stroke="#10b981" strokeWidth={2}
                dot={{ r: 3, fill: '#a7f3d0', stroke: '#10b981', strokeWidth: 1 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Gráfico complementar — evolução dos últimos 12 meses:
//   - Bar: Lucro bruto R$ (eixo esquerdo)
//   - Line com marcadores: Margem % (eixo direito)
function GraficoLucroMargem12m({ serie, loading }) {
  const temDados = (serie || []).some(p => p.lucro !== 0 || p.faturamento > 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <LineChartIcon className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-gray-800">Lucro bruto & Margem · últimos 12 meses</h3>
        <span className="text-[11px] text-gray-400">· R$ de lucro e % de margem</span>
      </div>
      {loading ? (
        <div className="h-72 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          Carregando evolução...
        </div>
      ) : !temDados ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-500">
          Sem dados nos últimos 12 meses.
        </div>
      ) : (
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                tickFormatter={(v) => Math.abs(v) >= 1000
                  ? `R$ ${(v / 1000).toFixed(0)}k`
                  : `R$ ${v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Lucro bruto') return [formatCurrency(value), name];
                  if (name === 'Margem')      return [`${Number(value).toFixed(1)}%`, name];
                  return [value, name];
                }}
                labelStyle={{ fontSize: 12, fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="lucro" name="Lucro bruto"
                fill="#86efac" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                stroke="#0ea5e9" strokeWidth={2}
                dot={{ r: 3, fill: '#bae6fd', stroke: '#0ea5e9', strokeWidth: 1 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Tabela em árvore: (Empresa) → Categoria → Grupo → Produto. Cada linha mostra
// quantidade, faturamento e lucro bruto. A toolbar superior permite alternar
// entre visualização "Atual", "Projeção do mês" ou "Ambos", além de expandir
// ou recolher todos os nós de uma vez. O nível de empresa só aparece quando
// `multiEmpresa=true`.
function TreeVendas({ arvore, multiEmpresa, expandidos, setExpandidos, onToggle, projParams }) {
  const projetar = (total, dias) => {
    if (!projParams.dec || projParams.dec <= 0) return total;
    return total * (dias / projParams.dec);
  };
  const projDe = (metr) => ({
    atual: projetar(metr.atual, projParams.diasAtual),
    ma:    projetar(metr.ma,    projParams.diasMA),
    aa:    projetar(metr.aa,    projParams.diasAA),
  });
  const margemTxt = (lucro, fat) => {
    if (!fat || fat <= 0) return null;
    return `margem ${((lucro / fat) * 100).toFixed(1)}%`;
  };

  // Enumera todas as chaves possíveis (empresa/categoria/grupo) para expandir/recolher tudo.
  const todasChaves = React.useMemo(() => {
    const out = [];
    arvore.forEach(emp => {
      const empKey = `emp:${emp.empresa_codigo}`;
      out.push(empKey);
      emp.categorias.forEach(cat => {
        const prefixo = multiEmpresa ? empKey : '';
        const catKey = `${prefixo}/cat:${cat.categoria.key}`;
        out.push(catKey);
        cat.grupos.forEach(g => {
          out.push(`${catKey}/g:${g.codigo ?? 'none'}`);
        });
      });
    });
    return out;
  }, [arvore, multiEmpresa]);

  function expandirTudo()  { setExpandidos(new Set(todasChaves)); }
  function recolherTudo()  { setExpandidos(new Set()); }

  // Indentação por nível.
  const padEmp = 'pl-4';
  const padCat = multiEmpresa ? 'pl-10' : 'pl-4';
  const padGrp = multiEmpresa ? 'pl-16' : 'pl-10';
  const padPrd = multiEmpresa ? 'pl-20' : 'pl-16';

  const tituloCol = multiEmpresa
    ? 'Empresa / Categoria / Grupo / Produto'
    : 'Categoria / Grupo / Produto';

  // Renderiza chevron com tamanho adequado ao nível.
  const Chev = ({ aberto, classes = 'h-3.5 w-3.5 text-gray-400' }) =>
    aberto
      ? <ChevronDown className={`${classes} flex-shrink-0 transition-transform`} />
      : <ChevronRight className={`${classes} flex-shrink-0 transition-transform`} />;

  // Linha de stats: sempre 6 colunas (Atual + Projeção para cada métrica).
  // Divisores:
  //   - 'forte' (gray-300) entre métricas diferentes (Qtd | Fat | Lucro)
  //   - 'leve'  (gray-200) entre Atual e Projeção dentro de uma mesma métrica
  function LinhaStats({ s }) {
    const pQ = projDe(s.qtd);
    const pF = projDe(s.fat);
    const pL = projDe(s.lucro);
    return (
      <>
        {/* Quantidade */}
        <CelulaUnica valor={s.qtd.atual} ma={s.qtd.ma} aa={s.qtd.aa}
          moeda={false} decimais={2} divisor="forte" />
        <CelulaUnica valor={pQ.atual} ma={pQ.ma} aa={pQ.aa}
          moeda={false} decimais={2} divisor="leve" tomProj />
        {/* Faturamento */}
        <CelulaUnica valor={s.fat.atual} ma={s.fat.ma} aa={s.fat.aa}
          divisor="forte" />
        <CelulaUnica valor={pF.atual} ma={pF.ma} aa={pF.aa}
          divisor="leve" tomProj />
        {/* Lucro bruto */}
        <CelulaUnica valor={s.lucro.atual} ma={s.lucro.ma} aa={s.lucro.aa}
          sub={margemTxt(s.lucro.atual, s.fat.atual)} divisor="forte" />
        <CelulaUnica valor={pL.atual} ma={pL.ma} aa={pL.aa}
          sub={margemTxt(pL.atual, pF.atual)} divisor="leve" tomProj />
      </>
    );
  }

  function renderCategorias(categorias, prefixoKey) {
    return categorias.map(catNode => {
      const catKey = `${prefixoKey}/cat:${catNode.categoria.key}`;
      const catAberto = expandidos.has(catKey);
      const Pal = CAT_PALETA[catNode.categoria.cor];
      const Icone = catNode.categoria.icone;
      const s = catNode.stats;
      return (
        <React.Fragment key={catKey}>
          <tr className={`cursor-pointer ${Pal.bg} hover:brightness-95 transition-all border-t border-gray-100`}
            onClick={() => onToggle(catKey)}>
            <td className={`py-2.5 pr-3 ${padCat}`}>
              <div className="flex items-center gap-2">
                <Chev aberto={catAberto} />
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${Pal.text} bg-white/60 backdrop-blur-sm ring-1 ${Pal.border}`}>
                  <Icone className={`h-3 w-3 ${Pal.icon}`} />
                  {catNode.categoria.label}
                </span>
              </div>
            </td>
            <LinhaStats s={s} />
          </tr>
          {catAberto && catNode.grupos.map(grupoNode => {
            const gKey = `${catKey}/g:${grupoNode.codigo ?? 'none'}`;
            const gAberto = expandidos.has(gKey);
            const gs = grupoNode.stats;
            return (
              <React.Fragment key={gKey}>
                <tr className="cursor-pointer bg-gray-50/50 hover:bg-gray-100/70 transition-colors"
                  onClick={() => onToggle(gKey)}>
                  <td className={`py-2 pr-3 ${padGrp}`}>
                    <div className="flex items-center gap-2">
                      <Chev aberto={gAberto} classes="h-3 w-3 text-gray-500" />
                      <span className="text-[12.5px] font-semibold text-gray-700 truncate">{grupoNode.nome}</span>
                      {grupoNode.codigo != null && (
                        <span className="text-[9.5px] text-gray-400 font-mono">#{grupoNode.codigo}</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-1">{grupoNode.produtos.length} prod.</span>
                    </div>
                  </td>
                  <LinhaStats s={gs} />
                </tr>
                {gAberto && grupoNode.produtos.map((p, idx) => (
                  <tr key={`${gKey}/p:${p.codigo}`}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-blue-50/30 transition-colors`}>
                    <td className={`py-1.5 pr-3 ${padPrd}`}>
                      <p className="text-[12px] text-gray-700 truncate max-w-[420px]">{p.nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                    </td>
                    <LinhaStats s={{
                      qtd: p.qtd, fat: p.fat, lucro: p.lucro,
                    }} />
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-b from-white to-gray-50/40">
        <h3 className="text-[13px] font-semibold text-gray-800 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-blue-500" />
          Análise de vendas
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={expandirTudo}
            className="text-[11px] font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
            Expandir tudo
          </button>
          <span className="text-gray-300">·</span>
          <button onClick={recolherTudo}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
            Recolher tudo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="px-4 py-2 text-left">{tituloCol}</th>
              <th colSpan={2} className="px-2.5 py-1.5 text-center border-l-2 border-gray-300">Quantidade</th>
              <th colSpan={2} className="px-2.5 py-1.5 text-center border-l-2 border-gray-300">Faturamento</th>
              <th colSpan={2} className="px-2.5 py-1.5 text-center border-l-2 border-gray-300">Lucro bruto</th>
            </tr>
            <tr className="text-[8px] font-medium text-gray-400 uppercase tracking-wider">
              <th className="px-2.5 py-1 text-right border-l-2 border-gray-300">Atual</th>
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-blue-50/30">Proj. mês</th>
              <th className="px-2.5 py-1 text-right border-l-2 border-gray-300">Atual</th>
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-blue-50/30">Proj. mês</th>
              <th className="px-2.5 py-1 text-right border-l-2 border-gray-300">Atual</th>
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-blue-50/30">Proj. mês</th>
            </tr>
          </thead>
          <tbody>
            {arvore.map(empNode => {
              if (!multiEmpresa) {
                // Sem nível de empresa.
                return (
                  <React.Fragment key={`emp:${empNode.empresa_codigo}`}>
                    {renderCategorias(empNode.categorias, '')}
                  </React.Fragment>
                );
              }
              const empKey = `emp:${empNode.empresa_codigo}`;
              const empAberto = expandidos.has(empKey);
              const es = empNode.stats;
              return (
                <React.Fragment key={empKey}>
                  <tr className="cursor-pointer bg-gradient-to-r from-blue-100/70 to-blue-50/40 hover:from-blue-100 hover:to-blue-50/70 border-t-2 border-blue-200 transition-colors"
                    onClick={() => onToggle(empKey)}>
                    <td className={`py-3 pr-3 ${padEmp}`}>
                      <div className="flex items-center gap-2">
                        <Chev aberto={empAberto} classes="h-4 w-4 text-blue-600" />
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                          <Building2 className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-gray-900 truncate leading-tight">{empNode.nome}</p>
                          {empNode.empresa_codigo != null && (
                            <p className="text-[9.5px] text-gray-500 font-mono leading-tight">cód {empNode.empresa_codigo}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <LinhaStats s={es} />
                  </tr>
                  {empAberto && renderCategorias(empNode.categorias, empKey)}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiLucro({ cat, lucro, lucroProjecao, margem, lucroAnoAnterior, faturamento, faturamentoProjecao, qtd, serieMargem }) {
  const Icone = cat.icone;
  const Pal = CAT_PALETA[cat.cor];
  const temProj = lucroProjecao != null && Math.abs(lucroProjecao - lucro) > 0.01;
  // Cor do sparkline acompanha a paleta da categoria.
  const CORES_SPARK = { blue: '#3b82f6', amber: '#f59e0b', emerald: '#10b981' };
  // Label da quantidade depende da categoria — só Combustível usa litros.
  const qtdLabel = cat.key === 'combustivel' ? 'Litros' : 'Qtd';
  return (
    <KpiLucroLayout
      icone={<Icone className={`h-4 w-4 ${Pal.icon}`} />}
      bgIcone={Pal.bg}
      label="Lucro bruto"
      categoria={cat.label}
      lucro={lucro}
      lucroProjecao={lucroProjecao}
      temProj={temProj}
      margem={margem}
      lucroAnoAnterior={lucroAnoAnterior}
      faturamento={faturamento}
      faturamentoProjecao={faturamentoProjecao}
      qtd={qtd}
      qtdLabel={qtdLabel}
      serieMargem={serieMargem}
      sparklineCor={CORES_SPARK[cat.cor] || '#3b82f6'}
    />
  );
}

// Layout compartilhado entre KpiLucro (por categoria) e KpiLucroGlobal.
// Estrutura: header (ícone + label/categoria) ▸ valor principal + chip de
// variação ▸ sparkline de margem 12m ▸ stripe inferior (margem | proj. mês).
function KpiLucroLayout({ icone, bgIcone, label, categoria, lucro, lucroProjecao, temProj, margem, lucroAnoAnterior, faturamento, faturamentoProjecao, qtd, qtdLabel, serieMargem, sparklineCor = '#3b82f6', ring }) {
  // Tendência da margem: compara o último ponto da série com a média dos
  // demais 11 meses pra dar contexto ao número de margem atual.
  const tendenciaMargem = (() => {
    if (!serieMargem || serieMargem.length < 3) return null;
    const ultimo = serieMargem[serieMargem.length - 1].margemPct;
    const anteriores = serieMargem.slice(0, -1).filter(p => p.margemPct > 0);
    if (anteriores.length === 0) return null;
    const media = anteriores.reduce((s, p) => s + p.margemPct, 0) / anteriores.length;
    if (media === 0) return null;
    const diff = ultimo - media;
    return { diff, sentido: diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'flat' };
  })();

  return (
    <div className={`bg-white rounded-xl border border-gray-200/70 ${ring || ''} shadow-sm flex flex-col h-full overflow-hidden`}>
      {/* Header — ícone à direita pra equilibrar o peso visual */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 leading-tight truncate">{label}</p>
          <p className="text-[10.5px] text-gray-700 leading-tight truncate font-medium">{categoria}</p>
        </div>
        <div className={`h-7 w-7 rounded-md ${bgIcone} flex items-center justify-center flex-shrink-0`}>
          {icone}
        </div>
      </div>

      {/* Valor principal + badge AA + contexto de faturamento (realizado + proj) */}
      <div className="px-3 pt-3 pb-1.5 flex-1 flex flex-col justify-center">
        <p className={`text-[22px] font-bold tracking-tight tabular-nums truncate leading-none ${lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}
          title={formatCurrency(lucro)}>
          {formatCurrency(lucro)}
        </p>
        <div className="mt-1">
          <BadgeComparacaoAA atual={lucro} anoAnterior={lucroAnoAnterior} />
        </div>
        {faturamento != null && faturamento > 0 && (
          <div className="mt-3 space-y-0.5">
            <p className="text-[10.5px] text-gray-500 leading-tight truncate" title={`Faturamento: ${formatCurrency(faturamento)}`}>
              <span className="text-gray-400">Faturamento </span>
              <span className="font-semibold text-gray-700 tabular-nums">{formatCurrency(faturamento)}</span>
            </p>
            {faturamentoProjecao != null && Math.abs(faturamentoProjecao - faturamento) > 0.01 && (
              <p className="text-[10.5px] leading-tight truncate" title={`Projeção do faturamento: ${formatCurrency(faturamentoProjecao)}`}>
                <span className="text-blue-500/80">Proj. mês </span>
                <span className="font-semibold text-blue-700 tabular-nums">{formatCurrency(faturamentoProjecao)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sparkline de margem dos últimos 12 meses */}
      {serieMargem && serieMargem.length >= 2 && (
        <div className="px-3 pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[8.5px] uppercase tracking-wider text-gray-400 font-semibold">Margem 12m</span>
            {tendenciaMargem && tendenciaMargem.sentido !== 'flat' && (
              <span className={`text-[9px] font-semibold tabular-nums inline-flex items-center gap-0.5 ${
                tendenciaMargem.sentido === 'up' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {tendenciaMargem.sentido === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {tendenciaMargem.diff > 0 ? '+' : ''}{tendenciaMargem.diff.toFixed(1)}pp
              </span>
            )}
          </div>
          <Sparkline serie={serieMargem} cor={sparklineCor} altura={28} />
        </div>
      )}

      {/* Stripe inferior — 2 ou 3 colunas dependendo se tem qtd (litros etc.) */}
      <div className={`grid ${qtd != null ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/40`}>
        {qtd != null && (
          <div className="px-2.5 py-2 min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">{qtdLabel || 'Qtd'}</p>
            <p className="text-[11.5px] font-semibold tabular-nums text-gray-800 leading-tight truncate" title={`${formatNumero(qtd, 0)}`}>
              {formatNumeroCompact(qtd)}
            </p>
          </div>
        )}
        <div className="px-2.5 py-2 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">Margem</p>
          <p className="text-[11.5px] font-semibold tabular-nums text-gray-800 leading-tight truncate">{(margem * 100).toFixed(1)}%</p>
        </div>
        <div className="px-2.5 py-2 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">Proj. mês</p>
          <p className={`text-[11.5px] font-semibold tabular-nums leading-tight truncate ${temProj ? 'text-blue-700' : 'text-gray-400'}`}
            title={temProj ? formatCurrency(lucroProjecao) : '—'}>
            {temProj ? formatCurrencyCompact(lucroProjecao) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Agrega os grupos de uma categoria (automotivos/conveniência) somando
// faturamento, lucro e itens de cada produto na árvore. Ordenado por
// faturamento desc. Retorna [{ codigo, nome, valor, lucro, itens, margem, ticket }].
function agregarGruposDaCategoria(arvore, categoriaKey) {
  const mapa = new Map();
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== categoriaKey) return;
      (cat.grupos || []).forEach(grupo => {
        const k = String(grupo.codigo ?? grupo.nome);
        let cur = mapa.get(k);
        if (!cur) {
          cur = { codigo: grupo.codigo, nome: grupo.nome, valor: 0, lucro: 0, itens: 0 };
          mapa.set(k, cur);
        }
        (grupo.produtos || []).forEach(p => {
          cur.valor += Number(p.fat?.atual)   || 0;
          cur.lucro += Number(p.lucro?.atual) || 0;
          cur.itens += 1;
        });
      });
    });
  });
  return Array.from(mapa.values())
    .filter(g => g.valor > 0 || g.lucro !== 0)
    .map(g => ({
      ...g,
      margem: g.valor > 0 ? g.lucro / g.valor : 0,
      ticket: g.itens > 0 ? g.valor / g.itens : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// Abrevia nome de produto de combustível pra caber na stripe inferior.
// Mantém apenas a "essência" do nome (ex: "GASOLINA C COMUM ADITIVADA"
// → "GASOLINA AD."; "OLEO DIESEL B S-10 COMUM" → "DIESEL S-10").
function abreviarCombustivel(nome) {
  if (!nome) return '—';
  let n = String(nome).toUpperCase().trim();
  n = n.replace(/\bOLEO\s+/g, '').replace(/\bHIDRATADO\b/g, 'HID.').replace(/\bCOMUM\b/g, '');
  n = n.replace(/\bADITIVADO\b|\bADITIVADA\b/g, 'AD.');
  n = n.replace(/\s+/g, ' ').trim();
  // Se ainda for muito longo, corta nas primeiras 14 chars (cabe na stripe).
  return n.length > 14 ? `${n.slice(0, 13)}…` : n;
}

// Formato compacto para quantidades: 12,3K · 1,5M
function formatNumeroCompact(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pt-BR')}k`;
  return formatNumero(n, 0);
}

// Sparkline SVG — linha suave (Catmull-Rom convertida em cubic bézier) com
// preenchimento em gradient vertical. Sem dependência de Recharts.
function Sparkline({ serie, cor = '#3b82f6', altura = 28 }) {
  // ID único do gradient pra cada instância (evita colisão se houver vários).
  const gradId = useMemo(
    () => `spark-grad-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  const pontos = serie.map(p => Number(p.margemPct) || 0);
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const range = max - min || 1;
  const W = 100;
  const H = altura;
  const stepX = pontos.length > 1 ? W / (pontos.length - 1) : 0;
  const padTop = 2;
  const padBot = 2;
  const y = (v) => H - padBot - ((v - min) / range) * (H - padTop - padBot);
  const coords = pontos.map((v, i) => [i * stepX, y(v)]);

  // Catmull-Rom → cubic bézier. Tensão 0.5 dá uma curva visualmente suave
  // sem "overshoot" que distorça a leitura da série.
  function suavizar(pts) {
    if (pts.length < 2) return '';
    const T = 0.5;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) * T / 3;
      const cp1y = p1[1] + (p2[1] - p0[1]) * T / 3;
      const cp2x = p2[0] - (p3[0] - p1[0]) * T / 3;
      const cp2y = p2[1] - (p3[1] - p1[1]) * T / 3;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  const linha = suavizar(coords);
  const area  = `${linha} L ${W} ${H} L 0 ${H} Z`;
  const ultimo = coords[coords.length - 1];
  const ultimoVal = pontos[pontos.length - 1];
  const labelMargem = `${ultimoVal.toFixed(1)}%`;

  return (
    <div className="relative" title={`Margem últimos 12 meses · atual ${labelMargem}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={cor} stopOpacity={0.35} />
            <stop offset="60%"  stopColor={cor} stopOpacity={0.12} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={linha} fill="none" stroke={cor} strokeWidth="1.4"
          strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />
        <circle cx={ultimo[0]} cy={ultimo[1]} r="1.8" fill={cor}
          stroke="white" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

// Chip de variação semanal compacto (versão para a tree de Realizado dia a dia).
function ChipVariacaoSemanal({ pct }) {
  if (pct == null) {
    return <span className="text-[10px] text-gray-300 tabular-nums">—</span>;
  }
  if (Math.abs(pct) < 0.0005) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500 tabular-nums">
        <Minus className="h-2.5 w-2.5" /> 0%
      </span>
    );
  }
  const positivo = pct > 0;
  const Icone = positivo ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
      positivo ? 'text-emerald-600' : 'text-red-600'
    }`}>
      <Icone className="h-3 w-3" />
      {positivo ? '+' : ''}{(pct * 100).toFixed(1)}%
    </span>
  );
}

// Célula numérica simples (sem chips), para a tree de Realizado dia a dia.
// Suporta barra de proporção interna (opt-in via `barraMax`): pinta uma
// barrinha no rodapé da célula proporcional a (valor / barraMax) — ajuda a
// comparar visualmente quem é maior na coluna sem precisar ler os números.
const BARRA_CORES = {
  blue:    'bg-blue-400/70 dark:bg-blue-500/60',
  emerald: 'bg-emerald-400/70 dark:bg-emerald-500/60',
  violet:  'bg-violet-400/70 dark:bg-violet-500/60',
  amber:   'bg-amber-400/70 dark:bg-amber-500/60',
};
function CelulaNumero({ valor, moeda = true, decimais = 0, sufixo = '', sub, negativoBg = true, divisor = 'leve', barraMax, barraCor = 'blue', corTexto, onClick }) {
  const negativo = negativoBg && valor < 0;
  const txt = moeda ? formatCurrency(valor) : `${formatNumero(valor, decimais)}${sufixo}`;
  const temBarra = barraMax != null && barraMax > 0 && valor > 0;
  const pctBarra = temBarra ? Math.min(100, (Number(valor) / Number(barraMax)) * 100) : 0;
  const cls = [
    'px-2.5 py-2 text-right align-top whitespace-nowrap',
    temBarra ? 'relative pb-3' : '',
    divisor === 'forte' ? 'border-l-2 border-gray-300' : '',
    divisor === 'leve'  ? 'border-l border-gray-100'   : '',
    onClick ? 'cursor-pointer' : '',
  ].filter(Boolean).join(' ');
  // Cor do texto: vermelho se negativo; caso contrário, usa corTexto se
  // informada e valor > 0 (zero permanece cinza neutro pra não distrair).
  const corValor = negativo
    ? 'text-red-700'
    : (corTexto && Number(valor) > 0 ? corTexto : 'text-gray-900');
  return (
    <td className={cls} onClick={onClick}>
      <p className={`font-mono tabular-nums text-[12px] font-semibold leading-tight ${corValor}`}>
        {txt}
      </p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
      {temBarra && (
        <div className="absolute left-2 right-2 bottom-1 h-1 rounded-full overflow-hidden bg-gray-100">
          <div className={`h-full rounded-full ${BARRA_CORES[barraCor]}`} style={{ width: `${pctBarra}%` }} />
        </div>
      )}
    </td>
  );
}

// Tree do "Realizado dia a dia" — agrupa por data, expande para os produtos.
// Colunas: Dia da semana, Litros (+ ΔSemana), Faturamento, Lucro bruto,
// Acréscimos, Descontos, Margem, Preço médio, Custo médio, Lucro/L.
function TreeRealizadoDia({ arvore, expandidos, onToggle }) {
  // Linha de produto que o usuário "fixou" pra leitura horizontal dos dados.
  // Click na mesma linha desseleciona.
  const [linhaSelecionada, setLinhaSelecionada] = useState(null);
  function toggleLinha(key) {
    setLinhaSelecionada(prev => prev === key ? null : key);
  }

  function calcAux(s) {
    const margem    = s.valor > 0 ? (s.valor - s.custo) / s.valor : 0;
    const precoMed  = s.qtd   > 0 ? s.valor / s.qtd : 0;
    const custoMed  = s.qtd   > 0 ? s.custo / s.qtd : 0;
    const lucroL    = s.qtd   > 0 ? (s.valor - s.custo) / s.qtd : 0;
    const lucro     = s.valor - s.custo;
    return { lucro, margem, precoMed, custoMed, lucroL };
  }

  // Pra produtos, calculamos o max dentro de cada dia — as barras de
  // proporção aparecem APENAS nas linhas de produto (comparação intra-dia).
  function maxProdutos(produtos) {
    return produtos.reduce((acc, p) => {
      const a = calcAux({ qtd: p.qtd, valor: p.valor, custo: p.custo });
      acc.valor  = Math.max(acc.valor,  p.valor);
      acc.lucro  = Math.max(acc.lucro,  a.lucro);
      acc.margem = Math.max(acc.margem, a.margem * 100);
      return acc;
    }, { valor: 0, lucro: 0, margem: 0 });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Data / Produto</th>
            <th className="px-2.5 py-2 text-center border-l-2 border-gray-300">Dia</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Litros</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Δ Sem.</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Lucro bruto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Acréscimos</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Descontos</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Margem</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Lucro / L</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(dNode => {
            const diaKey = `dia:${dNode.dia}`;
            const aberto = expandidos.has(diaKey);
            const aux = calcAux(dNode.stats);
            return (
              <React.Fragment key={diaKey}>
                <tr className="cursor-pointer bg-amber-50/40 hover:bg-amber-50/70 transition-colors border-t border-amber-100"
                  onClick={() => onToggle(diaKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {aberto
                        ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
                      <span className="text-[13px] font-semibold text-gray-900">{formatDataBR(dNode.dia)}</span>
                      <span className="text-[10px] text-gray-400">· {dNode.produtos.length} prod.</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-[11px] font-medium text-gray-600 border-l-2 border-gray-300">
                    {diaSemanaCurto(dNode.dia)}
                  </td>
                  <CelulaNumero valor={dNode.stats.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                  <td className="px-2.5 py-2.5 text-right border-l border-gray-100">
                    <ChipVariacaoSemanal pct={dNode.varSemana} />
                  </td>
                  <CelulaNumero valor={dNode.stats.valor} divisor="forte" />
                  <CelulaNumero valor={aux.lucro} divisor="forte" />
                  <CelulaNumero valor={dNode.stats.acresc} divisor="forte" corTexto="text-emerald-700" />
                  <CelulaNumero valor={dNode.stats.desc}   divisor="leve"  corTexto="text-red-700" />
                  <CelulaNumero valor={aux.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                  <CelulaNumero valor={aux.precoMed} divisor="forte" />
                  <CelulaNumero valor={aux.custoMed} divisor="leve" />
                  <CelulaNumero valor={aux.lucroL} divisor="leve" />
                </tr>
                {aberto && (() => {
                  const maxP = maxProdutos(dNode.produtos);
                  return dNode.produtos.map((p, idx) => {
                    const auxP = calcAux({ qtd: p.qtd, valor: p.valor, custo: p.custo });
                    const rowKey = `${diaKey}/p:${p.codigo}`;
                    const selecionada = linhaSelecionada === rowKey;
                    return (
                      <tr key={rowKey}
                        onClick={() => toggleLinha(rowKey)}
                        className={`cursor-pointer transition-colors ${
                          selecionada
                            ? 'bg-yellow-100 hover:bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                            : `${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30`
                        }`}>
                        <td className="pl-10 pr-3 py-1.5">
                          <p className="text-[12px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                          <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                        </td>
                        <td className="px-2.5 py-1.5 border-l-2 border-gray-300"></td>
                        <CelulaNumero valor={p.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                        <td className="px-2.5 py-1.5 text-right border-l border-gray-100">
                          <ChipVariacaoSemanal pct={p.varSemana} />
                        </td>
                        <CelulaNumero valor={p.valor}        divisor="forte" barraMax={maxP.valor}  barraCor="blue" />
                        <CelulaNumero valor={auxP.lucro}     divisor="forte" barraMax={maxP.lucro}  barraCor="emerald" />
                        <CelulaNumero valor={p.acresc} divisor="forte" corTexto="text-emerald-700" />
                        <CelulaNumero valor={p.desc}   divisor="leve"  corTexto="text-red-700" />
                        <CelulaNumero valor={auxP.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} barraMax={maxP.margem} barraCor="violet" />
                        <CelulaNumero valor={auxP.precoMed} divisor="forte" />
                        <CelulaNumero valor={auxP.custoMed} divisor="leve" />
                        <CelulaNumero valor={auxP.lucroL} divisor="leve" />
                      </tr>
                    );
                  });
                })()}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tree "Realizado dia a dia" (Automotivos/Conveniência) — Data → Grupo → Produto.
// Colunas: Qtd, Faturamento, Custo, Lucro bruto, Margem, Preço méd., Custo méd., Lucro méd.
function TreeRealizadoAutoDia({ arvore, expandidos, onToggle, cor = 'blue' }) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  // Linha selecionada pelo usuário (grupo OU produto) — destacada em amarelo
  // pra facilitar a leitura horizontal dos valores na mesma linha.
  const [linhaSelecionada, setLinhaSelecionada] = useState(null);
  function toggleLinha(key) {
    setLinhaSelecionada(prev => prev === key ? null : key);
  }

  function calc(s) {
    const lucro    = s.valor - s.custo;
    const margem   = s.valor > 0 ? lucro / s.valor : 0;
    const precoMed = s.qtd   > 0 ? s.valor / s.qtd : 0;
    const custoMed = s.qtd   > 0 ? s.custo / s.qtd : 0;
    const lucroMed = s.qtd   > 0 ? lucro  / s.qtd : 0;
    return { lucro, margem, precoMed, custoMed, lucroMed };
  }

  // Max de Faturamento, Lucro e Margem entre os produtos de um grupo —
  // referência pras barras de proporção (só no nível de produto).
  function maxProdutosDoGrupo(produtos) {
    return produtos.reduce((acc, p) => {
      const c = calc({ qtd: p.qtd, valor: p.valor, custo: p.custo });
      acc.valor  = Math.max(acc.valor,  p.valor);
      acc.lucro  = Math.max(acc.lucro,  c.lucro);
      acc.margem = Math.max(acc.margem, c.margem * 100);
      return acc;
    }, { valor: 0, lucro: 0, margem: 0 });
  }

  // LinhaStats agora aceita:
  //  - onClick: aplicado em cada td (quando passado, ativa seleção da linha
  //    via click em qualquer célula numérica). A primeira td (nome) fica
  //    livre pra continuar fazendo toggle de expansão.
  //  - barras: { valor, lucro, margem } pra desenhar as barras de proporção
  //    nas células Faturamento, Lucro bruto e Margem.
  function LinhaStats({ s, onClick, barras }) {
    const c = calc(s);
    return (
      <>
        <CelulaNumero valor={s.qtd}        moeda={false} decimais={2} divisor="forte" onClick={onClick} />
        <CelulaNumero valor={s.valor}      divisor="forte" onClick={onClick} barraMax={barras?.valor}  barraCor="blue" />
        <CelulaNumero valor={s.custo}      divisor="leve"  onClick={onClick} />
        <CelulaNumero valor={c.lucro}      divisor="forte" onClick={onClick} barraMax={barras?.lucro}  barraCor="emerald" />
        <CelulaNumero valor={c.margem*100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} onClick={onClick} barraMax={barras?.margem} barraCor="violet" />
        <CelulaNumero valor={c.precoMed}   divisor="forte" onClick={onClick} />
        <CelulaNumero valor={c.custoMed}   divisor="leve"  onClick={onClick} />
        <CelulaNumero valor={c.lucroMed}   divisor="leve"  onClick={onClick} />
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Data / Grupo / Produto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Qtd</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Custo</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Lucro bruto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Margem</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Lucro méd.</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(dNode => {
            const dKey = `aD:${dNode.dia}`;
            const dAberto = expandidos.has(dKey);
            return (
              <React.Fragment key={dKey}>
                <tr className={`cursor-pointer ${Pal.bgHeader} ${Pal.hoverHeader} transition-colors border-t ${Pal.borderTop}`}
                  onClick={() => onToggle(dKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {dAberto
                        ? <ChevronDown className={`h-3.5 w-3.5 ${Pal.chevron} flex-shrink-0`} />
                        : <ChevronRight className={`h-3.5 w-3.5 ${Pal.chevron} flex-shrink-0`} />}
                      <span className="text-[12.5px] font-semibold text-gray-900">{formatDataBR(dNode.dia)}</span>
                      <span className="text-[10px] text-gray-500">{diaSemanaCurto(dNode.dia)}</span>
                    </div>
                  </td>
                  <LinhaStats s={dNode.stats} />
                </tr>
                {dAberto && dNode.grupos.map(gNode => {
                  const gKey = `${dKey}/g:${gNode.codigo ?? 'none'}`;
                  const gAberto = expandidos.has(gKey);
                  const gSelecionada = linhaSelecionada === gKey;
                  // bg base do grupo + override quando selecionada (amarelo)
                  const gRowBg = gSelecionada
                    ? 'bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                    : 'bg-gray-50/50 hover:bg-gray-100/70';
                  const maxP = maxProdutosDoGrupo(gNode.produtos);
                  return (
                    <React.Fragment key={gKey}>
                      <tr className={`${gRowBg} transition-colors`}>
                        {/* Primeira td: click expande/colapsa (não seleciona) */}
                        <td className="pl-10 pr-3 py-2 cursor-pointer"
                          onClick={() => onToggle(gKey)}>
                          <div className="flex items-center gap-2">
                            {gAberto
                              ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
                            <Package className={`h-3.5 w-3.5 ${Pal.iconSub} flex-shrink-0`} />
                            <span className="text-[12px] font-medium text-gray-800 truncate">{gNode.nome}</span>
                          </div>
                        </td>
                        {/* Demais células: click seleciona/desseleciona a linha */}
                        <LinhaStats s={gNode.stats} onClick={() => toggleLinha(gKey)} />
                      </tr>
                      {gAberto && gNode.produtos.map((p, idx) => {
                        const pKey = `${gKey}/p:${p.codigo}`;
                        const pSelecionada = linhaSelecionada === pKey;
                        const pRowBg = pSelecionada
                          ? 'bg-yellow-100 hover:bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                          : `${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${Pal.hoverLeaf}`;
                        return (
                          <tr key={pKey}
                            onClick={() => toggleLinha(pKey)}
                            className={`cursor-pointer ${pRowBg} transition-colors`}>
                            <td className="pl-16 pr-3 py-1.5">
                              <p className="text-[11.5px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                              <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                            </td>
                            <LinhaStats s={{ qtd: p.qtd, valor: p.valor, custo: p.custo }} barras={maxP} />
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Linha do tempo (Automotivos): ComposedChart de 12 meses com Bar = faturamento
// e Line = margem. Multi-select de grupos + multi-select opcional de produtos.
// Labels acima das barras mostram a variação MoM do faturamento.
function LinhaDoTempoAuto({
  loading, serie, grupos, produtos,
  gruposSel, onToggleGrupo, onToggleTodosGrupos, onLimparGrupos,
  produtosSel, onToggleProduto, onToggleTodosProdutos, onLimparProdutos,
  cor = 'blue',
}) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  const temDados = (serie || []).some(p => p.faturamento > 0);

  return (
    <div className="p-4 space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect
            grupos={grupos} selecionadas={gruposSel}
            onToggle={onToggleGrupo} onToggleTodos={onToggleTodosGrupos}
            tipo="grupo" minWidth={220}
          />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimparGrupos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> Produto
          </span>
          <GrupoMultiSelect
            grupos={produtos} selecionadas={produtosSel}
            onToggle={onToggleProduto} onToggleTodos={onToggleTodosProdutos}
            tipo="produto" minWidth={240}
          />
          {produtosSel.size > 0 && (
            <button type="button" onClick={onLimparProdutos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
              Limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className={`h-5 w-5 animate-spin ${Pal.spinner}`} />
          <span className="text-sm">Carregando linha do tempo...</span>
        </div>
      ) : !temDados ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <Package className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm">Sem dados no período / filtros selecionados.</p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 px-2 pb-2">
            <LineChartIcon className={`h-4 w-4 ${Pal.chartIcon}`} />
            <h4 className="text-[13px] font-semibold text-gray-800">Faturamento & Margem · últimos 12 meses</h4>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
              <YAxis yAxisId="left"
                tickFormatter={(v) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`}
                tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
              <YAxis yAxisId="right" orientation="right"
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Faturamento') return [formatCurrency(value), name];
                  if (name === 'Margem')      return [`${Number(value).toFixed(1)}%`, name];
                  return [value, name];
                }}
                labelStyle={{ fontSize: 12, fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="faturamento" name="Faturamento"
                fill={Pal.chartBar} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="fatVarMA" content={<LabelVariacaoMA />} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                stroke="#a78bfa" strokeWidth={2}
                dot={{ r: 3, fill: '#c4b5fd', stroke: '#a78bfa', strokeWidth: 1 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Análise de cesta de compras (market basket) — Automotivos.
// Mostra pares de produtos vendidos juntos no mesmo mlid, ordenados pela
// frequência (transacoes_juntas).
const CARRINHO_MIN_OPTS = [2, 5, 10, 20, 50];
const CARRINHO_PERIODO_OPTS = [30, 60, 90, 180];
function CarrinhoCompras({
  loading, erro, pares, totalPares, totalTransacoes,
  grupos, gruposSel, onToggleGrupo, onToggleTodos, onLimparGrupos,
  minTransacoes, onChangeMin, busca, onChangeBusca,
  periodoDias, onChangePeriodoDias,
  cor = 'blue',
}) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className={`h-5 w-5 animate-spin ${Pal.spinner}`} />
        <span className="text-sm">Analisando cesta de compras...</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Não foi possível carregar a análise</p>
          <p className="text-red-700 mt-1">{erro}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {CARRINHO_PERIODO_OPTS.map(n => {
              const ativo = periodoDias === n;
              return (
                <button key={n} onClick={() => onChangePeriodoDias(n)}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                    ativo
                      ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}`
                      : 'text-gray-600 hover:text-gray-900'
                  }`}>{n}d</button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect
            grupos={grupos} selecionadas={gruposSel}
            onToggle={onToggleGrupo} onToggleTodos={onToggleTodos}
            tipo="grupo" minWidth={220}
          />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimparGrupos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Mínimo</span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {CARRINHO_MIN_OPTS.map(n => {
              const ativo = minTransacoes === n;
              return (
                <button key={n} onClick={() => onChangeMin(n)}
                  className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                    ativo
                      ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}`
                      : 'text-gray-600 hover:text-gray-900'
                  }`}>≥ {n}</button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={busca} onChange={e => onChangeBusca(e.target.value)}
              placeholder="Buscar por produto..."
              className={`w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white ${Pal.focusBorder} focus:outline-none focus:ring-2 ${Pal.focusRing}`} />
          </div>
        </div>
      </div>

      {/* KPI Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`rounded-xl ${Pal.kpiGradient} border ${Pal.kpiBorder} p-4`}>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Transações no período</p>
          <p className={`text-[22px] font-bold ${Pal.kpiText} leading-tight mt-1`}>{formatNumero(totalTransacoes, 0)}</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">notas fiscais distintas</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Pares analisados</p>
          <p className="text-[22px] font-bold text-gray-900 leading-tight mt-1">{formatNumero(totalPares, 0)}</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">
            {pares.length === totalPares ? 'todos visíveis' : `${formatNumero(pares.length, 0)} visíveis após filtros`}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Par mais frequente</p>
          {pares.length > 0 ? (
            <>
              <p className="text-[12px] font-semibold text-gray-900 leading-tight mt-1 truncate">
                {pares[0].produto_a_nome} + {pares[0].produto_b_nome}
              </p>
              <p className="text-[10.5px] text-gray-500 mt-0.5">
                {formatNumero(Number(pares[0].transacoes_juntas), 0)} transações juntas
              </p>
            </>
          ) : (
            <p className="text-[12px] text-gray-400 mt-2">—</p>
          )}
        </div>
      </div>

      {/* Tabela de pares */}
      {pares.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-100 rounded-xl">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <ShoppingCart className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm font-medium text-gray-900">
            Nenhum par de produtos atende aos filtros
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Tente reduzir o mínimo de transações ou ajustar os grupos selecionados.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-center w-10">#</th>
                <th className="px-4 py-2 text-left">Produto A</th>
                <th className="px-4 py-2 text-left border-l border-gray-200">Produto B</th>
                <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Transações juntas</th>
                <th className="px-2.5 py-2 text-right border-l border-gray-200">% das transações</th>
                <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Valor das vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pares.map((p, i) => {
                const transacoes = Number(p.transacoes_juntas) || 0;
                const valor = Number(p.valor_juntas) || 0;
                const supportPct = totalTransacoes > 0 ? (transacoes / totalTransacoes) * 100 : 0;
                return (
                  <tr key={`${p.produto_a}-${p.produto_b}`} className={`${Pal.hoverLeaf} transition-colors`}>
                    <td className={`px-3 py-1.5 text-center font-mono text-[11px] ${Pal.kpiText} font-semibold`}>
                      {i + 1}
                    </td>
                    <td className="px-4 py-1.5">
                      <p className="text-[12px] text-gray-800 truncate max-w-[300px]">{p.produto_a_nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {p.produto_a}</p>
                    </td>
                    <td className="px-4 py-1.5 border-l border-gray-100">
                      <p className="text-[12px] text-gray-800 truncate max-w-[300px]">{p.produto_b_nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {p.produto_b}</p>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">
                      {formatNumero(transacoes, 0)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-600 border-l border-gray-100">
                      {supportPct.toFixed(2)}%
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900 border-l-2 border-gray-300">
                      {formatCurrency(valor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Análise de Pareto (80/20) para Automotivos. Lista produtos ordenados por
// faturamento descendente, com % e % acumulado. A meta selecionada (60/70/80/90%)
// destaca os produtos que juntos formam essa fatia.
const PARETO_METAS = [60, 70, 80, 90];

// Dropdown multi-select genérico (multi-checkbox). Set vazio = nenhum filtro.
// `tipo` controla o label (ex: "Todos os grupos", "Todos os produtos").
function GrupoMultiSelect({ grupos, selecionadas, onToggle, onToggleTodos, tipo = 'grupo', minWidth = 240 }) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  // Limpa a busca quando o dropdown é fechado.
  React.useEffect(() => { if (!aberto) setBusca(''); }, [aberto]);
  const gruposFiltrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(g => (g.nome || '').toLowerCase().includes(q));
  }, [grupos, busca]);
  const todosMarcados = selecionadas.size > 0 && selecionadas.size === grupos.length;
  const plural = `${tipo}s`;
  const label = selecionadas.size === 0
    ? `Todos os ${plural} (${grupos.length})`
    : todosMarcados
    ? `Todos (${grupos.length})`
    : selecionadas.size === 1
    ? grupos.find(g => selecionadas.has(g.codigo))?.nome || `1 ${tipo}`
    : `${selecionadas.size} ${plural}`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(o => !o)}
        style={{ minWidth }}
        className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-[12px] transition-colors ${
          aberto
            ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800 bg-white'
            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
        }`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            {/* Input de busca */}
            <div className="relative border-b border-gray-100">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder={`Buscar ${tipo}...`}
                autoFocus
                className="w-full pl-8 pr-3 py-2 text-[12px] bg-transparent outline-none focus:bg-gray-50/60 transition-colors" />
            </div>
            <button type="button" onClick={onToggleTodos}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todosMarcados}
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {gruposFiltrados.length === 0 ? (
                <p className="px-3 py-4 text-center text-[12px] text-gray-400">
                  Nenhum {tipo} encontrado
                </p>
              ) : gruposFiltrados.map(g => {
                const marcada = selecionadas.has(g.codigo);
                return (
                  <label key={g.codigo}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(g.codigo)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-gray-800 truncate">{g.nome}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnalisePareto({ dados, grupos, meta, onChangeMeta, gruposSel, onToggleGrupo, onToggleTodos, onLimpar, cor = 'blue' }) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  const cutoffIdx = React.useMemo(() => {
    if (!dados.list.length) return -1;
    const i = dados.list.findIndex(p => p.pctAcum >= meta);
    return i === -1 ? dados.list.length - 1 : i;
  }, [dados.list, meta]);
  const dentroDaMeta = cutoffIdx >= 0 ? cutoffIdx + 1 : 0;
  const valorDentroMeta = dados.list
    .slice(0, dentroDaMeta)
    .reduce((s, p) => s + p.valor, 0);
  const pctDentroDaMeta = dados.total > 0 ? (valorDentroMeta / dados.total) * 100 : 0;
  const restanteCount   = Math.max(0, dados.list.length - dentroDaMeta);
  const restanteValor   = Math.max(0, dados.total - valorDentroMeta);

  return (
    <div className="p-4 space-y-4">
      {/* Controles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Meta</span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {PARETO_METAS.map(m => {
              const ativo = meta === m;
              return (
                <button key={m} onClick={() => onChangeMeta(m)}
                  className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                    ativo
                      ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}`
                      : 'text-gray-600 hover:text-gray-900'
                  }`}>{m}%</button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect
            grupos={grupos}
            selecionadas={gruposSel}
            onToggle={onToggleGrupo}
            onToggleTodos={onToggleTodos}
          />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimpar}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* KPI Resumo */}
      {dados.list.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-100 rounded-xl">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <Package className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm font-medium text-gray-900">
            Nenhum produto encontrado{gruposSel.size > 0 ? ' nos grupos selecionados' : ''}
          </p>
        </div>
      ) : (
        <>
          <div className={`rounded-xl ${Pal.kpiGradient} border ${Pal.kpiBorder} p-4`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-[28px] font-bold ${Pal.kpiText} leading-none`}>{dentroDaMeta}</span>
              <span className="text-[13px] text-gray-700">produto{dentroDaMeta === 1 ? '' : 's'} formam</span>
              <span className={`text-[20px] font-bold ${Pal.kpiText} leading-none`}>{pctDentroDaMeta.toFixed(1)}%</span>
              <span className="text-[13px] text-gray-700">do faturamento</span>
              <span className="text-[13px] font-semibold text-gray-900">({formatCurrency(valorDentroMeta)})</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              De um total de <strong className="text-gray-700">{dados.list.length}</strong> produtos · faturamento total{' '}
              <strong className="text-gray-700">{formatCurrency(dados.total)}</strong> · restante:{' '}
              <strong className="text-gray-700">{restanteCount}</strong> produto{restanteCount === 1 ? '' : 's'}{' '}
              ({formatCurrency(restanteValor)})
            </p>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-center w-10">#</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Qtd</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">% do total</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">% acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.list.map((p, i) => {
                  const dentro = i <= cutoffIdx;
                  return (
                    <React.Fragment key={p.codigo}>
                      <tr className={dentro
                        ? `bg-white ${Pal.hoverLeaf} transition-colors`
                        : 'bg-gray-50/40 text-gray-400 hover:bg-gray-100/60 transition-colors'}>
                        <td className={`px-3 py-1.5 text-center font-mono text-[11px] ${dentro ? `${Pal.kpiText} font-semibold` : 'text-gray-400'}`}>
                          {i + 1}
                        </td>
                        <td className="px-4 py-1.5">
                          <p className={`text-[12px] truncate max-w-[400px] ${dentro ? 'text-gray-800' : 'text-gray-500'}`}>
                            {p.nome}
                          </p>
                          <p className="text-[9.5px] text-gray-400 font-mono">
                            cód {p.codigo}{p.grupoNome ? ` · ${p.grupoNome}` : ''}
                          </p>
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] border-l border-gray-100">
                          {formatNumero(p.qtd, 2)}
                        </td>
                        <td className={`px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${dentro ? 'text-gray-900' : ''}`}>
                          {formatCurrency(p.valor)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] border-l border-gray-100">
                          {p.pct.toFixed(2)}%
                        </td>
                        <td className={`px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${dentro ? Pal.kpiText : 'text-gray-500'}`}>
                          {p.pctAcum.toFixed(2)}%
                        </td>
                      </tr>
                      {i === cutoffIdx && (i + 1) < dados.list.length && (
                        <tr className={`${Pal.kpiBg} border-y-2 ${Pal.kpiBorderStrong}`}>
                          <td colSpan={6} className={`px-4 py-1.5 text-center text-[11px] font-semibold ${Pal.kpiText}`}>
                            ↑ Top {dentroDaMeta} produto{dentroDaMeta === 1 ? '' : 's'} = {pctDentroDaMeta.toFixed(1)}% do faturamento
                            <span className="text-gray-500 font-normal mx-2">·</span>
                            ↓ Restantes {restanteCount} = {(100 - pctDentroDaMeta).toFixed(1)}%
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Tree "Realizado por grupo" (Automotivos/Conveniência) — Grupo → Data → Produto.
function TreeRealizadoAutoGrupo({ arvore, expandidos, onToggle, cor = 'blue' }) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  function calc(s) {
    const lucro    = s.valor - s.custo;
    const margem   = s.valor > 0 ? lucro / s.valor : 0;
    const precoMed = s.qtd   > 0 ? s.valor / s.qtd : 0;
    const custoMed = s.qtd   > 0 ? s.custo / s.qtd : 0;
    const lucroMed = s.qtd   > 0 ? lucro  / s.qtd : 0;
    return { lucro, margem, precoMed, custoMed, lucroMed };
  }
  function LinhaStats({ s }) {
    const c = calc(s);
    return (
      <>
        <CelulaNumero valor={s.qtd}        moeda={false} decimais={2} divisor="forte" />
        <CelulaNumero valor={s.valor}      divisor="forte" />
        <CelulaNumero valor={s.custo}      divisor="leve" />
        <CelulaNumero valor={c.lucro}      divisor="forte" />
        <CelulaNumero valor={c.margem*100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
        <CelulaNumero valor={c.precoMed}   divisor="forte" />
        <CelulaNumero valor={c.custoMed}   divisor="leve" />
        <CelulaNumero valor={c.lucroMed}   divisor="leve" />
      </>
    );
  }

  // Ordenação no nível de grupo. Default: faturamento desc (mantém o
  // comportamento anterior da árvore). Clique no cabeçalho alterna.
  const [ordemCampo, setOrdemCampo] = useState('valor');
  const [ordemDir, setOrdemDir]     = useState('desc');
  function clickHeader(campo) {
    if (campo === ordemCampo) setOrdemDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setOrdemCampo(campo); setOrdemDir('desc'); }
  }
  function pegarValor(gNode, campo) {
    const s = gNode.stats;
    switch (campo) {
      case 'nome':   return (gNode.nome || '').toLowerCase();
      case 'qtd':    return s.qtd;
      case 'valor':  return s.valor;
      case 'custo':  return s.custo;
      case 'lucro':  return s.valor - s.custo;
      case 'margem': return s.valor > 0 ? (s.valor - s.custo) / s.valor : 0;
      default:       return 0;
    }
  }
  const arvoreOrdenada = useMemo(() => {
    return [...arvore].sort((a, b) => {
      const va = pegarValor(a, ordemCampo);
      const vb = pegarValor(b, ordemCampo);
      if (typeof va === 'string') {
        return ordemDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = !Number.isFinite(va), nb = !Number.isFinite(vb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      return ordemDir === 'asc' ? va - vb : vb - va;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arvore, ordemCampo, ordemDir]);

  function ThSort({ campo, children, className = 'text-right border-l-2 border-gray-300' }) {
    const ativo = ordemCampo === campo;
    const setaUp   = ativo && ordemDir === 'asc';
    const setaDown = ativo && ordemDir === 'desc';
    return (
      <th className={`px-2.5 py-2 select-none ${className}`}>
        <button type="button" onClick={() => clickHeader(campo)}
          className={`w-full inline-flex items-center gap-1 hover:text-gray-800 transition-colors ${
            className.includes('text-left') ? 'justify-start' : 'justify-end'
          } ${ativo ? 'text-blue-700' : ''}`}>
          <span className="whitespace-nowrap">{children}</span>
          <span className="inline-flex flex-col items-center -my-0.5 leading-none">
            <span className={`text-[8px] ${setaUp ? 'text-blue-700' : 'text-gray-300'}`}>▲</span>
            <span className={`text-[8px] -mt-0.5 ${setaDown ? 'text-blue-700' : 'text-gray-300'}`}>▼</span>
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <ThSort campo="nome"   className="text-left">Grupo / Data / Produto</ThSort>
            <ThSort campo="qtd">Qtd</ThSort>
            <ThSort campo="valor">Faturamento</ThSort>
            <ThSort campo="custo" className="text-right border-l border-gray-200">Custo</ThSort>
            <ThSort campo="lucro">Lucro bruto</ThSort>
            <ThSort campo="margem">Margem</ThSort>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Lucro méd.</th>
          </tr>
        </thead>
        <tbody>
          {arvoreOrdenada.map(gNode => {
            const gKey = `aG:${gNode.codigo ?? 'none'}`;
            const gAberto = expandidos.has(gKey);
            return (
              <React.Fragment key={gKey}>
                <tr className={`cursor-pointer ${Pal.bgHeader} ${Pal.hoverHeader} transition-colors border-t ${Pal.borderTop}`}
                  onClick={() => onToggle(gKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {gAberto
                        ? <ChevronDown className={`h-3.5 w-3.5 ${Pal.chevron} flex-shrink-0`} />
                        : <ChevronRight className={`h-3.5 w-3.5 ${Pal.chevron} flex-shrink-0`} />}
                      <Package className={`h-3.5 w-3.5 ${Pal.icon} flex-shrink-0`} />
                      <span className="text-[12.5px] font-semibold text-gray-900 truncate">{gNode.nome}</span>
                    </div>
                  </td>
                  <LinhaStats s={gNode.stats} />
                </tr>
                {gAberto && gNode.dias.map(dNode => {
                  const dKey = `${gKey}/d:${dNode.dia}`;
                  const dAberto = expandidos.has(dKey);
                  return (
                    <React.Fragment key={dKey}>
                      <tr className="cursor-pointer bg-gray-50/50 hover:bg-gray-100/70 transition-colors"
                        onClick={() => onToggle(dKey)}>
                        <td className="pl-10 pr-3 py-2">
                          <div className="flex items-center gap-2">
                            {dAberto
                              ? <ChevronDown className="h-3 w-3 text-gray-500 flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-gray-500 flex-shrink-0" />}
                            <span className="text-[12px] font-medium text-gray-800">{formatDataBR(dNode.dia)}</span>
                            <span className="text-[10px] text-gray-500">{diaSemanaCurto(dNode.dia)}</span>
                          </div>
                        </td>
                        <LinhaStats s={dNode.stats} />
                      </tr>
                      {dAberto && dNode.produtos.map((p, idx) => (
                        <tr key={`${dKey}/p:${p.codigo}`}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${Pal.hoverLeaf} transition-colors`}>
                          <td className="pl-16 pr-3 py-1.5">
                            <p className="text-[11.5px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                            <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                          </td>
                          <LinhaStats s={{ qtd: p.qtd, valor: p.valor, custo: p.custo }} />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tree "Realizado · Por combustível" — hierarquia invertida em relação à de "dia a dia":
// Produto → Data. As mesmas colunas são exibidas. No nível do produto não há
// variação semanal (é um agregado de N dias) — a célula correspondente fica vazia.
function TreeRealizadoPorCombustivel({ arvore, expandidos, onToggle }) {
  function calcAux(s) {
    const margem    = s.valor > 0 ? (s.valor - s.custo) / s.valor : 0;
    const precoMed  = s.qtd   > 0 ? s.valor / s.qtd : 0;
    const custoMed  = s.qtd   > 0 ? s.custo / s.qtd : 0;
    const lucroL    = s.qtd   > 0 ? (s.valor - s.custo) / s.qtd : 0;
    const lucro     = s.valor - s.custo;
    return { lucro, margem, precoMed, custoMed, lucroL };
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Produto / Data</th>
            <th className="px-2.5 py-2 text-center border-l-2 border-gray-300">Dia</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Litros</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Δ Sem.</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Lucro bruto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Acréscimos</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Descontos</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Margem</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Lucro / L</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(prodNode => {
            const pKey = `prod:${prodNode.codigo}`;
            const aberto = expandidos.has(pKey);
            const aux = calcAux(prodNode.stats);
            return (
              <React.Fragment key={pKey}>
                <tr className="cursor-pointer bg-amber-50/40 hover:bg-amber-50/70 transition-colors border-t border-amber-100"
                  onClick={() => onToggle(pKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {aberto
                        ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
                      <Fuel className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-gray-900 truncate">{prodNode.nome}</span>
                    </div>
                  </td>
                  {/* Dia da semana: vazio no nível do produto */}
                  <td className="px-2.5 py-2.5 text-center text-[11px] text-gray-300 border-l-2 border-gray-300">—</td>
                  <CelulaNumero valor={prodNode.stats.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                  {/* Variação semanal: vazia no nível do produto */}
                  <td className="px-2.5 py-2.5 text-right border-l border-gray-100">
                    <span className="text-[10px] text-gray-300 tabular-nums">—</span>
                  </td>
                  <CelulaNumero valor={prodNode.stats.valor} divisor="forte" />
                  <CelulaNumero valor={aux.lucro} divisor="forte" />
                  <CelulaNumero valor={prodNode.stats.acresc} divisor="forte" />
                  <CelulaNumero valor={prodNode.stats.desc} divisor="leve" />
                  <CelulaNumero valor={aux.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                  <CelulaNumero valor={aux.precoMed} divisor="forte" />
                  <CelulaNumero valor={aux.custoMed} divisor="leve" />
                  <CelulaNumero valor={aux.lucroL} divisor="leve" />
                </tr>
                {aberto && prodNode.dias.map((d, idx) => {
                  const auxD = calcAux({ qtd: d.qtd, valor: d.valor, custo: d.custo });
                  return (
                    <tr key={`${pKey}/d:${d.dia}`}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30 transition-colors`}>
                      <td className="pl-10 pr-3 py-1.5">
                        <p className="text-[12px] text-gray-700">{formatDataBR(d.dia)}</p>
                      </td>
                      <td className="px-2.5 py-1.5 text-center text-[11px] font-medium text-gray-600 border-l-2 border-gray-300">
                        {diaSemanaCurto(d.dia)}
                      </td>
                      <CelulaNumero valor={d.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                      <td className="px-2.5 py-1.5 text-right border-l border-gray-100">
                        <ChipVariacaoSemanal pct={d.varSemana} />
                      </td>
                      <CelulaNumero valor={d.valor} divisor="forte" />
                      <CelulaNumero valor={auxD.lucro} divisor="forte" />
                      <CelulaNumero valor={d.acresc} divisor="forte" />
                      <CelulaNumero valor={d.desc} divisor="leve" />
                      <CelulaNumero valor={auxD.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                      <CelulaNumero valor={auxD.precoMed} divisor="forte" />
                      <CelulaNumero valor={auxD.custoMed} divisor="leve" />
                      <CelulaNumero valor={auxD.lucroL} divisor="leve" />
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Paleta suave (pastéis) + cores fortes para destacar melhor/pior mês.
const COR_BAR_LITROS  = '#fde68a'; // amber-200
const COR_BAR_LUCROL  = '#a7f3d0'; // emerald-200
const COR_LINHA       = '#a78bfa'; // blue-400 (lucro / margem)
const COR_LINHA_DOT   = '#c4b5fd'; // blue-300 (dot padrão)
const COR_MELHOR      = '#10b981'; // emerald-500
const COR_PIOR        = '#f43f5e'; // rose-500

// Encontra os índices de melhor e pior mês para um dado campo, considerando
// apenas meses com algum dado (filtra zeros para não enviesar a comparação).
function acharMelhorPior(serie, campo) {
  const comDado = serie
    .map((p, idx) => ({ idx, valor: Number(p[campo]) || 0, temDado: p.faturamento > 0 || p.litros > 0 }))
    .filter(p => p.temDado);
  if (comDado.length === 0) return { melhor: -1, pior: -1 };
  const melhor = comDado.reduce((a, b) => b.valor > a.valor ? b : a);
  const pior   = comDado.reduce((a, b) => b.valor < a.valor ? b : a);
  // Se só existe 1 mês com dado, marca apenas como melhor (não dupliquemos).
  return {
    melhor: melhor.idx,
    pior:   melhor.idx === pior.idx ? -1 : pior.idx,
  };
}

// Dot customizado que destaca melhor (verde) e pior (rosa) na linha.
function makeDotRenderer(melhor, pior) {
  return (props) => {
    const { cx, cy, index, key } = props;
    if (cx == null || cy == null) return null;
    if (index === melhor) {
      return <circle key={key || index} cx={cx} cy={cy} r={6} fill={COR_MELHOR} stroke="#fff" strokeWidth={2} />;
    }
    if (index === pior) {
      return <circle key={key || index} cx={cx} cy={cy} r={6} fill={COR_PIOR} stroke="#fff" strokeWidth={2} />;
    }
    return <circle key={key || index} cx={cx} cy={cy} r={3} fill={COR_LINHA_DOT} stroke={COR_LINHA} strokeWidth={1} />;
  };
}

// Label posicionada acima da barra com a variação % vs mês anterior.
// Cor: verde se positivo, rosa se negativo, cinza se ~zero, oculto se sem base.
function LabelVariacaoMA(props) {
  const { x, y, width, value } = props;
  if (value == null || !Number.isFinite(value)) return null;
  const pct = value;
  const cor = Math.abs(pct) < 0.5 ? '#94a3b8' : pct > 0 ? '#059669' : '#e11d48';
  const texto = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return (
    <text x={x + width / 2} y={y - 4} fill={cor} textAnchor="middle"
      fontSize={10} fontWeight={600}>
      {texto}
    </text>
  );
}

// Heatmap semanal: combustíveis × dia da semana. Cor da célula em escala
// discreta de amber (mais escuro = mais vendido).
const DIAS_SEMANA_HEAT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function corHeatmap(valor, maxValor) {
  if (!valor || valor <= 0 || maxValor === 0) return { bg: '#f9fafb', text: '#9ca3af' };
  const r = valor / maxValor;
  if (r < 0.15) return { bg: '#fffbeb', text: '#78350f' }; // amber-50
  if (r < 0.30) return { bg: '#fef3c7', text: '#78350f' }; // amber-100
  if (r < 0.50) return { bg: '#fde68a', text: '#78350f' }; // amber-200
  if (r < 0.70) return { bg: '#fcd34d', text: '#7c2d12' }; // amber-300
  if (r < 0.90) return { bg: '#fbbf24', text: '#7c2d12' }; // amber-400
  return                 { bg: '#f59e0b', text: '#ffffff' }; // amber-500
}
function HeatmapSemanal({ dados, contagemDias }) {
  // Máximo entre todas as células (escala global p/ comparar cross-produto).
  const max = React.useMemo(() => {
    let m = 0;
    dados.forEach(p => p.porDia.forEach(v => { if (v > m) m = v; }));
    return m;
  }, [dados]);
  // Totais por dia (rodapé)
  const totalPorDia = React.useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    dados.forEach(p => p.porDia.forEach((v, i) => { t[i] += v; }));
    return t;
  }, [dados]);
  const totalGeral = totalPorDia.reduce((s, v) => s + v, 0);
  const totalDias = contagemDias?.total || 0;
  const porDiaCount = contagemDias?.porDia || [0, 0, 0, 0, 0, 0, 0];
  // Média por ocorrência: total / contagem (do dia ou geral).
  const media = (total, count) => (count > 0 ? total / count : 0);

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-separate table-fixed" style={{ borderSpacing: '4px' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            {DIAS_SEMANA_HEAT.map(d => <col key={d} style={{ width: '9.5%' }} />)}
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 text-left">Combustível</th>
              {DIAS_SEMANA_HEAT.map(d => (
                <th key={d}
                  className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2 text-center">
                  {d}
                </th>
              ))}
              <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(p => (
              <tr key={p.codigo}>
                <td className="px-3 py-1.5 text-[12px] font-medium text-gray-800 whitespace-nowrap pr-4">
                  <div className="flex items-center gap-1.5">
                    <Fuel className="h-3 w-3 text-amber-600 flex-shrink-0" />
                    <span className="truncate max-w-[200px]">{p.nome}</span>
                  </div>
                </td>
                {p.porDia.map((v, idx) => {
                  const c = corHeatmap(v, max);
                  const cnt = porDiaCount[idx];
                  return (
                    <td key={idx}
                      className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums transition-transform hover:scale-105 hover:ring-1 hover:ring-amber-500"
                      style={{ background: c.bg, color: c.text }}>
                      <div className="text-[11.5px] font-semibold leading-tight">
                        {v > 0 ? formatNumero(v, 0) : '—'}
                      </div>
                      {v > 0 && cnt > 0 && (
                        <div className="text-[9px] opacity-70 leading-tight mt-0.5">
                          média {formatNumero(media(v, cnt), 0)}/dia
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                  <div className="text-[11.5px] font-bold leading-tight">
                    {formatNumero(p.total, 0)}
                  </div>
                  {totalDias > 0 && (
                    <div className="text-[9px] text-gray-500 leading-tight mt-0.5">
                      média {formatNumero(media(p.total, totalDias), 0)}/dia
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap pr-4 border-t border-gray-200">
                Total
              </td>
              {totalPorDia.map((v, idx) => {
                const cnt = porDiaCount[idx];
                return (
                  <td key={idx}
                    className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                    <div className="text-[11.5px] font-bold leading-tight">
                      {v > 0 ? formatNumero(v, 0) : '—'}
                    </div>
                    {v > 0 && cnt > 0 && (
                      <div className="text-[9px] text-gray-500 leading-tight mt-0.5">
                        média {formatNumero(media(v, cnt), 0)}/dia
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-amber-100 text-amber-900">
                <div className="text-[11.5px] font-bold leading-tight">
                  {formatNumero(totalGeral, 0)}
                </div>
                {totalDias > 0 && (
                  <div className="text-[9px] text-amber-700 leading-tight mt-0.5">
                    média {formatNumero(media(totalGeral, totalDias), 0)}/dia
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-400 mt-3 px-1">
        Valores em litros. Intensidade da cor proporcional ao total da célula (escala global, max ={' '}
        <strong className="text-gray-600">{formatNumero(max, 0)} L</strong>).
      </p>
    </div>
  );
}

// Chips de legenda mostrando o rótulo do mês "melhor" (verde) e "pior" (rosa).
function LegendaMelhorPior({ melhorRotulo, piorRotulo }) {
  if (!melhorRotulo && !piorRotulo) return null;
  return (
    <div className="flex items-center gap-2 text-[10.5px]">
      {melhorRotulo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_MELHOR }} />
          Melhor: <strong className="font-semibold">{melhorRotulo}</strong>
        </span>
      )}
      {piorRotulo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_PIOR }} />
          Pior: <strong className="font-semibold">{piorRotulo}</strong>
        </span>
      )}
    </div>
  );
}

// Sub-aba "Últimos 12 meses" da aba Combustíveis: seletor de combustível +
// 2 gráficos (Bar + Line) com 12 buckets mensais. Destaca o melhor (verde) e
// pior (rosa) mês com base no Lucro bruto (gráfico 1) e na Margem (gráfico 2).
function Evolucao12mCombustivel({ loading, serie, produtos, produtoSelecionado, onChangeProduto }) {
  const temDados = (serie || []).some(p => p.faturamento > 0 || p.litros > 0);
  const ml = React.useMemo(() => acharMelhorPior(serie, 'lucro'),    [serie]);
  const mm = React.useMemo(() => acharMelhorPior(serie, 'margemPct'),[serie]);

  return (
    <div className="p-4 space-y-4">
      {/* Filtro de combustível */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-600" />
          <span className="text-[12px] font-semibold text-gray-700">Combustível:</span>
          <select value={produtoSelecionado || ''}
            onChange={(e) => onChangeProduto(e.target.value)}
            disabled={loading || produtos.length === 0}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-[12px] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 min-w-[220px]">
            {produtos.length > 1 && <option value="__todos">Todos os combustíveis</option>}
            {produtos.map(p => (
              <option key={p.codigo} value={String(p.codigo)}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="text-sm">Carregando evolução...</span>
        </div>
      ) : !temDados ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
            <Fuel className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm">Sem dados de combustível nos últimos 12 meses.</p>
        </div>
      ) : (
        <>
          {/* Gráfico 1: Litros (bar) + Lucro bruto (linha) — destaque por Lucro */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-blue-500" />
                <h4 className="text-[13px] font-semibold text-gray-800">Litros & Lucro bruto</h4>
              </div>
              <LegendaMelhorPior
                melhorRotulo={ml.melhor >= 0 ? serie[ml.melhor].rotulo : null}
                piorRotulo={ml.pior >= 0 ? serie[ml.pior].rotulo : null}
              />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis yAxisId="left"
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k L` : `${v.toFixed(0)} L`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <YAxis yAxisId="right" orientation="right"
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Litros')       return [`${formatNumero(value, 2)} L`, name];
                    if (name === 'Lucro bruto')  return [formatCurrency(value), name];
                    return [value, name];
                  }}
                  labelStyle={{ fontSize: 12, fontWeight: 600 }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="litros" name="Litros" radius={[4, 4, 0, 0]}>
                  {serie.map((_, idx) => (
                    <Cell key={`b1-${idx}`}
                      fill={idx === ml.melhor ? COR_MELHOR : idx === ml.pior ? COR_PIOR : COR_BAR_LITROS} />
                  ))}
                  <LabelList dataKey="litrosVarMA" content={<LabelVariacaoMA />} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="lucro" name="Lucro bruto"
                  stroke={COR_LINHA} strokeWidth={2}
                  dot={makeDotRenderer(ml.melhor, ml.pior)}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico 2: Lucro por litro (bar) + Margem (linha) — destaque por Margem */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-emerald-500" />
                <h4 className="text-[13px] font-semibold text-gray-800">Lucro por litro & Margem</h4>
              </div>
              <LegendaMelhorPior
                melhorRotulo={mm.melhor >= 0 ? serie[mm.melhor].rotulo : null}
                piorRotulo={mm.pior >= 0 ? serie[mm.pior].rotulo : null}
              />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis yAxisId="left"
                  tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <YAxis yAxisId="right" orientation="right"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Lucro / litro') return [formatCurrency(value), name];
                    if (name === 'Margem')         return [`${Number(value).toFixed(1)}%`, name];
                    return [value, name];
                  }}
                  labelStyle={{ fontSize: 12, fontWeight: 600 }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="lucroL" name="Lucro / litro" radius={[4, 4, 0, 0]}>
                  {serie.map((_, idx) => (
                    <Cell key={`b2-${idx}`}
                      fill={idx === mm.melhor ? COR_MELHOR : idx === mm.pior ? COR_PIOR : COR_BAR_LUCROL} />
                  ))}
                  <LabelList dataKey="lucroLVarMA" content={<LabelVariacaoMA />} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                  stroke={COR_LINHA} strokeWidth={2}
                  dot={makeDotRenderer(mm.melhor, mm.pior)}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// Conveniência · Análise de margem: tabela plana de produtos com lucro/margem,
// filtro multi-select de grupos, busca por nome/código e toggle "apenas margem
// negativa". Margens negativas são destacadas em vermelho.
// Cabeçalho ordenável usado na Análise de Margem (Conveniência).
function ThSortAM({ campo, ordemCampo, ordemDir, onClick, align = 'right', children }) {
  const ativo = ordemCampo === campo;
  const setaUp   = ativo && ordemDir === 'asc';
  const setaDown = ativo && ordemDir === 'desc';
  return (
    <th className="px-4 py-2.5 select-none">
      <button type="button" onClick={() => onClick(campo)}
        className={`w-full inline-flex items-center gap-1 hover:text-gray-800 transition-colors ${
          align === 'left' ? 'justify-start' : 'justify-end'
        } ${ativo ? 'text-emerald-700' : ''}`}>
        <span className="whitespace-nowrap">{children}</span>
        <span className="inline-flex flex-col items-center -my-0.5 leading-none">
          <span className={`text-[8px] ${setaUp ? 'text-emerald-700' : 'text-gray-300'}`}>▲</span>
          <span className={`text-[8px] -mt-0.5 ${setaDown ? 'text-emerald-700' : 'text-gray-300'}`}>▼</span>
        </span>
      </button>
    </th>
  );
}

function AnaliseMargemConv({ loading, produtos, grupos }) {
  const [gruposSel, setGruposSel] = useState(() => new Set());
  const [busca, setBusca] = useState('');
  const [soNegativa, setSoNegativa] = useState(false);
  const [gruposAberto, setGruposAberto] = useState(false);
  const refDrop = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (refDrop.current && !refDrop.current.contains(e.target)) setGruposAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Ordenação. Default: faturamento desc (mantém ordem natural do produtos
  // que já vem ordenado por valor desc no useMemo do parent).
  const [ordemCampo, setOrdemCampo] = useState('valor');
  const [ordemDir, setOrdemDir]     = useState('desc');
  function clickHeader(campo) {
    if (campo === ordemCampo) setOrdemDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setOrdemCampo(campo); setOrdemDir('desc'); }
  }
  function pegarValor(p, campo) {
    switch (campo) {
      case 'grupo':   return (p.grupo_nome    || '').toLowerCase();
      case 'produto': return (p.produto_nome  || '').toLowerCase();
      case 'valor':   return p.valor;
      case 'custo':   return p.custo;
      case 'lucro':   return p.lucro;
      case 'margem':  return p.margem;
      default:        return 0;
    }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = produtos.filter(p => {
      if (gruposSel.size > 0 && !gruposSel.has(p.grupo_codigo)) return false;
      if (soNegativa && !(p.margem < 0)) return false;
      if (q) {
        const nome = String(p.produto_nome || '').toLowerCase();
        const cod = String(p.produto_codigo || '');
        if (!nome.includes(q) && !cod.includes(q)) return false;
      }
      return true;
    });
    return arr.sort((a, b) => {
      const va = pegarValor(a, ordemCampo);
      const vb = pegarValor(b, ordemCampo);
      if (typeof va === 'string') {
        return ordemDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = !Number.isFinite(va), nb = !Number.isFinite(vb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      return ordemDir === 'asc' ? va - vb : vb - va;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, gruposSel, busca, soNegativa, ordemCampo, ordemDir]);

  const totais = useMemo(() => {
    let valor = 0, custo = 0;
    filtrados.forEach(p => { valor += p.valor; custo += p.custo; });
    const lucro = valor - custo;
    return { valor, custo, lucro, margem: valor > 0 ? (lucro / valor) * 100 : 0 };
  }, [filtrados]);

  const todosMarcados = gruposSel.size === grupos.length && grupos.length > 0;
  const labelGrupos = gruposSel.size === 0
    ? 'Todos'
    : todosMarcados ? `Todos (${grupos.length})`
    : gruposSel.size === 1
    ? grupos.find(g => gruposSel.has(g.codigo))?.nome || '1 grupo'
    : `${gruposSel.size} grupos`;

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <span className="text-sm">Carregando análise...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Filtros */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/40 flex items-center gap-3 flex-wrap">
        <div ref={refDrop} className="relative">
          <button type="button" onClick={() => setGruposAberto(o => !o)}
            className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[200px] max-w-[280px] ${
              gruposAberto ? 'border-emerald-400 ring-2 ring-emerald-100 text-gray-800'
                : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
            }`}>
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Grupos:</span>
              <span className="truncate">{labelGrupos}</span>
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${gruposAberto ? 'rotate-180' : ''}`} />
          </button>
          {gruposAberto && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
              <button type="button" onClick={() => setGruposSel(prev =>
                prev.size === grupos.length ? new Set() : new Set(grupos.map(g => g.codigo))
              )}
                className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 text-left">
                <input type="checkbox" checked={todosMarcados} onChange={() => {}}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-[12.5px] font-medium text-gray-700">
                  {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                </span>
              </button>
              <div className="max-h-72 overflow-y-auto">
                {grupos.map(g => (
                  <label key={g.codigo}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={gruposSel.has(g.codigo)}
                      onChange={() => setGruposSel(prev => {
                        const next = new Set(prev);
                        if (next.has(g.codigo)) next.delete(g.codigo); else next.add(g.codigo);
                        return next;
                      })}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-[12.5px] text-gray-800 truncate">{g.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto (nome ou código)..."
            className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
        </div>

        <button type="button" onClick={() => setSoNegativa(o => !o)}
          className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors ${
            soNegativa
              ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-700'
          }`}>
          <TrendingDown className="h-3.5 w-3.5" />
          Só margem negativa
          {soNegativa && <span className="text-[10px] text-red-500 ml-1">(ativo)</span>}
        </button>

        <div className="flex-1 hidden sm:block" />
        <span className="text-[11px] text-gray-500">
          {filtrados.length} de {produtos.length} produtos
        </span>
      </div>

      {/* Tabela */}
      {produtos.length === 0 ? (
        <div className="p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <Percent className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma venda de conveniência no período</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="p-12 text-center text-[13px] text-gray-500">
          Nenhum produto corresponde aos filtros.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0 z-10">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <ThSortAM campo="grupo"   ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader} align="left">Grupo</ThSortAM>
                <ThSortAM campo="produto" ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader} align="left">Produto</ThSortAM>
                <th className="px-4 py-2.5">Código</th>
                <ThSortAM campo="valor"   ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader}>Faturamento</ThSortAM>
                <ThSortAM campo="custo"   ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader}>Custo</ThSortAM>
                <ThSortAM campo="lucro"   ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader}>Lucro bruto</ThSortAM>
                <ThSortAM campo="margem"  ordemCampo={ordemCampo} ordemDir={ordemDir} onClick={clickHeader}>Margem</ThSortAM>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(p => {
                const neg = p.margem < 0;
                return (
                  <tr key={p.produto_codigo} className={neg ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-emerald-50/30'}>
                    <td className="px-4 py-2 text-[12px] text-gray-700 truncate max-w-[200px]">{p.grupo_nome}</td>
                    <td className="px-4 py-2 text-[12.5px] text-gray-900 font-medium truncate max-w-[300px]">{p.produto_nome}</td>
                    <td className="px-4 py-2 text-[11px] text-gray-500 font-mono">{p.produto_codigo}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800">{formatCurrency(p.valor)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-600">{formatCurrency(p.custo)}</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] font-semibold ${neg ? 'text-red-700' : 'text-gray-900'}`}>
                      {formatCurrency(p.lucro)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] font-bold ${neg ? 'text-red-700' : 'text-emerald-700'}`}>
                      {p.margem.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50/70 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                  Total ({filtrados.length} produto{filtrados.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900">{formatCurrency(totais.valor)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-700">{formatCurrency(totais.custo)}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {formatCurrency(totais.lucro)}
                </td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold ${totais.margem < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {totais.margem.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// Placeholder usado nas sub-abas da aba Combustíveis ainda não implementadas.
function PlaceholderEmConstrucao({ titulo }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
        <Construction className="h-6 w-6 text-amber-600" />
      </div>
      <p className="text-sm font-medium text-gray-900">{titulo}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-md">
        Esta visualização ainda está em construção. Avise quando quiser implementá-la.
      </p>
    </div>
  );
}

// Card de métrica genérico: ícone (sempre âmbar/combustível), label, valor
// principal e badge de comparação com o ano anterior. Reusado pelos 5 cards
// da aba "Combustíveis".
// KPI específico da aba Combustíveis — layout mais "executivo": label e
// ícone no topo (com ícone à direita), valor grande no centro, e a métrica
// "Ano anterior" + chip de variação no rodapé.
// KPI estilo Visão geral, adaptado pra aba Combustíveis:
//   - Header com label + ícone à direita
//   - Valor principal + badge AA + linha "Ano anterior" + linha "Proj. mês"
//   - Sparkline 12m da métrica (linha suave com gradient)
//   - Stripe inferior com top 3 combustíveis e seus valores nessa métrica
function KpiCombustivelDashboard({
  label, icone: Icone, cor = 'amber',
  valor, valorAA, valorProj,
  atual, anoAnterior, temProj, negativo,
  serie, // array de números (séria 12m da métrica)
  produtos, // array [{ nome, valor }] top 3 combustíveis na métrica
  formatProduto, // (n) => string — pra formatar o valor de cada produto na stripe
}) {
  const CORES = {
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'ring-amber-100',   spark: '#f59e0b' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-100', spark: '#10b981' },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'ring-violet-100',  spark: '#8b5cf6' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    ring: 'ring-rose-100',    spark: '#f43f5e' },
  };
  const C = CORES[cor] || CORES.amber;
  const temAA = anoAnterior !== undefined && anoAnterior !== null;
  const serieSpark = (serie || []).map(v => ({ margemPct: Number(v) || 0 }));

  return (
    <div className="bg-white rounded-xl border border-gray-200/70 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 leading-tight truncate flex-1">{label}</p>
        <div className={`h-7 w-7 rounded-md ${C.bg} ring-1 ${C.ring} flex items-center justify-center flex-shrink-0`}>
          <Icone className={`h-3.5 w-3.5 ${C.icon}`} />
        </div>
      </div>

      {/* Valor + badge AA + Ano anterior + Proj mês */}
      <div className="px-3 pt-2 pb-1.5 flex-1 flex flex-col justify-center">
        <p className={`text-[22px] font-bold tracking-tight tabular-nums truncate leading-none ${negativo ? 'text-red-700' : 'text-gray-900'}`}
          title={valor}>
          {valor}
        </p>
        {temAA && (
          <div className="mt-1.5">
            <BadgeComparacaoAA atual={atual} anoAnterior={anoAnterior} />
          </div>
        )}
        {(temAA || temProj) && (
          <div className="mt-3 space-y-0.5">
            {temAA && (
              <p className="text-[10.5px] text-gray-500 leading-tight truncate" title={`Ano anterior: ${valorAA}`}>
                <span className="text-gray-400">Ano anterior </span>
                <span className="font-semibold text-gray-700 tabular-nums">{valorAA}</span>
              </p>
            )}
            {temProj && (
              <p className="text-[10.5px] leading-tight truncate" title={`Projeção do mês: ${valorProj}`}>
                <span className="text-blue-500/80">Proj. mês </span>
                <span className="font-semibold text-blue-700 tabular-nums">{valorProj}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sparkline 12m */}
      {serieSpark.length >= 2 && (
        <div className="px-3 pb-1.5">
          <Sparkline serie={serieSpark} cor={C.spark} altura={26} />
        </div>
      )}

    </div>
  );
}

// Tabela "Projeção por combustível" — exibe cada produto da categoria
// 'combustivel' com Litros, Lucro bruto, Margem e L.B./litro nos modos
// realizado e projetado para o fechamento do mês. Total no rodapé.
function TabelaProjecaoCombustivel({ produtos, totais, projetar }) {
  const linhas = produtos || [];
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <Fuel className="h-4 w-4 text-amber-500" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-gray-800 leading-tight">Projeção por combustível</h3>
          <p className="text-[10.5px] text-gray-500 leading-tight">Valores realizados no período e projeção para o fechamento do mês</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="px-4 py-2 align-bottom">Combustível</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Litros</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Lucro bruto</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Margem</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">L.B. / litro</th>
            </tr>
            <tr className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[12px] text-gray-400">
                  Nenhum combustível com vendas no período.
                </td>
              </tr>
            ) : linhas.map(p => {
              const litrosProj = projetar(p.qtd);
              const lucroProj  = projetar(p.lucro);
              return (
                <tr key={p.codigo} className="border-t border-gray-100 hover:bg-amber-50/30 transition-colors">
                  <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800 truncate" title={p.nome}>{p.nome}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 border-l border-gray-100">{formatNumero(p.qtd, 0)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-700 font-semibold">{formatNumero(litrosProj, 0)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${p.lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(p.lucro)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${lucroProj < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(lucroProj)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{(p.margem * 100).toFixed(2)}%</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${p.lbL < 0 ? 'text-red-700' : 'text-gray-700'}`}>{formatCurrency(p.lbL)}</td>
                </tr>
              );
            })}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatNumero(totais.qtd, 0)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-700">{formatNumero(projetar(totais.qtd), 0)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucro)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${projetar(totais.lucro) < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(projetar(totais.lucro))}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.luPorL)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Tabela "Projeção por grupo" (Automotivos/Conveniência) — exibe cada
// grupo de produtos com Faturamento, Lucro bruto, Margem e Ticket médio
// nos modos realizado e projetado para o fechamento do mês. Total no rodapé.
function TabelaProjecaoCategoria({ titulo, descricao, icone: Icone = Package, cor = 'blue', linhas, totais, projetar }) {
  const items = linhas || [];
  const corHeader = {
    blue:    'text-blue-500',
    emerald: 'text-emerald-500',
  }[cor] || 'text-blue-500';
  const corProj = 'text-blue-700';
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <Icone className={`h-4 w-4 ${corHeader}`} />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-gray-800 leading-tight">{titulo}</h3>
          <p className="text-[10.5px] text-gray-500 leading-tight">{descricao}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[920px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="px-4 py-2 align-bottom">Grupo</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Faturamento</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Lucro bruto</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Margem</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Ticket médio</th>
            </tr>
            <tr className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[12px] text-gray-400">Sem vendas no período.</td>
              </tr>
            ) : items.map(g => {
              const fatProj   = projetar(g.valor);
              const lucroProj = projetar(g.lucro);
              return (
                <tr key={g.codigo ?? g.nome} className="border-t border-gray-100 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800 truncate" title={g.nome}>{g.nome}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 border-l border-gray-100">{formatCurrency(g.valor)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${corProj}`}>{formatCurrency(fatProj)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${g.lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(g.lucro)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${lucroProj < 0 ? 'text-red-700' : corProj}`}>{formatCurrency(lucroProj)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{(g.margem * 100).toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{g.ticket > 0 ? formatCurrency(g.ticket) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.valor)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${corProj}`}>{formatCurrency(projetar(totais.valor))}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucro)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${projetar(totais.lucro) < 0 ? 'text-red-700' : corProj}`}>{formatCurrency(projetar(totais.lucro))}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{totais.ticket > 0 ? formatCurrency(totais.ticket) : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Card "Resumo geral do mês" (Combustíveis) — tabela compacta com Litros,
// Lucro bruto e L.B./litro por tipo de combustível + linha de total.
function CardResumoCombustivel({ produtos, totais, luPorL }) {
  const top = produtos.slice(0, 6);
  return (
    <div className="bg-white rounded-xl border border-gray-200/70 shadow-sm overflow-hidden lg:col-span-2 flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[12.5px] font-semibold text-blue-700 leading-tight flex-1">Resumo geral do mês</p>
        <LineChartIcon className="h-3.5 w-3.5 text-blue-500" />
      </div>
      <div className="flex-1 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <th className="px-3 py-1.5 text-left">Combustível</th>
              <th className="px-2 py-1.5 text-right">Litros</th>
              <th className="px-2 py-1.5 text-right">Lucro bruto</th>
              <th className="px-3 py-1.5 text-right">L.B. litro</th>
            </tr>
          </thead>
          <tbody>
            {top.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-3 text-center text-[10.5px] text-gray-400">Sem dados no período</td></tr>
            ) : top.map(p => {
              const lbL = p.qtd > 0 ? p.lucro / p.qtd : 0;
              return (
                <tr key={p.codigo} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]" title={p.nome}>{p.nome}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-800">{formatNumero(p.qtd, 0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-gray-800">{formatCurrency(p.lucro)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800">{formatCurrency(lbL)}</td>
                </tr>
              );
            })}
          </tbody>
          {top.length > 0 && (
            <tfoot>
              <tr className="bg-blue-50/40 border-t-2 border-blue-200 font-semibold">
                <td className="px-3 py-1.5 text-blue-700">Total</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-blue-700">{formatNumero(totais.qtd, 0)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-blue-700">{formatCurrency(totais.lucro)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-blue-700">{formatCurrency(luPorL)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function KpiMetrica({ icone: Icone, label, valor, negativo, atual, anoAnterior }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-50 p-2.5 flex-shrink-0">
          <Icone className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${negativo ? 'text-red-700' : 'text-gray-900'}`}>
            {valor}
          </p>
          {atual !== undefined && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <BadgeComparacaoAA atual={atual} anoAnterior={anoAnterior} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Card com valor atual + valor do período base (AA ou MA) + variação.
// `prefixoBase` é o rótulo mostrado antes do valor base (ex: "AA", "Mês anterior").
// `rotuloBase` é o sufixo do chip de variação (ex: "AA", "MA").
function KpiComAA({ cor = 'blue', icone: Icone, label, valor, valorBase, prefixoBase = 'AA', rotuloBase = 'AA', atual, base, negativo }) {
  const Pal = CAT_PALETA[cor] || CAT_PALETA.gray;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${negativo ? 'text-red-700' : 'text-gray-900'}`}>
            {valor}
          </p>
          <p className="text-[10.5px] text-gray-400 mt-1 truncate">
            {prefixoBase}:{' '}
            <strong className="text-gray-600 font-medium">{valorBase}</strong>
          </p>
          <div className="mt-1">
            <BadgeComparacaoAA atual={atual} anoAnterior={base} rotulo={rotuloBase} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiLucroGlobal({ lucro, lucroProjecao, margem, lucroAnoAnterior, faturamento, faturamentoProjecao, serieMargem }) {
  const temProj = lucroProjecao != null && Math.abs(lucroProjecao - lucro) > 0.01;
  return (
    <KpiLucroLayout
      icone={<ShoppingCart className="h-4 w-4 text-blue-600" />}
      bgIcone="bg-blue-50"
      label="Lucro bruto"
      categoria="Global"
      lucro={lucro}
      lucroProjecao={lucroProjecao}
      temProj={temProj}
      margem={margem}
      lucroAnoAnterior={lucroAnoAnterior}
      faturamento={faturamento}
      faturamentoProjecao={faturamentoProjecao}
      serieMargem={serieMargem}
      sparklineCor="#2563eb"
      ring="ring-1 ring-blue-200"
    />
  );
}

