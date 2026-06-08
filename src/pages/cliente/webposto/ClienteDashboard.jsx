// Webposto · Visão Geral — layout focado em "fechar o dia":
// - 4 KPIs com sparkline diário do mês (Lucro · Litros · LB/litro · Margem)
// - Donut de categorias + projeção por categoria + tabela combustíveis
// - Contas a pagar hoje + Contas a receber hoje (cartões/duplicatas)
// - Cheques (vencidos/hoje) + Títulos (vencidos/faturados hoje)

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, AlertCircle, RefreshCw, Calendar, Building2,
  TrendingUp, TrendingDown, Minus, Fuel, Droplet, Percent, Receipt, CreditCard, FileText, Banknote,
  ArrowUpRight, ArrowDownLeft, ArrowRight, AlertTriangle, CheckCircle2,
  PieChart as PieChartIcon, Info,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { formatCurrency } from '../../../utils/format';

import {
  construirArvoreWebposto, totalizarArvore,
  buscarVendasComercialHibridoWebposto, buscarKpisPeriodoHibridoWebposto,
} from '../../../utils/vendasArvoreWebposto';
import EmpresaMultiSelect from '../../../components/vendas/EmpresaMultiSelect';
import { formatNumero } from '../../../components/vendas/VendasCompartilhado';
import BannerCarregando from '../../../components/vendas/BannerCarregando';
import { classificarItem } from '../../../services/mapeamentoVendasService';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil } from '../../../utils/diasUteis';
import { lerCache as lerCacheV2, salvarCache as salvarCacheV2 } from '../../../services/webpostoCacheV3';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import IndicadorAtualizacao from '../../../components/vendas/IndicadorAtualizacao';

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function isoHoje() { return ymd(new Date()); }
function primeiroDiaDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function ultimoDiaDoMesNum() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function somarDias(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}

// Lê vencimento e valor de QUALQUER shape (Quality varia entre endpoints)
function extrairVenc(c) {
  const raw = c?.dataVencimento || c?.vencimento || c?.dataVencto || c?.vencto || '';
  return String(raw).slice(0, 10);
}
function extrairVal(c) {
  return Number(
    c?.valorPendente ?? c?.valorLiquido ?? c?.valorDuplicata ?? c?.valor ?? 0,
  ) || 0;
}

