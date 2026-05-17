import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Fuel, Package, Store, MoreHorizontal,
  Loader2, AlertCircle, RefreshCw, Calendar,
  Building2, ChevronDown, ChevronRight, LayoutGrid,
  TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon,
  Percent, Coins, CalendarDays, Droplet, CalendarRange, Construction,
  BarChart3, Layers, Clock,
} from 'lucide-react';

// Sub-abas exibidas dentro da aba "Combustíveis".
const SUB_ABAS_COMBUSTIVEL = [
  { key: 'dia',     label: 'Realizado dia a dia',      icone: CalendarDays  },
  { key: 'tipo',    label: 'Realizado · Por combustível', icone: Droplet    },
  { key: 'doze',    label: 'Últimos 12 meses',         icone: LineChartIcon },
  { key: 'semana',  label: 'Análise semanal',          icone: CalendarRange },
];
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
  { key: 'geral',        label: 'Visão geral',  icone: LayoutGrid, categoria: null          },
  { key: 'combustivel',  label: 'Combustíveis', icone: Fuel,       categoria: 'combustivel' },
  { key: 'automotivos',  label: 'Automotivos',  icone: Package,    categoria: 'automotivos' },
  { key: 'conveniencia', label: 'Conveniências',icone: Store,      categoria: 'conveniencia'},
];
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

