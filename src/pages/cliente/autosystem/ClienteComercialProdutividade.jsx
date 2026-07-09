import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Users, Fuel, Package, Store,
  Search, Coins, Calendar, Boxes, LineChart as LineChartIcon, Droplet, Gauge,
  Trophy, Medal, Award, Info, FileDown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import * as autosystemService from '../../../services/autosystemService';
import * as usuariosService from '../../../services/usuariosSistemaService';
import { formatCurrency } from '../../../utils/format';
import SeletorMesAno from '../../../components/vendas/SeletorMesAno';
import { primeiroDiaMesIso, ultimoDiaMesIso } from '../../../utils/periodoMes';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import { gerarPdfProdutividade } from '../../../utils/pdfProdutividade';

const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function diasEntre(de, ate) {
  if (!de || !ate) return 0;
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = ate.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// Paletas das categorias (alinhadas com o resto do portal)
const CAT_PALETA = {
  combustivel:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icone: Fuel,    chartFill: '#fcd34d' },
  automotivos:  { bg: 'bg-blue-50',    text: 'text-blue-700',    icone: Package, chartFill: '#5eead4' },
  conveniencia: { bg: 'bg-emerald-50', text: 'text-emerald-700', icone: Store,   chartFill: '#86efac' },
};

// Abas: Rank (ranking geral) e Conveniência. `perm` = permissão por-aba.
const ABAS = [
  { key: 'rank',         label: 'Rank',          icone: Trophy, borda: 'border-yellow-500',  texto: 'text-yellow-700', perm: 'produtividade_rank' },
  { key: 'conveniencia', label: 'Conveniência',  icone: Store, borda: 'border-emerald-600', texto: 'text-emerald-700', perm: 'produtividade_conveniencia' },
];

