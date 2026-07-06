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
import { useClienteSession } from '../../../hooks/useAuth';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { formatCurrency } from '../../../utils/format';

import {
  totalizarArvore, totalizarArvoreAA, totalizarArvoreMA,
  construirArvoreWebpostoAgregado,
  buscarVendasComercialWebposto,
  construirArvoreDiaProdutoAgregado, construirArvoreDiaGrupoAgregado,
  buscarDiaProdutoCategoriaWebposto, buscarDiaTotaisCategoriaWebposto,
  montarDiasBaseTotais, montarMapaProdutoCategoria,
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
import SeletorMesAno from '../../../components/vendas/SeletorMesAno';
import { primeiroDiaMesIso, ultimoDiaMesIso } from '../../../utils/periodoMes';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import { lerCache as lerCacheV2, salvarCache as salvarCacheV2 } from '../../../services/webpostoCacheV3';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import { useAtualizarDados } from '../../../hooks/useAtualizarDados';
import { useEmpresasSelecionadas } from '../../../hooks/useEmpresasSelecionadas';
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
function ontemIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return ymd(d);
}
function minIso(a, b) { return a < b ? a : b; }
function diasNoIntervalo(de, ate) {
  const [y1, m1, d1] = String(de).split('-').map(Number);
  const [y2, m2, d2] = String(ate).split('-').map(Number);
  return Math.max(1, Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000) + 1);
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

  // Seleção SINCRONIZADA entre páginas (persiste em localStorage)
  const [empresasSelIds, setEmpresasSelIds] = useEmpresasSelecionadas(
    empresasDisponiveis, session?.chaveApi?.id
  );

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds],
  );

  const [loadingDados, setLoadingDados] = useState(false);
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
  const [tab, setTab] = useState('geral');

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
        setErro(null);
        return; // cache hit localStorage — sem fetch
      }
    }
    if (!silencioso) setLoadingDados(true);
    setErro(null);

    try {
      const precisaCatalogos = produtosMap.size === 0 || gruposMap.size === 0;
      const chaveApiIdRede = empresasSel[0].chave_api_id;
      const empresasCodigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      const atualDe = dataDe;
      const atualAte = dataAteEfetivo;

      // apiKey do catálogo Quality só é resolvida quando precisamos (re)carregar
      // os catálogos — evita 1 request a `chaves_api` em cada troca de período.
      let apiKeyCatalogo = null;
      if (precisaCatalogos) {
        apiKeyCatalogo = chaveApiSessao;
        if (!apiKeyCatalogo || session?.chaveApi?.id !== chaveApiIdRede) {
          const chavesApi = await mapService.listarChavesApi();
          const ch = chavesApi.find(c => c.id === chaveApiIdRede);
          if (!ch) throw new Error(`Chave API não encontrada para "${empresasSel[0].fantasia || empresasSel[0].nome}"`);
          apiKeyCatalogo = ch.chave;
        }
      }

      const inicio = performance.now();

      // 3 fetches paralelos: catálogos (se precisa) + 1 RPC unificada
      const [prods, grps, agregado] = await Promise.all([
        (precisaCatalogos ? qualityApi.buscarProdutos(apiKeyCatalogo).catch(() => []) : Promise.resolve(null)),
        (precisaCatalogos ? qualityApi.buscarGrupos(apiKeyCatalogo).catch(() => [])   : Promise.resolve(null)),
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
        diasPeriodo: agregado.diasPeriodo,  // pra projeção
        diasMes:     agregado.diasMes,
        tempoMs: Math.round(performance.now() - inicio),
      };
      // eslint-disable-next-line no-console
      console.info('[vendas RPC unificada]', {
        resumoRows: agregado.resumo.length,
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
    }
  }, [empresasSel, dataDe, dataAteEfetivo, produtosMap, gruposMap, chaveApiSessao, session?.chaveApi?.id]);

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

  // Refresh in-place quando o toast global (layout) pede atualização.
  useAtualizarDados(() => carregar({ force: true }));

  // Auto-carregar quando filtros mudam (após 1ª carga). Debounce pra
  // evitar disparar a cada tecla quando o usuário digita data manualmente.
  // Banner sutil aparece durante o fetch — sem precisar clicar "Atualizar".
  useEffect(() => {
    if (!primeiraCargaRef.current) return; // ainda não carregou pela 1ª vez
    if (empresasSel.length === 0) return;
    const t = setTimeout(() => { dispararCarregamento(true); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataDe, dataAteEfetivo, apenasFechados, JSON.stringify([...empresasSelIds].sort())]);

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

  // Sparklines removidas: sem série → os cards não renderizam o mini-gráfico
  // (nem o rótulo). Elimina de vez o fetch de 12 meses que sobrecarregava o
  // banco (retry storm / ERR_CONNECTION_CLOSED).
  const seriesMargem = null;
  const loadingSeries = false;

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

  // Prefetch leve: aquece o cache do nível 1 (totais por dia) das 3 categorias,
  // pra 1ª troca de aba/abertura do "dia a dia" ficar instantânea. Sequencial e
  // só depois do carregamento principal — não compete com o fetch dos cards por
  // streams HTTP/2 (evita a cascata de retry que já causou ERR_CONNECTION_CLOSED).
  const empresasCodigosPrefetch = useMemo(
    () => empresasSel.map(e => Number(e.empresa_codigo)),
    [empresasSel],
  );
  useEffect(() => {
    const chaveApiId = empresasSel[0]?.chave_api_id;
    if (loadingDados || !chaveApiId || empresasCodigosPrefetch.length === 0
        || !dataDeAplicada || !dataAteAplicada || produtosMap.size === 0) return;
    let cancelado = false;
    (async () => {
      for (const categoria of ['combustivel', 'automotivos', 'conveniencia']) {
        if (cancelado) return;
        const ck = chaveDiaTotais(categoria, dataDeAplicada, dataAteAplicada, empresasCodigosPrefetch);
        if (lerCacheV2(ck, chaveApiId)) continue;   // já aquecido
        const { produtoCodigos, categorias } = montarMapaProdutoCategoria(produtosMap, gruposMap, categoria);
        if (produtoCodigos.length === 0) continue;
        try {
          const rows = await buscarDiaTotaisCategoriaWebposto({
            chaveApiId, empresasCodigos: empresasCodigosPrefetch,
            dataDe: dataDeAplicada, dataAte: dataAteAplicada,
            produtoCodigos, categorias, categoria,
          });
          if (!cancelado) salvarCacheV2(ck, chaveApiId, rows);
        } catch { /* prefetch é best-effort */ }
      }
    })();
    return () => { cancelado = true; };
  }, [loadingDados, empresasCodigosPrefetch, dataDeAplicada, dataAteAplicada, produtosMap, gruposMap]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <PageHeader title="Vendas"
        description={session?.chaveApi?.nome || 'Itens vendidos no período'}>
        <SeletorMesAno mes={mes} ano={ano} onChange={(m, a) => { setMes(m); setAno(a); }} />
        <label className="hidden md:inline-flex items-center gap-1.5 h-9 px-2 cursor-pointer select-none"
          title="Limita o período a ontem (exclui o dia corrente, ainda em aberto)">
          <input type="checkbox" checked={apenasFechados}
            onChange={e => setApenasFechados(e.target.checked)}
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

      {loadingDados ? (
        // Skeleton em todo carregamento bloqueante (1ª carga, troca de mês,
        // troca de empresa, "Atualizar"). Refresh silencioso mantém os dados.
        <SkeletonComercial />
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
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))}
              dataDe={dataDeAplicada} dataAte={dataAteAplicada} />
          )}
          {tab === 'automotivos'  && (
            <AbaAutoConv categoriaKey="automotivos" arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA}
              dadosRaw={dadosRaw} produtosMap={produtosMap} gruposMap={gruposMap} projetar={projetar}
              cor="blue" series={seriesMargem?.automotivos} seriesLoading={loadingSeries}
              chaveApiId={empresasSel[0]?.chave_api_id}
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))}
              dataDe={dataDeAplicada} dataAte={dataAteAplicada} />
          )}
          {tab === 'conveniencia' && (
            <AbaAutoConv categoriaKey="conveniencia" arvore={arvore} totaisAtual={totaisAtual} totaisAA={totaisAA}
              dadosRaw={dadosRaw} produtosMap={produtosMap} gruposMap={gruposMap} projetar={projetar}
              cor="emerald" series={seriesMargem?.conveniencia} seriesLoading={loadingSeries}
              chaveApiId={empresasSel[0]?.chave_api_id}
              empresasCodigos={empresasSel.map(e => Number(e.empresa_codigo))}
              dataDe={dataDeAplicada} dataAte={dataAteAplicada} />
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

// ─── Cache (v3) do "Realizado dia a dia" lazy ────────────────
// Nível 1 (totais por dia) e detalhe por dia são cacheados por
// período+categoria+empresas. Torna revisita / troca de aba instantânea.
const normEmpresas = (arr) => [...arr].map(Number).sort((a, b) => a - b).join('-');
const chaveDiaTotais = (categoria, dataDe, dataAte, empresasCodigos) =>
  `dia-totais:${categoria}:${dataDe}:${dataAte}:${normEmpresas(empresasCodigos)}`;
const chaveDiaDetalhe = (categoria, dia, empresasCodigos) =>
  `dia-det:${categoria}:${dia}:${normEmpresas(empresasCodigos)}`;

// Um dia com mais de 2 dias de idade não muda mais (padrão DIAS_FRESCOS do sync).
// Só esses entram no cache de detalhe; dias recentes são sempre buscados frescos.
function diaImutavel(dia) {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() - 2);
  const p = (n) => String(n).padStart(2, '0');
  const corte = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
  return dia < corte;   // comparação lexicográfica de YYYY-MM-DD
}

// ─── Aba: Combustíveis ───────────────────────────────────────
const SUB_ABAS_COMBUSTIVEL = [
  { key: 'dia',    label: 'Realizado dia a dia',     icone: Droplet },
  { key: 'tipo',   label: 'Realizado · Por combustível', icone: Fuel },
  { key: 'doze',   label: 'Últimos 12 meses',        icone: LineChartIcon },
  { key: 'semana', label: 'Análise semanal',         icone: Calendar },
];
function AbaCombustiveis({ arvore, totaisAtual, totaisAA, produtosMap, gruposMap, projetar, series, seriesLoading, chaveApiId, empresasCodigos, dataDe, dataAte }) {
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

  // Diário (sub-abas dia/tipo/semana) buscado SOB DEMANDA, só da categoria
  // combustível — não vem mais no fetch principal. Mapa filtrado à categoria
  // (payload pequeno).
  const { produtoCodigos, categorias } = useMemo(
    () => montarMapaProdutoCategoria(produtosMap, gruposMap, 'combustivel'), [produtosMap, gruposMap]);
  // "tipo"/"semana" ainda precisam do detalhe COMPLETO do período (invertem por
  // produto / montam heatmap). "dia" virou LAZY (mais abaixo): nível 1 = totais
  // por dia; o detalhe de cada dia é buscado só ao expandir.
  const precisaFull = subAba === 'tipo' || subAba === 'semana';
  const [diaRows, setDiaRows] = useState([]);
  const [loadingDia, setLoadingDia] = useState(false);
  useEffect(() => {
    if (!precisaFull || !chaveApiId || empresasCodigos.length === 0 || !dataDe || !dataAte || produtoCodigos.length === 0) return;
    let cancelado = false;
    (async () => {
      setLoadingDia(true);
      try {
        const rows = await buscarDiaProdutoCategoriaWebposto({
          chaveApiId, empresasCodigos, dataDe, dataAte,
          produtoCodigos, categorias, categoria: 'combustivel',
        });
        if (!cancelado) setDiaRows(rows);
      } catch (err) {
        if (!cancelado) { console.error('[dia combustivel]', err); setDiaRows([]); }
      } finally {
        if (!cancelado) setLoadingDia(false);
      }
    })();
    return () => { cancelado = true; };
  }, [precisaFull, chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const arvoreDia = useMemo(
    () => construirArvoreDiaProdutoAgregado({
      diaProduto: diaRows,
      produtosMap, gruposMap, categoriaKey: 'combustivel',
    }),
    [diaRows, produtosMap, gruposMap],
  );
  const arvoreProdutoDia = useMemo(() => inverterArvoreParaProdutoDia(arvoreDia), [arvoreDia]);
  const heatmap = useMemo(() => agregarHeatmapSemanal(arvoreDia), [arvoreDia]);

  // ── Lazy "Realizado dia a dia" ──
  // Nível 1: só os totais por dia (rápido). Nível 2 (produtos do dia) buscado ao expandir.
  const [diasTotais, setDiasTotais] = useState([]);
  const [loadingDiasTotais, setLoadingDiasTotais] = useState(false);
  const [detalheDia, setDetalheDia] = useState(() => new Map());     // dia → produtos[]
  const [carregandoDias, setCarregandoDias] = useState(() => new Set());
  const [expandidos, setExpandidos] = useState(new Set());
  const [expandidosProd, setExpandidosProd] = useState(new Set());
  const toggleProd = (k) => setExpandidosProd(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  // Muda o período/empresa/produtos → invalida os detalhes já buscados e colapsa.
  useEffect(() => {
    setDetalheDia(new Map());
    setExpandidos(new Set());
  }, [chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nível 1: busca os totais por dia ao entrar na sub-aba "dia".
  // Stale-while-revalidate: mostra o cache na hora e revalida em background.
  useEffect(() => {
    if (subAba !== 'dia' || !chaveApiId || empresasCodigos.length === 0 || !dataDe || !dataAte || produtoCodigos.length === 0) return;
    let cancelado = false;
    const ck = chaveDiaTotais('combustivel', dataDe, dataAte, empresasCodigos);
    const cache = lerCacheV2(ck, chaveApiId);
    if (cache) { setDiasTotais(cache); setLoadingDiasTotais(false); }
    else setLoadingDiasTotais(true);
    (async () => {
      try {
        const rows = await buscarDiaTotaisCategoriaWebposto({
          chaveApiId, empresasCodigos, dataDe, dataAte,
          produtoCodigos, categorias, categoria: 'combustivel',
        });
        if (!cancelado) { setDiasTotais(rows); salvarCacheV2(ck, chaveApiId, rows); }
      } catch (err) {
        if (!cancelado && !cache) { console.error('[dia totais combustivel]', err); setDiasTotais([]); }
      } finally {
        if (!cancelado) setLoadingDiasTotais(false);
      }
    })();
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const arvoreDiaLazy = useMemo(
    () => montarDiasBaseTotais(diasTotais).map(d => ({ ...d, produtos: detalheDia.get(d.dia) || [] })),
    [diasTotais, detalheDia],
  );

  const carregarDetalheDia = useCallback(async (dia) => {
    // Detalhe de dias já fechados (>2 dias) vem do cache — instantâneo, sem spinner.
    const ck = chaveDiaDetalhe('combustivel', dia, empresasCodigos);
    if (diaImutavel(dia)) {
      const cache = lerCacheV2(ck, chaveApiId);
      if (cache) { setDetalheDia(prev => { const n = new Map(prev); n.set(dia, cache); return n; }); return; }
    }
    setCarregandoDias(prev => { const n = new Set(prev); n.add(dia); return n; });
    try {
      const rows = await buscarDiaProdutoCategoriaWebposto({
        chaveApiId, empresasCodigos, dataDe: dia, dataAte: dia,
        produtoCodigos, categorias, categoria: 'combustivel',
      });
      const arv = construirArvoreDiaProdutoAgregado({ diaProduto: rows, produtosMap, gruposMap, categoriaKey: 'combustivel' });
      const produtos = arv[0]?.produtos || [];
      setDetalheDia(prev => { const n = new Map(prev); n.set(dia, produtos); return n; });
      if (diaImutavel(dia)) salvarCacheV2(ck, chaveApiId, produtos);
    } catch (err) {
      console.error('[detalhe dia combustivel]', dia, err);
      setDetalheDia(prev => { const n = new Map(prev); n.set(dia, []); return n; });
    } finally {
      setCarregandoDias(prev => { const n = new Set(prev); n.delete(dia); return n; });
    }
  }, [chaveApiId, empresasCodigos.join(','), produtoCodigos.length, produtosMap, gruposMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k) => {
    const abrindo = !expandidos.has(k);
    setExpandidos(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
    if (abrindo && k.startsWith('dia:')) {
      const dia = k.slice(4);
      if (!detalheDia.has(dia) && !carregandoDias.has(dia)) carregarDetalheDia(dia);
    }
  };

  // Sub-aba "Últimos 12 meses": busca evolução mensal por produto.
  const [evolucao12mRows, setEvolucao12mRows] = useState([]);
  const [loadingEvol, setLoadingEvol] = useState(false);
  const [produtoSel, setProdutoSel] = useState('__todos');
  useEffect(() => {
    if (subAba !== 'doze' || !chaveApiId || empresasCodigos.length === 0 || produtoCodigos.length === 0) return;
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
      p_produto_codigos:  produtoCodigos,
    }).then(({ data, error }) => {
      if (cancelado) return;
      if (error) console.error('[evolucao 12m]', error);
      setEvolucao12mRows(data || []);
    }).finally(() => { if (!cancelado) setLoadingEvol(false); });
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(','), produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const produtosEvol = useMemo(
    () => listarProdutosCombustivelDaSerie({ rowsEvolucao: evolucao12mRows, produtosMap, gruposMap }),
    [evolucao12mRows, produtosMap, gruposMap],
  );
  const serieEvol = useMemo(
    () => construirSerieEvolucaoCombustivel({
      rowsEvolucao: evolucao12mRows, produtosMap, gruposMap,
      produtoSelecionado: produtoSel === '__todos' ? null : produtoSel,
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
        <KpiCombustivelDashboard label="Lucro por litro" icone={Droplet} cor="rose"
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
        {subAba === 'dia'    && (loadingDiasTotais
          ? <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>
          : arvoreDiaLazy.length > 0
          ? <TreeRealizadoDia arvore={arvoreDiaLazy} expandidos={expandidos} onToggle={toggle} carregandoDias={carregandoDias} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'tipo'   && (loadingDia
          ? <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>
          : arvoreProdutoDia.length > 0
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
        {subAba === 'semana' && (loadingDia
          ? <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>
          : heatmap.dados.length > 0
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
function AbaAutoConv({ categoriaKey, arvore, totaisAtual, totaisAA, produtosMap, gruposMap, projetar, cor = 'blue', series, seriesLoading, chaveApiId, empresasCodigos, dataDe, dataAte }) {
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

  // Diário (sub-abas dia/grupo) buscado SOB DEMANDA, só desta categoria.
  // Mapa filtrado à categoria (payload pequeno).
  const { produtoCodigos, categorias } = useMemo(
    () => montarMapaProdutoCategoria(produtosMap, gruposMap, categoriaKey), [produtosMap, gruposMap, categoriaKey]);
  // "grupo" ainda precisa do detalhe COMPLETO do período (inverte grupo→dia).
  // "dia" virou LAZY (mais abaixo): nível 1 = totais por dia; grupos/produtos de
  // cada dia buscados só ao expandir.
  const precisaFull = subAba === 'grupo';
  const [diaRows, setDiaRows] = useState([]);
  const [loadingDia, setLoadingDia] = useState(false);
  useEffect(() => {
    if (!precisaFull || !chaveApiId || empresasCodigos.length === 0 || !dataDe || !dataAte || produtoCodigos.length === 0) return;
    let cancelado = false;
    (async () => {
      setLoadingDia(true);
      try {
        const rows = await buscarDiaProdutoCategoriaWebposto({
          chaveApiId, empresasCodigos, dataDe, dataAte,
          produtoCodigos, categorias, categoria: categoriaKey,
        });
        if (!cancelado) setDiaRows(rows);
      } catch (err) {
        if (!cancelado) { console.error('[dia', categoriaKey, ']', err); setDiaRows([]); }
      } finally {
        if (!cancelado) setLoadingDia(false);
      }
    })();
    return () => { cancelado = true; };
  }, [precisaFull, categoriaKey, chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const arvoreDia = useMemo(
    () => construirArvoreDiaGrupoAgregado({
      diaProduto: diaRows,
      produtosMap, gruposMap, categoriaKey,
    }),
    [diaRows, produtosMap, gruposMap, categoriaKey],
  );
  const arvoreGrupoDia = useMemo(() => inverterArvoreParaGrupoDia(arvoreDia), [arvoreDia]);

  // ── Lazy "Realizado dia a dia" ──
  // Nível 1: totais por dia (rápido). Nível 2 (grupo→produto do dia) ao expandir.
  const [diasTotais, setDiasTotais] = useState([]);
  const [loadingDiasTotais, setLoadingDiasTotais] = useState(false);
  const [detalheDia, setDetalheDia] = useState(() => new Map());     // dia → grupos[]
  const [carregandoDias, setCarregandoDias] = useState(() => new Set());
  const [expandidos, setExpandidos] = useState(new Set());
  const [expandidosGrupo, setExpandidosGrupo] = useState(new Set());
  const toggleGrupo = (k) => setExpandidosGrupo(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  // Muda período/empresa/produtos/categoria → invalida detalhes já buscados e colapsa.
  useEffect(() => {
    setDetalheDia(new Map());
    setExpandidos(new Set());
  }, [categoriaKey, chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nível 1: busca os totais por dia ao entrar na sub-aba "dia".
  // Stale-while-revalidate: mostra o cache na hora e revalida em background.
  useEffect(() => {
    if (subAba !== 'dia' || !chaveApiId || empresasCodigos.length === 0 || !dataDe || !dataAte || produtoCodigos.length === 0) return;
    let cancelado = false;
    const ck = chaveDiaTotais(categoriaKey, dataDe, dataAte, empresasCodigos);
    const cache = lerCacheV2(ck, chaveApiId);
    if (cache) { setDiasTotais(cache); setLoadingDiasTotais(false); }
    else setLoadingDiasTotais(true);
    (async () => {
      try {
        const rows = await buscarDiaTotaisCategoriaWebposto({
          chaveApiId, empresasCodigos, dataDe, dataAte,
          produtoCodigos, categorias, categoria: categoriaKey,
        });
        if (!cancelado) { setDiasTotais(rows); salvarCacheV2(ck, chaveApiId, rows); }
      } catch (err) {
        if (!cancelado && !cache) { console.error('[dia totais', categoriaKey, ']', err); setDiasTotais([]); }
      } finally {
        if (!cancelado) setLoadingDiasTotais(false);
      }
    })();
    return () => { cancelado = true; };
  }, [subAba, categoriaKey, chaveApiId, empresasCodigos.join(','), dataDe, dataAte, produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const arvoreDiaLazy = useMemo(
    () => montarDiasBaseTotais(diasTotais).map(d => ({ ...d, grupos: detalheDia.get(d.dia) || [] })),
    [diasTotais, detalheDia],
  );

  const carregarDetalheDia = useCallback(async (dia) => {
    // Detalhe de dias já fechados (>2 dias) vem do cache — instantâneo, sem spinner.
    const ck = chaveDiaDetalhe(categoriaKey, dia, empresasCodigos);
    if (diaImutavel(dia)) {
      const cache = lerCacheV2(ck, chaveApiId);
      if (cache) { setDetalheDia(prev => { const n = new Map(prev); n.set(dia, cache); return n; }); return; }
    }
    setCarregandoDias(prev => { const n = new Set(prev); n.add(dia); return n; });
    try {
      const rows = await buscarDiaProdutoCategoriaWebposto({
        chaveApiId, empresasCodigos, dataDe: dia, dataAte: dia,
        produtoCodigos, categorias, categoria: categoriaKey,
      });
      const arv = construirArvoreDiaGrupoAgregado({ diaProduto: rows, produtosMap, gruposMap, categoriaKey });
      const gruposDia = arv[0]?.grupos || [];
      setDetalheDia(prev => { const n = new Map(prev); n.set(dia, gruposDia); return n; });
      if (diaImutavel(dia)) salvarCacheV2(ck, chaveApiId, gruposDia);
    } catch (err) {
      console.error('[detalhe dia', categoriaKey, ']', dia, err);
      setDetalheDia(prev => { const n = new Map(prev); n.set(dia, []); return n; });
    } finally {
      setCarregandoDias(prev => { const n = new Set(prev); n.delete(dia); return n; });
    }
  }, [chaveApiId, empresasCodigos.join(','), produtoCodigos.length, categoriaKey, produtosMap, gruposMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k) => {
    const abrindo = !expandidos.has(k);
    setExpandidos(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
    // TreeRealizadoAutoDia usa a chave de dia no formato "aD:YYYY-MM-DD".
    if (abrindo && k.startsWith('aD:')) {
      const dia = k.slice(3);
      if (!detalheDia.has(dia) && !carregandoDias.has(dia)) carregarDetalheDia(dia);
    }
  };

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
    if (subAba !== 'tempo' || !chaveApiId || empresasCodigos.length === 0 || produtoCodigos.length === 0) return;
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
      p_produto_codigos:  produtoCodigos,
    }).then(({ data, error }) => {
      if (cancelado) return;
      if (error) console.error('[linha tempo]', error);
      setEvolucao12mRows(data || []);
    }).finally(() => { if (!cancelado) setLoadingEvol(false); });
    return () => { cancelado = true; };
  }, [subAba, chaveApiId, empresasCodigos.join(','), produtoCodigos.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {subAba === 'dia'   && (loadingDiasTotais
          ? <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>
          : arvoreDiaLazy.length > 0
          ? <TreeRealizadoAutoDia arvore={arvoreDiaLazy} expandidos={expandidos} onToggle={toggle} cor={cor} carregandoDias={carregandoDias} />
          : <p className="p-8 text-center text-sm text-gray-400">Sem dados no período.</p>)}
        {subAba === 'grupo' && (loadingDia
          ? <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>
          : arvoreGrupoDia.length > 0
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
