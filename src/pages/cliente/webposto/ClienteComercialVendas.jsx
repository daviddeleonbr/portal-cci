// Webposto · Comercial · Vendas — paridade visual com o autosystem.
// Filtros idênticos: período (dataDe/dataAte), apenas dias fechados,
// multi-select de empresas (todas as Webposto da rede do usuário).

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Fuel, Package, Store, LayoutGrid, Loader2, AlertCircle, RefreshCw,
  Calendar, DollarSign, Percent, Coins, Droplet, PieChart, ShoppingCart,
  LineChart as LineChartIcon,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import BarraProgressoTopo from '../../../components/ui/BarraProgressoTopo';
import { useClienteSession } from '../../../hooks/useAuth';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { formatCurrency } from '../../../utils/format';

import {
  totalizarArvore, totalizarArvoreAA, totalizarArvoreMA,
  construirArvoreWebpostoAgregado,
  buscarVendasComercialWebposto,
  buscarSeriesMargem12mWebposto,
  construirArvoreDiaProdutoAgregado, construirArvoreDiaGrupoAgregado,
  inverterArvoreParaProdutoDia, inverterArvoreParaGrupoDia,
  agregarHeatmapSemanal, calcularPareto, agregarAnaliseMargem,
  construirSerieEvolucaoCombustivel, listarProdutosCombustivelDaSerie,
  construirSerieLinhaTempo, listarGruposDaCategoria, listarProdutosDaCategoria,
  buscarParesCarrinhoWebposto,
  CATEGORIAS,
} from '../../../utils/vendasArvoreWebposto';
import {
  TreeRealizadoPorCombustivel, HeatmapSemanal, Evolucao12mCombustivel,
  TreeRealizadoAutoGrupo, AnalisePareto, AnaliseMargem,
  LinhaDoTempoAuto, CarrinhoCompras,
} from '../../../components/vendas/VendasAvancado';
import { supabase } from '../../../lib/supabase';
import {
  KpiLucro, KpiLucroGlobal, KpiCombustivelDashboard,
  TabelaPostoCategoria, DetalhamentoSetor,
  TabelaProjecaoCombustivel, TabelaProjecaoCategoria,
  TreeRealizadoDia, TreeRealizadoAutoDia,
  agregarGruposDaCategoria, agregarProdutosCombustivel,
  formatNumero,
} from '../../../components/vendas/VendasCompartilhado';
import EmpresaMultiSelect from '../../../components/vendas/EmpresaMultiSelect';
import BannerCarregando from '../../../components/vendas/BannerCarregando';
import { lerCache as lerCacheV2, salvarCache as salvarCacheV2 } from '../../../services/webpostoCacheV3';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import IndicadorAtualizacao from '../../../components/vendas/IndicadorAtualizacao';