export default function ClienteDashboard() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const chaveApiSessao = session?.chaveApi?.chave || null;
  const chaveApiNome   = session?.chaveApi?.nome  || '';
  const temPermFinanceiro = (session?.usuario?.permissoes || []).includes('financeiro');

  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);
  const empresasDisponiveis = useMemo(
    () => {
      const base = clientesRede.length > 0 ? clientesRede : (cliente ? [cliente] : []);
      return base.filter(c => c.empresa_codigo != null && c.empresa_codigo !== '');
    },
    [clientesRede, cliente],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(
    () => new Set(empresasDisponiveis.map(c => c.id)),
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
    [empresasDisponiveis, empresasSelIds],
  );

  const dataDe  = useMemo(() => primeiroDiaDoMes(), []);
  const dataAte = useMemo(() => isoHoje(), []);
  // Janelas de comparação MESMO PERÍODO (mesma quantidade de dias):
  //   MA: 1º dia do mês anterior → mesmo dia do mês anterior (clampado
  //       pro último dia do mês se o mês anterior for mais curto)
  //   AA: 1º dia do mesmo mês do ano anterior → mesmo dia do mês ant ano
  //       (clampado pra 28/02 quando o ano anterior não é bissexto)
  const dataDeMA  = useMemo(() => {
    const h = new Date();
    const d = new Date(h.getFullYear(), h.getMonth() - 1, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }, []);
  const dataAteMA = useMemo(() => {
    const h = new Date();
    const ano = h.getFullYear();
    const mesAnt = h.getMonth() - 1;
    const ultimoDiaMesAnt = new Date(ano, mesAnt + 1, 0).getDate();
    const dia = Math.min(h.getDate(), ultimoDiaMesAnt);
    const d = new Date(ano, mesAnt, dia);
    return ymd(d);
  }, []);
  const dataDeAA  = useMemo(() => {
    const h = new Date();
    const d = new Date(h.getFullYear() - 1, h.getMonth(), 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }, []);
  const dataAteAA = useMemo(() => {
    const h = new Date();
    const anoAnt = h.getFullYear() - 1;
    const mes = h.getMonth();
    const ultimoDiaMesAA = new Date(anoAnt, mes + 1, 0).getDate();
    const dia = Math.min(h.getDate(), ultimoDiaMesAA);
    const d = new Date(anoAnt, mes, dia);
    return ymd(d);
  }, []);
  const multiEmpresa = empresasSel.length > 1;

  // ─── Dados de vendas (RPC unificada) ──────────────────────
  // Pré-leitura SÍNCRONA do cache v2 no mount: chave determinística por
  // (página, chaveApiId) — não depende de datas variáveis ou ordem de
  // empresas. Hit = dados no primeiro render, sem delay.
  const chaveApiIdAtiva = empresasDisponiveis[0]?.chave_api_id || null;
  const cacheInicial = useMemo(() => {
    return chaveApiIdAtiva ? lerCacheV2('dashboard', chaveApiIdAtiva) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [agregado,   setAgregado]   = useState(() => cacheInicial?.agregado   || null);
  const [agregadoMA, setAgregadoMA] = useState(() => cacheInicial?.agregadoMA || null);
  const [agregadoAA, setAgregadoAA] = useState(() => cacheInicial?.agregadoAA || null);
  const [produtosMap, setProdutosMap] = useState(() =>
    cacheInicial?.produtosMap instanceof Map ? cacheInicial.produtosMap : new Map());
  const [gruposMap,   setGruposMap]   = useState(() =>
    cacheInicial?.gruposMap instanceof Map ? cacheInicial.gruposMap : new Map());
  const [administradorasMap, setAdministradorasMap] = useState(() =>
    cacheInicial?.administradorasMap instanceof Map ? cacheInicial.administradorasMap : new Map());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  // Reseta catálogos quando troca o CONJUNTO de chaves_api (multi-rede).
  // PULA o primeiro mount pra preservar os Maps hidratados do cache.
  const chaveApiIdsRefDash = useRef(null);
  useEffect(() => {
    const atual = empresasSel.map(e => e.chave_api_id).sort().join(',');
    if (chaveApiIdsRefDash.current === null) {
      chaveApiIdsRefDash.current = atual;
      return;
    }
    if (chaveApiIdsRefDash.current === atual) return;
    chaveApiIdsRefDash.current = atual;
    setProdutosMap(new Map());
    setGruposMap(new Map());
    setAdministradorasMap(new Map());
  }, [empresasSel]);

  const carregar = useCallback(async ({ force = false, silencioso = false } = {}) => {
    if (empresasSel.length === 0) return;
    const chaveApiIdCache = empresasSel[0].chave_api_id;
    // Cache v2 — chave determinística (pagina + chaveApiId)
    if (!force) {
      const cache = lerCacheV2('dashboard', chaveApiIdCache);
      if (cache?.agregado) {
        setProdutosMap(cache.produtosMap instanceof Map ? cache.produtosMap : new Map());
        setGruposMap(cache.gruposMap instanceof Map ? cache.gruposMap : new Map());
        setAdministradorasMap(cache.administradorasMap instanceof Map ? cache.administradorasMap : new Map());
        setAgregado(cache.agregado);
        setAgregadoMA(cache.agregadoMA || null);
        setAgregadoAA(cache.agregadoAA || null);
        setLoading(false);
        setErro('');
        return; // cache hit — não faz fetch
      }
    }
    // silencioso=true: não mostra banner (usado pelo auto-refresh em background)
    if (!silencioso) setLoading(true);
    setErro('');
    try {
      const chavesApi = await mapService.listarChavesApi();
      let apiKeyAlguma = chaveApiSessao;
      if (!apiKeyAlguma || session?.chaveApi?.id !== empresasSel[0].chave_api_id) {
        const ch = chavesApi.find(c => c.id === empresasSel[0].chave_api_id);
        if (!ch) throw new Error(`Chave API não encontrada`);
        apiKeyAlguma = ch.chave;
      }
      const precisaCatalogos = produtosMap.size === 0 || gruposMap.size === 0 || administradorasMap.size === 0;
      const chaveApiIdRede = empresasSel[0].chave_api_id;

      const empCodigos = empresasSel.map(e => Number(e.empresa_codigo));
      const empresasInfo = empresasSel.map(e => ({ codigo: Number(e.empresa_codigo), nome: e.fantasia || e.nome }));
      // Etapa 1: busca catálogos + período atual em paralelo. A função
      // híbrida cai pra Quality API direto quando o cache local está
      // vazio (rede recém-cadastrada / sem backfill).
      const [prods, grps, adms, ag] = await Promise.all([
        precisaCatalogos ? qualityApi.buscarProdutos(apiKeyAlguma).catch(() => []) : Promise.resolve(null),
        precisaCatalogos ? qualityApi.buscarGrupos(apiKeyAlguma).catch(() => [])   : Promise.resolve(null),
        precisaCatalogos ? qualityApi.buscarAdministradoras(apiKeyAlguma).catch(() => []) : Promise.resolve(null),
        buscarVendasComercialHibridoWebposto({
          chaveApiId: chaveApiIdRede, empresasCodigos: empCodigos, dataDe, dataAte,
          apiKey: apiKeyAlguma, empresasInfo,
        }),
      ]);

      let pMapFinal = produtosMap;
      let gMapFinal = gruposMap;
      let aMapFinal = administradorasMap;
      if (precisaCatalogos) {
        const pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        const gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        const aMap = new Map();
        (adms || []).forEach(a => {
          const cod = a.administradoraCodigo ?? a.codigo ?? a.codigoAdministradora;
          const nome = a.descricao || a.nomeAdministradora || a.nome
            || a.razao || a.razaoSocial || a.fantasia || a.nomeFantasia || '';
          if (cod != null && nome) {
            aMap.set(Number(cod), nome);
            aMap.set(cod, nome);
          }
        });
        setProdutosMap(pMap);
        setGruposMap(gMap);
        setAdministradorasMap(aMap);
        pMapFinal = pMap; gMapFinal = gMap; aMapFinal = aMap;
      }
      setAgregado(ag);

      // Etapa 2: agora que sabemos quais produtos são combustível,
      // dispara RPC enxuta `cci_webposto_kpis_periodo` pra MA e AA em
      // paralelo. Payload mínimo (4 números por período).
      const produtosCombustivel = [];
      pMapFinal.forEach((_, codigo) => {
        const cat = classificarItem({ produtoCodigo: Number(codigo) }, pMapFinal, gMapFinal);
        if (cat === 'combustivel') produtosCombustivel.push(Number(codigo));
      });
      const [kpisMA, kpisAA] = await Promise.all([
        buscarKpisPeriodoHibridoWebposto({
          chaveApiId: chaveApiIdRede, empresasCodigos: empCodigos,
          dataDe: dataDeMA, dataAte: dataAteMA, produtosCombustivel,
          apiKey: apiKeyAlguma,
        }).catch(() => null),
        buscarKpisPeriodoHibridoWebposto({
          chaveApiId: chaveApiIdRede, empresasCodigos: empCodigos,
          dataDe: dataDeAA, dataAte: dataAteAA, produtosCombustivel,
          apiKey: apiKeyAlguma,
        }).catch(() => null),
      ]);
      setAgregadoMA(kpisMA);
      setAgregadoAA(kpisAA);

      // Salva cache v2 — service trata serialização de Maps automaticamente.
      salvarCacheV2('dashboard', chaveApiIdCache, {
        agregado:    ag,
        agregadoMA:  kpisMA,
        agregadoAA:  kpisAA,
        produtosMap: pMapFinal,
        gruposMap:   gMapFinal,
        administradorasMap: aMapFinal,
      });
    } catch (err) {
      setErro(err.message || 'Falha ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }, [empresasSel, dataDe, dataAte, dataDeMA, dataAteMA, dataDeAA, dataAteAA, produtosMap, gruposMap, administradorasMap, chaveApiSessao, session?.chaveApi?.id]);

  // Auto-carregar SEMPRE — mas o cache hidratado no mount mantém os dados
  // visíveis na tela enquanto a busca acontece em background (banner topo).
  // Sem fetch nunca, dados ficariam desatualizados; com este fetch dá pra
  // navegar entre páginas sem perder dados nem ver tela vazia.
  useEffect(() => {
    if (empresasSel.length > 0) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasSelIds]);

  // Auto-refresh em background a cada 10 min (silencioso — sem banner)
  useAutoRefresh(() => {
    if (empresasSel.length > 0) carregar({ force: true, silencioso: true });
  });

  // ─── Contas a pagar (janela atrás 60d + frente 30d) ───────
  const cacheInicialCP = useMemo(() => {
    return chaveApiIdAtiva && temPermFinanceiro
      ? lerCacheV2('contas-pagar', chaveApiIdAtiva)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [contasPagar, setContasPagar] = useState(() => cacheInicialCP?.lista || []);
  const [loadingCP, setLoadingCP] = useState(false);
  useEffect(() => {
    if (!temPermFinanceiro || empresasSel.length === 0) { setContasPagar([]); return; }
    let cancelado = false;
    const chaveApiIdCache = empresasSel[0].chave_api_id;
    const cache = lerCacheV2('contas-pagar', chaveApiIdCache);
    if (cache?.lista) {
      setContasPagar(cache.lista);
      return; // cache hit — não faz fetch
    }
    if (contasPagar.length === 0) setLoadingCP(true);
    const hoje = isoHoje();
    const filtros = (emp) => ({
      dataInicial: somarDias(hoje, -60),
      dataFinal:   somarDias(hoje, +30),
      empresaCodigo: emp.empresa_codigo,
      apenasPendente: true,
      dataFiltro: 'VENCIMENTO',
    });
    (async () => {
      try {
        const chavesApi = await mapService.listarChavesApi();
        const lists = await Promise.all(empresasSel.map(async (emp) => {
          const ch = chavesApi.find(c => c.id === emp.chave_api_id);
          const apiKey = ch?.chave || chaveApiSessao;
          if (!apiKey) return [];
          const arr = await qualityApi.buscarTitulosPagar(apiKey, filtros(emp)).catch(() => []);
          return arr.map(r => ({ ...r, _empresaNome: emp.fantasia || emp.nome, _empresaId: emp.id }));
        }));
        if (!cancelado) {
          const lista = lists.flat();
          setContasPagar(lista);
          salvarCacheV2('contas-pagar', chaveApiIdCache, { lista });
        }
      } finally { if (!cancelado) setLoadingCP(false); }
    })();
    return () => { cancelado = true; };
  }, [empresasSelIds, temPermFinanceiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Contas a receber (janela 2 anos atrás → +30 dias) ────
  // Inclui títulos, duplicatas, cartões e cheques. Stale-while-revalidate
  // igual contas a pagar — mostra cache imediato, atualiza em background.
  const cacheInicialCR = useMemo(() => {
    return chaveApiIdAtiva && temPermFinanceiro
      ? lerCacheV2('contas-receber', chaveApiIdAtiva)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [contasReceberRows, setContasReceberRows] = useState(() => cacheInicialCR?.lista || []);
  const [loadingCR, setLoadingCR] = useState(false);
  useEffect(() => {
    if (!temPermFinanceiro || empresasSel.length === 0) { setContasReceberRows([]); return; }
    let cancelado = false;
    const chaveApiIdCache = empresasSel[0].chave_api_id;
    const cache = lerCacheV2('contas-receber', chaveApiIdCache);
    if (cache?.lista) {
      setContasReceberRows(cache.lista);
      return; // cache hit — não faz fetch
    }
    if (contasReceberRows.length === 0) setLoadingCR(true);
    const hoje = isoHoje();
    const filtros = (emp) => ({
      dataInicial: somarDias(hoje, -730),
      dataFinal:   somarDias(hoje, +30),
      empresaCodigo: emp.empresa_codigo,
      apenasPendente: true,
      dataFiltro: 'VENCIMENTO',
    });
    (async () => {
      try {
        const chavesApi = await mapService.listarChavesApi();
        const todas = await Promise.all(empresasSel.map(async (emp) => {
          const ch = chavesApi.find(c => c.id === emp.chave_api_id);
          const apiKey = ch?.chave || chaveApiSessao;
          if (!apiKey) return [];
          const [tit, dup, car, che] = await Promise.all([
            qualityApi.buscarTitulosReceber(apiKey, filtros(emp)).catch(() => []),
            qualityApi.buscarDuplicatas(apiKey, filtros(emp)).catch(() => []),
            qualityApi.buscarCartoes(apiKey, filtros(emp)).catch(() => []),
            qualityApi.buscarCheques(apiKey, filtros(emp)).catch(() => []),
          ]);
          const tag = (arr, fonte) => arr.map(r => ({ ...r, _fonte: fonte, _empresaNome: emp.fantasia || emp.nome, _empresaId: emp.id }));
          return [...tag(tit, 'titulos'), ...tag(dup, 'duplicatas'), ...tag(car, 'cartoes'), ...tag(che, 'cheques')];
        }));
        if (!cancelado) {
          const lista = todas.flat();
          setContasReceberRows(lista);
          salvarCacheV2('contas-receber', chaveApiIdCache, { lista });
        }
      } finally { if (!cancelado) setLoadingCR(false); }
    })();
    return () => { cancelado = true; };
  }, [empresasSelIds, temPermFinanceiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Árvore agregada + totais do mês ──────────────────────
  const arvore = useMemo(() => {
    if (!agregado || empresasSel.length === 0) return [];
    const mapaEmpresas = new Map(empresasSel.map(e => [Number(e.empresa_codigo), e.fantasia || e.nome]));
    // Construímos via shape "rows agregadas" — reusamos helper utilitário
    const rows = agregado.resumo || [];
    // Transformamos rows pra periodos esperados (não temos MA/AA aqui)
    // Mais simples: usamos diretamente os rows para os totais.
    // Construir uma árvore precisa de itens/vendas — mas a Visão Geral
    // só precisa de totais. Vamos calcular diretamente.
    return rows.map(r => ({ ...r, _empresa: mapaEmpresas.get(Number(r.empresa_codigo)) || `Empresa ${r.empresa_codigo}` }));
  }, [agregado, empresasSel]);

  // Classificador (combustivel/automotivos/conveniencia) sob demanda
  const classificar = useCallback((produtoCodigo) => {
    const cat = classificarItem({ produtoCodigo: Number(produtoCodigo) }, produtosMap, gruposMap);
    return cat === 'outros' ? 'automotivos' : cat;
  }, [produtosMap, gruposMap]);

  // Totais do mês (Lucro / Faturamento / Litros / por categoria)
  const totaisMes = useMemo(() => {
    const out = {
      fat: 0, custo: 0, lucro: 0, litros: 0,
      porCat: {
        combustivel:  { fat: 0, custo: 0, lucro: 0, qtd: 0 },
        automotivos:  { fat: 0, custo: 0, lucro: 0, qtd: 0 },
        conveniencia: { fat: 0, custo: 0, lucro: 0, qtd: 0 },
      },
      porProdutoCombustivel: new Map(),
    };
    (arvore || []).forEach(r => {
      const fat   = Number(r.fat_atual)   || 0;
      const custo = Number(r.custo_atual) || 0;
      const qtd   = Number(r.qtd_atual)   || 0;
      const cat = classificar(r.produto_codigo);
      out.fat += fat; out.custo += custo;
      if (cat === 'combustivel') out.litros += qtd;
      if (out.porCat[cat]) {
        out.porCat[cat].fat   += fat;
        out.porCat[cat].custo += custo;
        out.porCat[cat].lucro += (fat - custo);
        out.porCat[cat].qtd   += qtd;
      }
      if (cat === 'combustivel') {
        const k = Number(r.produto_codigo);
        let cur = out.porProdutoCombustivel.get(k);
        if (!cur) {
          const p = produtosMap.get(k);
          cur = { codigo: k, nome: p?.nome || p?.descricao || `#${k}`, fat: 0, custo: 0, qtd: 0 };
          out.porProdutoCombustivel.set(k, cur);
        }
        cur.fat += fat; cur.custo += custo; cur.qtd += qtd;
      }
    });
    out.lucro = out.fat - out.custo;
    return out;
  }, [arvore, classificar, produtosMap]);

  // Projeção pro fim do mês
  const projecao = useMemo(() => {
    const diasPeriodo = Number(agregado?.diasPeriodo) || 1;
    const diasMes     = Number(agregado?.diasMes) || ultimoDiaDoMesNum();
    const fator = diasMes / diasPeriodo;
    return { diasPeriodo, diasMes, fator, projetar: (v) => Number(v) * fator };
  }, [agregado]);

  // Totais MA/AA vêm prontos da RPC `cci_webposto_kpis_periodo` no shape
  // { fat, custo, litros, qtdVendas }. Apenas derivamos `lucro`.
  const totaisMA = useMemo(() => agregadoMA ? { ...agregadoMA, lucro: agregadoMA.fat - agregadoMA.custo } : null, [agregadoMA]);
  const totaisAA = useMemo(() => agregadoAA ? { ...agregadoAA, lucro: agregadoAA.fat - agregadoAA.custo } : null, [agregadoAA]);

  // ─── Contas filtradas (HOJE ou PRÓXIMO ÚTIL) ──────────────
  // Quando hoje não é dia útil (sáb/dom/feriado), tudo que vence entre
  // o dia atual e o próximo dia útil é "pago/recebido no próximo útil".
  const hoje = isoHoje();
  const infoHoje = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const ehUtil = ehDiaUtil(d);
    const proxUtil = proximoDiaUtil(d);
    const proxUtilIso = isoDateUtil(proxUtil);
    // Conjunto de datas que rolarão pro próximo dia útil
    const datas = new Set([proxUtilIso]);
    if (!ehUtil) {
      const cur = new Date(proxUtil); cur.setDate(cur.getDate() - 1);
      while (!ehDiaUtil(cur)) {
        datas.add(isoDateUtil(cur));
        cur.setDate(cur.getDate() - 1);
      }
    }
    // Label pra exibição
    const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const labelProx = `${DOW[proxUtil.getDay()]} ${String(proxUtil.getDate()).padStart(2, '0')}/${String(proxUtil.getMonth() + 1).padStart(2, '0')}`;
    return { ehUtil, datas, proxUtilIso, labelProx };
  }, [hoje]);

  // Sempre testa contra o conjunto `infoHoje.datas` (que cobre 1 dia se
  // hoje é útil, ou múltiplos dias se hoje é sáb/dom/feriado)
  const venceHoje = (c) => infoHoje.datas.has(extrairVenc(c));
  // A pagar HOJE — agrupado por empresa
  const aPagarHoje = useMemo(() => {
    const filtrados = (contasPagar || []).filter(venceHoje);
    const total = filtrados.reduce((s, c) => s + extrairVal(c), 0);
    // Por empresa
    const porEmp = new Map();
    filtrados.forEach(c => {
      const k = c._empresaNome || 'Sem empresa';
      let cur = porEmp.get(k);
      if (!cur) { cur = { empresa: k, total: 0, qtd: 0, contas: [] }; porEmp.set(k, cur); }
      cur.total += extrairVal(c); cur.qtd++;
      cur.contas.push(c);
    });
    const porEmpresa = Array.from(porEmp.values()).sort((a, b) => b.total - a.total);
    const top6 = [...filtrados].sort((a, b) => extrairVal(b) - extrairVal(a)).slice(0, 6);
    return { total, qtd: filtrados.length, porEmpresa, top6, todas: filtrados };
  }, [contasPagar, hoje, infoHoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // A receber HOJE — só cartões + duplicatas (conforme pedido)
  const aReceberHoje = useMemo(() => {
    const filtrados = (contasReceberRows || []).filter(c =>
      venceHoje(c) &&
      (c._fonte === 'cartoes' || c._fonte === 'duplicatas'),
    );
    const total = filtrados.reduce((s, c) => s + extrairVal(c), 0);
    const cartoes    = filtrados.filter(c => c._fonte === 'cartoes');
    const duplicatas = filtrados.filter(c => c._fonte === 'duplicatas');
    // Top 3 administradoras dos cartões (somando valores). Lookup
    // tenta o catálogo primeiro (resolve pelo código), depois fallback
    // pra qualquer campo de nome embutido no próprio cartão.
    const porAdm = new Map();
    cartoes.forEach(c => {
      const cod = c.administradoraCodigo ?? c.codigoAdministradora ?? c.codigo ?? null;
      const nomeDoCatalogo = cod != null
        ? (administradorasMap.get(Number(cod)) || administradorasMap.get(cod))
        : null;
      const nome = nomeDoCatalogo
        || c.administradoraNome || c.nomeAdministradora || c.administradora
        || c.descricao || c.fantasia || c.nomeFantasia
        || (cod != null ? `Administradora ${cod}` : 'Sem administradora');
      let cur = porAdm.get(nome);
      if (!cur) { cur = { nome, total: 0, qtd: 0 }; porAdm.set(nome, cur); }
      cur.total += extrairVal(c); cur.qtd++;
    });
    const topAdm = Array.from(porAdm.values()).sort((a, b) => b.total - a.total).slice(0, 3);
    return {
      total, qtd: filtrados.length,
      cartoes: { qtd: cartoes.length, total: cartoes.reduce((s, c) => s + extrairVal(c), 0), itens: cartoes, topAdm },
      duplicatas: { qtd: duplicatas.length, total: duplicatas.reduce((s, c) => s + extrairVal(c), 0), itens: duplicatas },
    };
  }, [contasReceberRows, hoje, infoHoje, administradorasMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cheques — vencidos + hoje
  const cheques = useMemo(() => {
    const todos = (contasReceberRows || []).filter(c => c._fonte === 'cheques');
    const vencidos = todos.filter(c => {
      const v = extrairVenc(c); return v && v < hoje;
    });
    const hojeArr = todos.filter(venceHoje);
    return {
      vencidos: { qtd: vencidos.length, total: vencidos.reduce((s, c) => s + extrairVal(c), 0), itens: vencidos },
      hoje:     { qtd: hojeArr.length,  total: hojeArr.reduce((s, c) => s + extrairVal(c), 0),  itens: hojeArr },
    };
  }, [contasReceberRows, hoje, infoHoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // Títulos — vencidos + faturados no próximo útil
  const titulos = useMemo(() => {
    const todos = (contasReceberRows || []).filter(c => c._fonte === 'titulos');
    const vencidos = todos.filter(c => {
      const v = extrairVenc(c); return v && v < hoje;
    });
    const hojeArr = todos.filter(venceHoje);
    return {
      vencidos: { qtd: vencidos.length, total: vencidos.reduce((s, c) => s + extrairVal(c), 0), itens: vencidos },
      hoje:     { qtd: hojeArr.length,  total: hojeArr.reduce((s, c) => s + extrairVal(c), 0),  itens: hojeArr },
    };
  }, [contasReceberRows, hoje, infoHoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dados pra donut
  const categoriaDonut = useMemo(() => [
    { key: 'combustivel',  nome: 'Combustível',  valor: totaisMes.porCat.combustivel.lucro,  cor: '#f59e0b' },
    { key: 'automotivos',  nome: 'Automotivos',  valor: totaisMes.porCat.automotivos.lucro,  cor: '#3b82f6' },
    { key: 'conveniencia', nome: 'Conveniência', valor: totaisMes.porCat.conveniencia.lucro, cor: '#10b981' },
  ].filter(c => c.valor > 0), [totaisMes]);
  const totalDonut = categoriaDonut.reduce((s, c) => s + c.valor, 0);

  // Lucro bruto / litro (combustível)
  const lbPorLitro = totaisMes.porCat.combustivel.qtd > 0
    ? totaisMes.porCat.combustivel.lucro / totaisMes.porCat.combustivel.qtd : 0;
  const margem = totaisMes.fat > 0 ? (totaisMes.lucro / totaisMes.fat) * 100 : 0;

  // ─── Render ──────────────────────────────────────────────
  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Visão Geral" description="Indicadores principais" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem empresas Webposto com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Visão Geral" description={chaveApiNome || 'Indicadores principais'}>
        <span className="hidden sm:inline-flex text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap items-center gap-1">
          <Calendar className="h-3 w-3" /> Mês corrente
        </span>
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
        <IndicadorAtualizacao pagina="dashboard" chaveApiId={chaveApiIdAtiva} />
        <button onClick={() => carregar({ force: true })} disabled={loading || empresasSel.length === 0}
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      <BannerCarregando aberto={loading} mensagem="Atualizando indicadores..." />

      {loading && !agregado ? (
        <div className="h-32" />
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{erro}</p>
        </div>
      ) : (
        <>
          {/* Aviso: dados ao vivo (cache local ainda não sincronizado) */}
          {agregado?._fonte === 'quality-fallback' && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-blue-800 leading-snug">
                <strong>Sincronização local pendente</strong> — esta rede ainda não foi importada pro cache.
                Os indicadores abaixo estão sendo lidos <strong>ao vivo</strong> da Quality
                (pode ser mais lento que o normal). Após o primeiro backfill admin, ficará instantâneo.
              </p>
            </div>
          )}

          {/* 4 KPIs com comparação vs MA e AA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiComparativo
              label="Lucro bruto" icone={TrendingUp} cor="emerald"
              valor={formatCurrency(totaisMes.lucro)}
              proj={formatCurrency(projecao.projetar(totaisMes.lucro))}
              negativo={totaisMes.lucro < 0}
              atual={totaisMes.lucro}
              maValor={totaisMA?.lucro} aaValor={totaisAA?.lucro} formatBase={formatCurrency} />
            <KpiComparativo
              label="Litros vendidos" icone={Fuel} cor="amber"
              valor={`${formatNumero(totaisMes.litros, 0)} L`}
              proj={`${formatNumero(projecao.projetar(totaisMes.litros), 0)} L`}
              atual={totaisMes.litros}
              maValor={totaisMA?.litros} aaValor={totaisAA?.litros}
              formatBase={(v) => `${formatNumero(v, 0)} L`} />
            <KpiComparativo
              label="Lucro bruto por litro" icone={Droplet} cor="rose"
              valor={formatCurrency(lbPorLitro)}
              negativo={lbPorLitro < 0}
              atual={lbPorLitro}
              maValor={totaisMA && totaisMA.litros > 0 ? totaisMA.lucro / totaisMA.litros : null}
              aaValor={totaisAA && totaisAA.litros > 0 ? totaisAA.lucro / totaisAA.litros : null}
              formatBase={formatCurrency} />
            <KpiComparativo
              label="Margem" icone={Percent} cor="violet"
              valor={`${margem.toFixed(1)}%`}
              negativo={margem < 0}
              atual={margem}
              maValor={totaisMA && totaisMA.fat > 0 ? (totaisMA.lucro / totaisMA.fat) * 100 : null}
              aaValor={totaisAA && totaisAA.fat > 0 ? (totaisAA.lucro / totaisAA.fat) * 100 : null}
              formatBase={(v) => `${v.toFixed(1)}%`} />
          </div>

          {/* Donut + Tabela Combustíveis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <DonutPorCategoria categoriaDonut={categoriaDonut} totalDonut={totalDonut}
              totaisMes={totaisMes} projetar={projecao.projetar} />
            <TabelaCombustiveis
              produtos={Array.from(totaisMes.porProdutoCombustivel.values()).sort((a, b) => b.qtd - a.qtd)}
              totalLitros={totaisMes.porCat.combustivel.qtd}
              totalLucro={totaisMes.porCat.combustivel.lucro}
              projetar={projecao.projetar} />
          </div>

          {/* Banner: hoje não é dia útil */}
          {temPermFinanceiro && !infoHoje.ehUtil && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-[11.5px] text-amber-800">
                <strong>Hoje não é dia útil</strong> — os valores abaixo consideram o próximo dia útil
                (<strong className="font-semibold">{infoHoje.labelProx}</strong>), incluindo vencimentos
                de sábado e domingo.
              </p>
            </div>
          )}

          {/* A pagar HOJE + A receber HOJE */}
          {temPermFinanceiro && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <CardAPagarHoje loading={loadingCP && contasPagar.length === 0} info={aPagarHoje} multiEmpresa={multiEmpresa} infoHoje={infoHoje} />
              <CardAReceberHoje loading={loadingCR && contasReceberRows.length === 0} info={aReceberHoje} infoHoje={infoHoje} />
            </div>
          )}

          {/* Cheques + Títulos */}
          {temPermFinanceiro && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <CardCheques loading={loadingCR && contasReceberRows.length === 0} info={cheques} infoHoje={infoHoje} />
              <CardTitulos loading={loadingCR && contasReceberRows.length === 0} info={titulos} infoHoje={infoHoje} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componentes locais ──────────────────────────────────────

// Calcula variação relativa entre 2 valores. Retorna null se a base for 0/null
// (impossível dividir). `pct` é decimal (0.123 = 12.3%).
function calcVar(atual, base) {
  if (base == null || !Number.isFinite(base) || base === 0) return null;
  const pct = (atual - base) / Math.abs(base);
  if (Math.abs(pct) < 0.0005) return { pct: 0, sentido: 'flat' };
  return { pct, sentido: pct > 0 ? 'up' : 'down' };
}

function ChipComparativo({ rotulo, atual, base, formatBase, ehMargem }) {
  const v = calcVar(atual, base);
  if (v == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ring-1 text-gray-500 bg-gray-50 ring-gray-200">
        sem dados {rotulo}
      </span>
    );
  }
  const Icone = v.sentido === 'up' ? TrendingUp : v.sentido === 'down' ? TrendingDown : Minus;
  const cls = v.sentido === 'up' ? 'text-emerald-700 bg-emerald-50 ring-emerald-200'
            : v.sentido === 'down' ? 'text-red-700 bg-red-50 ring-red-200'
            : 'text-gray-600 bg-gray-50 ring-gray-200';
  // Pra margem (já em %): mostramos diferença em pontos percentuais (pp)
  const texto = ehMargem
    ? `${v.pct === 0 ? '0,0' : (v.pct > 0 ? '+' : '')}${(atual - base).toFixed(1)}pp`
    : `${v.sentido === 'flat' ? '0,0%' : `${v.pct > 0 ? '+' : ''}${(v.pct * 100).toFixed(1)}%`}`;
  return (
    <span title={`Base ${rotulo}: ${formatBase ? formatBase(base) : base}`}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ${cls}`}>
      <Icone className="h-2.5 w-2.5" />
      {texto}
      <span className="text-gray-400 font-normal ml-0.5">vs {rotulo}</span>
    </span>
  );
}

function KpiComparativo({ label, icone: Icone, cor, valor, proj, negativo, atual, maValor, aaValor, formatBase }) {
  const PAL = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600' },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600' },
  };
  const Pal = PAL[cor] || PAL.emerald;
  const ehMargem = label === 'Margem';
  return (
    // Card vira flex-col pra empilhar (cabeçalho + valor + projeção)
    // no topo e as pills no rodapé via `mt-auto`. `h-full` garante que
    // os 4 cards do grid tenham a mesma altura.
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col px-4 pt-4 pb-3">
      {/* Bloco superior — ícone + label + valor + projeção */}
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider leading-tight">{label}</p>
            <span title="Comparação contra o mesmo período do mês anterior (MA) e do ano anterior (AA) — mesma quantidade de dias do recorte atual, pra leitura justa."
              className="text-gray-300 hover:text-gray-500 cursor-help flex-shrink-0">
              <Info className="h-3 w-3" />
            </span>
          </div>
          <p className={`text-[20px] font-bold tracking-tight tabular-nums truncate leading-snug mt-0.5 ${negativo ? 'text-red-700' : 'text-gray-900'}`}>
            {valor}
          </p>
          {proj && (
            <p className="text-[10.5px] text-blue-600 leading-tight truncate">
              <span className="text-gray-400">Proj. mês </span>
              <span className="font-semibold tabular-nums">{proj}</span>
            </p>
          )}
        </div>
      </div>
      {/* Pills SEMPRE no rodapé — `mt-auto` empurra pro fim do flex-col */}
      <div className="flex flex-wrap items-center gap-1 mt-auto pt-3">
        <ChipComparativo rotulo="MA" atual={atual} base={maValor} formatBase={formatBase} ehMargem={ehMargem} />
        <ChipComparativo rotulo="AA" atual={atual} base={aaValor} formatBase={formatBase} ehMargem={ehMargem} />
      </div>
    </div>
  );
}

function DonutPorCategoria({ categoriaDonut, totalDonut, totaisMes, projetar }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-blue-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Lucro bruto por categoria · mês</h3>
      </div>
      {categoriaDonut.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-sm text-gray-400">Sem lucro registrado no mês.</div>
      ) : (
        // Layout horizontal: donut compacto à esquerda, tabela à direita
        <div className="grid grid-cols-[140px_1fr] gap-2 p-3 items-center">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={categoriaDonut} dataKey="valor" nameKey="nome"
                cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={2}>
                {categoriaDonut.map((c, i) => <Cell key={i} fill={c.cor} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [formatCurrency(value), name]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr className="text-[8.5px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-2 py-1.5 text-left">Categoria</th>
                  <th className="px-2 py-1.5 text-right">Realizado</th>
                  <th className="px-2 py-1.5 text-right">Proj. mês</th>
                  <th className="px-2 py-1.5 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {categoriaDonut.map(c => {
                  const pct = totalDonut > 0 ? (c.valor / totalDonut) * 100 : 0;
                  return (
                    <tr key={c.key} className="border-t border-gray-100">
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: c.cor }} />
                          <span className="text-gray-700 truncate">{c.nome}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-gray-800 whitespace-nowrap">{formatCurrency(c.valor)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-blue-700 font-semibold whitespace-nowrap">{formatCurrency(projetar(c.valor))}</td>
                      <td className="px-2 py-1 text-right text-gray-500 whitespace-nowrap">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-2 py-1 text-gray-900">Total</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(totaisMes.lucro)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-blue-700 whitespace-nowrap">{formatCurrency(projetar(totaisMes.lucro))}</td>
                  <td className="px-2 py-1 text-right text-gray-500">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TabelaCombustiveis({ produtos, totalLitros, totalLucro, projetar }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Fuel className="h-4 w-4 text-amber-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Combustíveis · projeção do mês</h3>
      </div>
      {produtos.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">Sem combustíveis vendidos no mês.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50">
              <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-right">Litros</th>
                <th className="px-3 py-2 text-right">Proj. litros</th>
                <th className="px-3 py-2 text-right">Lucro</th>
                <th className="px-3 py-2 text-right">Proj. lucro</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map(p => {
                const lucro = p.fat - p.custo;
                return (
                  <tr key={p.codigo} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-800 truncate max-w-[180px]" title={p.nome}>{p.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-800">{formatNumero(p.qtd, 0)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-blue-700 font-semibold">{formatNumero(projetar(p.qtd), 0)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(lucro)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${projetar(lucro) < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(projetar(lucro))}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-1.5 text-gray-900">Total</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-900">{formatNumero(totalLitros, 0)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-blue-700">{formatNumero(projetar(totalLitros), 0)}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${totalLucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totalLucro)}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${projetar(totalLucro) < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(projetar(totalLucro))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CardAPagarHoje({ loading, info, multiEmpresa, infoHoje }) {
  const linkVerTodas = '/cliente/webposto/financeiro/contas-pagar';
  const titulo = infoHoje?.ehUtil ? 'A pagar hoje' : `A pagar no próximo dia útil · ${infoHoje?.labelProx}`;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <ArrowUpRight className="h-4 w-4 text-rose-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">{titulo}</h3>
        <span className="text-[11px] text-gray-400">· {info.qtd} {info.qtd === 1 ? 'conta' : 'contas'} · {formatCurrency(info.total)}</span>
        <Link to={linkVerTodas} className="ml-auto inline-flex items-center gap-1 text-[11px] text-rose-700 hover:text-rose-900 font-medium">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-rose-500" /><span className="text-sm">Carregando...</span>
        </div>
      ) : info.qtd === 0 ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-sm text-gray-500 px-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-300 mb-2" />
          Nenhuma conta a pagar hoje.
        </div>
      ) : multiEmpresa ? (
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50">
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Empresa</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {info.porEmpresa.map(e => (
              <tr key={e.empresa} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-gray-800 truncate">{e.empresa}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-700">{e.qtd}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700 font-semibold">{formatCurrency(e.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-1.5 text-gray-900">Total</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-900">{info.qtd}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700">{formatCurrency(info.total)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50">
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Conta / Fornecedor</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {info.top6.map((c, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className="px-3 py-1.5">
                  <p className="text-gray-800 truncate max-w-[280px]" title={c.fornecedorNome || c.fornecedor || c.nomeFornecedor || c.razao || c.fantasia}>
                    {c.fornecedorNome || c.fornecedor || c.nomeFornecedor || c.razao || c.fantasia || '—'}
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">
                    {c.documento ? `doc ${c.documento}` : ''}
                    {c.parcela ? ` · parc ${c.parcela}` : ''}
                    {c.historico ? ` · ${c.historico}` : ''}
                  </p>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700 font-semibold whitespace-nowrap">
                  {formatCurrency(extrairVal(c))}
                </td>
              </tr>
            ))}
            {info.qtd > 6 && (
              <tr className="border-t border-gray-100 bg-amber-50/40">
                <td className="px-3 py-1.5 text-[11px] text-gray-600 italic" colSpan={2}>
                  + {info.qtd - 6} outras contas — <Link to={linkVerTodas} className="text-rose-700 font-medium hover:underline">ver todas</Link>
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-1.5 text-gray-900">Total ({info.qtd})</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700">{formatCurrency(info.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function CardAReceberHoje({ loading, info, infoHoje }) {
  const linkVerTodas = '/cliente/webposto/financeiro/contas-receber';
  const titulo = infoHoje?.ehUtil ? 'A receber hoje' : `A receber no próximo dia útil · ${infoHoje?.labelProx}`;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">{titulo}</h3>
        <span className="text-[11px] text-gray-400">· cartões + duplicatas · {formatCurrency(info.total)}</span>
        <Link to={linkVerTodas} className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 font-medium">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /><span className="text-sm">Carregando...</span>
        </div>
      ) : info.qtd === 0 ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-sm text-gray-500 px-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-300 mb-2" />
          Nada a receber hoje (cartões ou duplicatas).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <ResumoFonte icone={CreditCard} cor="blue"
              label="Cartões" qtd={info.cartoes.qtd} total={info.cartoes.total} />
            <ResumoFonte icone={Receipt} cor="cyan"
              label="Duplicatas" qtd={info.duplicatas.qtd} total={info.duplicatas.total} />
          </div>
          {info.cartoes.topAdm && info.cartoes.topAdm.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="px-4 py-2 bg-gray-50/60 flex items-center gap-1.5">
                <CreditCard className="h-3 w-3 text-blue-500" />
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Top 3 administradoras dos cartões</p>
              </div>
              <table className="w-full text-[11.5px]">
                <tbody>
                  {info.cartoes.topAdm.map((a, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                          <span className="text-gray-800 truncate max-w-[220px]" title={a.nome}>{a.nome}</span>
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-gray-500 text-[10.5px]">{a.qtd} doc.</td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums text-blue-700 font-semibold whitespace-nowrap">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResumoFonte({ icone: Icone, cor, label, qtd, total }) {
  const PAL = {
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  text: 'text-blue-700' },
    cyan:  { bg: 'bg-cyan-50',  icon: 'text-cyan-600',  text: 'text-cyan-700' },
    rose:  { bg: 'bg-rose-50',  icon: 'text-rose-600',  text: 'text-rose-700' },
    purple:{ bg: 'bg-purple-50',icon: 'text-purple-600',text: 'text-purple-700' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', text: 'text-amber-700' },
  };
  const Pal = PAL[cor] || PAL.blue;
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-lg ${Pal.bg} flex items-center justify-center flex-shrink-0`}>
          <Icone className={`h-3.5 w-3.5 ${Pal.icon}`} />
        </div>
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold tracking-tight ${qtd === 0 ? 'text-gray-300' : Pal.text}`}>
        {qtd === 0 ? '—' : formatCurrency(total)}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {qtd === 0 ? 'nada' : `${qtd} ${qtd === 1 ? 'documento' : 'documentos'}`}
      </p>
    </div>
  );
}

function CardCheques({ loading, info, infoHoje }) {
  const sem = info.vencidos.qtd === 0 && info.hoje.qtd === 0;
  const subtituloHoje = infoHoje?.ehUtil ? 'hoje' : `próximo útil (${infoHoje?.labelProx})`;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Banknote className="h-4 w-4 text-purple-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Cheques</h3>
        <span className="text-[11px] text-gray-400">· vencidos + {subtituloHoje}</span>
      </div>
      {loading ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-purple-500" /><span className="text-sm">Carregando...</span>
        </div>
      ) : sem ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-sm text-gray-500 px-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-300 mb-2" />
          Nenhum cheque vencido ou vencendo {infoHoje?.ehUtil ? 'hoje' : 'no próximo dia útil'}.
        </div>
      ) : (
        <ListaResumoFonte vencidos={info.vencidos} hoje={info.hoje} corVenc="rose" corHoje="amber" infoHoje={infoHoje} />
      )}
    </div>
  );
}

function CardTitulos({ loading, info, infoHoje }) {
  const sem = info.vencidos.qtd === 0 && info.hoje.qtd === 0;
  const subtituloHoje = infoHoje?.ehUtil ? 'faturados hoje' : `faturados no próximo útil (${infoHoje?.labelProx})`;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <FileText className="h-4 w-4 text-amber-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Títulos</h3>
        <span className="text-[11px] text-gray-400">· vencidos + {subtituloHoje}</span>
      </div>
      {loading ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" /><span className="text-sm">Carregando...</span>
        </div>
      ) : sem ? (
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center text-sm text-gray-500 px-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-300 mb-2" />
          Nenhum título vencido ou vencendo {infoHoje?.ehUtil ? 'hoje' : 'no próximo dia útil'}.
        </div>
      ) : (
        <ListaResumoFonte vencidos={info.vencidos} hoje={info.hoje} corVenc="rose" corHoje="amber" infoHoje={infoHoje} />
      )}
    </div>
  );
}

// Sublista: vencidos + hoje com detalhamento cliente / valor
function ListaResumoFonte({ vencidos, hoje, corVenc = 'rose', corHoje = 'amber', infoHoje }) {
  const PAL_TEXT = { rose: 'text-rose-700', amber: 'text-amber-700' };
  const labelHoje = infoHoje?.ehUtil ? 'Hoje' : `Próx. útil · ${infoHoje?.labelProx}`;
  return (
    <div className="divide-y divide-gray-100">
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 ${PAL_TEXT[corVenc]}`} />
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Vencidos</p>
          </div>
          <p className={`text-xl font-bold tracking-tight ${vencidos.qtd === 0 ? 'text-gray-300' : PAL_TEXT[corVenc]}`}>
            {vencidos.qtd === 0 ? '—' : formatCurrency(vencidos.total)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {vencidos.qtd === 0 ? 'nenhum' : `${vencidos.qtd} ${vencidos.qtd === 1 ? 'documento' : 'documentos'}`}
          </p>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Calendar className={`h-3.5 w-3.5 ${PAL_TEXT[corHoje]}`} />
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{labelHoje}</p>
          </div>
          <p className={`text-xl font-bold tracking-tight ${hoje.qtd === 0 ? 'text-gray-300' : PAL_TEXT[corHoje]}`}>
            {hoje.qtd === 0 ? '—' : formatCurrency(hoje.total)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {hoje.qtd === 0 ? 'nenhum' : `${hoje.qtd} ${hoje.qtd === 1 ? 'documento' : 'documentos'}`}
          </p>
        </div>
      </div>
      {/* Top itens (até 5 vencidos + 5 hoje) */}
      {(vencidos.itens.length > 0 || hoje.itens.length > 0) && (
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50">
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-center">Vencimento</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {[...vencidos.itens].sort((a, b) => extrairVal(b) - extrairVal(a)).slice(0, 5).map((t, i) => (
              <tr key={`v${i}`} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <p className="text-gray-800 truncate max-w-[260px]" title={t.nomeCliente}>
                    {t.nomeCliente || `Cliente ${t.clienteCodigo || ''}`}
                  </p>
                </td>
                <td className="px-3 py-1.5 text-center font-mono tabular-nums text-rose-700 text-[11px]">
                  {(extrairVenc(t).split('-').reverse().slice(0, 2).join('/'))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-rose-700 font-semibold whitespace-nowrap">
                  {formatCurrency(extrairVal(t))}
                </td>
              </tr>
            ))}
            {[...hoje.itens].sort((a, b) => extrairVal(b) - extrairVal(a)).slice(0, 5).map((t, i) => (
              <tr key={`h${i}`} className="border-t border-gray-100 bg-amber-50/30">
                <td className="px-3 py-1.5">
                  <p className="text-gray-800 truncate max-w-[260px]" title={t.nomeCliente}>
                    {t.nomeCliente || `Cliente ${t.clienteCodigo || ''}`}
                  </p>
                </td>
                <td className="px-3 py-1.5 text-center text-[11px] text-amber-700 font-medium">HOJE</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-amber-700 font-semibold whitespace-nowrap">
                  {formatCurrency(extrairVal(t))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
