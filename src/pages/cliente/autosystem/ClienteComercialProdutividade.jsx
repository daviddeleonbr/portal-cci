import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown, ChevronRight,
  Users, Fuel, Package, Store,
  Search, Coins, Calendar, Boxes, LineChart as LineChartIcon, Droplet, Gauge,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function primeiroDiaDoMesIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
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
  automotivos:  { bg: 'bg-blue-50',    text: 'text-blue-700',    icone: Package, chartFill: '#93c5fd' },
  conveniencia: { bg: 'bg-emerald-50', text: 'text-emerald-700', icone: Store,   chartFill: '#86efac' },
};

// Abas: Pista (combustível + automotivos) e Conveniência.
const ABAS = [
  { key: 'pista',        label: 'Pista',         icone: Fuel,  borda: 'border-amber-600',   texto: 'text-amber-700'   },
  { key: 'conveniencia', label: 'Conveniência',  icone: Store, borda: 'border-emerald-600', texto: 'text-emerald-700' },
];

export default function ClienteComercialProdutividade() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  // Inicialmente apenas a empresa com o menor `empresa_codigo` fica marcada.
  // Usuário pode marcar/desmarcar livremente depois.
  const [empresasSelIds, setEmpresasSelIds] = useState(new Set());
  useEffect(() => {
    setEmpresasSelIds(prev => {
      if (prev.size === 0 && empresasDisponiveis.length > 0) {
        const menor = [...empresasDisponiveis]
          .sort((a, b) => (Number(a.empresa_codigo) || 0) - (Number(b.empresa_codigo) || 0))[0];
        return new Set([menor.id]);
      }
      return prev;
    });
  }, [empresasDisponiveis]);
  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds],
  );

  // Período: usuário escolhe data inicial e final. Default = mês atual.
  const [dataDe, setDataDe] = useState(primeiroDiaDoMesIso());
  const [dataAte, setDataAte] = useState(isoHoje());
  const periodoDias = useMemo(() => diasEntre(dataDe, dataAte), [dataDe, dataAte]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('pista');

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
    try {
      const data = await autosystemService.buscarProdutividadeDetalheAutosystem(redeId, {
        empresa_codigo:  v.empresa,
        vendedor_codigo: v.vendedor_codigo,
        data_de:  dataDe,
        data_ate: dataAte,
        automotivos_data_de:  auto12m.de,
        automotivos_data_ate: auto12m.ate,
        grupos_automotivos: gruposPorCat.automotivos,
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
  const tabelaVendedores = useMemo(() => {
    return [...vendedoresEnriquecidos].sort((a, b) => {
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
    let totFatAuto = 0, totLucroAuto = 0;
    let totAditiv = 0, totComum = 0;
    // Conta vendedores com atividade no escopo (fat > 0 ou vendas > 0).
    let comAtividade = 0;
    vendedoresEnriquecidos.forEach(v => {
      const s = v[escopo];
      totFat   += s.fat;
      totLucro += s.lucro;
      totVendas += s.vendas;
      if (s.fat > 0 || s.vendas > 0) comAtividade++;
      if (escopo === 'pista') {
        totLitros += s.qtdCombustivel;
        totAbast  += s.abastecimentos;
        totFatAuto   += s.fatAutomotivos;
        totLucroAuto += s.lucroAutomotivos;
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
      mix, litrosAditivada: totAditiv, litrosComum: totComum,
    };
  }, [vendedoresEnriquecidos, escopo]);

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
      <PageHeader title="Produtividade" description={asRede?.nome || 'Vendas por vendedor'}>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} max={dataAte}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} min={dataDe}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        {empresasDisponiveis.length > 1 && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
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

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando produtividade...</span>
        </div>
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
          {/* Abas: Pista (combustível + automotivos) / Conveniência */}
          <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
            <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
              {ABAS.map(a => {
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

          {/* KPIs (variam por aba) */}
          <div className={`grid grid-cols-2 ${escopo === 'pista' ? 'lg:grid-cols-5' : 'lg:grid-cols-2'} gap-3 mb-5`}>
            <Kpi icone={Users} cor="violet" label="Vendedores ativos" valor={fmtNum(kpis.totalVendedores)} />
            {escopo === 'pista' ? (
              <>
                <Kpi icone={Droplet} cor="violet" label="Mix de aditivada"
                  valor={kpis.mix != null ? `${kpis.mix.toFixed(1)}%` : '—'}
                  sub={kpis.mix != null
                    ? `${fmtNum(kpis.litrosAditivada, 0)} / ${fmtNum(kpis.litrosAditivada + kpis.litrosComum, 0)} L`
                    : 'Classifique em Configurações'} />
                <Kpi icone={Coins}   cor="blue"  label="Abastecimentos"     valor={fmtNum(kpis.abastecimentos)}
                  sub={`${fmtNum(kpis.vendas)} vendas total`} />
                <Kpi icone={Package} cor="blue"  label="Vendas de automotivos" valor={formatCurrency(kpis.fatAutomotivos)} />
                <Kpi icone={Gauge}   cor="emerald" label="Margem automotivos"
                  valor={`${kpis.margemAutomotivos.toFixed(1)}%`}
                  negativo={kpis.margemAutomotivos < 0} />
              </>
            ) : (
              <Kpi icone={Coins} cor="blue" label="Vendas (linhas)" valor={fmtNum(kpis.vendas)} />
            )}
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
                      <th className="px-3 py-2 text-left">Vendedor</th>
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
                    {tabelaVendedores.map(v => (
                      <tr key={`an-${v.empresa}-${v.vendedor_codigo}`} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-3 py-1.5">
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
                    ))}
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

// Painel de detalhes do vendedor (linha expandida da tabela).
// 3 painéis: Combustíveis vendidos | Grupos/Produtos (tree) | Mini-chart Automotivos 12m.
function DetalheVendedor({ vendedor, detalhe, mapaCatGrupos, mapaNomeGrupos, mapaMix }) {
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

  // ─── Combustíveis (categoria = combustivel) ──────────────────
  const combustiveis = produtos.filter(p => mapaCatGrupos.get(Number(p.grupo_codigo)) === 'combustivel');
  const totalLitros = combustiveis.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
  const combustiveisOrd = [...combustiveis].sort((a, b) => Number(b.quantidade) - Number(a.quantidade));

  // ─── Mix de gasolina (aditivada vs comum) ───────────────────
  // Mix = litros aditivada / (litros aditivada + litros comum)
  let litrosAditivada = 0, litrosComum = 0;
  combustiveis.forEach(p => {
    const tipo = mapaMix?.get(Number(p.produto_codigo));
    const qtd  = Number(p.quantidade) || 0;
    if (tipo === 'aditivada') litrosAditivada += qtd;
    else if (tipo === 'comum') litrosComum += qtd;
  });
  const baseMix = litrosAditivada + litrosComum;
  const mixPct = baseMix > 0 ? (litrosAditivada / baseMix) * 100 : null;
  const temClassif = baseMix > 0;

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Painel 1: Combustíveis */}
      <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
        <div className="px-3 py-2 bg-amber-50/60 border-b border-amber-100 flex items-center gap-2">
          <Fuel className="h-3.5 w-3.5 text-amber-600" />
          <h4 className="text-[11.5px] font-semibold text-amber-900">Combustíveis vendidos</h4>
          <span className="ml-auto text-[10px] font-mono tabular-nums text-amber-700 font-bold">
            {fmtNum(totalLitros, 0)} L
          </span>
        </div>
        {/* Mix de gasolina */}
        {temClassif ? (
          <div className="px-3 py-2 border-b border-amber-50 bg-gradient-to-r from-blue-50/50 to-transparent">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Mix aditivada</span>
                <span className="text-[18px] font-bold text-blue-700 leading-none tabular-nums">{mixPct.toFixed(1)}%</span>
              </div>
              <span className="text-[10px] text-gray-500 tabular-nums">
                {fmtNum(litrosAditivada, 0)} / {fmtNum(baseMix, 0)} L
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                style={{ width: `${Math.max(2, mixPct)}%` }} />
            </div>
          </div>
        ) : (
          <div className="px-3 py-2 border-b border-amber-50 text-[10px] text-gray-400 italic">
            Mix não calculável — classifique os produtos em <strong className="text-blue-600 not-italic">Configurações</strong>.
          </div>
        )}
        <div className="p-3 max-h-[260px] overflow-y-auto">
          {combustiveisOrd.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic text-center py-4">Sem vendas de combustível no período</p>
          ) : (
            <div className="space-y-2">
              {combustiveisOrd.map(p => {
                const litros = Number(p.quantidade) || 0;
                const pct = totalLitros > 0 ? (litros / totalLitros) * 100 : 0;
                return (
                  <div key={p.produto_codigo}>
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <p className="text-[11.5px] text-gray-800 truncate flex-1">{p.produto_nome}</p>
                      <p className="text-[11.5px] font-mono tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                        {fmtNum(litros, 0)} L
                      </p>
                    </div>
                    <div className="h-1.5 w-full bg-amber-50 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-300 to-amber-500 rounded-full"
                        style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                    <p className="text-[9.5px] text-gray-400 mt-0.5">{pct.toFixed(1)}% do total · {formatCurrency(Number(p.valor) || 0)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Painel 2: Grupos / Produtos (tree) */}
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

      {/* Painel 3: Mini-gráfico Automotivos 12 meses */}
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
    </div>
  );
}

// Mini-tree Grupo → Produto usado no painel de detalhe.
function TreeGrupos({ arvore }) {
  const [abertos, setAbertos] = useState(() => new Set([arvore[0]?.codigo].filter(Boolean).map(String)));
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

// Multi-select de empresas (mesmo padrão da Operação)
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
    : todasMarcadas ? `Todas (${clientesRede.length})`
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
            aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
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
              <input type="checkbox" checked={todasMarcadas} onChange={() => {}}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
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
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
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
