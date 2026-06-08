import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown,
  Users, Fuel, Package, Store,
  Search, Coins, Calendar, Droplet, Gauge,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import BannerCarregando from '../../../components/vendas/BannerCarregando';
import { lerCache as lerCacheV2, salvarCache as salvarCacheV2 } from '../../../services/webpostoCacheV3';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import IndicadorAtualizacao from '../../../components/vendas/IndicadorAtualizacao';
import { useClienteSession } from '../../../hooks/useAuth';
import * as qualityApi from '../../../services/qualityApiService';
import * as mapService from '../../../services/mapeamentoService';
import { classificarItem } from '../../../services/mapeamentoVendasService';
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

const ABAS = [
  { key: 'pista',        label: 'Pista',         icone: Fuel,  borda: 'border-amber-600',   texto: 'text-amber-700'   },
  { key: 'conveniencia', label: 'Conveniência',  icone: Store, borda: 'border-emerald-600', texto: 'text-emerald-700' },
];

export default function ClienteComercialProdutividade() {
  const session = useClienteSession();
  const chaveApi = session?.chaveApi;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  // Empresa(s) selecionada(s) — começa com a de menor empresa_codigo
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

  const [dataDe, setDataDe] = useState(primeiroDiaDoMesIso());
  const [dataAte, setDataAte] = useState(isoHoje());
  const periodoDias = useMemo(() => diasEntre(dataDe, dataAte), [dataDe, dataAte]);
  // Cache v2 — chave determinística (pagina + chaveApiId)
  const chaveApiIdAtiva = chaveApi?.id || null;
  const cacheInicialProd = useMemo(() => {
    return chaveApiIdAtiva ? lerCacheV2('produtividade', chaveApiIdAtiva) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [vendedores, setVendedores] = useState(() => cacheInicialProd?.vendedores || []);
  const [heatmapConv, setHeatmapConv] = useState(() =>
    cacheInicialProd?.heatmapConv instanceof Map ? cacheInicialProd.heatmapConv : new Map());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('pista');

  const [mapaMix, setMapaMix] = useState(new Map()); // produto_codigo → 'aditivada' | 'comum'

  const chaveApiId = chaveApi?.id;

  // Carrega classificação de Mix (uma vez por rede)
  useEffect(() => {
    if (!chaveApiId) { setMapaMix(new Map()); return; }
    (async () => {
      try {
        const lista = await mapService.listarMixProdutosWebposto(chaveApiId);
        const m = new Map();
        (lista || []).forEach(c => m.set(Number(c.produto_codigo), c.tipo));
        setMapaMix(m);
      } catch { /* noop */ }
    })();
  }, [chaveApiId]);

  // Guarda o id do fetch ativo. Se mudar antes do fetch terminar,
  // a resposta antiga eh descartada (race protection).
  const fetchIdRef = useRef(0);

  const carregar = useCallback(async ({ force = false, silencioso = false } = {}) => {
    if (!chaveApi?.chave || empresasSel.length === 0) return;
    if (!dataDe || !dataAte || dataDe > dataAte) return;
    const myFetchId = ++fetchIdRef.current;
    setErro('');

    if (!force) {
      const cache = lerCacheV2('produtividade', chaveApiId);
      // Valida estrutura: cache deve ter `heatmapConv` (Map) e vendedores
      // com `convPorDia` — caso contrário, refaz fetch.
      const temEstruturaNova = Array.isArray(cache?.vendedores)
        && cache?.heatmapConv instanceof Map
        && (cache.vendedores.length === 0
            || cache.vendedores.some(v => v && (v.convPorDia instanceof Map)));
      if (cache?.vendedores && temEstruturaNova) {
        setVendedores(cache.vendedores);
        setHeatmapConv(cache.heatmapConv);
        setLoading(false);
        return; // cache hit válido — não faz fetch
      }
    }
    if (!silencioso) setLoading(true);
    try {
      const apiKey = chaveApi.chave;
      const filtros = { dataInicial: dataDe, dataFinal: dataAte };

      // Catálogos (cacheados pelo qualityApi). Necessários para resolver nome
      // do funcionário e classificar produto em combustivel/automotivos/conveniencia.
      const [funcionarios, produtos, grupos] = await Promise.all([
        qualityApi.buscarFuncionarios(apiKey).catch(() => []),
        qualityApi.buscarProdutos(apiKey).catch(() => []),
        qualityApi.buscarGrupos(apiKey).catch(() => []),
      ]);
      const funcionariosMap = new Map();
      (funcionarios || []).forEach(f => {
        const cod = f.funcionarioCodigo ?? f.codigo;
        if (cod != null) funcionariosMap.set(Number(cod), f);
      });
      const produtosMap = new Map();
      (produtos || []).forEach(p => {
        const cod = p.produtoCodigo ?? p.codigo;
        if (cod != null) produtosMap.set(Number(cod), p);
      });
      const gruposMap = new Map();
      (grupos || []).forEach(g => {
        const cod = g.grupoCodigo ?? g.codigo;
        if (cod != null) gruposMap.set(Number(cod), g);
      });

      // Para cada empresa selecionada, busca VENDA (só p/ flag cancelada),
      // VENDA_ITEM (fonte principal) e ABASTECIMENTO (só p/ contar).
      const blocos = await Promise.all(empresasSel.map(async emp => {
        const filtrosEmp = { ...filtros, empresaCodigo: emp.empresa_codigo };
        const [vendas, vendaItens, abastecimentos] = await Promise.all([
          qualityApi.buscarVendas(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarVendaItens(apiKey, filtrosEmp).catch(() => []),
          qualityApi.buscarAbastecimentos(apiKey, filtrosEmp).catch(() => []),
        ]);
        return { emp, vendas: vendas || [], vendaItens: vendaItens || [], abastecimentos: abastecimentos || [] };
      }));

      // Agrega por (empresa_codigo, vendedor). Vendedor = item.funcionarioCodigo
      // (não venda.funcionarioCodigo). No Webposto o VENDA_ITEM traz quem
      // efetivamente vendeu cada item, incluindo o frentista para combustível.
      const agg = new Map();
      function bucket(empresaCodigo, vendedorCodigo) {
        const k = `${empresaCodigo}::${vendedorCodigo}`;
        if (!agg.has(k)) {
          agg.set(k, {
            empresa: empresaCodigo,
            vendedor_codigo: vendedorCodigo,
            vendedor_nome: funcionariosMap.get(Number(vendedorCodigo))?.nome
                          || funcionariosMap.get(Number(vendedorCodigo))?.funcionarioNome
                          || `Funcionário #${vendedorCodigo}`,
            fat_combustivel: 0, custo_combustivel: 0, qtd_combustivel: 0,
            fat_automotivos: 0, custo_automotivos: 0, vendas_automotivos: 0,
            fat_conveniencia: 0, custo_conveniencia: 0, vendas_conveniencia: 0,
            litros_aditivada: 0, litros_comum: 0,
            abastecimentos: 0,
            vendas_combustivel: 0,
            convPorGrupo: new Map(),
            // Vendas conv por dia (gráfico de linha acumulado por vendedor):
            // dia_iso → fat conv naquele dia
            convPorDia: new Map(),
          });
        }
        return agg.get(k);
      }

      // Heatmap GLOBAL conv: "dow-hh" (0=domingo, 0-23) → fat. Não é por
      // vendedor — agrega toda a rede.
      const convHeatmap = new Map();

      blocos.forEach(({ emp, vendas, vendaItens, abastecimentos }) => {
        const empCod = Number(emp.empresa_codigo);

        // Mapa vendaCodigo → objeto venda completo (pra pegar dataHora além
        // do status cancelada).
        const vendasMap = new Map();
        (vendas || []).forEach(v => {
          const vc = v.vendaCodigo ?? v.codigo;
          if (vc != null) vendasMap.set(vc, v);
        });

        // ─── VENDA_ITEM: fonte única de fat/custo/qtd por (vendedor, categoria).
        // Conta também vendas distintas por categoria via vendaCodigo.
        const tagsPorVenda = new Map();
        // vendaCodigo → Map<vendedorCodigo, {comb:boolean, auto:boolean, conv:boolean}>
        (vendaItens || []).forEach(item => {
          // Descarta itens de vendas canceladas
          const vendaObj = vendasMap.get(item.vendaCodigo);
          if (!vendaObj || (vendaObj.cancelada || 'N') !== 'N') return;

          const vendedorCodigo = item.funcionarioCodigo;
          if (vendedorCodigo == null) return;

          const cat = classificarItem(item, produtosMap, gruposMap);
          if (cat === 'outros') return; // não conta em nenhuma das 3 categorias

          const totalVenda = Number(item.totalVenda || 0);
          const totalCusto = Number(item.totalCusto || 0);
          const qtd = Number(item.quantidade || 0);
          const b = bucket(empCod, vendedorCodigo);

          if (cat === 'combustivel') {
            b.fat_combustivel   += totalVenda;
            b.custo_combustivel += totalCusto;
            b.qtd_combustivel   += qtd;
            // Mix de aditivada via mapaMix (cadastrado em Configurações)
            const tipoMix = mapaMix.get(Number(item.produtoCodigo));
            if (tipoMix === 'aditivada')   b.litros_aditivada += qtd;
            else if (tipoMix === 'comum')  b.litros_comum     += qtd;
          } else if (cat === 'automotivos') {
            b.fat_automotivos   += totalVenda;
            b.custo_automotivos += totalCusto;
          } else if (cat === 'conveniencia') {
            b.fat_conveniencia   += totalVenda;
            b.custo_conveniencia += totalCusto;
            // Vendas por dia (gráfico de linha acumulado por vendedor)
            const dataRaw = vendaObj.dataHora || vendaObj.dataVenda || vendaObj.data;
            const diaIso = String(dataRaw || '').slice(0, 10);
            if (diaIso) {
              b.convPorDia.set(diaIso, (b.convPorDia.get(diaIso) || 0) + totalVenda);
            }
            // Heatmap GLOBAL: agrega por (dia_da_semana, hora) usando dataHora
            if (vendaObj.dataHora) {
              const d = new Date(vendaObj.dataHora);
              if (!isNaN(d.getTime())) {
                const dow = d.getDay();    // 0=domingo
                const hh  = d.getHours();  // 0-23
                const kHm = `${dow}-${hh}`;
                convHeatmap.set(kHm, (convHeatmap.get(kHm) || 0) + totalVenda);
              }
            }
          }

          // Tags por (vendaCodigo, vendedorCodigo) para contar vendas distintas
          let porVendedor = tagsPorVenda.get(item.vendaCodigo);
          if (!porVendedor) { porVendedor = new Map(); tagsPorVenda.set(item.vendaCodigo, porVendedor); }
          let tags = porVendedor.get(vendedorCodigo);
          if (!tags) { tags = { comb: false, auto: false, conv: false }; porVendedor.set(vendedorCodigo, tags); }
          if (cat === 'combustivel')      tags.comb = true;
          else if (cat === 'automotivos') tags.auto = true;
          else if (cat === 'conveniencia') tags.conv = true;
        });

        tagsPorVenda.forEach(porVendedor => {
          porVendedor.forEach((tags, vendedorCodigo) => {
            const b = bucket(empCod, vendedorCodigo);
            if (tags.comb) b.vendas_combustivel++;
            if (tags.auto) b.vendas_automotivos++;
            if (tags.conv) b.vendas_conveniencia++;
          });
        });

        // ─── ABASTECIMENTO: apenas contagem por frentista (KPI/coluna
        // "Abastecimentos"). Não cria novos buckets — só incrementa quando o
        // frentista já apareceu em algum VENDA_ITEM. Quem fez apenas
        // abastecimentos (sem nenhuma venda registrada) fica fora da tabela.
        (abastecimentos || []).forEach(a => {
          if (a.afericao === 'S' || a.afericao === true || a.afericao === 1) return;
          const cod = a.codigoFrentista ?? a.funcionarioCodigo;
          if (cod == null) return;
          const k = `${empCod}::${cod}`;
          const b = agg.get(k);
          if (b) b.abastecimentos++;
        });
      });

      if (myFetchId !== fetchIdRef.current) return; // resposta obsoleta
      const novosVendedores = Array.from(agg.values());
      setVendedores(novosVendedores);
      setHeatmapConv(convHeatmap);
      // Salva cache v2
      salvarCacheV2('produtividade', chaveApiId, {
        vendedores: novosVendedores,
        heatmapConv: convHeatmap,
      });
    } catch (err) {
      if (myFetchId !== fetchIdRef.current) return;
      setErro(err.message || 'Falha ao carregar produtividade');
      setVendedores([]);
    } finally {
      if (myFetchId === fetchIdRef.current) setLoading(false);
    }
  }, [chaveApi, empresasSel, dataDe, dataAte, mapaMix]);

  // Auto-fetch: carregar() já checa cache exato internamente.
  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh em background a cada 10 min (silencioso — sem banner)
  useAutoRefresh(() => {
    if (chaveApi?.chave && empresasSel.length > 0) carregar({ force: true, silencioso: true });
  });

  // Enriquece cada vendedor com totais escopados por aba (pista / conv).
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
        fatCombustivel:    fatComb,
        lucroCombustivel:  fatComb - custoComb,
        qtdCombustivel:    Number(v.qtd_combustivel) || 0,
        abastecimentos:    Number(v.abastecimentos) || 0,
        fatAutomotivos:    fatAuto,
        lucroAutomotivos:  fatAuto - custoAuto,
        vendasAutomotivos: Number(v.vendas_automotivos) || 0,
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

      // Árvore conv: grupo → produto. Cada nível com Vendas (fat), Custo,
      // Lucro, Margem, Ticket, Atendimentos (vendas distintas via vendaCods).
      const cpg = v.convPorGrupo;
      const grupos = cpg ? Array.from(cpg.values()).map(g => {
        const produtos = Array.from(g.produtos.values()).map(p => {
          const atendimentos = p.vendaCods?.size || 0;
          const lucro = p.fat - p.custo;
          return {
            produto_codigo: p.produto_codigo,
            produto_nome:   p.produto_nome,
            fat: p.fat, custo: p.custo, lucro,
            margem: p.fat > 0 ? (lucro / p.fat) * 100 : 0,
            atendimentos,
            ticket: atendimentos > 0 ? p.fat / atendimentos : 0,
          };
        }).sort((a, b) => b.fat - a.fat);
        const atendimentos = g.vendaCods?.size || 0;
        const lucro = g.fat - g.custo;
        return {
          grupo_codigo: g.grupo_codigo,
          grupo_nome:   g.grupo_nome,
          fat: g.fat, custo: g.custo, lucro,
          margem: g.fat > 0 ? (lucro / g.fat) * 100 : 0,
          atendimentos,
          ticket: atendimentos > 0 ? g.fat / atendimentos : 0,
          produtos,
        };
      }).sort((a, b) => b.fat - a.fat) : [];
      conv.grupos = grupos;

      return { ...v, pista, conv };
    });
  }, [vendedores]);

  const escopo = aba === 'conveniencia' ? 'conv' : 'pista';

  // KPIs
  const kpis = useMemo(() => {
    let totFat = 0, totLucro = 0, totVendas = 0, totLitros = 0, totAbast = 0;
    let totFatAuto = 0, totLucroAuto = 0;
    let totAditiv = 0, totComum = 0;
    let comAtividade = 0;
    vendedoresEnriquecidos.forEach(v => {
      const s = v[escopo];
      totFat    += s.fat;
      totLucro  += s.lucro;
      totVendas += s.vendas;
      if (s.fat > 0 || s.vendas > 0) comAtividade++;
      if (escopo === 'pista') {
        totLitros    += s.qtdCombustivel;
        totAbast     += s.abastecimentos;
        totFatAuto   += s.fatAutomotivos;
        totLucroAuto += s.lucroAutomotivos;
        totAditiv    += s.litrosAditivada || 0;
        totComum     += s.litrosComum || 0;
      }
    });
    const margem     = totFat > 0 ? (totLucro / totFat) * 100 : 0;
    const margemAuto = totFatAuto > 0 ? (totLucroAuto / totFatAuto) * 100 : 0;
    const baseMix    = totAditiv + totComum;
    const mix        = baseMix > 0 ? (totAditiv / baseMix) * 100 : null;
    return {
      totalVendedores: comAtividade,
      faturamento: totFat, lucro: totLucro, margem,
      vendas: totVendas, litros: totLitros, abastecimentos: totAbast,
      fatAutomotivos: totFatAuto, margemAutomotivos: margemAuto,
      mix, litrosAditivada: totAditiv, litrosComum: totComum,
      atendimentosPorDia: periodoDias > 0 ? totVendas / periodoDias : 0,
    };
  }, [vendedoresEnriquecidos, escopo, periodoDias]);

  // ─── Análise comparativa por vendedor ────────────────────────
  // Colunas mudam por aba — Pista mostra métricas de pista (combustíveis +
  // automotivos), Conveniência mostra Vendas/Custo/Lucro/Margem/Ticket/Atend.
  const COLS_PISTA = [
    { campo: 'automotivos',    titulo: 'Automotivos',       icone: Package, cor: 'blue',    fmt: (n) => formatCurrency(n) },
    { campo: 'mix',            titulo: 'Mix aditivada',     icone: Droplet, cor: 'violet',  fmt: (n) => n != null ? `${n.toFixed(1)}%` : '—' },
    { campo: 'abastecimentos', titulo: 'Abastecimentos',    icone: Coins,   cor: 'amber',   fmt: (n) => fmtNum(n) },
    { campo: 'lucro',          titulo: 'Lucro bruto',       icone: Coins,   cor: 'emerald', fmt: (n) => formatCurrency(n) },
    { campo: 'ticketComb',     titulo: 'Ticket méd. comb.', icone: Fuel,    cor: 'amber',   fmt: (n) => formatCurrency(n) },
    { campo: 'ticketAuto',     titulo: 'Ticket méd. auto.', icone: Package, cor: 'blue',    fmt: (n) => formatCurrency(n) },
  ];
  const COLS_CONV = [
    { campo: 'fat',           titulo: 'Vendas',       icone: Coins,   cor: 'emerald', fmt: (n) => formatCurrency(n) },
    { campo: 'custo',         titulo: 'Custo',        icone: Coins,   cor: 'amber',   fmt: (n) => formatCurrency(n) },
    { campo: 'lucro',         titulo: 'Lucro bruto',  icone: Coins,   cor: 'emerald', fmt: (n) => formatCurrency(n) },
    { campo: 'margem',        titulo: 'Margem',       icone: Gauge,   cor: 'violet',  fmt: (n) => Number.isFinite(n) ? `${n.toFixed(1)}%` : '—' },
    { campo: 'ticket',        titulo: 'Ticket médio', icone: Coins,   cor: 'blue',    fmt: (n) => formatCurrency(n) },
    { campo: 'atendimentos',  titulo: 'Atendimentos', icone: Users,   cor: 'amber',   fmt: (n) => fmtNum(n) },
  ];
  const COLS_ANALISE = escopo === 'conv' ? COLS_CONV : COLS_PISTA;
  function pegarValor(v, campo) {
    if (escopo === 'conv') {
      const s = v.conv || {};
      switch (campo) {
        case 'fat':           return s.fat;
        case 'custo':         return s.custo;
        case 'lucro':         return s.lucro;
        case 'margem':        return s.margem;
        case 'ticket':        return s.ticket;
        case 'atendimentos':  return s.vendas;
        default:              return 0;
      }
    }
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
  // Ordem inicial = primeira coluna da aba. Reseta quando troca de aba.
  const [ordemCampo, setOrdemCampo] = useState(COLS_ANALISE[0].campo);
  const [ordemDir, setOrdemDir]     = useState('desc');
  useEffect(() => {
    setOrdemCampo(COLS_ANALISE[0].campo);
    setOrdemDir('desc');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopo]);
  function clickHeader(campo) {
    if (campo === ordemCampo) {
      setOrdemDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setOrdemCampo(campo);
      setOrdemDir('desc');
    }
  }
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
    const q = busca.trim().toLowerCase();
    // Filtra vendedores SEM ATIVIDADE no escopo atual: precisa ter fat OU
    // vendas > 0 (ou abastecimentos > 0 na pista, pra incluir frentista
    // que só abasteceu sem registrar venda).
    const temAtividade = (v) => {
      const s = v[escopo];
      if ((s?.fat || 0) > 0 || (s?.vendas || 0) > 0) return true;
      if (escopo === 'pista' && (s?.abastecimentos || 0) > 0) return true;
      return false;
    };
    let filtrados = vendedoresEnriquecidos.filter(temAtividade);
    if (q) filtrados = filtrados.filter(v => (v.vendedor_nome || '').toLowerCase().includes(q));
    return [...filtrados].sort((a, b) => {
      const va = pegarValor(a, ordemCampo);
      const vb = pegarValor(b, ordemCampo);
      const na = !Number.isFinite(va);
      const nb = !Number.isFinite(vb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      return ordemDir === 'asc' ? va - vb : vb - va;
    });
  }, [vendedoresEnriquecidos, busca, ordemCampo, ordemDir, escopo]);

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Produtividade" description="Vendas por vendedor" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem empresas com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Produtividade" description={chaveApi?.nome || 'Vendas por vendedor'}>
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
        <IndicadorAtualizacao pagina="produtividade" chaveApiId={chaveApiIdAtiva} />
        <button onClick={() => carregar({ force: true })} disabled={loading || empresasSel.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      <BannerCarregando aberto={loading} mensagem="Carregando produtividade dos vendedores..." />

      {loading ? (
        <div className="h-32" />
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
          {/* Abas */}
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

          {/* KPIs */}
          <div className={`grid grid-cols-2 ${escopo === 'pista' ? 'lg:grid-cols-5' : 'lg:grid-cols-5'} gap-3 mb-5`}>
            <Kpi icone={Users} cor="violet" label="Vendedores ativos" valor={fmtNum(kpis.totalVendedores)} />
            {escopo === 'pista' ? (
              <>
                <Kpi icone={Droplet} cor="violet" label="Mix de aditivada"
                  valor={kpis.mix != null ? `${kpis.mix.toFixed(1)}%` : '—'}
                  sub={kpis.mix != null
                    ? `${fmtNum(kpis.litrosAditivada, 0)} / ${fmtNum(kpis.litrosAditivada + kpis.litrosComum, 0)} L`
                    : 'Classifique em Configurações'} />
                <Kpi icone={Coins} cor="blue" label="Abastecimentos" valor={fmtNum(kpis.abastecimentos)}
                  sub={`${fmtNum(kpis.vendas)} vendas total`} />
                <Kpi icone={Package} cor="blue" label="Vendas de automotivos" valor={formatCurrency(kpis.fatAutomotivos)} />
                <Kpi icone={Gauge} cor="emerald" label="Margem automotivos"
                  valor={`${kpis.margemAutomotivos.toFixed(1)}%`}
                  negativo={kpis.margemAutomotivos < 0} />
              </>
            ) : (
              <>
                <Kpi icone={Coins} cor="emerald" label="Faturamento" valor={formatCurrency(kpis.faturamento)} />
                <Kpi icone={Gauge} cor="violet" label="Margem geral"
                  valor={`${kpis.margem.toFixed(1)}%`}
                  negativo={kpis.margem < 0} />
                <Kpi icone={Coins} cor="blue" label="Ticket médio"
                  valor={formatCurrency(kpis.vendas > 0 ? kpis.faturamento / kpis.vendas : 0)}
                  sub={`${fmtNum(kpis.vendas)} atendimentos`} />
                <Kpi icone={Calendar} cor="amber" label="Atendimentos/dia"
                  valor={fmtNum(Math.round(kpis.atendimentosPorDia))}
                  sub={`média em ${periodoDias} dia(s)`} />
              </>
            )}
          </div>

          {/* Análise comparativa — mesma UI nas 2 abas, colunas mudam por escopo */}
          {tabelaVendedores.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <Gauge className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Análise comparativa</h3>
                <span className="text-[11px] text-gray-400">
                  por vendedor · clique no cabeçalho para ordenar · últimos {periodoDias} dias
                </span>
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

          {/* Gráficos da aba Conv: vêm DEPOIS da tabela */}
          {escopo === 'conv' && tabelaVendedores.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <GraficoLinhaAcumulado vendedoras={tabelaVendedores} dataDe={dataDe} dataAte={dataAte} />
              <HeatmapHoraXDow heatmap={heatmapConv} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const COR_ICONE = {
  violet:  'text-blue-600',
  blue:    'text-blue-600',
  amber:   'text-amber-600',
  emerald: 'text-emerald-600',
};
const COR_RGB = {
  violet:  '139, 92, 246',
  blue:    '96, 165, 250',
  amber:   '251, 191, 36',
  emerald: '52, 211, 153',
};
function corHeatmap(valor, min, max, cor = 'violet') {
  if (!Number.isFinite(valor) || valor <= 0 || max <= 0) return {};
  const span = max - min;
  const intensity = span > 0 ? Math.max(0, Math.min(1, (valor - min) / span)) : 1;
  const opacity = 0.06 + 0.34 * intensity;
  const rgb = COR_RGB[cor] || COR_RGB.violet;
  return { backgroundColor: `rgba(${rgb}, ${opacity})` };
}

function Kpi({ icone: Icone, cor, label, valor, sub, negativo }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',    icon: 'text-blue-600' },
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

// ─── Gráfico de linha acumulado por vendedora ─────────────────
// Eixo X: dias do período. Eixo Y: faturamento acumulado conv.
// Cada vendedora é uma linha com cor distinta.
function GraficoLinhaAcumulado({ vendedoras, dataDe, dataAte }) {
  const cores = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

  const dados = useMemo(() => {
    if (!dataDe || !dataAte) return { rows: [], series: [] };
    // Lista todos os dias do período (inclusive)
    const dias = [];
    const ini = new Date(`${dataDe}T00:00:00`);
    const fim = new Date(`${dataAte}T00:00:00`);
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      dias.push(d.toISOString().slice(0, 10));
    }
    // Top 10 vendedoras por fat (gráfico fica ilegível com mais)
    const top = [...vendedoras]
      .sort((a, b) => (b.conv?.fat || 0) - (a.conv?.fat || 0))
      .slice(0, 10);
    const series = top.map((v, i) => ({
      key: `v${v.empresa}_${v.vendedor_codigo}`,
      nome: v.vendedor_nome || `Vendedor ${v.vendedor_codigo}`,
      cor: cores[i % cores.length],
      porDia: v.convPorDia instanceof Map ? v.convPorDia : new Map(),
    }));
    // Constrói rows pra Recharts — uma linha por dia, colunas por vendedora
    const rows = dias.map(dia => {
      const linha = { dia, label: dia.slice(8, 10) + '/' + dia.slice(5, 7) };
      series.forEach(s => { linha[s.key] = 0; });
      return linha;
    });
    // Preenche acumulado por vendedora
    series.forEach(s => {
      let acum = 0;
      rows.forEach(row => {
        acum += s.porDia.get(row.dia) || 0;
        row[s.key] = Math.round(acum * 100) / 100;
      });
    });
    return { rows, series };
  }, [vendedoras, dataDe, dataAte]);

  if (dados.rows.length === 0 || dados.series.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-8 text-center text-sm text-gray-400">
        Sem dados pra gráfico.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <Coins className="h-4 w-4 text-emerald-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Vendas acumuladas por vendedora · diário</h3>
        <span className="text-[11px] text-gray-400">top 10</span>
      </div>
      <div className="p-3" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados.rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(v, nome) => [v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), nome]} />
            <Legend wrapperStyle={{ fontSize: 10 }} iconType="line" />
            {dados.series.map(s => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.nome}
                stroke={s.cor} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Heatmap hora × dia da semana ─────────────────────────────
// Grid 7 colunas (dom→sáb) × 24 linhas (0h→23h). Intensidade da cor =
// faturamento na célula.
function HeatmapHoraXDow({ heatmap }) {
  const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const { matriz, max } = useMemo(() => {
    const m = Array.from({ length: 24 }, () => Array(7).fill(0));
    let max = 0;
    if (heatmap instanceof Map) {
      heatmap.forEach((fat, k) => {
        const [dow, hh] = String(k).split('-').map(Number);
        if (Number.isFinite(dow) && Number.isFinite(hh) && dow >= 0 && dow < 7 && hh >= 0 && hh < 24) {
          m[hh][dow] = fat;
          if (fat > max) max = fat;
        }
      });
    }
    return { matriz: m, max };
  }, [heatmap]);

  const corCell = (valor) => {
    if (!valor || max <= 0) return { backgroundColor: '#f9fafb', color: '#d1d5db' };
    const intensity = valor / max;
    const opacity = 0.12 + 0.78 * intensity;
    return {
      backgroundColor: `rgba(16, 185, 129, ${opacity})`,
      color: intensity > 0.6 ? '#fff' : '#065f46',
    };
  };

  if (max === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-8 text-center text-sm text-gray-400">
        Sem dados de hora/dia da semana.
      </div>
    );
  }

  // Linhas só pras horas com vendas (evita 24 linhas vazias)
  const horasComVendas = matriz
    .map((row, h) => ({ h, soma: row.reduce((s, v) => s + v, 0) }))
    .filter(r => r.soma > 0)
    .map(r => r.h);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-emerald-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Vendas por hora × dia da semana</h3>
        <span className="text-[11px] text-gray-400">intensidade = faturamento</span>
      </div>
      <div className="p-3 overflow-x-auto">
        <table className="w-full text-[10.5px] tabular-nums">
          <thead>
            <tr>
              <th className="px-2 py-1 text-right font-semibold text-gray-500">Hora</th>
              {DOW_LABELS.map(d => (
                <th key={d} className="px-1 py-1 text-center font-semibold text-gray-500">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horasComVendas.map(h => (
              <tr key={h}>
                <td className="px-2 py-0.5 text-right text-gray-500 font-mono">
                  {String(h).padStart(2, '0')}h
                </td>
                {matriz[h].map((v, dow) => (
                  <td key={dow} className="px-0.5 py-0.5">
                    <div className="rounded text-center py-1 px-1 font-medium" style={corCell(v)}
                      title={`${DOW_LABELS[dow]} ${String(h).padStart(2, '0')}h: ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
                      {v > 0 ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v >= 100 ? Math.round(v) : '·') : ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