// ─── Helpers de data ─────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
function isoHoje() {
  const d = new Date();
  return ymd(d);
}
function ontemIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return ymd(d);
}
function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function minIso(a, b) { return a < b ? a : b; }
function diasNoIntervalo(de, ate) {
  const [y1, m1, d1] = String(de).split('-').map(Number);
  const [y2, m2, d2] = String(ate).split('-').map(Number);
  return Math.max(1, Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000) + 1);
}
// Subtrai 1 mês mantendo dia (clamp se mês menor)
function subtrairUmMes(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const ano = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(d, ultimo))}`;
}
function subtrairUmAno(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const tent = new Date(y - 1, m - 1, d);
  if (tent.getMonth() !== m - 1) {
    const ultimo = new Date(y - 1, m, 0).getDate();
    return `${y - 1}-${pad(m)}-${pad(ultimo)}`;
  }
  return `${y - 1}-${pad(m)}-${pad(d)}`;
}

// ─── Cache em memória ────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map();
const chaveCache = (empIds, de, ate) => `${[...empIds].sort().join(',')}|${de}|${ate}`;

function toggleSet(prev, key) {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

export default function ClienteComercialVendas() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];
  const chaveApiSessao = session?.chaveApi?.chave || null;

  // Empresas elegíveis (com empresa_codigo). Em ambiente single-empresa,
  // `clientesRede` tem só 1 e empresasDisponiveis também.
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
  // Garante seleção inicial = todas após carregamento da sessão
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

  const [loadingDados, setLoadingDados] = useState(false);
  const [bgRefresh, setBgRefresh]       = useState(false);
  const [erro, setErro]                 = useState(null);
  // Cache v3 — chave determinística (pagina + chaveApiId)
  const chaveApiIdAtiva = empresasDisponiveis[0]?.chave_api_id || null;
  const cacheInicialVendas = useMemo(() => {
    try {
      return chaveApiIdAtiva ? lerCacheV2('vendas', chaveApiIdAtiva) : null;
    } catch (err) {
      console.error('[Vendas] erro ao ler cache inicial:', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dadosRaw, setDadosRaw]         = useState(() => {
    try {
      const d = cacheInicialVendas?.dadosRaw;
      // Valida estrutura mínima esperada
      return (d && Array.isArray(d.resumo)) ? d : null;
    } catch { return null; }
  });
  const [produtosMap, setProdutosMap]   = useState(() => {
    try {
      return cacheInicialVendas?.produtosMap instanceof Map ? cacheInicialVendas.produtosMap : new Map();
    } catch { return new Map(); }
  });
  const [gruposMap,   setGruposMap]     = useState(() => {
    try {
      return cacheInicialVendas?.gruposMap instanceof Map ? cacheInicialVendas.gruposMap : new Map();
    } catch { return new Map(); }
  });
  const [seriesMargem, setSeriesMargem] = useState({
    combustivel:  { margem: [], litros: [], lucro: [], lbPorL: [] },
    automotivos:  { margem: [], fat: [],    lucro: [], ticket: [] },
    conveniencia: { margem: [], fat: [],    lucro: [], ticket: [] },
    global:       { margem: [], fat: [],    lucro: [] },
  });
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [tab, setTab] = useState('geral');

  // Filtros
  const [dataDe, setDataDe]             = useState(inicioMesAtual());
  const [dataAte, setDataAte]           = useState(ontemIso());
  const [apenasFechados, setApenasFechados] = useState(true);

  const handleApenasFechadosChange = (checked) => {
    setApenasFechados(checked);
    if (checked) {
      const ontem = ontemIso();
      if (dataAte > ontem) setDataAte(ontem);
    } else {
      setDataAte(isoHoje());
    }
  };

  // Data limite real usada nas consultas — clamp em ontem quando "apenas fechados"
  const dataAteEfetivo = useMemo(
    () => apenasFechados ? minIso(dataAte, ontemIso()) : dataAte,
    [dataAte, apenasFechados],
  );

  // Reseta catálogos quando troca o CONJUNTO de chaves_api (multi-rede).
  // PULA o primeiro mount pra preservar os Maps hidratados do cache.
  const chaveApiIdsRef = useRef(null);
  useEffect(() => {
    const atual = empresasSel.map(e => e.chave_api_id).sort().join(',');
    if (chaveApiIdsRef.current === null) {
      // 1º mount — só registra valor inicial, não reseta
      chaveApiIdsRef.current = atual;
      return;
    }
    if (chaveApiIdsRef.current === atual) return; // não mudou
    chaveApiIdsRef.current = atual;
    setProdutosMap(new Map());
    setGruposMap(new Map());
  }, [empresasSel]);

  // ─── Fetch principal ────────────────────────────────────
  // Estratégia: usa 2 RPCs no Supabase que agregam direto no banco
  // (cci_webposto_resumo_3periodos + cci_webposto_dia_produto). Em vez
  // de baixar 100k+ rows granulares, recebe ~5k rows já pré-agregadas
  // e o front só monta a árvore. Tempo cai de 3-5s pra <1s.
  const carregar = useCallback(async ({ force = false, silencioso = false } = {}) => {
    if (empresasSel.length === 0) return;
    const empIds = empresasSel.map(e => e.id);
    const key = chaveCache(empIds, dataDe, dataAteEfetivo);
    const chaveApiIdAtual = empresasSel[0].chave_api_id;

    if (!force) {
      // 1) cache em memória (rápido, mesma sessão da page)
      const cached = _cache.get(key);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        setDadosRaw(cached.dadosRaw);
        setProdutosMap(cached.produtosMap);
        setGruposMap(cached.gruposMap);
        setLoadingDados(false);
        setBgRefresh(false);
        setErro(null);
        return; // cache hit memória — sem fetch
      }
      // 2) cache v2 em localStorage
      const persisted = lerCacheV2('vendas', chaveApiIdAtual);
      if (persisted?.dadosRaw) {
        setDadosRaw(persisted.dadosRaw);
        if (persisted.produtosMap instanceof Map) setProdutosMap(persisted.produtosMap);
        if (persisted.gruposMap   instanceof Map) setGruposMap(persisted.gruposMap);
        setLoadingDados(false);
        setBgRefresh(false);
        setErro(null);
        return; // cache hit localStorage — sem fetch
      }
    }
    if (!silencioso) setLoadingDados(true);
    setErro(null);

    try {
      // Catálogos da Quality continuam vindo via apiKey (tem cache 1h)
      const chavesApi = await mapService.listarChavesApi();
      let apiKeyCatalogo = chaveApiSessao;
      if (!apiKeyCatalogo || session?.chaveApi?.id !== empresasSel[0].chave_api_id) {
        const ch = chavesApi.find(c => c.id === empresasSel[0].chave_api_id);
        if (!ch) throw new Error(`Chave API não encontrada para "${empresasSel[0].fantasia || empresasSel[0].nome}"`);
        apiKeyCatalogo = ch.chave;
      }

      // Janelas MA/AA mantêm o número de dias do recorte atual
      const atualDe = dataDe;
      const atualAte = dataAteEfetivo;
      const maDe   = subtrairUmMes(atualDe);
      const maAte  = subtrairUmMes(atualAte);
      const aaDe   = subtrairUmAno(atualDe);
      const aaAte  = subtrairUmAno(atualAte);

      const precisaCatalogos = produtosMap.size === 0 || gruposMap.size === 0;
      const chaveApiIdRede = empresasSel[0].chave_api_id;
      const empresasCodigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);

      const inicio = performance.now();

      // 3 fetches paralelos: catálogos (se precisa) + 1 RPC unificada
      const [prods, grps, agregado] = await Promise.all([
        precisaCatalogos ? qualityApi.buscarProdutos(apiKeyCatalogo).catch(() => []) : Promise.resolve(null),
        precisaCatalogos ? qualityApi.buscarGrupos(apiKeyCatalogo).catch(() => [])   : Promise.resolve(null),
        buscarVendasComercialWebposto({
          chaveApiId: chaveApiIdRede,
          empresasCodigos,
          dataDe:  atualDe,
          dataAte: atualAte,
        }),
      ]);

      let pMap = produtosMap, gMap = gruposMap;
      if (precisaCatalogos) {
        pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        setProdutosMap(pMap);
        setGruposMap(gMap);
      }

      const dadosRawNew = {
        resumo:      agregado.resumo,       // 1 linha por (empresa, produto) com totais atual+MA+AA
        diaProduto:  agregado.diaProduto,   // 1 linha por (dia, empresa, produto) só do período atual
        diasPeriodo: agregado.diasPeriodo,  // pra projeção
        diasMes:     agregado.diasMes,
        tempoMs: Math.round(performance.now() - inicio),
      };
      // eslint-disable-next-line no-console
      console.info('[vendas RPC unificada]', {
        resumoRows: agregado.resumo.length,
        diaProdutoRows: agregado.diaProduto.length,
        diasPeriodo: agregado.diasPeriodo,
        diasMes: agregado.diasMes,
        ms: dadosRawNew.tempoMs,
      });
      setDadosRaw(dadosRawNew);
      _cache.set(key, { timestamp: Date.now(), dadosRaw: dadosRawNew, produtosMap: pMap, gruposMap: gMap });
      // Persiste em localStorage v2
      salvarCacheV2('vendas', chaveApiIdAtual, {
        dadosRaw: dadosRawNew,
        produtosMap: pMap,
        gruposMap: gMap,
      });
    } catch (err) {
      setErro('Erro ao buscar vendas: ' + err.message);
    } finally {
      setLoadingDados(false);
      setBgRefresh(false);
    }
  }, [empresasSel, dataDe, dataAteEfetivo, produtosMap, gruposMap, chaveApiSessao, session?.chaveApi?.id]);

  // Séries 12m de margem (sparklines dos KPIs da Visão geral). Buscado
  // em paralelo SEM bloquear a tela. Tem cache localStorage (24h) porque
  // só muda após sync diário do cron — não precisa refetch a cada
  // navegação.
  useEffect(() => {
    const chaveApiId = empresasSel[0]?.chave_api_id;
    if (!chaveApiId || empresasSel.length === 0 || produtosMap.size === 0) return;
    let cancelado = false;
    const empIds = empresasSel.map(e => e.id);
    // Tenta cache v3: hit = usa imediato sem refetch (séries só mudam após
    // sync diário do cron). Inclui o dia atual na "chave" via prefixo.
    const cacheSeries = lerCacheV2('series12m', chaveApiId);
    const hoje = new Date().toISOString().slice(0, 10);
    if (cacheSeries?.series && cacheSeries?.dia === hoje) {
      setSeriesMargem(cacheSeries.series);
      return;
    }
    setLoadingSeries(true);
    buscarSeriesMargem12mWebposto({
      chaveApiId,
      empresasCodigos: empresasSel.map(e => Number(e.empresa_codigo)),
      produtosMap, gruposMap,
    }).then(s => {
      if (cancelado) return;
      setSeriesMargem(s);
      salvarCacheV2('series12m', chaveApiId, { series: s, dia: hoje });
    })
      .catch(err => console.error('[series 12m]', err))
      .finally(() => { if (!cancelado) setLoadingSeries(false); });
    return () => { cancelado = true; };
  }, [empresasSelIds, produtosMap, gruposMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carregamento automático SÓ na primeira vez que as empresas ficam
  // disponíveis (entrada na página). Mudanças posteriores em filtros
  // (data, empresas) NÃO disparam fetch — o usuário precisa clicar em
  // "Atualizar" pra aplicar.
  const primeiraCargaRef = useRef(false);
  useEffect(() => {
    if (primeiraCargaRef.current) return;
    if (empresasSel.length === 0) return;
    primeiraCargaRef.current = true;
    // carregar() já checa cache exato; só faz fetch se miss
    dispararCarregamento(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasSel.length]);

  // Auto-refresh em background a cada 10 min (silencioso — sem banner)
  useAutoRefresh(() => {
    if (empresasSel.length > 0) carregar({ force: true, silencioso: true });
  });

  // Snapshot dos filtros APLICADOS — fonte de verdade pra tudo que é
  // renderizado (description, projeção, modal, tree). Os inputs do
  // header continuam mostrando os valores que o usuário está editando,
  // mas TUDO no corpo da página usa essa snapshot até clicar "Aplicar".
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    dataDe, dataAte: dataAteEfetivo, empresasIds: new Set(),
  });

  // Wrapper que atualiza o snapshot ANTES de carregar — assim a UI já
  // reflete os filtros que estão sendo carregados (modal mostra período
  // correto mesmo se usuário continuar mexendo nos inputs).
  // `force=true` por default — usado pelo botão "Atualizar" que pede
  // refresh explícito. Na 1ª carga da página passamos `false` pra honrar
  // o cache local (sem modal). Pra evitar TypeError quando o botão envia
  // o event como argumento, qualquer valor que não seja exatamente `false`
  // é tratado como true.
  const dispararCarregamento = useCallback((force) => {
    setFiltrosAplicados({
      dataDe, dataAte: dataAteEfetivo,
      empresasIds: new Set(empresasSelIds),
    });
    carregar({ force: force !== false });
  }, [dataDe, dataAteEfetivo, empresasSelIds, carregar]);

  // Indica visualmente que há filtro alterado e ainda não foi aplicado.
  const filtrosPendentes = useMemo(() => {
    if (!dadosRaw) return false;
    if (dataDe         !== filtrosAplicados.dataDe)  return true;
    if (dataAteEfetivo !== filtrosAplicados.dataAte) return true;
    const a = filtrosAplicados.empresasIds;
    if (a.size !== empresasSelIds.size) return true;
    for (const id of empresasSelIds) if (!a.has(id)) return true;
    return false;
  }, [dadosRaw, dataDe, dataAteEfetivo, empresasSelIds, filtrosAplicados]);

  // Helpers pra usar nas seções de exibição (description, projetar, etc).
  // Sempre os filtros que correspondem aos DADOS carregados.
  const dataDeAplicada  = filtrosAplicados.dataDe;
  const dataAteAplicada = filtrosAplicados.dataAte;
  const qtdEmpresasAplicadas = filtrosAplicados.empresasIds.size;

  // ─── Constrói árvore (a partir das rows do RPC) ──────────
  const arvore = useMemo(() => {
    if (!dadosRaw || empresasSel.length === 0) return [];
    const mapaEmpresas = new Map(
      empresasSel.map(e => [Number(e.empresa_codigo), e.fantasia || e.nome || `Empresa ${e.empresa_codigo}`])
    );
    const empresasInfo = empresasSel.map(e => ({
      codigo: Number(e.empresa_codigo),
      nome: e.fantasia || e.nome || `Empresa ${e.empresa_codigo}`,
    }));
    return construirArvoreWebpostoAgregado({
      rows: dadosRaw.resumo,
      produtosMap, gruposMap,
      mapaEmpresas, empresasInfo,
    });
  }, [dadosRaw, produtosMap, gruposMap, empresasSel]);

  const totaisAtual = useMemo(() => totalizarArvore(arvore), [arvore]);
  const totaisMA    = useMemo(() => totalizarArvoreMA(arvore), [arvore]);
  const totaisAA    = useMemo(() => totalizarArvoreAA(arvore), [arvore]);

  // Projeção: prefere os dias retornados pelo servidor (mais precisos
  // que o cálculo client), fallback pro cálculo local sobre filtros
  // APLICADOS — não muda enquanto usuário edita os inputs.
  const projParams = useMemo(() => {
    const diasDecorridos = dadosRaw?.diasPeriodo || diasNoIntervalo(dataDeAplicada, dataAteAplicada);
    const [y, m] = dataDeAplicada.split('-').map(Number);
    const diasMes = dadosRaw?.diasMes || new Date(y, m, 0).getDate();
    return { diasDecorridos, diasMes, fator: diasMes / diasDecorridos };
  }, [dataDeAplicada, dataAteAplicada, dadosRaw]);
  const projetar = useCallback((v) => Number(v) * projParams.fator, [projParams.fator]);

  // ─── Renderização ────────────────────────────────────────
  if (!cliente?.id) return <Navigate to="/cliente/webposto/dashboard" replace />;

  const podeFiltrarEmpresa = empresasDisponiveis.length > 1;

  const abas = [
    { key: 'geral',        label: 'Visão geral',  icon: LayoutGrid },
    { key: 'combustivel',  label: 'Combustíveis', icon: Fuel },
    { key: 'automotivos',  label: 'Automotivos',  icon: Package },
    { key: 'conveniencia', label: 'Conveniência', icon: Store },
  ];

  return (
    <div>
      <BarraProgressoTopo loading={loadingDados || bgRefresh} />
      {/* Modal envolvente durante o primeiro carregamento (a RPC pode
          levar 20-25s pra períodos grandes com muitas empresas). Não
          aparece em refresh silencioso (cache hit + revalidate) — esse
          fica só com a BarraProgressoTopo. */}
      <BannerCarregando aberto={loadingDados || bgRefresh} mensagem="Carregando vendas do período..." />
      <PageHeader title="Vendas"
        description={session?.chaveApi?.nome || 'Itens vendidos no período'}>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
            max={apenasFechados ? ontemIso() : undefined}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        <label className="hidden md:inline-flex items-center gap-1.5 h-9 px-2 cursor-pointer select-none"
          title="Limita o período a ontem (exclui o dia corrente, ainda em aberto)">
          <input type="checkbox" checked={apenasFechados}
            onChange={e => handleApenasFechadosChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">Apenas dias fechados</span>
        </label>
        {podeFiltrarEmpresa && (
          <EmpresaMultiSelect
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => toggleSet(prev, id))}
            onToggleTodas={() => setEmpresasSelIds(prev =>
              prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
            )}
          />
        )}
        <IndicadorAtualizacao pagina="vendas" chaveApiId={chaveApiIdAtiva} />
        <button onClick={dispararCarregamento} disabled={loadingDados || empresasSel.length === 0}
          title={filtrosPendentes ? 'Filtros alterados — clique pra aplicar' : 'Recarregar dados'}
          className={`relative inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
            filtrosPendentes
              ? 'border-blue-400 bg-blue-600 text-white hover:bg-blue-700 shadow-sm ring-2 ring-blue-100'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}>
          <RefreshCw className={`h-4 w-4 ${loadingDados ? 'animate-spin' : ''}`} />
          {filtrosPendentes ? 'Aplicar filtros' : 'Atualizar'}
          {filtrosPendentes && !loadingDados && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white animate-pulse" />
          )}
        </button>
      </PageHeader>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {abas.map(a => {
            const Icone = a.icon;
            const ativo = tab === a.key;
            return (
              <button key={a.key} onClick={() => setTab(a.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icone className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          {erro}
        </div>
      )}

      {loadingDados && !dadosRaw ? (
        // Modal envolvente cuida do feedback — esse div é só placeholder
        // pra reservar espaço sem mostrar nada visual atrás dele.
        <div className="h-32" />
      ) : arvore.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 mb-3">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma venda no período</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatDataBR(dataDe)} a {formatDataBR(dataAteEfetivo)} · {empresasSel.length} empresa(s) selecionada(s)
          </p>
        </div>
      ) : (
        <>
          {tab === 'geral'        && <AbaVisaoGeral arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA} podeFiltrarEmpresa={podeFiltrarEmpresa} projetar={projetar} seriesMargem={seriesMargem} seriesLoading={loadingSeries} />}
          {tab === 'combustivel'  && (
            <AbaCombustiveis arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA} totaisMA={totaisMA}
              dadosRaw={dadosRaw} produtosMap={produtosMap} gruposMap={gruposMap}
              projetar={projetar} series={seriesMargem?.combustivel} seriesLoading={loadingSeries}
              chaveApiId={empresasSel[0]?.chave_api_id}
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))} />
          )}
          {tab === 'automotivos'  && (
            <AbaAutoConv categoriaKey="automotivos" arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA}
              dadosRaw={dadosRaw} produtosMap={produtosMap} gruposMap={gruposMap} projetar={projetar}
              cor="blue" series={seriesMargem?.automotivos} seriesLoading={loadingSeries}
              chaveApiId={empresasSel[0]?.chave_api_id}
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))} />
          )}
          {tab === 'conveniencia' && (
            <AbaAutoConv categoriaKey="conveniencia" arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA}
              dadosRaw={dadosRaw} produtosMap={produtosMap} gruposMap={gruposMap} projetar={projetar}
              cor="emerald" series={seriesMargem?.conveniencia} seriesLoading={loadingSeries}
              chaveApiId={empresasSel[0]?.chave_api_id}
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Aba: Visão geral ────────────────────────────────────────
function AbaVisaoGeral({ arvore, totaisAtual, totaisAA, podeFiltrarEmpresa, projetar, seriesMargem, seriesLoading }) {
  const cats3 = CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key));
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {cats3.map(c => {
          const d  = totaisAtual.porCat[c.key] || { lucro: 0, valor: 0, qtd: 0 };
          const aa = totaisAA.porCat[c.key]    || { lucro: 0, valor: 0 };
          const margem = d.valor > 0 ? d.lucro / d.valor : 0;
          return (
            <KpiLucro key={c.key} cat={c}
              lucro={d.lucro} lucroProjecao={projetar(d.lucro)}
              margem={margem}
              lucroAnoAnterior={aa.lucro}
              faturamento={d.valor} faturamentoProjecao={projetar(d.valor)}
              qtd={d.qtd}
              serieMargem={seriesMargem?.[c.key]?.margem || null}
              seriesLoading={seriesLoading}
            />
          );
        })}
        <KpiLucroGlobal
          lucro={totaisAtual.totalLucro}
          lucroProjecao={projetar(totaisAtual.totalLucro)}
          margem={totaisAtual.totalValor > 0 ? totaisAtual.totalLucro / totaisAtual.totalValor : 0}
          lucroAnoAnterior={totaisAA.totalLucro}
          faturamento={totaisAtual.totalValor}
          faturamentoProjecao={projetar(totaisAtual.totalValor)}
          serieMargem={seriesMargem?.global?.margem || null}
          seriesLoading={seriesLoading}
        />
      </div>
      {arvore.length > 0 && (
        <TabelaPostoCategoria arvore={arvore} multiEmpresa={podeFiltrarEmpresa} />
      )}
      {arvore.length > 0 && <DetalhamentoSetor arvore={arvore} />}
    </>
  );
}