// ─── Helpers ─────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
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
function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
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
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  // Empresas elegíveis (com empresa_codigo)
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set(empresasDisponiveis.map(c => c.id))
  );
  useEffect(() => {
    setEmpresasSelIds(prev => {
      if (prev.size === 0 && empresasDisponiveis.length > 0) {
        return new Set(empresasDisponiveis.map(c => c.id));
      }
      return prev;
    });
  }, [empresasDisponiveis]);

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds]
  );

  const [dataDe, setDataDe] = useState(inicioMesAtual());
  // Quando true, limita o `data_ate` efetivo a ontem (exclui o dia corrente
  // que ainda está aberto). Marcado por padrão — por isso o `dataAte` também
  // começa em ontem.
  const [apenasFechados, setApenasFechados] = useState(true);
  const [dataAte, setDataAte] = useState(ontemIso());
  // Marcar: recua o `dataAte` para ontem (se estiver em hoje/futuro).
  // Desmarcar: avança para hoje (se estiver em ontem) — assume que o usuário
  // quer ver o dia corrente assim que abre o filtro.
  function handleApenasFechadosChange(checked) {
    setApenasFechados(checked);
    if (checked) {
      const ontem = ontemIso();
      if (dataAte > ontem) setDataAte(ontem);
    } else {
      setDataAte(isoHoje());
    }
  }
  // Data limite real usada nas consultas — derivada de dataAte + apenasFechados
  // (safety net caso o `max` do input seja contornado).
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
  const [expandidos, setExpandidos] = useState(new Set());

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
      const lucro = fat - custo;
      const margem = fat > 0 ? lucro / fat : 0;
      out.push({
        ano_mes: ym,
        rotulo: `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        lucro,
        margemPct: margem * 100,
        faturamento: fat,
      });
    }
    return out;
  }, [evolucao12m]);

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
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
            max={apenasFechados ? ontemIso() : undefined}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
        </div>
        <label className="hidden md:inline-flex items-center gap-1.5 h-9 px-2 cursor-pointer select-none"
          title="Limita o período a ontem (exclui o dia corrente, ainda em aberto)">
          <input type="checkbox" checked={apenasFechados}
            onChange={e => handleApenasFechadosChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
          <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">Apenas dias fechados</span>
        </label>
        {empresasDisponiveis.length > 1 && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => toggleSet(prev, id))}
            onToggleTodas={() => setEmpresasSelIds(prev =>
              prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
            )}
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
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
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
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{a.label}</span>
                <span className={`text-[10.5px] tabular-nums ${ativo ? 'text-violet-500' : 'text-gray-400'}`}>· {formatNumero(qtd)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards de lucro bruto (apenas na Visão geral) */}
      {aba === 'geral' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)).map(c => {
            const dados = totaisGerais.porCat[c.key] || { lucro: 0, valor: 0, custo: 0 };
            const dadosAA = totaisAnoAnterior.porCat[c.key] || { lucro: 0, valor: 0, custo: 0 };
            const margem = dados.valor > 0 ? dados.lucro / dados.valor : 0;
            return (
              <KpiLucro key={c.key} cat={c}
                lucro={dados.lucro}
                margem={margem}
                lucroAnoAnterior={dadosAA.lucro}
              />
            );
          })}
          <KpiLucroGlobal
            lucro={totaisGerais.totalLucro}
            margem={totaisGerais.totalValor > 0 ? totaisGerais.totalLucro / totaisGerais.totalValor : 0}
            lucroAnoAnterior={totaisAnoAnterior.totalLucro}
          />
        </div>
      )}

      {/* Cards específicos da aba Combustíveis */}
      {aba === 'combustivel' && (() => {
        const d  = totaisGerais.porCat.combustivel       || { qtd: 0, valor: 0, lucro: 0 };
        const aa = totaisAnoAnterior.porCat.combustivel  || { qtd: 0, valor: 0, lucro: 0 };
        const margem      = d.valor  > 0 ? d.lucro  / d.valor  : 0;
        const margemAA    = aa.valor > 0 ? aa.lucro / aa.valor : 0;
        const luPorL      = d.qtd    > 0 ? d.lucro  / d.qtd    : 0;
        const luPorLAA    = aa.qtd   > 0 ? aa.lucro / aa.qtd   : 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <KpiMetrica icone={Fuel}        label="Litros vendidos"
              valor={`${formatNumero(d.qtd, 2)} L`}
              atual={d.qtd}   anoAnterior={aa.qtd} />
            <KpiMetrica icone={ShoppingCart} label="Faturamento"
              valor={formatCurrency(d.valor)}
              atual={d.valor} anoAnterior={aa.valor} />
            <KpiMetrica icone={TrendingUp}   label="Lucro bruto"
              valor={formatCurrency(d.lucro)}
              negativo={d.lucro < 0}
              atual={d.lucro} anoAnterior={aa.lucro} />
            <KpiMetrica icone={Percent}      label="Margem"
              valor={`${(margem * 100).toFixed(1)}%`}
              atual={margem}  anoAnterior={margemAA} />
            <KpiMetrica icone={Coins}        label="Lucro por litro"
              valor={formatCurrency(luPorL)}
              negativo={luPorL < 0}
              atual={luPorL}  anoAnterior={luPorLAA} />
          </div>
        );
      })()}

      {/* Cards específicos da aba Automotivos */}
      {aba === 'automotivos' && (() => {
        const d   = totaisGerais.porCat.automotivos       || { valor: 0, lucro: 0, itens: 0 };
        const aa  = totaisAnoAnterior.porCat.automotivos  || { valor: 0, lucro: 0, itens: 0 };
        const ma  = totaisMesAnterior.porCat.automotivos  || { valor: 0, lucro: 0, itens: 0 };
        const margem    = d.valor   > 0 ? d.lucro  / d.valor   : 0;
        const margemAA  = aa.valor  > 0 ? aa.lucro / aa.valor  : 0;
        const ticket    = d.itens   > 0 ? d.valor  / d.itens   : 0;
        const ticketAA  = aa.itens  > 0 ? aa.valor / aa.itens  : 0;
        const projetar  = (v, dias) => projParams.dec > 0 ? v * (dias / projParams.dec) : v;
        const projAtual = projetar(d.valor,  projParams.diasAtual);
        const projMA    = projetar(ma.valor, projParams.diasMA);
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <KpiComAA cor="blue" icone={ShoppingCart} label="Faturamento"
              valor={formatCurrency(d.valor)} valorBase={formatCurrency(aa.valor)}
              prefixoBase="Ano anterior" rotuloBase="AA"
              atual={d.valor} base={aa.valor} />
            <KpiComAA cor="blue" icone={TrendingUp} label="Lucro bruto"
              valor={formatCurrency(d.lucro)} valorBase={formatCurrency(aa.lucro)}
              prefixoBase="Ano anterior" rotuloBase="AA"
              negativo={d.lucro < 0}
              atual={d.lucro} base={aa.lucro} />
            <KpiComAA cor="blue" icone={Percent} label="Margem"
              valor={`${(margem * 100).toFixed(1)}%`}
              valorBase={`${(margemAA * 100).toFixed(1)}%`}
              prefixoBase="Ano anterior" rotuloBase="AA"
              atual={margem} base={margemAA} />
            <KpiComAA cor="blue" icone={Coins} label="Ticket médio"
              valor={formatCurrency(ticket)} valorBase={formatCurrency(ticketAA)}
              prefixoBase="Ano anterior" rotuloBase="AA"
              atual={ticket} base={ticketAA} />
            <KpiComAA cor="blue" icone={LineChartIcon} label="Projeção faturamento"
              valor={formatCurrency(projAtual)} valorBase={formatCurrency(projMA)}
              prefixoBase="Mês anterior" rotuloBase="MA"
              atual={projAtual} base={projMA} />
          </div>
        );
      })()}

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
            Classifique os grupos de produto correspondentes em <em>/admin/clientes → Redes Autosystem → Classificar grupos</em>.
          </p>
        </div>
      )}

      {/* Evolução 12 meses (acima da tree) */}
      {aba === 'geral' && (
        <GraficoEvolucao12m serie={serieEvolucao} loading={loadingEvolucao} />
      )}

      {/* Conteúdo: a tree de análise só aparece na aba "Visão geral".
          Estados de loading/erro/vazio continuam visíveis em qualquer aba para
          dar feedback ao usuário sobre o carregamento dos dados. */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
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
      ) : aba !== 'geral' ? null : arvoreVisivel.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 mb-3">
            <ShoppingCart className="h-6 w-6 text-violet-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma venda no período selecionado</p>
          <p className="text-xs text-gray-500 mt-1">
            Tente ajustar o intervalo de datas ou as empresas selecionadas.
          </p>
        </div>
      ) : (
        <TreeVendas
          arvore={arvoreVisivel}
          multiEmpresa={multiEmpresa}
          expandidos={expandidos}
          setExpandidos={setExpandidos}
          onToggle={toggleExpandido}
          projParams={projParams}
        />
      )}
    </div>
  );
}

// ─── Componentes ──────────────────────────────────────────────
function toggleSet(prev, key) {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

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
function CelulaUnica({ valor, ma, aa, moeda = true, decimais = 0, sub, divisor, tomProj = false }) {
  const negativo = moeda && valor < 0;
  const txt = moeda ? formatCurrency(valor) : formatNumero(valor, decimais);
  const cls = [
    'px-2.5 py-2 text-right align-top',
    divisor === 'forte' ? 'border-l-2 border-gray-300' : '',
    divisor === 'leve'  ? 'border-l border-gray-200'   : '',
    tomProj ? 'bg-violet-50/30' : '',
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

// Gráfico de área com a evolução de Lucro bruto (eixo esquerdo em R$) e
// Margem (eixo direito em %) dos últimos 12 meses.
function GraficoEvolucao12m({ serie, loading }) {
  const temDados = (serie || []).some(p => p.faturamento > 0 || p.lucro !== 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <LineChartIcon className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-800">Evolução · últimos 12 meses</h3>
        <span className="text-[11px] text-gray-400">· Lucro bruto e margem</span>
      </div>
      {loading ? (
        <div className="h-72 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
          Carregando evolução...
        </div>
      ) : !temDados ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-500">
          Sem dados nos últimos 12 meses.
        </div>
      ) : (
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={serie} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradLucro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradMargem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1"
                tickFormatter={(v) => Math.abs(v) >= 1000
                  ? `R$ ${(v / 1000).toFixed(0)}k`
                  : `R$ ${v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1"
                tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Lucro bruto') return [formatCurrency(value), name];
                  if (name === 'Margem')       return [`${Number(value).toFixed(1)}%`, name];
                  return [value, name];
                }}
                labelStyle={{ fontSize: 12, fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="left"  type="monotone" dataKey="lucro"     name="Lucro bruto"
                stroke="#8b5cf6" strokeWidth={2} fill="url(#gradLucro)" />
              <Area yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                stroke="#10b981" strokeWidth={2} fill="url(#gradMargem)" />
            </AreaChart>
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
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-violet-50/30 transition-colors`}>
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
          <LayoutGrid className="h-4 w-4 text-violet-500" />
          Análise de vendas
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={expandirTudo}
            className="text-[11px] font-medium text-violet-700 hover:text-violet-900 hover:bg-violet-50 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
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
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-violet-50/30">Proj. mês</th>
              <th className="px-2.5 py-1 text-right border-l-2 border-gray-300">Atual</th>
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-violet-50/30">Proj. mês</th>
              <th className="px-2.5 py-1 text-right border-l-2 border-gray-300">Atual</th>
              <th className="px-2.5 py-1 text-right border-l border-gray-200 bg-violet-50/30">Proj. mês</th>
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
                  <tr className="cursor-pointer bg-gradient-to-r from-violet-100/70 to-violet-50/40 hover:from-violet-100 hover:to-violet-50/70 border-t-2 border-violet-200 transition-colors"
                    onClick={() => onToggle(empKey)}>
                    <td className={`py-3 pr-3 ${padEmp}`}>
                      <div className="flex items-center gap-2">
                        <Chev aberto={empAberto} classes="h-4 w-4 text-violet-600" />
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
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

function KpiLucro({ cat, lucro, margem, lucroAnoAnterior }) {
  const Icone = cat.icone;
  const Pal = CAT_PALETA[cat.cor];
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">Lucro bruto · {cat.label}</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {formatCurrency(lucro)}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-gray-400">margem {(margem * 100).toFixed(1)}%</span>
            <BadgeComparacaoAA atual={lucro} anoAnterior={lucroAnoAnterior} />
          </div>
        </div>
      </div>
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
function CelulaNumero({ valor, moeda = true, decimais = 0, sufixo = '', sub, negativoBg = true, divisor = 'leve' }) {
  const negativo = negativoBg && valor < 0;
  const txt = moeda ? formatCurrency(valor) : `${formatNumero(valor, decimais)}${sufixo}`;
  const cls = [
    'px-2.5 py-2 text-right align-top whitespace-nowrap',
    divisor === 'forte' ? 'border-l-2 border-gray-300' : '',
    divisor === 'leve'  ? 'border-l border-gray-100'   : '',
  ].filter(Boolean).join(' ');
  return (
    <td className={cls}>
      <p className={`font-mono tabular-nums text-[12px] font-semibold leading-tight ${negativo ? 'text-red-700' : 'text-gray-900'}`}>
        {txt}
      </p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
    </td>
  );
}

// Tree do "Realizado dia a dia" — agrupa por data, expande para os produtos.
// Colunas: Dia da semana, Litros (+ ΔSemana), Faturamento, Lucro bruto,
// Acréscimos, Descontos, Margem, Preço médio, Custo médio, Lucro/L.
function TreeRealizadoDia({ arvore, expandidos, onToggle }) {
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
                  <CelulaNumero valor={dNode.stats.acresc} divisor="forte" />
                  <CelulaNumero valor={dNode.stats.desc} divisor="leve" />
                  <CelulaNumero valor={aux.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                  <CelulaNumero valor={aux.precoMed} divisor="forte" />
                  <CelulaNumero valor={aux.custoMed} divisor="leve" />
                  <CelulaNumero valor={aux.lucroL} divisor="leve" />
                </tr>
                {aberto && dNode.produtos.map((p, idx) => {
                  const auxP = calcAux({ qtd: p.qtd, valor: p.valor, custo: p.custo });
                  return (
                    <tr key={`${diaKey}/p:${p.codigo}`}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30 transition-colors`}>
                      <td className="pl-10 pr-3 py-1.5">
                        <p className="text-[12px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                        <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                      </td>
                      <td className="px-2.5 py-1.5 border-l-2 border-gray-300"></td>
                      <CelulaNumero valor={p.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                      <td className="px-2.5 py-1.5 text-right border-l border-gray-100">
                        <ChipVariacaoSemanal pct={p.varSemana} />
                      </td>
                      <CelulaNumero valor={p.valor} divisor="forte" />
                      <CelulaNumero valor={auxP.lucro} divisor="forte" />
                      <CelulaNumero valor={p.acresc} divisor="forte" />
                      <CelulaNumero valor={p.desc} divisor="leve" />
                      <CelulaNumero valor={auxP.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                      <CelulaNumero valor={auxP.precoMed} divisor="forte" />
                      <CelulaNumero valor={auxP.custoMed} divisor="leve" />
                      <CelulaNumero valor={auxP.lucroL} divisor="leve" />
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
const COR_LINHA       = '#a78bfa'; // violet-400 (lucro / margem)
const COR_LINHA_DOT   = '#c4b5fd'; // violet-300 (dot padrão)
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
                <LineChartIcon className="h-4 w-4 text-violet-500" />
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

function KpiLucroGlobal({ lucro, margem, lucroAnoAnterior }) {
  return (
    <div className="bg-white rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-50 p-2.5 flex-shrink-0">
          <ShoppingCart className="h-5 w-5 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-violet-700 font-semibold mb-0.5">Lucro bruto · Global</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {formatCurrency(lucro)}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-gray-500">margem {(margem * 100).toFixed(1)}%</span>
            <BadgeComparacaoAA atual={lucro} anoAnterior={lucroAnoAnterior} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Multi-select de empresas (idêntico ao usado em contas a pagar/receber)
function EmpresaMultiSelect({ clientesRede, selecionadas, onToggle, onToggleTodas }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (clientesRede.length === 0) return null;

  const todasMarcadas = selecionadas.size === clientesRede.length;
  const label = selecionadas.size === 0
    ? 'Nenhuma'
    : todasMarcadas
    ? `Todas (${clientesRede.length})`
    : selecionadas.size === 1
    ? clientesRede.find(c => selecionadas.has(c.id))?.nome || '1 selecionada'
    : `${selecionadas.size} empresas`;

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Empresas
        </span>
        <button type="button" onClick={() => setAberto(o => !o)}
          className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[180px] max-w-[260px] ${
            aberto ? 'border-violet-400 ring-2 ring-violet-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
          }`}>
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </label>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <button type="button" onClick={onToggleTodas}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todasMarcadas}
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {clientesRede.map(emp => {
                const marcada = selecionadas.has(emp.id);
                return (
                  <label key={emp.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(emp.id)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate">{emp.nome}</p>
                      {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
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