export default function ClienteComercialProdutividade() {
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

  // Período: usuário escolhe data inicial e final. Default = mês atual.
  // Filtros — período por MÊS + ANO (mês fechado)
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [apenasFechados, setApenasFechados] = useState(true);
  const dataDe = useMemo(() => primeiroDiaMesIso(ano, mes), [ano, mes]);
  const dataAte = useMemo(() => {
    const ultimo = ultimoDiaMesIso(ano, mes);
    if (!apenasFechados) return ultimo;
    const d = new Date(); d.setDate(d.getDate() - 1);
    const ontem = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return ultimo < ontem ? ultimo : ontem;   // mês passado: mês inteiro; mês atual: até ontem
  }, [ano, mes, apenasFechados]);
  const periodoDias = useMemo(() => diasEntre(dataDe, dataAte), [dataDe, dataAte]);
  const diasMes = new Date(ano, mes, 0).getDate();
  // Tendência = projeção linear do fechamento do mês. Só extrapola se o período
  // ainda não cobre o mês inteiro (ex.: "apenas dias fechados", mês corrente).
  const projetar = (val) => (periodoDias > 0 && periodoDias < diasMes ? (val * diasMes) / periodoDias : val);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  // Abas liberadas para o usuário (permissão por-aba, default-deny).
  const abasPermitidas = useMemo(() => {
    const perms = new Set(usuariosService.permissoesEfetivas(session?.usuario));
    return ABAS.filter(a => perms.has(a.perm));
  }, [session?.usuario]);
  const [aba, setAba] = useState(() => abasPermitidas[0]?.key || null);
  // Se a aba ativa não está mais liberada, cai na primeira permitida.
  useEffect(() => {
    if (abasPermitidas.length > 0 && !abasPermitidas.some(a => a.key === aba)) {
      setAba(abasPermitidas[0].key);
    }
  }, [abasPermitidas, aba]);

  // Mapa de grupos por categoria + nomes (vem da classificação salva no Supabase)
  const [gruposPorCat, setGruposPorCat] = useState({
    combustivel: [], automotivos: [], conveniencia: [],
  });
  const [mapaNomeGrupos, setMapaNomeGrupos] = useState(new Map());
  const [mapaCatGrupos, setMapaCatGrupos]   = useState(new Map());
  // Classificação de Mix: produto_codigo (number) → 'aditivada' | 'comum'
  const [mapaMix, setMapaMix] = useState(new Map());

  // Expansão de linhas da tabela.
  const [expandidos, setExpandidos] = useState(new Set());
  // Detalhes carregados sob demanda. Map<`${empresa}::${vendedor}`, { produtos, automotivos_mensal, loading, erro }>
  const [detalhes, setDetalhes] = useState(new Map());

  const redeId = asRede?.id;

  // Carrega mapeamento de grupos → categoria + nomes + classificação de Mix uma vez por rede
  useEffect(() => {
    if (!redeId) {
      setGruposPorCat({ combustivel: [], automotivos: [], conveniencia: [] });
      setMapaNomeGrupos(new Map());
      setMapaCatGrupos(new Map());
      setMapaMix(new Map());
      return;
    }
    (async () => {
      try {
        const [lista, mixSalvo] = await Promise.all([
          autosystemService.listarGruposProdutoRede(redeId),
          autosystemService.listarMixProdutos(redeId).catch(() => []),
        ]);
        const out = { combustivel: [], automotivos: [], conveniencia: [] };
        const mNome = new Map();
        const mCat  = new Map();
        (lista || []).forEach(g => {
          if (g.grid == null) return;
          const grid = Number(g.grid);
          if (out[g.categoria]) out[g.categoria].push(grid);
          if (g.nome) mNome.set(grid, g.nome);
          mCat.set(grid, g.categoria);
        });
        setGruposPorCat(out);
        setMapaNomeGrupos(mNome);
        setMapaCatGrupos(mCat);
        const mMix = new Map();
        (mixSalvo || []).forEach(c => mMix.set(Number(c.produto_codigo), c.tipo));
        setMapaMix(mMix);
      } catch { /* noop */ }
    })();
  }, [redeId]);

  async function carregar() {
    if (!redeId || empresasSel.length === 0) return;
    if (!dataDe || !dataAte || dataDe > dataAte) return;
    setLoading(true);
    setErro('');
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      const produtos_aditivada = [];
      const produtos_comum = [];
      mapaMix.forEach((tipo, codigo) => {
        if (tipo === 'aditivada') produtos_aditivada.push(codigo);
        else if (tipo === 'comum') produtos_comum.push(codigo);
      });
      const rows = await autosystemService.buscarProdutividadeAutosystem(redeId, codigos, {
        data_de: dataDe, data_ate: dataAte,
        grupos_combustivel:  gruposPorCat.combustivel,
        grupos_automotivos:  gruposPorCat.automotivos,
        grupos_conveniencia: gruposPorCat.conveniencia,
        produtos_aditivada, produtos_comum,
      });
      setVendedores(rows || []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar produtividade');
      setVendedores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [redeId, empresasSelIds, dataDe, dataAte, gruposPorCat, mapaMix]);

  // Limpa expansões e cache de detalhes quando filtros que afetam os dados mudam.
  useEffect(() => {
    setExpandidos(new Set());
    setDetalhes(new Map());
  }, [redeId, empresasSelIds, dataDe, dataAte]);

  // Janela fixa de 12 meses para o mini-gráfico de Automotivos no detalhe.
  const auto12m = useMemo(() => {
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return {
      de:  `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-01`,
      ate: `${fim.getFullYear()}-${pad(fim.getMonth() + 1)}-${pad(fim.getDate())}`,
    };
  }, []);

  async function toggleVendedor(v) {
    const key = `${v.empresa}::${v.vendedor_codigo}`;
    const jaAberto = expandidos.has(key);
    setExpandidos(prev => {
      const next = new Set(prev);
      if (jaAberto) next.delete(key); else next.add(key);
      return next;
    });
    if (jaAberto) return;
    if (detalhes.has(key) && !detalhes.get(key).erro) return; // já carregado
    setDetalhes(prev => new Map(prev).set(key, { loading: true }));
    // Produtos classificados como aditivada/comum (p/ o mix mensal no detalhe).
    const produtosAditivada = [], produtosComum = [];
    mapaMix.forEach((tipo, cod) => {
      if (tipo === 'aditivada') produtosAditivada.push(cod);
      else if (tipo === 'comum') produtosComum.push(cod);
    });
    try {
      const data = await autosystemService.buscarProdutividadeDetalheAutosystem(redeId, {
        empresa_codigo:  v.empresa,
        vendedor_codigo: v.vendedor_codigo,
        data_de:  dataDe,
        data_ate: dataAte,
        automotivos_data_de:  auto12m.de,
        automotivos_data_ate: auto12m.ate,
        grupos_automotivos:  gruposPorCat.automotivos,
        grupos_conveniencia: gruposPorCat.conveniencia,
        produtos_aditivada: produtosAditivada,
        produtos_comum:     produtosComum,
      });
      setDetalhes(prev => new Map(prev).set(key, { ...data, loading: false }));
    } catch (err) {
      setDetalhes(prev => new Map(prev).set(key, { erro: err.message || 'Falha ao carregar detalhe', loading: false }));
    }
  }

  // Empresa map (para mostrar nome na tabela quando multi-empresa)
  const mapaEmpresas = useMemo(() => {
    const m = new Map();
    empresasDisponiveis.forEach(e => {
      const c = Number(e.empresa_codigo);
      if (Number.isFinite(c)) m.set(c, e.nome || `Empresa ${c}`);
    });
    return m;
  }, [empresasDisponiveis]);
  const multiEmpresa = empresasSel.length > 1;

  // Enriquece cada vendedor com totais escopados por aba (pista / conveniencia).
  // Pista = combustível + automotivos. Conveniência = só conveniência.
  const vendedoresEnriquecidos = useMemo(() => {
    return (vendedores || []).map(v => {
      const fatComb   = Number(v.fat_combustivel)   || 0;
      const custoComb = Number(v.custo_combustivel) || 0;
      const fatAuto   = Number(v.fat_automotivos)   || 0;
      const custoAuto = Number(v.custo_automotivos) || 0;
      const fatConv   = Number(v.fat_conveniencia)  || 0;
      const custoConv = Number(v.custo_conveniencia)|| 0;

      const litrosAditivada = Number(v.litros_aditivada) || 0;
      const litrosComum     = Number(v.litros_comum) || 0;
      const baseMix         = litrosAditivada + litrosComum;
      const mix             = baseMix > 0 ? (litrosAditivada / baseMix) * 100 : null;

      const pista = {
        fat:   fatComb + fatAuto,
        custo: custoComb + custoAuto,
        vendas: (Number(v.vendas_combustivel) || 0) + (Number(v.vendas_automotivos) || 0),
        // Quebras
        fatCombustivel:   fatComb,
        lucroCombustivel: fatComb - custoComb,
        qtdCombustivel:   Number(v.qtd_combustivel)    || 0,
        abastecimentos:   Number(v.abastecimentos)     || 0,
        fatAutomotivos:   fatAuto,
        lucroAutomotivos: fatAuto - custoAuto,
        vendasAutomotivos: Number(v.vendas_automotivos)|| 0,
        // Mix
        litrosAditivada, litrosComum, mix,
      };
      pista.lucro  = pista.fat - pista.custo;
      pista.margem = pista.fat > 0 ? (pista.lucro / pista.fat) * 100 : 0;
      pista.ticket = pista.vendas > 0 ? pista.fat / pista.vendas : 0;

      const conv = {
        fat:   fatConv,
        custo: custoConv,
        lucro: fatConv - custoConv,
        vendas: Number(v.vendas_conveniencia) || 0,
        qtd:   Number(v.qtd_conveniencia) || 0,
        atendimentos: Number(v.atendimentos_conveniencia) || 0,  // notas fiscais (mlid distintos)
      };
      conv.margem = conv.fat > 0 ? (conv.lucro / conv.fat) * 100 : 0;
      conv.ticket = conv.vendas > 0 ? conv.fat / conv.vendas : 0;

      return { ...v, pista, conv };
    });
  }, [vendedores]);

  // Escopo ativo (pista ou conv).
  const escopo = aba === 'conveniencia' ? 'conv' : 'pista';

  // Filtrados (busca) + ordenados por faturamento do escopo ativo.
  const vendedoresFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = !q
      ? vendedoresEnriquecidos
      : vendedoresEnriquecidos.filter(v => (v.vendedor_nome || '').toLowerCase().includes(q));
    return [...filtrados].sort((a, b) => (b[escopo].fat - a[escopo].fat));
  }, [vendedoresEnriquecidos, busca, escopo]);

  // ─── Análise comparativa por vendedor (tabela com heatmap + sort) ───
  const COLS_ANALISE = [
    { campo: 'automotivos',    titulo: 'Automotivos',      icone: Package, cor: 'blue',    fmt: (n) => formatCurrency(n) },
    { campo: 'mix',            titulo: 'Mix aditivada',    icone: Droplet, cor: 'violet',  fmt: (n) => n != null ? `${n.toFixed(1)}%` : '—' },
    { campo: 'abastecimentos', titulo: 'Abastecimentos',   icone: Coins,   cor: 'amber',   fmt: (n) => fmtNum(n) },
    { campo: 'lucro',          titulo: 'Lucro bruto',      icone: Coins,   cor: 'emerald', fmt: (n) => formatCurrency(n) },
    { campo: 'ticketComb',     titulo: 'Ticket méd. comb.',icone: Fuel,    cor: 'amber',   fmt: (n) => formatCurrency(n) },
    { campo: 'ticketAuto',     titulo: 'Ticket méd. auto.',icone: Package, cor: 'blue',    fmt: (n) => formatCurrency(n) },
  ];
  function pegarValor(v, campo) {
    const s = v.pista;
    switch (campo) {
      case 'automotivos':    return s.fatAutomotivos;
      case 'mix':            return s.mix;
      case 'abastecimentos': return s.abastecimentos;
      case 'lucro':          return s.lucro;
      case 'ticketComb':     return s.abastecimentos    > 0 ? s.fatCombustivel  / s.abastecimentos    : 0;
      case 'ticketAuto':     return s.vendasAutomotivos > 0 ? s.fatAutomotivos  / s.vendasAutomotivos : 0;
      case 'score':          return scoresPorVendedor.get(`${v.empresa}::${v.vendedor_codigo}`) || 0;
      default:               return 0;
    }
  }
  const [ordemCampo, setOrdemCampo] = useState('automotivos');
  const [ordemDir, setOrdemDir]     = useState('desc');
  function clickHeader(campo) {
    if (campo === ordemCampo) {
      setOrdemDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setOrdemCampo(campo);
      setOrdemDir('desc');
    }
  }
  // Min/max por coluna para escala de cores de fundo (heatmap).
  const escalas = useMemo(() => {
    const out = {};
    COLS_ANALISE.forEach(c => {
      const vals = vendedoresEnriquecidos
        .map(v => pegarValor(v, c.campo))
        .filter(x => Number.isFinite(x) && x > 0);
      if (vals.length === 0) { out[c.campo] = { min: 0, max: 0 }; return; }
      out[c.campo] = { min: Math.min(...vals), max: Math.max(...vals) };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedoresEnriquecidos]);

  // Score 0-100 por vendedor — média das 6 métricas normalizadas (min-max).
  // Vendedor com valor zero/inválido recebe 0 naquela métrica. Lucro negativo
  // também conta como 0 (não penaliza além disso). Útil pra ranquear quem
  // performa bem em todas as dimensões da Pista.
  const scoresPorVendedor = useMemo(() => {
    const out = new Map(); // key: `${empresa}::${vendedor_codigo}` → score
    vendedoresEnriquecidos.forEach(v => {
      let soma = 0;
      let qtdMetricas = 0;
      COLS_ANALISE.forEach(c => {
        const val = pegarValor(v, c.campo);
        const esc = escalas[c.campo] || { min: 0, max: 0 };
        const range = esc.max - esc.min;
        let norm = 0;
        if (range > 0 && Number.isFinite(val) && val > 0) {
          norm = Math.max(0, Math.min(1, (val - esc.min) / range));
        }
        soma += norm;
        qtdMetricas++;
      });
      const score = qtdMetricas > 0 ? (soma / qtdMetricas) * 100 : 0;
      out.set(`${v.empresa}::${v.vendedor_codigo}`, score);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedoresEnriquecidos, escalas]);

  // Ranking 1-based pelo score (medalhas top 3).
  const rankingScore = useMemo(() => {
    const arr = vendedoresEnriquecidos
      .map(v => ({
        key: `${v.empresa}::${v.vendedor_codigo}`,
        score: scoresPorVendedor.get(`${v.empresa}::${v.vendedor_codigo}`) || 0,
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const m = new Map();
    arr.forEach((x, i) => m.set(x.key, i + 1));
    return m;
  }, [vendedoresEnriquecidos, scoresPorVendedor]);
  const tabelaVendedores = useMemo(() => {
    // Esconde vendedores sem dados em nenhuma das colunas da análise comparativa.
    const comDados = vendedoresEnriquecidos.filter(v =>
      COLS_ANALISE.some(c => {
        const x = pegarValor(v, c.campo);
        return Number.isFinite(x) && x !== 0;
      })
    );
    return comDados.sort((a, b) => {
      const va = pegarValor(a, ordemCampo);
      const vb = pegarValor(b, ordemCampo);
      // null/NaN sempre depois
      const na = !Number.isFinite(va);
      const nb = !Number.isFinite(vb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      return ordemDir === 'asc' ? va - vb : vb - va;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedoresEnriquecidos, ordemCampo, ordemDir]);

  // KPIs (escopados pela aba). Pista também mostra litros + abastecimentos.
  const kpis = useMemo(() => {
    let totFat = 0, totLucro = 0, totVendas = 0, totLitros = 0, totAbast = 0;
    let totFatAuto = 0, totLucroAuto = 0, totVendasAuto = 0;
    let totAditiv = 0, totComum = 0;
    let totQtd = 0, totAtend = 0; // conveniência: quantidade total + atendimentos (notas)
    // Conta vendedores com atividade no escopo (fat > 0 ou vendas > 0).
    let comAtividade = 0;
    vendedoresEnriquecidos.forEach(v => {
      const s = v[escopo];
      totFat   += s.fat;
      totLucro += s.lucro;
      totVendas += s.vendas;
      totQtd   += s.qtd || 0;
      totAtend += s.atendimentos || 0;
      if (s.fat > 0 || s.vendas > 0) comAtividade++;
      if (escopo === 'pista') {
        totLitros += s.qtdCombustivel;
        totAbast  += s.abastecimentos;
        totFatAuto    += s.fatAutomotivos;
        totLucroAuto  += s.lucroAutomotivos;
        totVendasAuto += s.vendasAutomotivos || 0;
        totAditiv += s.litrosAditivada || 0;
        totComum  += s.litrosComum     || 0;
      }
    });
    const margem = totFat > 0 ? (totLucro / totFat) * 100 : 0;
    const margemAuto = totFatAuto > 0 ? (totLucroAuto / totFatAuto) * 100 : 0;
    const baseMix = totAditiv + totComum;
    const mix = baseMix > 0 ? (totAditiv / baseMix) * 100 : null;
    return {
      totalVendedores: comAtividade,
      faturamento: totFat, lucro: totLucro, margem,
      vendas: totVendas, litros: totLitros, abastecimentos: totAbast,
      fatAutomotivos: totFatAuto, margemAutomotivos: margemAuto,
      vendasAutomotivos: totVendasAuto,
      ticketAutomotivos: totFatAuto > 0 && totVendasAuto > 0 ? totFatAuto / totVendasAuto : 0,
      qtdConveniencia: totQtd, atendimentos: totAtend,
      mix, litrosAditivada: totAditiv, litrosComum: totComum,
    };
  }, [vendedoresEnriquecidos, escopo]);

  // Rankings da aba Rank (desc, só quem tem valor > 0). Baseados na Pista.
  const rankings = useMemo(() => {
    const mk = (getter) => vendedoresEnriquecidos
      .map(v => ({
        key: `${v.empresa}::${v.vendedor_codigo}`,
        nome: v.vendedor_nome,
        codigo: v.vendedor_codigo_real || '',
        valor: getter(v),
      }))
      .filter(r => r.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    return {
      automotivos:  mk(v => v.pista.fatAutomotivos),
      aditivada:    mk(v => v.pista.litrosAditivada),
      atendimentos: mk(v => v.pista.abastecimentos),
    };
  }, [vendedoresEnriquecidos]);

  // Funcionários que venderam combustível E automotivos (tabela-tree do Rank).
  const funcsPistaAuto = useMemo(
    () => vendedoresEnriquecidos
      .filter(v => v.pista.fatAutomotivos > 0 && (v.pista.abastecimentos > 0 || v.pista.qtdCombustivel > 0))
      .sort((a, b) => b.pista.fatAutomotivos - a.pista.fatAutomotivos),
    [vendedoresEnriquecidos],
  );
  // Máximo por coluna (base das barras de dados da hierarquia principal).
  const maxCol = useMemo(() => {
    const m = { auto: 0, aditiv: 0, mix: 0, abast: 0, ticket: 0 };
    funcsPistaAuto.forEach(v => {
      const s = v.pista;
      const ticket = s.vendasAutomotivos > 0 ? s.fatAutomotivos / s.vendasAutomotivos : 0;
      m.auto   = Math.max(m.auto,   s.fatAutomotivos);
      m.aditiv = Math.max(m.aditiv, s.litrosAditivada);
      m.mix    = Math.max(m.mix,    s.mix || 0);
      m.abast  = Math.max(m.abast,  s.abastecimentos);
      m.ticket = Math.max(m.ticket, ticket);
    });
    return m;
  }, [funcsPistaAuto]);

  // Carrega a logo (public/) como dataURL + dimensões p/ embutir no PDF.
  // Mesma origem → canvas não fica "tainted". Falha silenciosa → PDF sem logo.
  function carregarLogo(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Exporta o relatório da aba ativa em PDF.
  async function exportarPdf() {
    if (!aba) return;
    const dd = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
    const logo = await carregarLogo(`${import.meta.env.BASE_URL}logo-cci-landing.png`);
    const doc = gerarPdfProdutividade({
      aba,
      contexto: {
        rede:    asRede?.nome || '',
        empresa: empresaAtual?.nome || (empresaAtual ? `Empresa ${empresaAtual.empresa_codigo}` : ''),
        periodo: `${MESES_LONGO[mes - 1]}/${ano} (${dd(dataDe)}–${dd(dataAte)})`,
      },
      kpis,
      rankings,
      funcionarios: funcsPistaAuto,
      vendedoresConv: vendedoresFiltrados,
      projetar,
      logo,
    });
    const slug = (asRede?.nome || 'rede').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    doc.save(`produtividade-${aba}-${slug}-${ano}${pad(mes)}.pdf`);
  }

  // Habilita o botão de PDF só quando há aba liberada + dados carregados.
  const podeExportar = !loading && !erro && aba && vendedoresEnriquecidos.length > 0;

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Produtividade" description="Vendas por vendedor" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Produtividade" description={asRede?.nome || 'Vendas por vendedor'} sticky>
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
        <button onClick={exportarPdf} disabled={!podeExportar}
          title="Exportar resumo da aba atual em PDF (1 página)"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <FileDown className="h-4 w-4" />
          PDF
        </button>
      </PageHeader>

      {loading ? (
        <SkeletonComercial linhas={8} />
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar a produtividade</p>
            <p className="text-red-700 mt-1">{erro}</p>
          </div>
        </div>
      ) : vendedoresEnriquecidos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum vendedor encontrado no período</p>
        </div>
      ) : (
        <>
          {/* Seletor de abas — só as liberadas pro usuário (permissão por-aba) */}
          {abasPermitidas.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center mb-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-3">
                <Users className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-gray-900">Nenhuma aba liberada</p>
              <p className="text-[13px] text-gray-500 mt-1">Peça ao administrador para liberar as abas de Produtividade.</p>
            </div>
          )}
          {abasPermitidas.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
            <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
              {abasPermitidas.map(a => {
                const Icon = a.icone;
                const ativo = aba === a.key;
                return (
                  <button key={a.key} onClick={() => setAba(a.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                      ativo
                        ? `${a.borda} ${a.texto}`
                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                    }`}>
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{a.label}</span>
                    {a.key === 'pista' && (
                      <span className="text-[10px] text-gray-400 font-normal">· Combust. + Automot.</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {aba === 'rank' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                <Kpi icone={Package} cor="blue" label="Faturamento automotivos"
                  valor={formatCurrency(kpis.fatAutomotivos)} />
                <Kpi icone={Droplet} cor="violet" label="Litros de aditivada"
                  valor={`${fmtNum(kpis.litrosAditivada, 0)} L`} />
                <Kpi icone={Gauge} cor="violet" label="Mix de aditivada"
                  valor={kpis.mix != null ? `${kpis.mix.toFixed(1)}%` : '—'} />
                <Kpi icone={Coins} cor="blue" label="Abastecimentos"
                  valor={fmtNum(kpis.abastecimentos)} />
                <Kpi icone={Package} cor="emerald" label="Ticket médio automotivos"
                  valor={formatCurrency(kpis.ticketAutomotivos)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                <TabelaRank titulo="Vendas de automotivos" icone={Package} cor="blue"
                  itens={rankings.automotivos} fmt={(v) => formatCurrency(v)} />
                <TabelaRank titulo="Venda de aditivada" icone={Droplet} cor="violet"
                  itens={rankings.aditivada} fmt={(v) => `${fmtNum(v, 0)} L`} />
                <TabelaRank titulo="Atendimentos" icone={Coins} cor="amber"
                  itens={rankings.atendimentos} fmt={(v) => fmtNum(v)} />
              </div>

              {/* Tabela-tree: funcionários (combustível + automotivos) */}
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
                  <Users className="h-4 w-4 text-blue-500" />
                  <h3 className="text-[13px] font-semibold text-gray-800">Funcionários · Combustíveis + Automotivos</h3>
                  <span className="text-[11px] text-gray-400">· clique para expandir · tendência = projeção do mês</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[880px]">
                    <thead className="bg-gray-50/80 border-b border-gray-200">
                      <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-right border-l border-gray-200">Automotivos</th>
                        <th className="px-3 py-2 text-right text-blue-500">Tend.</th>
                        <th className="px-3 py-2 text-right border-l border-gray-200">Litros aditiv.</th>
                        <th className="px-3 py-2 text-right text-blue-500">Tend.</th>
                        <th className="px-3 py-2 text-right border-l border-gray-200">Mix</th>
                        <th className="px-3 py-2 text-right border-l border-gray-200">Abast.</th>
                        <th className="px-3 py-2 text-right text-blue-500">Tend.</th>
                        <th className="px-3 py-2 text-right border-l border-gray-200">Ticket auto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funcsPistaAuto.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-[12px] text-gray-400">Nenhum funcionário com combustível + automotivos no período.</td></tr>
                      ) : funcsPistaAuto.map(v => {
                        const s = v.pista;
                        const key = `${v.empresa}::${v.vendedor_codigo}`;
                        const aberto = expandidos.has(key);
                        const ticketAuto = s.vendasAutomotivos > 0 ? s.fatAutomotivos / s.vendasAutomotivos : 0;
                        return (
                          <React.Fragment key={key}>
                            <tr className={`cursor-pointer transition-colors border-t border-gray-100 ${aberto ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'}`}
                              onClick={() => toggleVendedor(v)}>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {aberto ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                                  <div className="min-w-0">
                                    <p className="text-[12.5px] font-semibold text-gray-900 truncate max-w-[220px]">{v.vendedor_nome || <span className="italic text-gray-400">sem nome</span>}</p>
                                    <p className="text-[9.5px] text-gray-400 font-mono">cód {v.vendedor_codigo_real || '—'}</p>
                                  </div>
                                </div>
                              </td>
                              <CelulaBarra valor={s.fatAutomotivos} max={maxCol.auto} cor="bg-blue-500/15" className="border-l border-gray-100">{formatCurrency(s.fatAutomotivos)}</CelulaBarra>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-blue-700">{formatCurrency(projetar(s.fatAutomotivos))}</td>
                              <CelulaBarra valor={s.litrosAditivada} max={maxCol.aditiv} cor="bg-violet-500/15" className="border-l border-gray-100">{fmtNum(s.litrosAditivada, 0)} L</CelulaBarra>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-blue-700">{fmtNum(projetar(s.litrosAditivada), 0)} L</td>
                              <CelulaBarra valor={s.mix || 0} max={maxCol.mix} cor="bg-indigo-500/15" className="border-l border-gray-100">{s.mix != null ? `${s.mix.toFixed(1)}%` : '—'}</CelulaBarra>
                              <CelulaBarra valor={s.abastecimentos} max={maxCol.abast} cor="bg-amber-500/20" className="border-l border-gray-100">{fmtNum(s.abastecimentos)}</CelulaBarra>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-blue-700">{fmtNum(projetar(s.abastecimentos))}</td>
                              <CelulaBarra valor={ticketAuto} max={maxCol.ticket} cor="bg-emerald-500/15" className="border-l border-gray-100">{formatCurrency(ticketAuto)}</CelulaBarra>
                            </tr>
                            {aberto && (
                              <tr>
                                <td colSpan={9} className="bg-gray-50/50 border-t border-gray-100 px-3 py-3">
                                  <DetalheVendedor
                                    vendedor={v}
                                    detalhe={detalhes.get(key)}
                                    mapaCatGrupos={mapaCatGrupos}
                                    mapaNomeGrupos={mapaNomeGrupos}
                                    mapaMix={mapaMix}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {aba === 'conveniencia' && (
          <>
          {/* KPIs — Conveniência */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Kpi icone={Store} cor="emerald" label="Faturamento conveniência"
              valor={formatCurrency(kpis.faturamento)} />
            <Kpi icone={Package} cor="blue" label="Atendimentos"
              valor={fmtNum(kpis.atendimentos)} />
            <Kpi icone={Boxes} cor="violet" label="Média de qtd/venda"
              valor={kpis.atendimentos > 0 ? (kpis.qtdConveniencia / kpis.atendimentos).toFixed(1) : '—'} />
            <Kpi icone={Coins} cor="amber" label="Ticket médio"
              valor={formatCurrency(kpis.atendimentos > 0 ? kpis.faturamento / kpis.atendimentos : 0)} />
          </div>

          {/* Análise comparativa (só na aba Pista) */}
          {escopo === 'pista' && tabelaVendedores.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Análise comparativa</h3>
                <span className="text-[11px] text-gray-400">
                  por vendedor · clique no cabeçalho para ordenar
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-center select-none relative">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button type="button" onClick={() => clickHeader('score')}
                            className={`inline-flex items-center gap-1.5 hover:text-gray-800 transition-colors ${ordemCampo === 'score' ? 'text-blue-700' : ''}`}>
                            <Trophy className="h-3 w-3 text-amber-500" />
                            <span className="whitespace-nowrap">Score</span>
                            <span className="inline-flex flex-col items-center -my-0.5 leading-none">
                              <span className={`text-[8px] ${ordemCampo === 'score' && ordemDir === 'asc' ? 'text-blue-700' : 'text-gray-300'}`}>▲</span>
                              <span className={`text-[8px] -mt-0.5 ${ordemCampo === 'score' && ordemDir === 'desc' ? 'text-blue-700' : 'text-gray-300'}`}>▼</span>
                            </span>
                          </button>
                          <ScoreInfoTooltip />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left border-l border-gray-100">Vendedor</th>
                      {COLS_ANALISE.map(c => {
                        const Icone = c.icone;
                        const ativo = ordemCampo === c.campo;
                        const setaUp = ativo && ordemDir === 'asc';
                        const setaDown = ativo && ordemDir === 'desc';
                        return (
                          <th key={c.campo} className="px-2.5 py-2 border-l border-gray-100 select-none">
                            <button type="button" onClick={() => clickHeader(c.campo)}
                              className={`w-full inline-flex items-center justify-end gap-1.5 hover:text-gray-800 transition-colors ${ativo ? 'text-blue-700' : ''}`}>
                              <Icone className={`h-3 w-3 ${COR_ICONE[c.cor]}`} />
                              <span className="whitespace-nowrap">{c.titulo}</span>
                              <span className="inline-flex flex-col items-center -my-0.5 leading-none">
                                <span className={`text-[8px] ${setaUp ? 'text-blue-700' : 'text-gray-300'}`}>▲</span>
                                <span className={`text-[8px] -mt-0.5 ${setaDown ? 'text-blue-700' : 'text-gray-300'}`}>▼</span>
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tabelaVendedores.map(v => {
                      const score = scoresPorVendedor.get(`${v.empresa}::${v.vendedor_codigo}`) || 0;
                      // Posição no ranking de score (1-based). Top 3 ganham medalha.
                      const rankScore = rankingScore.get(`${v.empresa}::${v.vendedor_codigo}`);
                      return (
                        <tr key={`an-${v.empresa}-${v.vendedor_codigo}`} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-1.5 text-center">
                            <ScoreBadge score={score} rank={rankScore} />
                          </td>
                          <td className="px-3 py-1.5 border-l border-gray-100">
                            <p className="text-[12px] font-medium text-gray-900 truncate max-w-[240px]">
                              {v.vendedor_nome || <span className="italic text-gray-400">sem nome</span>}
                            </p>
                            <p className="text-[9.5px] text-gray-400 font-mono">cód {v.vendedor_codigo}</p>
                          </td>
                          {COLS_ANALISE.map(c => {
                            const val = pegarValor(v, c.campo);
                            const escala = escalas[c.campo] || { min: 0, max: 0 };
                            const style = corHeatmap(val, escala.min, escala.max, c.cor);
                            const negativo = (c.campo === 'lucro' || c.campo === 'automotivos') && val < 0;
                            const vazio = !Number.isFinite(val) || val === 0;
                            return (
                              <td key={c.campo} style={style}
                                className={`px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] border-l border-gray-100 ${
                                  vazio ? 'text-gray-300' : negativo ? 'text-red-700 font-semibold' : 'text-gray-900 font-semibold'
                                }`}>
                                {vazio ? '—' : c.fmt(val)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabela de vendedores */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Detalhamento por vendedor</h3>
                <span className="text-[11px] text-gray-400">
                  · {fmtNum(vendedoresFiltrados.length)} / {fmtNum(vendedoresEnriquecidos.length)} · últimos {periodoDias} dias
                </span>
              </div>
              <div className="flex-1" />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por vendedor..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-center w-10">#</th>
                    <th className="px-3 py-2 text-left">Vendedor</th>
                    {multiEmpresa && <th className="px-3 py-2 text-left border-l border-gray-100">Empresa</th>}
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300">Vendas</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Ticket médio</th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Lucro</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Margem</th>
                    {escopo === 'pista' && (
                      <>
                        <th className="px-3 py-2 text-right border-l-2 border-gray-300" title="Combustível">
                          <span className="inline-flex items-center gap-1 justify-end">
                            <Fuel className="h-3 w-3 text-amber-600" /> Combust.
                          </span>
                        </th>
                        <th className="px-3 py-2 text-right border-l-2 border-gray-300" title="Automotivos">
                          <span className="inline-flex items-center gap-1 justify-end">
                            <Package className="h-3 w-3 text-blue-600" /> Automot.
                          </span>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendedoresFiltrados.map((v, i) => {
                    const s = v[escopo];
                    const key = `${v.empresa}::${v.vendedor_codigo}`;
                    const aberto = expandidos.has(key);
                    const det = detalhes.get(key);
                    const totalCols = 1 + 1 + (multiEmpresa ? 1 : 0) + 5 + (escopo === 'pista' ? 2 : 0);
                    return (
                      <React.Fragment key={key}>
                        <tr className={`cursor-pointer transition-colors ${aberto ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'}`}
                          onClick={() => toggleVendedor(v)}>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {aberto
                                ? <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                              <span className="font-mono text-[11px] text-blue-700 font-semibold">{i + 1}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <p className="text-[12.5px] font-semibold text-gray-900 truncate max-w-[260px]">
                              {v.vendedor_nome || <span className="italic text-gray-400">sem nome</span>}
                            </p>
                            <p className="text-[9.5px] text-gray-400 font-mono">cód {v.vendedor_codigo}</p>
                          </td>
                          {multiEmpresa && (
                            <td className="px-3 py-1.5 text-[11.5px] text-gray-600 border-l border-gray-100 truncate max-w-[140px]">
                              {mapaEmpresas.get(Number(v.empresa)) || `Empresa ${v.empresa}`}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-700 border-l-2 border-gray-300">
                            {fmtNum(s.vendas)}
                            {escopo === 'pista' && s.abastecimentos > 0 && (
                              <span className="block text-[9.5px] text-gray-400">{fmtNum(s.abastecimentos)} abast.</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-700 border-l border-gray-100">
                            {formatCurrency(s.ticket)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">
                            {formatCurrency(s.fat)}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${s.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatCurrency(s.lucro)}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${s.margem < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {s.margem.toFixed(1)}%
                          </td>
                          {escopo === 'pista' && (
                            <>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l-2 border-gray-300">
                                {s.fatCombustivel > 0 ? formatCurrency(s.fatCombustivel) : <span className="text-gray-300">—</span>}
                                {s.qtdCombustivel > 0 && (
                                  <span className="block text-[9.5px] text-gray-400">{fmtNum(s.qtdCombustivel, 0)} L</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l-2 border-gray-300">
                                {s.fatAutomotivos > 0 ? formatCurrency(s.fatAutomotivos) : <span className="text-gray-300">—</span>}
                                {s.vendasAutomotivos > 0 && (
                                  <span className="block text-[9.5px] text-gray-400">{fmtNum(s.vendasAutomotivos)} vendas</span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                        {aberto && (
                          <tr className="bg-gradient-to-b from-blue-50/40 to-white">
                            <td colSpan={totalCols} className="px-4 py-4 border-b-2 border-blue-100">
                              <DetalheVendedor
                                vendedor={v}
                                detalhe={det}
                                mapaCatGrupos={mapaCatGrupos}
                                mapaNomeGrupos={mapaNomeGrupos}
                                conveniencia={escopo === 'conv'}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

// Ícones coloridos no header da tabela de análise.
const COR_ICONE = {
  violet:  'text-blue-600',
  blue:    'text-blue-600',
  amber:   'text-amber-600',
  emerald: 'text-emerald-600',
};
// RGB das paletas (sem opacity) — usado para gerar o heatmap por coluna.
const COR_RGB = {
  violet:  '139, 92, 246',   // blue-500
  blue:    '96, 165, 250',   // blue-400
  amber:   '251, 191, 36',   // amber-400
  emerald: '52, 211, 153',   // emerald-400
};
// Background heatmap proporcional ao valor da célula dentro da escala da coluna.
function corHeatmap(valor, min, max, cor = 'violet') {
  if (!Number.isFinite(valor) || valor <= 0 || max <= 0) return {};
  const span = max - min;
  const intensity = span > 0 ? Math.max(0, Math.min(1, (valor - min) / span)) : 1;
  const opacity = 0.06 + 0.34 * intensity; // 6% até 40%
  const rgb = COR_RGB[cor] || COR_RGB.violet;
  return { backgroundColor: `rgba(${rgb}, ${opacity})` };
}

// Tooltip explicativo do cálculo do Score.
// Renderizado via createPortal no document.body com position: fixed para
// escapar do overflow:auto da tabela. Posicionamento calculado a partir do
// rect do botão e reajustado em scroll/resize/escape.
function ScoreInfoTooltip() {
  const [aberto, setAberto] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const WIDTH = 320;

  useEffect(() => {
    if (!aberto) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Centraliza embaixo do botão; clampa pra não sair da viewport.
      const idealLeft = r.left + r.width / 2 - WIDTH / 2;
      const left = Math.max(8, Math.min(idealLeft, window.innerWidth - WIDTH - 8));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const onKey = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  return (
    <>
      <button ref={btnRef} type="button"
        aria-label="Como o Score é calculado"
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={(e) => { e.stopPropagation(); setAberto(o => !o); }}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-help">
        <Info className="h-3 w-3" />
      </button>
      {aberto && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: WIDTH, zIndex: 9999 }}
          className="rounded-xl bg-gray-900 text-white shadow-2xl ring-1 ring-black/10 pointer-events-none text-left normal-case tracking-normal">
          {/* setinha apontando pro botão */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 bg-gray-900" />
          <div className="relative p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-[12px] font-semibold">Como o Score é calculado</p>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed mb-2.5">
              Pontuação <strong className="text-white">0–100</strong> que mede a performance do
              vendedor em <strong className="text-white">6 dimensões</strong> da Pista.
              Cada métrica é normalizada (min→max) e o Score é a média simples delas.
            </p>
            <div className="border-t border-white/10 pt-2 mb-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
                Métricas utilizadas
              </p>
              <ul className="space-y-1 text-[11px] text-gray-200">
                <li className="flex items-center gap-1.5"><Package className="h-2.5 w-2.5 text-blue-400" /> Vendas de automotivos</li>
                <li className="flex items-center gap-1.5"><Droplet className="h-2.5 w-2.5 text-blue-300" /> Mix de aditivada</li>
                <li className="flex items-center gap-1.5"><Coins className="h-2.5 w-2.5 text-amber-400" /> Abastecimentos</li>
                <li className="flex items-center gap-1.5"><Coins className="h-2.5 w-2.5 text-emerald-400" /> Lucro bruto</li>
                <li className="flex items-center gap-1.5"><Fuel className="h-2.5 w-2.5 text-amber-400" /> Ticket médio combustíveis</li>
                <li className="flex items-center gap-1.5"><Package className="h-2.5 w-2.5 text-blue-400" /> Ticket médio automotivos</li>
              </ul>
            </div>
            <div className="border-t border-white/10 pt-2 mb-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                Fórmula
              </p>
              <p className="font-mono text-[10.5px] text-emerald-300 bg-white/5 rounded px-1.5 py-1">
                norm = (valor − mín) / (máx − mín)
              </p>
              <p className="font-mono text-[10.5px] text-emerald-300 bg-white/5 rounded px-1.5 py-1 mt-1">
                score = média(norm × 6 métricas) × 100
              </p>
            </div>
            <div className="border-t border-white/10 pt-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
                Faixas de cor
              </p>
              <div className="grid grid-cols-2 gap-1 text-[10.5px]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 80–100 excelente</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" /> 60–79 bom</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> 40–59 médio</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> 1–39 atenção</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Badge circular do Score (0-100) com cor gradativa e medalha para top 3.
//   0-39   → vermelho (precisa atenção)
//   40-59  → âmbar (médio)
//   60-79  → emerald (bom)
//   80-100 → emerald forte + ring (excelente)
function ScoreBadge({ score, rank }) {
  const n = Math.round(score || 0);
  const cor = n >= 80 ? 'emerald-strong'
            : n >= 60 ? 'emerald'
            : n >= 40 ? 'amber'
            : n > 0   ? 'red'
            : 'gray';
  const PAL = {
    'emerald-strong': { bg: 'bg-emerald-500', text: 'text-white',        ring: 'ring-emerald-300', med: 'text-emerald-600' },
    emerald:          { bg: 'bg-emerald-100', text: 'text-emerald-800',  ring: 'ring-emerald-200', med: 'text-emerald-600' },
    amber:            { bg: 'bg-amber-100',   text: 'text-amber-800',    ring: 'ring-amber-200',   med: 'text-amber-600'   },
    red:              { bg: 'bg-rose-100',    text: 'text-rose-800',     ring: 'ring-rose-200',    med: 'text-rose-600'    },
    gray:             { bg: 'bg-gray-100',    text: 'text-gray-400',     ring: 'ring-gray-200',    med: 'text-gray-400'    },
  }[cor];
  // Ícone de medalha pros top 3 (ouro/prata/bronze).
  const Medalha = rank === 1 ? Trophy : (rank === 2 || rank === 3) ? Medal : null;
  const corMedalha = rank === 1 ? 'text-amber-500'
                   : rank === 2 ? 'text-gray-400'
                   : rank === 3 ? 'text-amber-700' : '';
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full ${PAL.bg} ${PAL.text} ring-2 ${PAL.ring} shadow-sm`}>
        <span className="font-bold text-[12.5px] tabular-nums leading-none">{n}</span>
        {Medalha && (
          <Medalha className={`absolute -top-1.5 -right-1.5 h-3.5 w-3.5 ${corMedalha} drop-shadow-sm`} />
        )}
      </div>
      {rank && rank <= 3 && (
        <span className={`text-[8.5px] font-bold uppercase tracking-wider ${corMedalha}`}>
          {rank === 1 ? '1º' : rank === 2 ? '2º' : '3º'}
        </span>
      )}
    </div>
  );
}

// Painel de detalhes do vendedor (linha expandida da tabela).
// 3 painéis: Combustíveis vendidos | Grupos/Produtos (tree) | Mini-chart Automotivos 12m.
function DetalheVendedor({ vendedor, detalhe, mapaCatGrupos, mapaNomeGrupos, conveniencia = false }) {
  if (!detalhe || detalhe.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span className="text-[12px]">Carregando detalhes...</span>
      </div>
    );
  }
  if (detalhe.erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] text-red-800 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
        <p>{detalhe.erro}</p>
      </div>
    );
  }
  const produtos = detalhe.produtos || [];
  const automotivosMensal = detalhe.automotivos_mensal || [];
  const mixMensal = detalhe.mix_mensal || [];
  const convMensal = detalhe.conveniencia_mensal || [];

  // Helper: monta 12 buckets fixos (mês atual e 11 anteriores) a partir de rows
  // { ano_mes, ... }, extraindo o campo `campo`.
  const serie12m = (rows, campo) => {
    const idx = new Map();
    (rows || []).forEach(r => idx.set(String(r.ano_mes), r));
    const out = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || {};
      out.push({ rotulo: `${MESES_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`, valor: Number(row[campo]) || 0 });
    }
    return out;
  };
  const serieAtend = serie12m(convMensal, 'atendimentos');
  const serieConv  = serie12m(convMensal, 'valor');
  const semAtend = serieAtend.every(p => p.valor === 0);
  const semConv  = serieConv.every(p => p.valor === 0);

  // ─── Tree grupos → produtos (todos exceto combustível) ──────
  const arvore = (() => {
    const m = new Map();
    produtos.forEach(p => {
      const grupoCod = p.grupo_codigo != null ? Number(p.grupo_codigo) : null;
      if (mapaCatGrupos.get(grupoCod) === 'combustivel') return; // exclui combust.
      const gKey = grupoCod != null ? String(grupoCod) : 'sem';
      if (!m.has(gKey)) {
        m.set(gKey, {
          codigo: grupoCod,
          nome: grupoCod != null ? (mapaNomeGrupos.get(grupoCod) || `Grupo ${grupoCod}`) : 'Sem grupo',
          categoria: mapaCatGrupos.get(grupoCod) || 'outros',
          totalQtd: 0,
          totalValor: 0,
          totalLucro: 0,
          produtos: [],
        });
      }
      const g = m.get(gKey);
      const qtd = Number(p.quantidade) || 0;
      const val = Number(p.valor) || 0;
      const cus = Number(p.valor_custo) || 0;
      g.totalQtd   += qtd;
      g.totalValor += val;
      g.totalLucro += (val - cus);
      g.produtos.push({
        codigo: p.produto_codigo,
        nome: p.produto_nome || `Produto #${p.produto_codigo}`,
        qtd, valor: val, lucro: val - cus,
      });
    });
    return Array.from(m.values())
      .map(g => ({ ...g, produtos: g.produtos.sort((a, b) => b.valor - a.valor) }))
      .sort((a, b) => b.totalValor - a.totalValor);
  })();

  // ─── Série mensal de Automotivos (12 buckets fixos) ──────────
  const serieAuto = (() => {
    const idx = new Map();
    automotivosMensal.forEach(r => idx.set(String(r.ano_mes), r));
    const out = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || {};
      const valor = Number(row.valor) || 0;
      out.push({
        rotulo: `${MESES_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        valor,
      });
    }
    return out;
  })();
  const semAutomotivos = serieAuto.every(p => p.valor === 0);

  // ─── Série mensal de Mix aditivada (12 buckets fixos) ────────
  const serieMix = (() => {
    const idx = new Map();
    mixMensal.forEach(r => idx.set(String(r.ano_mes), r));
    const out = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym) || {};
      const adit = Number(row.litros_aditivada) || 0;
      const com  = Number(row.litros_comum) || 0;
      const base = adit + com;
      out.push({
        rotulo: `${MESES_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        mix: base > 0 ? (adit / base) * 100 : 0,
        temDado: base > 0,
      });
    }
    return out;
  })();
  const semMix = serieMix.every(p => !p.temDado);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Painel 1: Atendimentos 12m (conveniência) OU Mix aditivada 12m */}
      {conveniencia && (
      <div className="bg-white rounded-xl border border-blue-100 overflow-hidden">
        <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2">
          <LineChartIcon className="h-3.5 w-3.5 text-blue-600" />
          <h4 className="text-[11.5px] font-semibold text-blue-900">Atendimentos · 12 meses</h4>
        </div>
        <div className="p-3">
          {semAtend ? (
            <p className="text-[11px] text-gray-400 italic text-center py-10">Sem atendimentos nos últimos 12 meses</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieAtend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 9, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis allowDecimals={false} tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`}
                  tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip formatter={(value) => [fmtNum(value), 'Atendimentos']}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="valor" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      )}

      {/* Painel: Mix aditivada 12 meses */}
      {!conveniencia && (
      <div className="bg-white rounded-xl border border-blue-100 overflow-hidden">
        <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2">
          <LineChartIcon className="h-3.5 w-3.5 text-blue-600" />
          <h4 className="text-[11.5px] font-semibold text-blue-900">Mix aditivada · 12 meses</h4>
        </div>
        <div className="p-3">
          {semMix ? (
            <p className="text-[11px] text-gray-400 italic text-center py-10">Sem mix classificável nos últimos 12 meses</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieMix} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 9, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Mix aditivada']}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="mix" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      )}

      {/* Painel: Grupos / Produtos (tree) */}
      <div className="bg-white rounded-xl border border-blue-100 overflow-hidden">
        <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-2">
          <Boxes className="h-3.5 w-3.5 text-blue-600" />
          <h4 className="text-[11.5px] font-semibold text-blue-900">Grupos de produto vendidos</h4>
          <span className="ml-auto text-[10px] text-blue-700">{arvore.length} grupo{arvore.length === 1 ? '' : 's'}</span>
        </div>
        <div className="p-3 max-h-[260px] overflow-y-auto">
          {arvore.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic text-center py-4">Sem vendas (fora de combustível) no período</p>
          ) : (
            <TreeGrupos arvore={arvore} />
          )}
        </div>
      </div>

      {/* Painel 3: Conveniência 12m (conveniência) OU Automotivos 12m */}
      {conveniencia && (
      <div className="bg-white rounded-xl border border-emerald-100 overflow-hidden">
        <div className="px-3 py-2 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
          <LineChartIcon className="h-3.5 w-3.5 text-emerald-600" />
          <h4 className="text-[11.5px] font-semibold text-emerald-900">Conveniência · 12 meses</h4>
        </div>
        <div className="p-3">
          {semConv ? (
            <p className="text-[11px] text-gray-400 italic text-center py-10">Sem vendas de conveniência nos últimos 12 meses</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieConv} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 9, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`}
                  tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip formatter={(value) => [formatCurrency(value), 'Faturamento']}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="valor" fill="#86efac" radius={[3, 3, 0, 0]}>
                  {serieConv.map((p, i) => (
                    <Cell key={`c-${i}`} fill={i === 11 ? '#10b981' : '#86efac'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      )}

      {/* Painel: Automotivos 12 meses */}
      {!conveniencia && (
      <div className="bg-white rounded-xl border border-emerald-100 overflow-hidden">
        <div className="px-3 py-2 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
          <LineChartIcon className="h-3.5 w-3.5 text-emerald-600" />
          <h4 className="text-[11.5px] font-semibold text-emerald-900">Automotivos · 12 meses</h4>
        </div>
        <div className="p-3">
          {semAutomotivos ? (
            <p className="text-[11px] text-gray-400 italic text-center py-10">Sem vendas de automotivos nos últimos 12 meses</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieAuto} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 9, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`}
                  tick={{ fontSize: 9, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Faturamento']}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="valor" fill="#86efac" radius={[3, 3, 0, 0]}>
                  {serieAuto.map((p, i) => (
                    <Cell key={`m-${i}`} fill={i === 11 ? '#10b981' : '#86efac'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// Mini-tree Grupo → Produto usado no painel de detalhe.
function TreeGrupos({ arvore }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const tog = (k) => setAbertos(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const corCat = {
    automotivos:  { dot: 'bg-blue-500',    text: 'text-blue-700' },
    conveniencia: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    outros:       { dot: 'bg-gray-400',    text: 'text-gray-700' },
    sem_categoria:{ dot: 'bg-rose-400',    text: 'text-rose-700' },
  };
  return (
    <div className="space-y-1">
      {arvore.map(g => {
        const k = String(g.codigo);
        const aberto = abertos.has(k);
        const cat = corCat[g.categoria] || corCat.outros;
        return (
          <div key={k} className="text-[11px]">
            <button type="button" onClick={() => tog(k)}
              className="w-full flex items-center gap-1.5 px-1 py-1 rounded hover:bg-blue-50/60 transition-colors text-left">
              {aberto
                ? <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />}
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cat.dot}`} />
              <span className="text-[11.5px] font-semibold text-gray-800 truncate flex-1">{g.nome}</span>
              <span className="text-[10px] text-gray-400 ml-1">{g.produtos.length}</span>
              <span className="text-[11px] font-mono tabular-nums text-gray-900 font-semibold whitespace-nowrap">
                {formatCurrency(g.totalValor)}
              </span>
            </button>
            {aberto && (
              <div className="ml-5 mt-0.5 mb-1 space-y-0.5">
                {g.produtos.map(p => (
                  <div key={p.codigo} className="flex items-baseline gap-2 px-1.5 py-0.5 rounded text-[10.5px] hover:bg-gray-50/80">
                    <Droplet className="h-2.5 w-2.5 text-gray-300 flex-shrink-0" />
                    <p className="text-gray-700 truncate flex-1">{p.nome}</p>
                    <p className="text-gray-400 font-mono tabular-nums">{fmtNum(p.qtd, 2)}</p>
                    <p className="font-mono tabular-nums font-semibold text-gray-800 whitespace-nowrap">
                      {formatCurrency(p.valor)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// KPI card
function Kpi({ icone: Icone, cor, label, valor, sub, negativo }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',  icon: 'text-blue-600' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
  };
  const Pal = palette[cor] || palette.violet;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${negativo ? 'text-red-700' : 'text-gray-900'}`}>{valor}</p>
          {sub && <p className="text-[10.5px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// Célula numérica com barra de dados ao fundo (proporcional ao máx. da coluna).
function CelulaBarra({ children, valor, max, cor, className = '' }) {
  const pct = max > 0 && valor > 0 ? Math.max(3, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <td className={`relative px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 ${className}`}>
      {pct > 0 && (
        <div className="absolute inset-y-[4px] left-1.5 right-1.5 pointer-events-none">
          <div className={`h-full rounded-sm ${cor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="relative">{children}</span>
    </td>
  );
}

// Tabela de ranking (aba Rank). Ordenada desc; 1º colocado em destaque (troféu
// + linha dourada + valor em amber). Demais linhas com a posição (2º, 3º…).
function TabelaRank({ titulo, icone, cor, itens, fmt }) {
  const Icone = icone; // evita falso-positivo do eslint (renamed-destructure só usado em JSX)
  const header = {
    blue:   'text-blue-500',
    violet: 'text-violet-500',
    amber:  'text-amber-500',
  }[cor] || 'text-blue-500';
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <Icone className={`h-4 w-4 ${header}`} />
        <h3 className="text-[13px] font-semibold text-gray-800">{titulo}</h3>
      </div>
      {itens.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-gray-400">Sem dados no período.</p>
      ) : (
        <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: '18rem' }}>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-7" />
              <col />
              <col className="w-[104px]" />
            </colgroup>
            <tbody>
              {itens.map((r, i) => {
                const primeiro = i === 0;
                // 1º colocado fica "grudado" no topo ao rolar. Fundo opaco nas
                // células (bg-amber-50) pra as linhas de baixo não vazarem.
                const cel = primeiro ? 'bg-amber-50 border-b-2 border-amber-200' : '';
                return (
                  <tr key={r.key}
                    className={primeiro ? 'sticky top-0 z-10' : 'border-t border-gray-50 hover:bg-gray-50/50'}>
                    <td className={`pl-3 pr-0 py-2 align-middle ${cel}`}>
                      {primeiro
                        ? <Trophy className="h-4 w-4 text-amber-500" />
                        : <span className="text-[11px] font-semibold text-gray-400 tabular-nums">{i + 1}º</span>}
                    </td>
                    <td className={`pl-1.5 pr-2 py-2 ${cel}`}>
                      <p className={`text-[12.5px] truncate ${primeiro ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{r.nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {r.codigo || '—'}</p>
                    </td>
                    <td className={`pl-1 pr-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${primeiro ? 'text-[13px] font-bold text-amber-700' : 'text-[12px] font-semibold text-gray-800'} ${cel}`}>
                      {fmt(r.valor)}
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