// ─── Aba: Combustíveis ───────────────────────────────────────
const SUB_ABAS_COMBUSTIVEL = [
  { key: 'dia',    label: 'Realizado dia a dia',     icone: Droplet },
  { key: 'tipo',   label: 'Realizado · Por combustível', icone: Fuel },
  { key: 'doze',   label: 'Últimos 12 meses',        icone: LineChartIcon },
  { key: 'semana', label: 'Análise semanal',         icone: Calendar },
];
function AbaCombustiveis({ arvore, totaisAtual, totaisAA, dadosRaw, produtosMap, gruposMap, projetar, series, seriesLoading, chaveApiId, empresasCodigos }) {
  const [subAba, setSubAba] = useState('dia');
  // Adapta cada série pro shape array de números que o KpiCombustivelDashboard espera
  const sLitros = (series?.litros || []).map(p => p.margemPct);
  const sLucro  = (series?.lucro  || []).map(p => p.margemPct);
  const sMargem = (series?.margem || []).map(p => p.margemPct);
  const sLbPorL = (series?.lbPorL || []).map(p => p.margemPct);
  const d  = totaisAtual.porCat.combustivel || { qtd: 0, valor: 0, lucro: 0 };
  const aa = totaisAA.porCat.combustivel    || { qtd: 0, valor: 0, lucro: 0 };
  const margem   = d.valor > 0 ? d.lucro / d.valor : 0;
  const margemAA = aa.valor > 0 ? aa.lucro / aa.valor : 0;
  const luPorL   = d.qtd > 0  ? d.lucro / d.qtd  : 0;
  const luPorLAA = aa.qtd > 0 ? aa.lucro / aa.qtd : 0;

  const produtos = useMemo(() => agregarProdutosCombustivel(arvore), [arvore]);
  const arvoreDia = useMemo(
    () => construirArvoreDiaProdutoAgregado({
      diaProduto: dadosRaw?.diaProduto || [],
      produtosMap, gruposMap, categoriaKey: 'combustivel',
    }),
    [dadosRaw, produtosMap, gruposMap],
  );
  const arvoreProdutoDia = useMemo(() => inverterArvoreParaProdutoDia(arvoreDia), [arvoreDia]);
  const heatmap = useMemo(() => agregarHeatmapSemanal(arvoreDia), [arvoreDia]);
  const [expandidos, setExpandidos] = useState(new Set());
  const [expandidosProd, setExpandidosProd] = useState(new Set());
  const toggle = (k) => setExpandidos(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const toggleProd = (k) => setExpandidosProd(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  // Sub-aba "Últimos 12 meses": busca evolução mensal por produto.
  const [evolucao12mRows, setEvolucao12mRows] = useState([]);
  const [loadingEvol, setLoadingEvol] = useState(false);
  const [produtoSel, setProdutoSel] = useState('__todos');
  useEffect(() => {
    if (subAba !== 'doze' || !chaveApiId || empresasCodigos.length === 0) return;
    let cancelado = false;
    setLoadingEvol(true);
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    supabase.rpc('cci_webposto_evolucao_mensal_produto', {
      p_chave_api_id:     chaveApiId,
      p_empresas_codigos: empresasCodigos.map(Number),
      p_data_de:          ymd(ini),
      p_data_ate:         ymd(fim),
    }).then(({ data, error }) => {
      if (cancelado) return;
      if (error) console.error('[evolucao 12m]', error);
      setEvolucao12mRows(data || []);
    }).finally(() => { if (!cancelado) setLoadingEvol(false); });
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const produtosEvol = useMemo(
    () => listarProdutosCombustivelDaSerie({ rowsEvolucao: evolucao12mRows, produtosMap, gruposMap }),
    [evolucao12mRows, produtosMap, gruposMap],
  );
  const serieEvol = useMemo(
    () => construirSerieEvolucaoCombustivel({
      rowsEvolucao: evolucao12mRows, produtosMap, gruposMap,
      produtoCodigoSelecionado: produtoSel === '__todos' ? null : produtoSel,
    }),
    [evolucao12mRows, produtosMap, gruposMap, produtoSel],
  );

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCombustivelDashboard label="Litros vendidos" icone={Fuel} cor="amber"
          valor={formatNumero(d.qtd, 0)} valorAA={formatNumero(aa.qtd, 0)}
          valorProj={formatNumero(projetar(d.qtd), 0)}
          atual={d.qtd} anoAnterior={aa.qtd}
          temProj={Math.abs(projetar(d.qtd) - d.qtd) > 1}
          serie={sLitros} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Lucro bruto" icone={DollarSign} cor="emerald"
          valor={formatCurrency(d.lucro)} valorAA={formatCurrency(aa.lucro)}
          valorProj={formatCurrency(projetar(d.lucro))}
          negativo={d.lucro < 0}
          atual={d.lucro} anoAnterior={aa.lucro}
          temProj={Math.abs(projetar(d.lucro) - d.lucro) > 0.01}
          serie={sLucro} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Margem" icone={PieChart} cor="violet"
          valor={`${(margem * 100).toFixed(2)}%`} valorAA={`${(margemAA * 100).toFixed(2)}%`}
          atual={margem} anoAnterior={margemAA}
          serie={sMargem} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Lucro bruto por litro" icone={Droplet} cor="rose"
          valor={formatCurrency(luPorL)} valorAA={formatCurrency(luPorLAA)}
          negativo={luPorL < 0}
          atual={luPorL} anoAnterior={luPorLAA}
          serie={sLbPorL} seriesLoading={seriesLoading} />
      </div>
      <TabelaProjecaoCombustivel
        produtos={produtos}
        totais={{ qtd: d.qtd, valor: d.valor, lucro: d.lucro, margem, luPorL }}
        projetar={projetar} />

      {/* Sub-abas */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto bg-amber-50/40">
          {SUB_ABAS_COMBUSTIVEL.map(s => {
            const Ic = s.icone;
            const ativo = subAba === s.key;
            return (
              <button key={s.key} onClick={() => setSubAba(s.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                <Ic className="h-3.5 w-3.5" /> {s.label}
              </button>
            );
          })}
        </div>
        {subAba === 'dia'    && (arvoreDia.length > 0
          ? <TreeRealizadoDia arvore={arvoreDia} expandidos={expandidos} onToggle={toggle} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'tipo'   && (arvoreProdutoDia.length > 0
          ? <TreeRealizadoPorCombustivel arvore={arvoreProdutoDia} expandidos={expandidosProd} onToggle={toggleProd} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'doze'   && (
          <Evolucao12mCombustivel
            loading={loadingEvol}
            serie={serieEvol}
            produtos={produtosEvol}
            produtoSelecionado={produtoSel}
            onChangeProduto={setProdutoSel}
          />
        )}
        {subAba === 'semana' && (heatmap.dados.length > 0
          ? <HeatmapSemanal dados={heatmap.dados} contagemDias={heatmap.contagemDias} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
      </div>
    </>
  );
}

// ─── Aba: Automotivos / Conveniência ─────────────────────────
const SUB_ABAS_AUTOCONV = [
  { key: 'dia',             label: 'Realizado dia a dia',   icone: Calendar },
  { key: 'grupo',           label: 'Realizado por grupo',   icone: Package },
  { key: 'pareto',          label: 'Análise de pareto',     icone: PieChart },
  { key: 'analise_margem',  label: 'Análise de margem',     icone: Percent },
  { key: 'tempo',           label: 'Linha do tempo',        icone: LineChartIcon },
  { key: 'carrinho',        label: 'Carrinho de compras',   icone: ShoppingCart },
];
function AbaAutoConv({ categoriaKey, arvore, totaisAtual, totaisAA, dadosRaw, produtosMap, gruposMap, projetar, cor = 'blue', series, seriesLoading, chaveApiId, empresasCodigos }) {
  const [subAba, setSubAba] = useState('dia');
  const sFat    = (series?.fat    || []).map(p => p.margemPct);
  const sLucro  = (series?.lucro  || []).map(p => p.margemPct);
  const sMargem = (series?.margem || []).map(p => p.margemPct);
  const sTicket = (series?.ticket || []).map(p => p.margemPct);
  const d  = totaisAtual.porCat[categoriaKey] || { qtd: 0, valor: 0, lucro: 0, itens: 0 };
  const aa = totaisAA.porCat[categoriaKey]    || { qtd: 0, valor: 0, lucro: 0, itens: 0 };
  const margem   = d.valor > 0 ? d.lucro / d.valor : 0;
  const margemAA = aa.valor > 0 ? aa.lucro / aa.valor : 0;
  const ticket   = d.itens > 0 ? d.valor / d.itens : 0;
  const ticketAA = aa.itens > 0 ? aa.valor / aa.itens : 0;

  const grupos = useMemo(() => agregarGruposDaCategoria(arvore, categoriaKey), [arvore, categoriaKey]);
  const arvoreDia = useMemo(
    () => construirArvoreDiaGrupoAgregado({
      diaProduto: dadosRaw?.diaProduto || [],
      produtosMap, gruposMap, categoriaKey,
    }),
    [dadosRaw, produtosMap, gruposMap, categoriaKey],
  );
  const arvoreGrupoDia = useMemo(() => inverterArvoreParaGrupoDia(arvoreDia), [arvoreDia]);
  const [expandidos, setExpandidos] = useState(new Set());
  const [expandidosGrupo, setExpandidosGrupo] = useState(new Set());
  const toggle = (k) => setExpandidos(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const toggleGrupo = (k) => setExpandidosGrupo(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  // Pareto
  const [paretoMeta, setParetoMeta] = useState(80);
  const [paretoGrupos, setParetoGrupos] = useState(() => new Set());
  const paretoData = useMemo(
    () => calcularPareto(arvore, categoriaKey, paretoGrupos),
    [arvore, categoriaKey, paretoGrupos],
  );
  const paretoGruposList = useMemo(
    () => grupos.map(g => ({ codigo: g.codigo, nome: g.nome })),
    [grupos],
  );

  // Análise de margem
  const analiseMargemProdutos = useMemo(() => agregarAnaliseMargem(arvore, categoriaKey), [arvore, categoriaKey]);
  const analiseMargemGrupos = useMemo(() => {
    const set = new Map();
    analiseMargemProdutos.forEach(p => set.set(p.grupo_codigo, { codigo: p.grupo_codigo, nome: p.grupo_nome }));
    return Array.from(set.values()).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [analiseMargemProdutos]);

  // Linha do tempo (12m) — fetch sob demanda
  const [evolucao12mRows, setEvolucao12mRows] = useState([]);
  const [loadingEvol, setLoadingEvol] = useState(false);
  const [tempoGruposSel, setTempoGruposSel] = useState(() => new Set());
  const [tempoProdutosSel, setTempoProdutosSel] = useState(() => new Set());
  useEffect(() => {
    if (subAba !== 'tempo' || !chaveApiId || empresasCodigos.length === 0) return;
    let cancelado = false;
    setLoadingEvol(true);
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    supabase.rpc('cci_webposto_evolucao_mensal_produto', {
      p_chave_api_id:     chaveApiId,
      p_empresas_codigos: empresasCodigos.map(Number),
      p_data_de:          ymd(ini),
      p_data_ate:         ymd(fim),
    }).then(({ data, error }) => {
      if (cancelado) return;
      if (error) console.error('[linha tempo]', error);
      setEvolucao12mRows(data || []);
    }).finally(() => { if (!cancelado) setLoadingEvol(false); });
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const tempoGruposList = useMemo(
    () => listarGruposDaCategoria({ rowsEvolucao: evolucao12mRows, produtosMap, gruposMap, categoriaKey }),
    [evolucao12mRows, produtosMap, gruposMap, categoriaKey],
  );
  const tempoProdutosList = useMemo(
    () => listarProdutosDaCategoria({ rowsEvolucao: evolucao12mRows, produtosMap, gruposMap, categoriaKey, gruposFiltro: tempoGruposSel }),
    [evolucao12mRows, produtosMap, gruposMap, categoriaKey, tempoGruposSel],
  );
  const serieLinhaTempo = useMemo(
    () => construirSerieLinhaTempo({
      rowsEvolucao: evolucao12mRows, produtosMap, gruposMap, categoriaKey,
      gruposFiltro: tempoGruposSel, produtosFiltro: tempoProdutosSel,
    }),
    [evolucao12mRows, produtosMap, gruposMap, categoriaKey, tempoGruposSel, tempoProdutosSel],
  );

  // Carrinho de compras — RPC sob demanda
  const [carrinhoPares, setCarrinhoPares] = useState([]);
  const [carrinhoTotal, setCarrinhoTotal] = useState(0);
  const [loadingCarrinho, setLoadingCarrinho] = useState(false);
  const [erroCarrinho, setErroCarrinho] = useState(null);
  const [carrinhoPeriodoDias, setCarrinhoPeriodoDias] = useState(30);
  const [carrinhoMinTransacoes, setCarrinhoMinTransacoes] = useState(2);
  const [carrinhoBusca, setCarrinhoBusca] = useState('');
  const [carrinhoGruposSel, setCarrinhoGruposSel] = useState(() => new Set());
  // Lista de produtos da categoria pra filtro no banco
  const produtosCategoria = useMemo(() => {
    const set = new Set();
    analiseMargemProdutos.forEach(p => set.add(p.produto_codigo));
    return Array.from(set);
  }, [analiseMargemProdutos]);
  useEffect(() => {
    if (subAba !== 'carrinho' || !chaveApiId || empresasCodigos.length === 0 || produtosCategoria.length === 0) return;
    let cancelado = false;
    setLoadingCarrinho(true);
    setErroCarrinho(null);
    const hoje = new Date();
    const fim = hoje;
    const ini = new Date(hoje); ini.setDate(ini.getDate() - carrinhoPeriodoDias);
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    buscarParesCarrinhoWebposto({
      chaveApiId, empresasCodigos,
      dataDe: ymd(ini), dataAte: ymd(fim),
      produtosFiltro: produtosCategoria,
      minTransacoes: carrinhoMinTransacoes,
      produtosMap, gruposMap,
    }).then(({ pares, totalTransacoes }) => {
      if (cancelado) return;
      setCarrinhoPares(pares);
      setCarrinhoTotal(totalTransacoes);
    }).catch(err => { if (!cancelado) setErroCarrinho(err.message); })
      .finally(() => { if (!cancelado) setLoadingCarrinho(false); });
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(','), carrinhoPeriodoDias, carrinhoMinTransacoes, produtosCategoria.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const carrinhoGruposList = useMemo(() => grupos.map(g => ({ codigo: g.codigo, nome: g.nome })), [grupos]);
  const paresCarrinhoFiltrados = useMemo(() => {
    const q = carrinhoBusca.trim().toLowerCase();
    return carrinhoPares.filter(p => {
      if (carrinhoGruposSel.size > 0) {
        if (!carrinhoGruposSel.has(p.grupo_a_codigo) && !carrinhoGruposSel.has(p.grupo_b_codigo)) return false;
      }
      if (q) {
        const nomes = `${p.produto_a_nome} ${p.produto_b_nome}`.toLowerCase();
        if (!nomes.includes(q)) return false;
      }
      return true;
    });
  }, [carrinhoPares, carrinhoBusca, carrinhoGruposSel]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCombustivelDashboard label="Faturamento" icone={ShoppingCart} cor="amber"
          valor={formatCurrency(d.valor)} valorAA={formatCurrency(aa.valor)}
          valorProj={formatCurrency(projetar(d.valor))}
          atual={d.valor} anoAnterior={aa.valor}
          temProj={Math.abs(projetar(d.valor) - d.valor) > 0.01}
          serie={sFat} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Lucro bruto" icone={DollarSign} cor="emerald"
          valor={formatCurrency(d.lucro)} valorAA={formatCurrency(aa.lucro)}
          valorProj={formatCurrency(projetar(d.lucro))}
          negativo={d.lucro < 0}
          atual={d.lucro} anoAnterior={aa.lucro}
          temProj={Math.abs(projetar(d.lucro) - d.lucro) > 0.01}
          serie={sLucro} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Margem" icone={PieChart} cor="violet"
          valor={`${(margem * 100).toFixed(2)}%`} valorAA={`${(margemAA * 100).toFixed(2)}%`}
          atual={margem} anoAnterior={margemAA}
          serie={sMargem} seriesLoading={seriesLoading} />
        <KpiCombustivelDashboard label="Ticket médio" icone={Coins} cor="rose"
          valor={formatCurrency(ticket)} valorAA={formatCurrency(ticketAA)}
          atual={ticket} anoAnterior={ticketAA}
          serie={sTicket} seriesLoading={seriesLoading} />
      </div>
      {/* Sub-abas */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className={`flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto ${cor === 'emerald' ? 'bg-emerald-50/40' : 'bg-blue-50/40'}`}>
          {SUB_ABAS_AUTOCONV.map(s => {
            const Ic = s.icone;
            const ativo = subAba === s.key;
            const ringCor = cor === 'emerald' ? 'border-emerald-600 text-emerald-700' : 'border-blue-600 text-blue-700';
            return (
              <button key={s.key} onClick={() => setSubAba(s.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? ringCor : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}>
                <Ic className="h-3.5 w-3.5" /> {s.label}
              </button>
            );
          })}
        </div>
        {subAba === 'dia'   && (arvoreDia.length > 0
          ? <TreeRealizadoAutoDia arvore={arvoreDia} expandidos={expandidos} onToggle={toggle} cor={cor} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'grupo' && (arvoreGrupoDia.length > 0
          ? <TreeRealizadoAutoGrupo arvore={arvoreGrupoDia} expandidos={expandidosGrupo} onToggle={toggleGrupo} cor={cor} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'pareto' && (
          <AnalisePareto
            dados={paretoData} grupos={paretoGruposList}
            meta={paretoMeta} onChangeMeta={setParetoMeta}
            gruposSel={paretoGrupos}
            onToggleGrupo={(c) => setParetoGrupos(prev => { const n = new Set(prev); const k = String(c); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
            onToggleTodos={() => setParetoGrupos(prev => prev.size === paretoGruposList.length ? new Set() : new Set(paretoGruposList.map(g => String(g.codigo))))}
            onLimpar={() => setParetoGrupos(new Set())}
            cor={cor} />
        )}
        {subAba === 'analise_margem' && (
          <AnaliseMargem produtos={analiseMargemProdutos} grupos={analiseMargemGrupos} cor={cor} />
        )}
        {subAba === 'tempo' && (
          <LinhaDoTempoAuto
            loading={loadingEvol} serie={serieLinhaTempo}
            grupos={tempoGruposList} produtos={tempoProdutosList}
            gruposSel={tempoGruposSel}
            onToggleGrupo={(c) => setTempoGruposSel(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
            onToggleTodosGrupos={() => setTempoGruposSel(prev => prev.size === tempoGruposList.length ? new Set() : new Set(tempoGruposList.map(g => g.codigo)))}
            onLimparGrupos={() => setTempoGruposSel(new Set())}
            produtosSel={tempoProdutosSel}
            onToggleProduto={(c) => setTempoProdutosSel(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
            onToggleTodosProdutos={() => setTempoProdutosSel(prev => prev.size === tempoProdutosList.length ? new Set() : new Set(tempoProdutosList.map(g => g.codigo)))}
            onLimparProdutos={() => setTempoProdutosSel(new Set())}
            cor={cor} />
        )}
        {subAba === 'carrinho' && (
          <CarrinhoCompras
            loading={loadingCarrinho} erro={erroCarrinho}
            pares={paresCarrinhoFiltrados} totalPares={carrinhoPares.length} totalTransacoes={carrinhoTotal}
            grupos={carrinhoGruposList}
            gruposSel={carrinhoGruposSel}
            onToggleGrupo={(c) => setCarrinhoGruposSel(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
            onToggleTodos={() => setCarrinhoGruposSel(prev => prev.size === carrinhoGruposList.length ? new Set() : new Set(carrinhoGruposList.map(g => g.codigo)))}
            onLimparGrupos={() => setCarrinhoGruposSel(new Set())}
            minTransacoes={carrinhoMinTransacoes} onChangeMin={setCarrinhoMinTransacoes}
            busca={carrinhoBusca} onChangeBusca={setCarrinhoBusca}
            periodoDias={carrinhoPeriodoDias} onChangePeriodoDias={setCarrinhoPeriodoDias}
            cor={cor} />
        )}
      </div>
    </>
  );
}
