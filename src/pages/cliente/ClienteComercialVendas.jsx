import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  ShoppingCart, Fuel, Package, Store, TrendingUp, TrendingDown, Minus,
  Loader2, AlertCircle, RefreshCw, Receipt, LayoutGrid, Percent, ChevronRight,
  Calendar, BarChart3, PieChart as PieChartIcon, Building2,
} from 'lucide-react';
import React from 'react';
import PageHeader from '../../components/ui/PageHeader';
import BarraProgressoTopo from '../../components/ui/BarraProgressoTopo';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { agregarVendasItens, classificarItem } from '../../services/mapeamentoVendasService';
import { formatCurrency } from '../../utils/format';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDataBR(s) {
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
}
function formatNumero(v, casas = 0) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
function diaSemanaCurto(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = String(yyyyMmDd).split('-').map(Number);
  return DIAS_SEMANA[new Date(y, m - 1, d).getDay()];
}
function dataMenos7(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 7);
  return ymd(dt);
}
function diasNoIntervalo(dataInicial, dataFinal) {
  if (!dataInicial || !dataFinal) return 0;
  const di = new Date(dataInicial + 'T00:00:00');
  const df = new Date(dataFinal + 'T00:00:00');
  return Math.round((df - di) / (1000 * 60 * 60 * 24)) + 1;
}
function diasDoMes(yyyyMmDd) {
  const [y, m] = String(yyyyMmDd).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// mesKey no formato "YYYY-MM". Se for o mes corrente, recorta ate hoje (parcial);
// se for um mes passado, usa o mes inteiro. O "mes anterior" e "ano anterior" seguem
// o mesmo numero de dias do recorte atual (trunca se o mes de comparacao tiver menos dias).
function calcularPeriodos(mesKey, hoje = new Date(), apenasDiasFechados = false) {
  const [ano, mes] = String(mesKey).split('-').map(Number); // mes 1-12
  const hojeAno = hoje.getFullYear();
  const hojeMes = hoje.getMonth() + 1;
  const ehMesCorrente = ano === hojeAno && mes === hojeMes;
  const ultDiaSelec = new Date(ano, mes, 0).getDate();
  let dia = ehMesCorrente ? hoje.getDate() : ultDiaSelec;
  if (ehMesCorrente && apenasDiasFechados) dia = Math.max(1, dia - 1);

  const atual = {
    label: `${MESES_PT[mes - 1]}/${ano}`,
    dataInicial: ymd(new Date(ano, mes - 1, 1)),
    dataFinal: ymd(new Date(ano, mes - 1, dia)),
    ehMesCorrente,
  };

  let anoAnt = ano;
  let mesAnt = mes - 1;
  if (mesAnt === 0) { mesAnt = 12; anoAnt = ano - 1; }
  const ultDiaMesAnt = new Date(anoAnt, mesAnt, 0).getDate();
  const diaFimMesAnt = Math.min(dia, ultDiaMesAnt);
  const mesAnterior = {
    label: `${MESES_PT[mesAnt - 1]}/${anoAnt}`,
    dataInicial: ymd(new Date(anoAnt, mesAnt - 1, 1)),
    dataFinal: ymd(new Date(anoAnt, mesAnt - 1, diaFimMesAnt)),
  };

  const yaAno = ano - 1;
  const ultDiaYaMes = new Date(yaAno, mes, 0).getDate();
  const diaFimYa = Math.min(dia, ultDiaYaMes);
  const anoAnterior = {
    label: `${MESES_PT[mes - 1]}/${yaAno}`,
    dataInicial: ymd(new Date(yaAno, mes - 1, 1)),
    dataFinal: ymd(new Date(yaAno, mes - 1, diaFimYa)),
  };

  return { atual, mesAnterior, anoAnterior };
}

function mesKeyHoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function variacao(atual, anterior) {
  if (anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

// Extrai "YYYY-MM-DD" de varios formatos (ISO, BR, com ou sem tempo)
function extrairDataIso(raw) {
  if (!raw) return null;
  const s = String(raw);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

// Agrega itens por dia (com produtos aninhados) para a arvore dia > combustivel
function agregarPorDia(vendaItens, vendasMap, produtosMap, gruposMap) {
  const porDia = new Map();
  (vendaItens || []).forEach(item => {
    const venda = vendasMap?.get(item.vendaCodigo);
    if (venda?.cancelada !== 'N') return;
    const dataRaw = venda?.dataVenda ?? venda?.dataEmissao ?? venda?.dataMovimento ?? venda?.data
      ?? item?.dataVenda ?? item?.dataEmissao ?? item?.dataMovimento ?? item?.data;
    const data = extrairDataIso(dataRaw);
    if (!data) return;
    const produto = produtosMap.get(item.produtoCodigo);
    const categoria = classificarItem(item, produtosMap, gruposMap);
    if (!porDia.has(data)) porDia.set(data, new Map());
    const dia = porDia.get(data);
    if (!dia.has(item.produtoCodigo)) {
      dia.set(item.produtoCodigo, {
        produtoCodigo: item.produtoCodigo,
        produtoNome: produto?.nome || produto?.descricao || `Produto #${item.produtoCodigo}`,
        categoria,
        quantidade: 0, receita: 0, custo: 0,
      });
    }
    const p = dia.get(item.produtoCodigo);
    p.quantidade += Number(item.quantidade || 0);
    p.receita += Number(item.totalVenda || 0);
    p.custo += Number(item.totalCusto || 0);
  });
  return porDia;
}

// Agrega itens por produto (alem dos totais) para as abas detalhadas
function agregarPorProduto(vendaItens, vendasMap, produtosMap, gruposMap) {
  const porProduto = new Map();
  (vendaItens || []).forEach(item => {
    const venda = vendasMap?.get(item.vendaCodigo);
    if (venda?.cancelada !== 'N') return;

    const produtoCodigo = item.produtoCodigo;
    const produto = produtosMap.get(produtoCodigo);
    const grupo = produto ? gruposMap.get(produto.grupoCodigo) : null;
    const categoria = classificarItem(item, produtosMap, gruposMap);

    if (!porProduto.has(produtoCodigo)) {
      porProduto.set(produtoCodigo, {
        produtoCodigo,
        produtoNome: produto?.nome || produto?.descricao || `Produto #${produtoCodigo}`,
        grupoCodigo: produto?.grupoCodigo,
        grupoNome: grupo?.nome || grupo?.descricao || '—',
        tipoProduto: produto?.tipoProduto || null,
        tipoGrupo: grupo?.tipoGrupo || null,
        categoria,
        quantidade: 0,
        totalVenda: 0,
        totalCusto: 0,
        totalDesconto: 0,
      });
    }
    const p = porProduto.get(produtoCodigo);
    p.quantidade += Number(item.quantidade || 0);
    p.totalVenda += Number(item.totalVenda || 0);
    p.totalCusto += Number(item.totalCusto || 0);
    p.totalDesconto += Number(item.totalDesconto || 0);
  });
  return porProduto;
}

export default function ClienteComercialVendas() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];
  const chaveApiSessao = session?.chaveApi?.chave || null;

  // Selecao local de empresa para esta pagina — independente da topbar
  const [empresaSelId, setEmpresaSelId] = useState(() => cliente?.id || null);
  const empresaSel = useMemo(
    () => clientesRede.find(c => c.id === empresaSelId) || cliente || null,
    [clientesRede, empresaSelId, cliente]
  );
  const podeFiltrarEmpresa = clientesRede.length > 1;

  const [loadingDados, setLoadingDados] = useState(false);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [produtosMap, setProdutosMap] = useState(new Map());
  const [gruposCatMap, setGruposCatMap] = useState(new Map());
  const [geradoEm, setGeradoEm] = useState(null);
  const [tab, setTab] = useState('overview');
  const [mesSelecionado, setMesSelecionado] = useState(() => mesKeyHoje());
  const [apenasDiasFechados, setApenasDiasFechados] = useState(true);

  // Reseta cache de catalogos quando troca a empresa selecionada (chave api
  // pode ser diferente entre redes; entre empresas da mesma rede e a mesma).
  useEffect(() => {
    setProdutosMap(new Map());
    setGruposCatMap(new Map());
  }, [empresaSel?.chave_api_id]);

  const periodos = useMemo(
    () => calcularPeriodos(mesSelecionado, new Date(), apenasDiasFechados),
    [mesSelecionado, apenasDiasFechados]
  );
  const mesMax = mesKeyHoje();

  const carregar = useCallback(async () => {
    if (!empresaSel?.empresa_codigo) return;
    setLoadingDados(true);
    setErro(null);
    try {
      let apiKey = chaveApiSessao;
      if (!apiKey) {
        const chaves = await mapService.listarChavesApi();
        const chave = chaves.find(c => c.id === empresaSel.chave_api_id);
        if (!chave) throw new Error('Chave API não encontrada para esta empresa');
        apiKey = chave.chave;
      }

      let pMap = produtosMap, gMap = gruposCatMap;
      if (pMap.size === 0) {
        const [prods, grps] = await Promise.all([
          qualityApi.buscarProdutos(apiKey).catch(() => []),
          qualityApi.buscarGrupos(apiKey).catch(() => []),
        ]);
        pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        setProdutosMap(pMap);
        setGruposCatMap(gMap);
      }

      const buscarPeriodo = async (periodo) => {
        const filtros = {
          dataInicial: periodo.dataInicial,
          dataFinal: periodo.dataFinal,
          empresaCodigo: empresaSel.empresa_codigo,
        };
        const [vendaItens, vendas] = await Promise.all([
          qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
          qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
        ]);
        const vendasMap = new Map();
        (vendas || []).forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));
        const t = agregarVendasItens(vendaItens, vendasMap, pMap, gMap);
        const porProduto = agregarPorProduto(vendaItens, vendasMap, pMap, gMap);
        const porDia = agregarPorDia(vendaItens, vendasMap, pMap, gMap);
        const receita = t.receita_combustivel + t.receita_automotivos + t.receita_conveniencia;
        const cmv = t.cmv_combustivel + t.cmv_automotivos + t.cmv_conveniencia;
        const vendasValidas = (vendas || []).filter(v => (v.cancelada || 'N') !== 'S');
        const qtdVendas = vendasValidas.length;
        const ticketMedio = qtdVendas > 0 ? receita / qtdVendas : 0;
        return {
          ...periodo,
          receita,
          cmv,
          lucroBruto: receita - cmv,
          margem: receita > 0 ? ((receita - cmv) / receita) * 100 : 0,
          receitaCombustivel: t.receita_combustivel,
          receitaAutomotivos: t.receita_automotivos,
          receitaConveniencia: t.receita_conveniencia,
          cmvCombustivel: t.cmv_combustivel,
          cmvAutomotivos: t.cmv_automotivos,
          cmvConveniencia: t.cmv_conveniencia,
          descontos: t.descontos,
          acrescimos: t.acrescimos,
          impostos: t.impostos,
          vendasCanceladas: t.vendas_canceladas,
          qtdVendas,
          ticketMedio,
          porProduto,
          porDia,
        };
      };

      // Fetch auxiliar dos 7 dias antes do inicio do periodo selecionado — serve
      // apenas para comparar os dias 1-7 do mes atual com a "semana anterior".
      // Nao afeta KPIs/totais.
      const buscarBufferSemana = async () => {
        const [y, m, d] = periodos.atual.dataInicial.split('-').map(Number);
        const dtFim = new Date(y, m - 1, d);
        dtFim.setDate(dtFim.getDate() - 1);
        const dtIni = new Date(dtFim);
        dtIni.setDate(dtIni.getDate() - 6); // 7 dias no total (D-7 ao D-1)
        const filtros = {
          dataInicial: ymd(dtIni),
          dataFinal: ymd(dtFim),
          empresaCodigo: empresaSel.empresa_codigo,
        };
        const [vendaItens, vendas] = await Promise.all([
          qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
          qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
        ]);
        const vendasMap = new Map();
        (vendas || []).forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));
        return agregarPorDia(vendaItens, vendasMap, pMap, gMap);
      };

      const inicio = performance.now();
      const [atual, bufferPorDia, mesAnt, anoAnt] = await Promise.all([
        buscarPeriodo(periodos.atual),
        buscarBufferSemana(),
        buscarPeriodo(periodos.mesAnterior),
        buscarPeriodo(periodos.anoAnterior),
      ]);
      // Mescla o buffer de 7 dias no porDia do atual (sem alterar totais)
      const porDiaCompleto = new Map(atual.porDia);
      bufferPorDia.forEach((produtos, data) => {
        if (!porDiaCompleto.has(data)) porDiaCompleto.set(data, produtos);
      });
      const atualComBuffer = { ...atual, porDia: porDiaCompleto };
      setDados({ atual: atualComBuffer, mesAnterior: mesAnt, anoAnterior: anoAnt });
      setGeradoEm(performance.now() - inicio);
    } catch (err) {
      setErro('Erro ao buscar vendas: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [empresaSel, chaveApiSessao, periodos, produtosMap, gruposCatMap]);

  useEffect(() => {
    if (empresaSel?.empresa_codigo) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaSel?.id, mesSelecionado, apenasDiasFechados]);

  if (!cliente?.id) return <Navigate to="/cliente/dashboard" replace />;

  const abas = [
    { key: 'overview',     label: 'Overview',     icon: LayoutGrid },
    { key: 'combustiveis', label: 'Combustíveis', icon: Fuel },
    { key: 'produtos',     label: 'Produtos',     icon: Package },
    { key: 'conveniencia', label: 'Conveniência', icon: Store },
  ];

  return (
    <div>
      <BarraProgressoTopo loading={loadingDados} />
      <PageHeader
        title="Vendas"
        description={`${formatDataBR(periodos.atual.dataInicial)} a ${formatDataBR(periodos.atual.dataFinal)}${periodos.atual.ehMesCorrente ? ' (parcial)' : ''}`}
      >
        {podeFiltrarEmpresa && (
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Empresa
            </span>
            <select
              value={empresaSelId || ''}
              onChange={(e) => setEmpresaSelId(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 max-w-[220px] truncate"
            >
              {clientesRede.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mês</span>
          <input type="month" value={mesSelecionado} max={mesMax}
            onChange={(e) => e.target.value && setMesSelecionado(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="flex items-center gap-2 h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
          <input type="checkbox" checked={apenasDiasFechados}
            onChange={(e) => setApenasDiasFechados(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-600" />
          Apenas dias fechados
        </label>
        <button onClick={carregar} disabled={loadingDados}
          className="flex items-center gap-2 h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          {loadingDados ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </PageHeader>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {/* Abas */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {abas.map(a => {
            const Icon = a.icon;
            const active = tab === a.key;
            return (
              <button key={a.key} onClick={() => setTab(a.key)}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {loadingDados && !dados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <Loader2 className="h-7 w-7 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800">Buscando vendas dos 3 períodos...</p>
        </div>
      ) : !dados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <ShoppingCart className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Clique em atualizar para carregar as vendas.</p>
        </div>
      ) : (
        <>
          {tab === 'overview' && <AbaOverview dados={dados} geradoEm={geradoEm} />}
          {tab === 'combustiveis' && <AbaCombustiveis dados={dados} />}
          {tab === 'produtos' && <AbaProdutos dados={dados} />}
          {tab === 'conveniencia' && <AbaProdutos dados={dados} categoriaFiltro="conveniencia" />}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Aba Overview (KPIs + tabela comparativa)
// ────────────────────────────────────────────────────────────────────

function AbaOverview({ dados, geradoEm }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiComparativo label="Receita Total"   icon={Receipt}       color="blue"    atual={dados.atual.receita}            mesAnt={dados.mesAnterior.receita}            anoAnt={dados.anoAnterior.receita} />
        <KpiComparativo label="Combustíveis"    icon={Fuel}          color="amber"   atual={dados.atual.receitaCombustivel} mesAnt={dados.mesAnterior.receitaCombustivel} anoAnt={dados.anoAnterior.receitaCombustivel} />
        <KpiComparativo label="Conveniência"    icon={Store}         color="emerald" atual={dados.atual.receitaConveniencia} mesAnt={dados.mesAnterior.receitaConveniencia} anoAnt={dados.anoAnterior.receitaConveniencia} />
        <KpiComparativo label="Ticket medio"    icon={ShoppingCart}  color="indigo"  atual={dados.atual.ticketMedio}        mesAnt={dados.mesAnterior.ticketMedio}        anoAnt={dados.anoAnterior.ticketMedio} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Comparativo detalhado</h3>
          {geradoEm != null && (
            <span className="ml-auto text-[10px] text-gray-400 tabular-nums">gerado em {(geradoEm / 1000).toFixed(1)}s</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2.5">Metrica</th>
                <th className="px-4 py-2.5 text-right">Mês atual</th>
                <th className="px-4 py-2.5 text-right">Mês anterior</th>
                <th className="px-4 py-2.5 text-right">Var</th>
                <th className="px-4 py-2.5 text-right">Ano anterior</th>
                <th className="px-4 py-2.5 text-right">Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <LinhaComparativa label="Receita Combustíveis" atual={dados.atual.receitaCombustivel} ma={dados.mesAnterior.receitaCombustivel} aa={dados.anoAnterior.receitaCombustivel} />
              <LinhaComparativa label="Receita Automotivos"  atual={dados.atual.receitaAutomotivos}  ma={dados.mesAnterior.receitaAutomotivos}  aa={dados.anoAnterior.receitaAutomotivos} />
              <LinhaComparativa label="Receita Conveniência" atual={dados.atual.receitaConveniencia} ma={dados.mesAnterior.receitaConveniencia} aa={dados.anoAnterior.receitaConveniencia} />
              <LinhaComparativa label="Receita TOTAL"        atual={dados.atual.receita}             ma={dados.mesAnterior.receita}             aa={dados.anoAnterior.receita} bold />
              <LinhaComparativa label="CMV Total"            atual={dados.atual.cmv}                 ma={dados.mesAnterior.cmv}                 aa={dados.anoAnterior.cmv} inverter />
              <LinhaComparativa label="Lucro Bruto"          atual={dados.atual.lucroBruto}          ma={dados.mesAnterior.lucroBruto}          aa={dados.anoAnterior.lucroBruto} bold />
              <LinhaComparativa label="Margem Bruta"         atual={dados.atual.margem}              ma={dados.mesAnterior.margem}              aa={dados.anoAnterior.margem} tipo="pct" />
              <LinhaComparativa label="Descontos concedidos" atual={dados.atual.descontos}           ma={dados.mesAnterior.descontos}           aa={dados.anoAnterior.descontos} inverter />
              <LinhaComparativa label="Vendas canceladas"    atual={dados.atual.vendasCanceladas}    ma={dados.mesAnterior.vendasCanceladas}    aa={dados.anoAnterior.vendasCanceladas} inverter />
              <LinhaComparativa label="Qtd. de vendas"       atual={dados.atual.qtdVendas}           ma={dados.mesAnterior.qtdVendas}           aa={dados.anoAnterior.qtdVendas} tipo="num" />
              <LinhaComparativa label="Ticket medio"         atual={dados.atual.ticketMedio}         ma={dados.mesAnterior.ticketMedio}         aa={dados.anoAnterior.ticketMedio} />
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 bg-gray-50/60 border-t border-gray-100 text-[10.5px] text-gray-500">
          Variação em verde = evolucao positiva; em vermelho = regressao. Para CMV, descontos e canceladas, a variação <strong>negativa</strong> e considerada positiva (redução de custo).
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Aba Combustiveis
// ────────────────────────────────────────────────────────────────────

function AbaCombustiveis({ dados }) {
  const [diasExpandidos, setDiasExpandidos] = useState(new Set());
  const toggleDia = (data) => setDiasExpandidos(prev => {
    const next = new Set(prev);
    next.has(data) ? next.delete(data) : next.add(data);
    return next;
  });

  // Projecao linear por periodo: extrapola o total ate o fim do mes usando
  // media diaria * dias totais do mes. Para mes fechado, fator=1 (projecao=real).
  const projecoes = useMemo(() => {
    const calc = (periodo) => {
      const diasCobertos = diasNoIntervalo(periodo.dataInicial, periodo.dataFinal);
      const diasTotalMes = diasDoMes(periodo.dataInicial);
      const fator = diasCobertos > 0 ? diasTotalMes / diasCobertos : 0;
      const combs = Array.from(periodo.porProduto.values()).filter(p => p.categoria === 'combustivel');
      const totLitros = combs.reduce((s, p) => s + p.quantidade, 0);
      const totReceita = combs.reduce((s, p) => s + p.totalVenda, 0);
      const totCusto = combs.reduce((s, p) => s + p.totalCusto, 0);
      return {
        diasCobertos,
        diasTotalMes,
        fator,
        isProjecao: fator > 1,
        litros: totLitros * fator,
        receita: totReceita * fator,
        custo: totCusto * fator,
        margem: (totReceita - totCusto) * fator,
        porProduto: combs.map(p => ({
          produtoCodigo: p.produtoCodigo,
          produtoNome: p.produtoNome,
          projLitros: p.quantidade * fator,
          projReceita: p.totalVenda * fator,
          projMargem: (p.totalVenda - p.totalCusto) * fator,
          margemPct: p.totalVenda > 0 ? ((p.totalVenda - p.totalCusto) / p.totalVenda) * 100 : 0,
        })),
      };
    };
    return {
      atual: calc(dados.atual),
      mesAnt: calc(dados.mesAnterior),
      anoAnt: calc(dados.anoAnterior),
    };
  }, [dados]);

  // Arvore por dia > combustivel
  // Constroi totais por dia para TODOS os dias em porDia (inclui buffer de 7 dias
  // antes do mes selecionado) para conseguir comparar D vs D-7 nos primeiros dias.
  // Renderiza so os dias dentro do periodo selecionado.
  const treeDias = useMemo(() => {
    const allDaysMap = new Map();
    for (const [data, produtosDia] of dados.atual.porDia.entries()) {
      const combs = Array.from(produtosDia.values())
        .filter(p => p.categoria === 'combustivel')
        .map(p => ({
          ...p,
          margem: p.receita - p.custo,
          precoMedio: p.quantidade > 0 ? p.receita / p.quantidade : 0,
          custoMedio: p.quantidade > 0 ? p.custo / p.quantidade : 0,
          margemPct: p.receita > 0 ? ((p.receita - p.custo) / p.receita) * 100 : 0,
          margemPorLitro: p.quantidade > 0 ? (p.receita - p.custo) / p.quantidade : 0,
        }))
        .sort((a, b) => b.receita - a.receita);
      if (combs.length === 0) continue;
      const litros = combs.reduce((s, p) => s + p.quantidade, 0);
      const receita = combs.reduce((s, p) => s + p.receita, 0);
      const custo = combs.reduce((s, p) => s + p.custo, 0);
      allDaysMap.set(data, {
        data,
        diaSemana: diaSemanaCurto(data),
        litros, receita, custo,
        margem: receita - custo,
        precoMedio: litros > 0 ? receita / litros : 0,
        custoMedio: litros > 0 ? custo / litros : 0,
        margemPct: receita > 0 ? ((receita - custo) / receita) * 100 : 0,
        margemPorLitro: litros > 0 ? (receita - custo) / litros : 0,
        produtos: combs,
      });
    }

    const dias = Array.from(allDaysMap.values())
      .filter(d => d.data >= dados.atual.dataInicial && d.data <= dados.atual.dataFinal)
      .sort((a, b) => b.data.localeCompare(a.data));

    return dias.map(d => {
      const dAnterior = allDaysMap.get(dataMenos7(d.data));
      const varLitros = dAnterior && dAnterior.litros > 0
        ? ((d.litros - dAnterior.litros) / dAnterior.litros) * 100 : null;
      return {
        ...d,
        litrosSemAnt: dAnterior?.litros ?? null,
        varLitrosSemAnt: varLitros,
        produtos: d.produtos.map(p => {
          const pPrev = dAnterior?.produtos.find(x => x.produtoCodigo === p.produtoCodigo);
          const v = pPrev && pPrev.quantidade > 0
            ? ((p.quantidade - pPrev.quantidade) / pPrev.quantidade) * 100 : null;
          return { ...p, litrosSemAnt: pPrev?.quantidade ?? null, varLitrosSemAnt: v };
        }),
      };
    });
  }, [dados]);

  const produtos = useMemo(() => {
    const itens = Array.from(dados.atual.porProduto.values()).filter(p => p.categoria === 'combustivel');
    const total = itens.reduce((s, p) => s + p.totalVenda, 0);
    return itens
      .map(p => ({
        ...p,
        participacao: total > 0 ? (p.totalVenda / total) * 100 : 0,
        precoMedio: p.quantidade > 0 ? p.totalVenda / p.quantidade : 0,
        cmvPct: p.totalVenda > 0 ? (p.totalCusto / p.totalVenda) * 100 : 0,
        margem: p.totalVenda - p.totalCusto,
        varReceitaMesAnt: dados.mesAnterior.porProduto.get(p.produtoCodigo)?.totalVenda ?? null,
        varReceitaAnoAnt: dados.anoAnterior.porProduto.get(p.produtoCodigo)?.totalVenda ?? null,
      }))
      .sort((a, b) => b.totalVenda - a.totalVenda);
  }, [dados]);

  // Totais do mes anterior e ano anterior (apenas combustiveis) para comparacao nos KPIs
  const totaisPeriodo = (periodo) => {
    const itens = Array.from(periodo.porProduto.values()).filter(p => p.categoria === 'combustivel');
    const receita = itens.reduce((s, p) => s + p.totalVenda, 0);
    const litros  = itens.reduce((s, p) => s + p.quantidade, 0);
    const custo   = itens.reduce((s, p) => s + p.totalCusto, 0);
    return { receita, litros, custo, margem: receita - custo };
  };
  const tAtual = totaisPeriodo(dados.atual);
  const tMesAnt = totaisPeriodo(dados.mesAnterior);
  const tAnoAnt = totaisPeriodo(dados.anoAnterior);

  const margemPct = (t) => (t.receita > 0 ? (t.margem / t.receita) * 100 : null);
  const margemPctAtual  = margemPct(tAtual);
  const margemPctMesAnt = margemPct(tMesAnt);
  const margemPctAnoAnt = margemPct(tAnoAnt);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <KpiComparativo label="Receita combustíveis" icon={Fuel} color="amber"
          atual={tAtual.receita} mesAnt={tMesAnt.receita} anoAnt={tAnoAnt.receita} />
        <KpiComparativo label="Litros vendidos" icon={Fuel} color="blue"
          atual={tAtual.litros} mesAnt={tMesAnt.litros} anoAnt={tAnoAnt.litros}
          formatter={(v) => `${formatNumero(v, 0)} L`} />
        <KpiMargemPct
          label="Margem %" icon={Percent} color="indigo"
          atualPct={margemPctAtual} mesAntPct={margemPctMesAnt} anoAntPct={margemPctAnoAnt} />
        <KpiComparativo label="Margem bruta" icon={TrendingUp}
          color={tAtual.margem >= 0 ? 'emerald' : 'red'}
          atual={tAtual.margem} mesAnt={tMesAnt.margem} anoAnt={tAnoAnt.margem} />
      </div>

      {/* Projecao estatistica para o mes */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Projecao estatística para o mês</h3>
          <span className="text-[11px] text-gray-400">
            · base {projecoes.atual.diasCobertos}/{projecoes.atual.diasTotalMes} dias
            · {projecoes.atual.isProjecao ? 'projetado linear' : 'mês fechado'}
          </span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiComparativo label="Projecao faturamento" icon={Receipt} color="amber"
              atual={projecoes.atual.receita} mesAnt={projecoes.mesAnt.receita} anoAnt={projecoes.anoAnt.receita} />
            <KpiComparativo label="Projecao litros" icon={Fuel} color="blue"
              atual={projecoes.atual.litros} mesAnt={projecoes.mesAnt.litros} anoAnt={projecoes.anoAnt.litros}
              formatter={(v) => `${formatNumero(v, 0)} L`} />
            <KpiComparativo label="Projecao margem" icon={TrendingUp}
              color={projecoes.atual.margem >= 0 ? 'emerald' : 'red'}
              atual={projecoes.atual.margem} mesAnt={projecoes.mesAnt.margem} anoAnt={projecoes.anoAnt.margem} />
          </div>
          {projecoes.atual.porProduto.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">Sem base de combustíveis para projetar.</div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-y border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5" rowSpan={2}>Produto</th>
                    <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={3}>Litros (projetado)</th>
                    <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={3}>Faturamento (projetado)</th>
                    <th className="px-3 py-1.5 text-center border-l border-gray-200" colSpan={3}>Margem (projetado)</th>
                  </tr>
                  <tr className="text-right text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    <th className="px-3 py-2 border-l border-gray-200">Atual</th>
                    <th className="px-3 py-2">vs mês ant</th>
                    <th className="px-3 py-2">vs ano ant</th>
                    <th className="px-3 py-2 border-l border-gray-200">Atual</th>
                    <th className="px-3 py-2">vs mês ant</th>
                    <th className="px-3 py-2">vs ano ant</th>
                    <th className="px-3 py-2 border-l border-gray-200">Atual</th>
                    <th className="px-3 py-2">vs mês ant</th>
                    <th className="px-3 py-2">vs ano ant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {projecoes.atual.porProduto
                    .slice()
                    .sort((a, b) => b.projReceita - a.projReceita)
                    .map(p => {
                      const ma = projecoes.mesAnt.porProduto.find(x => x.produtoCodigo === p.produtoCodigo);
                      const aa = projecoes.anoAnt.porProduto.find(x => x.produtoCodigo === p.produtoCodigo);
                      return (
                        <tr key={p.produtoCodigo} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 text-[12.5px] text-gray-800 font-medium">{p.produtoNome}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l border-gray-200">{formatNumero(p.projLitros, 0)} L</td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projLitros, ma?.projLitros)} /></td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projLitros, aa?.projLitros)} /></td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 font-semibold border-l border-gray-200">{formatCurrency(p.projReceita)}</td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projReceita, ma?.projReceita)} /></td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projReceita, aa?.projReceita)} /></td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-200 ${p.projMargem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(p.projMargem)}</td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projMargem, ma?.projMargem)} /></td>
                          <td className="px-3 py-2 text-right"><MiniVar v={variacao(p.projMargem, aa?.projMargem)} /></td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-200">
                  <tr className="text-[12px] font-semibold">
                    <td className="px-4 py-3 text-gray-700">Total projetado</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatNumero(projecoes.atual.litros, 0)} L</td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.litros, projecoes.mesAnt.litros)} /></td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.litros, projecoes.anoAnt.litros)} /></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(projecoes.atual.receita)}</td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.receita, projecoes.mesAnt.receita)} /></td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.receita, projecoes.anoAnt.receita)} /></td>
                    <td className={`px-3 py-3 text-right font-mono tabular-nums border-l border-gray-200 ${projecoes.atual.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(projecoes.atual.margem)}</td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.margem, projecoes.mesAnt.margem)} /></td>
                    <td className="px-3 py-3 text-right"><MiniVar v={variacao(projecoes.atual.margem, projecoes.anoAnt.margem)} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[10px] text-gray-500">
            Metodo: extrapolacao linear (media diária × dias do mês). Comparação contra projecoes equivalentes de mês anterior e ano anterior (calculadas com a mesma base de dias).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">Vendas por combustível</h3>
          <span className="text-[11px] text-gray-400">· {produtos.length} produto{produtos.length === 1 ? '' : 's'}</span>
        </div>
        {produtos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhuma venda de combustível no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Produto</th>
                  <th className="px-4 py-2.5 text-right">Litros</th>
                  <th className="px-4 py-2.5 text-right">Preco medio</th>
                  <th className="px-4 py-2.5 text-right">Receita</th>
                  <th className="px-4 py-2.5 text-right">% total</th>
                  <th className="px-4 py-2.5 text-right">Margem</th>
                  <th className="px-4 py-2.5 text-right">Var mês ant</th>
                  <th className="px-4 py-2.5 text-right">Var ano ant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {produtos.map(p => (
                  <tr key={p.produtoCodigo} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-[12.5px] text-gray-800">
                      <span className="font-medium">{p.produtoNome}</span>
                      {p.grupoNome && <span className="text-[10px] text-gray-400 ml-2">{p.grupoNome}</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatNumero(p.quantidade, 2)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatCurrency(p.precoMedio)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(p.totalVenda)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-mono text-[11px] tabular-nums text-gray-600">{p.participacao.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-amber-400" style={{ width: `${p.participacao}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(p.margem)}
                    </td>
                    <td className="px-4 py-2 text-right"><MiniVar v={variacao(p.totalVenda, p.varReceitaMesAnt)} /></td>
                    <td className="px-4 py-2 text-right"><MiniVar v={variacao(p.totalVenda, p.varReceitaAnoAnt)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3 text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-800">{formatNumero(tAtual.litros, 2)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-800">{tAtual.litros > 0 ? formatCurrency(tAtual.receita / tAtual.litros) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">{formatCurrency(tAtual.receita)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">100%</td>
                  <td className={`px-4 py-3 text-right font-mono tabular-nums ${tAtual.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(tAtual.margem)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Arvore dia > combustivel */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">Vendas por dia &gt; combustível</h3>
          <span className="text-[11px] text-gray-400">· {treeDias.length} dia{treeDias.length === 1 ? '' : 's'} · clique para expandir</span>
          <button onClick={() => setDiasExpandidos(treeDias.length === diasExpandidos.size ? new Set() : new Set(treeDias.map(d => d.data)))}
            className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 font-medium">
            {diasExpandidos.size > 0 ? 'Recolher todos' : 'Expandir todos'}
          </button>
        </div>
        {treeDias.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Sem vendas de combustível no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Data / Produto</th>
                  <th className="px-2 py-2.5">Dia</th>
                  <th className="px-3 py-2.5 text-right">Litros</th>
                  <th className="px-3 py-2.5 text-right">vs sem. ant</th>
                  <th className="px-3 py-2.5 text-right">Faturamento</th>
                  <th className="px-3 py-2.5 text-right">Custo</th>
                  <th className="px-3 py-2.5 text-right">Margem R$</th>
                  <th className="px-3 py-2.5 text-right">Preco medio</th>
                  <th className="px-3 py-2.5 text-right">Custo medio</th>
                  <th className="px-3 py-2.5 text-right">Margem %</th>
                  <th className="px-3 py-2.5 text-right">Margem R$/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {treeDias.map(d => {
                  const aberto = diasExpandidos.has(d.data);
                  return (
                    <React.Fragment key={d.data}>
                      <tr onClick={() => toggleDia(d.data)}
                        className={`cursor-pointer transition-colors ${aberto ? 'bg-amber-50/30' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </motion.div>
                            <span className="font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatDataBR(d.data)}</span>
                            <span className="text-[10px] text-gray-400">({d.produtos.length} prod.)</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-[11px] text-gray-600 font-medium uppercase tracking-wider">{d.diaSemana}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 font-semibold">{formatNumero(d.litros, 0)} L</td>
                        <td className="px-3 py-2 text-right"><MiniVar v={d.varLitrosSemAnt} /></td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800">{formatCurrency(d.receita)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-600">{formatCurrency(d.custo)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold ${d.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(d.margem)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatCurrency(d.precoMedio)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-600">{formatCurrency(d.custoMedio)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] ${d.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{d.margemPct.toFixed(1)}%</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] ${d.margemPorLitro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(d.margemPorLitro)}</td>
                      </tr>
                      {aberto && d.produtos.map(p => (
                        <tr key={`${d.data}-${p.produtoCodigo}`} className="bg-gray-50/30 hover:bg-gray-50/60">
                          <td className="px-3 py-1.5" style={{ paddingLeft: 32 }}>
                            <span className="text-[11.5px] text-gray-700 truncate">{p.produtoNome}</span>
                          </td>
                          <td className="px-2 py-1.5" />
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatNumero(p.quantidade, 2)} L</td>
                          <td className="px-3 py-1.5 text-right"><MiniVar v={p.varLitrosSemAnt} /></td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatCurrency(p.receita)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-500">{formatCurrency(p.custo)}</td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(p.margem)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-600">{formatCurrency(p.precoMedio)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-500">{formatCurrency(p.custoMedio)}</td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${p.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.margemPct.toFixed(1)}%</td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${p.margemPorLitro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(p.margemPorLitro)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-2 bg-gray-50/60 border-t border-gray-100 text-[10px] text-gray-500">
          Comparação com semana anterior: dia D vs D-7. Inclui os 7 dias antes do início do mês para cobrir os dias 1-7 do período selecionado.
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Aba Produtos
// ────────────────────────────────────────────────────────────────────

// `categoriaFiltro`: null = todos os nao-combustiveis (aba Produtos)
//                     'conveniencia' = somente conveniencia (aba Conveniencia)
function AbaProdutos({ dados, categoriaFiltro = null }) {
  const [subTab, setSubTab] = useState('dia'); // dia | grupo | abc | graficos
  const [diasExpandidos, setDiasExpandidos] = useState(new Set());
  const [gruposDiaExpandidos, setGruposDiaExpandidos] = useState(new Set());
  const [rankingExpandido, setRankingExpandido] = useState(new Set());

  const passaCategoria = useCallback(
    (p) => {
      if (p.categoria === 'combustivel') return false;
      if (categoriaFiltro) return p.categoria === categoriaFiltro;
      return true;
    },
    [categoriaFiltro]
  );

  // Totais do periodo (apenas nao-combustiveis)
  const totaisPeriodo = useCallback((periodo) => {
    const itens = Array.from(periodo.porProduto.values()).filter(passaCategoria);
    const receita = itens.reduce((s, p) => s + p.totalVenda, 0);
    const custo   = itens.reduce((s, p) => s + p.totalCusto, 0);
    const qtd     = itens.reduce((s, p) => s + p.quantidade, 0);
    return { receita, custo, quantidade: qtd, margem: receita - custo };
  }, [passaCategoria]);

  const tAtual  = totaisPeriodo(dados.atual);
  const tMesAnt = totaisPeriodo(dados.mesAnterior);
  const tAnoAnt = totaisPeriodo(dados.anoAnterior);
  const margemPctAtual  = tAtual.receita  > 0 ? (tAtual.margem / tAtual.receita) * 100 : null;
  const margemPctMesAnt = tMesAnt.receita > 0 ? (tMesAnt.margem / tMesAnt.receita) * 100 : null;
  const margemPctAnoAnt = tAnoAnt.receita > 0 ? (tAnoAnt.margem / tAnoAnt.receita) * 100 : null;

  // Projecao linear: extrapola pelo total de dias do mes
  const projecoes = useMemo(() => {
    const calc = (periodo) => {
      const diasCobertos = diasNoIntervalo(periodo.dataInicial, periodo.dataFinal);
      const diasTotalMes = diasDoMes(periodo.dataInicial);
      const fator = diasCobertos > 0 ? diasTotalMes / diasCobertos : 0;
      const itens = Array.from(periodo.porProduto.values()).filter(passaCategoria);
      const totReceita = itens.reduce((s, p) => s + p.totalVenda, 0);
      const totCusto   = itens.reduce((s, p) => s + p.totalCusto, 0);
      return {
        diasCobertos, diasTotalMes, fator, isProjecao: fator > 1,
        receita: totReceita * fator,
        custo:   totCusto * fator,
        margem:  (totReceita - totCusto) * fator,
      };
    };
    return { atual: calc(dados.atual), mesAnt: calc(dados.mesAnterior), anoAnt: calc(dados.anoAnterior) };
  }, [dados, passaCategoria]);

  // Arvore: dia > grupo > produto. Inclui buffer de 7 dias antes do mes
  // selecionado (presente em dados.atual.porDia) para conseguir o D-7.
  const treeDias = useMemo(() => {
    const allDaysMap = new Map();
    for (const [data, produtosDia] of dados.atual.porDia.entries()) {
      const itensRaw = Array.from(produtosDia.values()).filter(passaCategoria);
      if (itensRaw.length === 0) continue;

      // Enriquece cada produto com grupo (lookup em porProduto) e metricas
      const itens = itensRaw.map(p => {
        const meta = dados.atual.porProduto.get(p.produtoCodigo);
        return {
          produtoCodigo: p.produtoCodigo,
          produtoNome: p.produtoNome,
          grupoCodigo: meta?.grupoCodigo ?? null,
          grupoNome: meta?.grupoNome || 'Sem grupo',
          quantidade: p.quantidade,
          receita: p.receita,
          custo: p.custo,
          margem: p.receita - p.custo,
          margemPct: p.receita > 0 ? ((p.receita - p.custo) / p.receita) * 100 : 0,
          precoMedio: p.quantidade > 0 ? p.receita / p.quantidade : 0,
          custoMedio: p.quantidade > 0 ? p.custo / p.quantidade : 0,
          margemRs: p.quantidade > 0 ? (p.receita - p.custo) / p.quantidade : 0,
        };
      });

      // Agrupa por grupo
      const gruposMap = new Map();
      itens.forEach(p => {
        const key = p.grupoCodigo ?? 'sem-grupo';
        if (!gruposMap.has(key)) {
          gruposMap.set(key, {
            grupoCodigo: p.grupoCodigo,
            grupoNome: p.grupoNome,
            quantidade: 0, receita: 0, custo: 0,
            produtos: [],
          });
        }
        const g = gruposMap.get(key);
        g.quantidade += p.quantidade;
        g.receita    += p.receita;
        g.custo      += p.custo;
        g.produtos.push(p);
      });

      const grupos = Array.from(gruposMap.values())
        .map(g => ({
          ...g,
          margem: g.receita - g.custo,
          margemPct: g.receita > 0 ? ((g.receita - g.custo) / g.receita) * 100 : 0,
          precoMedio: g.quantidade > 0 ? g.receita / g.quantidade : 0,
          custoMedio: g.quantidade > 0 ? g.custo / g.quantidade : 0,
          margemRs: g.quantidade > 0 ? (g.receita - g.custo) / g.quantidade : 0,
          produtos: g.produtos.sort((a, b) => b.receita - a.receita),
        }))
        .sort((a, b) => b.receita - a.receita);

      const qtdDia = itens.reduce((s, p) => s + p.quantidade, 0);
      const recDia = itens.reduce((s, p) => s + p.receita, 0);
      const cusDia = itens.reduce((s, p) => s + p.custo, 0);

      allDaysMap.set(data, {
        data,
        diaSemana: diaSemanaCurto(data),
        quantidade: qtdDia,
        receita: recDia,
        custo: cusDia,
        margem: recDia - cusDia,
        margemPct: recDia > 0 ? ((recDia - cusDia) / recDia) * 100 : 0,
        precoMedio: qtdDia > 0 ? recDia / qtdDia : 0,
        custoMedio: qtdDia > 0 ? cusDia / qtdDia : 0,
        margemRs: qtdDia > 0 ? (recDia - cusDia) / qtdDia : 0,
        grupos,
      });
    }

    const dias = Array.from(allDaysMap.values())
      .filter(d => d.data >= dados.atual.dataInicial && d.data <= dados.atual.dataFinal)
      .sort((a, b) => b.data.localeCompare(a.data));

    // Variacao semanal (D vs D-7) sobre faturamento
    return dias.map(d => {
      const dAnt = allDaysMap.get(dataMenos7(d.data));
      const varReceita = dAnt && dAnt.receita > 0
        ? ((d.receita - dAnt.receita) / dAnt.receita) * 100
        : null;
      return {
        ...d,
        receitaSemAnt: dAnt?.receita ?? null,
        varReceitaSemAnt: varReceita,
      };
    });
  }, [dados, passaCategoria]);

  // Ranking: tree grupo > produto, com comparacao vs ano anterior
  const treeRanking = useMemo(() => {
    const itens = Array.from(dados.atual.porProduto.values()).filter(passaCategoria);
    const totalGeral = itens.reduce((s, p) => s + p.totalVenda, 0);

    const gruposMap = new Map();
    itens.forEach(p => {
      const key = p.grupoCodigo ?? 'sem-grupo';
      if (!gruposMap.has(key)) {
        gruposMap.set(key, {
          grupoCodigo: p.grupoCodigo,
          grupoNome: p.grupoNome || 'Sem grupo',
          quantidade: 0, receita: 0, custo: 0,
          receitaMesAnt: 0,
          receitaAnoAnt: 0,
          qtdProdutos: 0,
          produtos: [],
        });
      }
      const g = gruposMap.get(key);
      const pMesAnt = dados.mesAnterior.porProduto.get(p.produtoCodigo);
      const pAnoAnt = dados.anoAnterior.porProduto.get(p.produtoCodigo);
      g.quantidade   += p.quantidade;
      g.receita      += p.totalVenda;
      g.custo        += p.totalCusto;
      g.receitaMesAnt += pMesAnt?.totalVenda ?? 0;
      g.receitaAnoAnt += pAnoAnt?.totalVenda ?? 0;
      g.qtdProdutos  += 1;
      g.produtos.push({
        produtoCodigo: p.produtoCodigo,
        produtoNome: p.produtoNome,
        categoria: p.categoria,
        quantidade: p.quantidade,
        receita: p.totalVenda,
        custo: p.totalCusto,
        margem: p.totalVenda - p.totalCusto,
        margemPct: p.totalVenda > 0 ? ((p.totalVenda - p.totalCusto) / p.totalVenda) * 100 : 0,
        participacao: totalGeral > 0 ? (p.totalVenda / totalGeral) * 100 : 0,
        receitaMesAnt: pMesAnt?.totalVenda ?? null,
        receitaAnoAnt: pAnoAnt?.totalVenda ?? null,
      });
    });

    const grupos = Array.from(gruposMap.values()).map(g => ({
      ...g,
      margem: g.receita - g.custo,
      margemPct: g.receita > 0 ? ((g.receita - g.custo) / g.receita) * 100 : 0,
      participacao: totalGeral > 0 ? (g.receita / totalGeral) * 100 : 0,
      varReceitaMesAnt: g.receitaMesAnt > 0 ? ((g.receita - g.receitaMesAnt) / g.receitaMesAnt) * 100 : null,
      varReceitaAnoAnt: g.receitaAnoAnt > 0 ? ((g.receita - g.receitaAnoAnt) / g.receitaAnoAnt) * 100 : null,
      produtos: g.produtos.sort((a, b) => b.receita - a.receita),
    })).sort((a, b) => b.receita - a.receita);

    return { totalGeral, grupos };
  }, [dados, passaCategoria]);

  // Curva ABC: classifica produtos pelo % cumulativo de receita
  // A: ate 80% acumulado (top performers, ~20% dos itens trazem 80% da receita)
  // B: 80-95%
  // C: >95%
  const curvaABC = useMemo(() => {
    const itens = Array.from(dados.atual.porProduto.values())
      .filter(passaCategoria)
      .sort((a, b) => b.totalVenda - a.totalVenda);
    const totalGeral = itens.reduce((s, p) => s + p.totalVenda, 0);
    let acumulado = 0;
    const classificados = itens.map((p, i) => {
      acumulado += p.totalVenda;
      const acumPct = totalGeral > 0 ? (acumulado / totalGeral) * 100 : 0;
      const participacao = totalGeral > 0 ? (p.totalVenda / totalGeral) * 100 : 0;
      const classe = acumPct <= 80 ? 'A' : acumPct <= 95 ? 'B' : 'C';
      return {
        rank: i + 1,
        produtoCodigo: p.produtoCodigo,
        produtoNome: p.produtoNome,
        grupoNome: p.grupoNome || 'Sem grupo',
        categoria: p.categoria,
        quantidade: p.quantidade,
        receita: p.totalVenda,
        margem: p.totalVenda - p.totalCusto,
        margemPct: p.totalVenda > 0 ? ((p.totalVenda - p.totalCusto) / p.totalVenda) * 100 : 0,
        participacao,
        acumPct,
        classe,
      };
    });
    const resumo = { A: { qtd: 0, receita: 0 }, B: { qtd: 0, receita: 0 }, C: { qtd: 0, receita: 0 } };
    classificados.forEach(p => {
      resumo[p.classe].qtd += 1;
      resumo[p.classe].receita += p.receita;
    });
    return { itens: classificados, totalGeral, resumo };
  }, [dados, passaCategoria]);

  // Dados para os graficos analiticos
  const dadosGraficos = useMemo(() => {
    // Receita diaria (ordem cronologica)
    const linhaReceita = treeDias
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(d => ({
        data: d.data,
        label: formatDataBR(d.data).slice(0, 5), // dd/mm
        receita: d.receita,
        margem: d.margem,
      }));

    // Top 10 produtos por receita
    const top10 = Array.from(dados.atual.porProduto.values())
      .filter(passaCategoria)
      .sort((a, b) => b.totalVenda - a.totalVenda)
      .slice(0, 10)
      .map(p => ({
        produto: p.produtoNome.length > 28 ? p.produtoNome.slice(0, 28) + '…' : p.produtoNome,
        receita: p.totalVenda,
      }));

    // Participacao por grupo (donut) — top 7 + outros
    const todosGrupos = treeRanking.grupos;
    const top7 = todosGrupos.slice(0, 7);
    const outros = todosGrupos.slice(7);
    const outrosReceita = outros.reduce((s, g) => s + g.receita, 0);
    const donut = top7.map(g => ({ name: g.grupoNome, value: g.receita }));
    if (outrosReceita > 0) donut.push({ name: 'Outros', value: outrosReceita });

    // Margem % por grupo (so grupos com receita > 0)
    const barrasMargem = todosGrupos
      .filter(g => g.receita > 0)
      .map(g => ({
        grupo: g.grupoNome.length > 16 ? g.grupoNome.slice(0, 16) + '…' : g.grupoNome,
        margemPct: Number(g.margemPct.toFixed(1)),
      }));

    return { linhaReceita, top10, donut, barrasMargem };
  }, [treeDias, treeRanking, dados, passaCategoria]);

  const toggleDia = (data) => setDiasExpandidos(prev => {
    const next = new Set(prev);
    next.has(data) ? next.delete(data) : next.add(data);
    return next;
  });
  const toggleGrupoDia = (key) => setGruposDiaExpandidos(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleGrupoRanking = (key) => setRankingExpandido(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const expandirTudoDia = () => {
    if (diasExpandidos.size > 0) {
      setDiasExpandidos(new Set());
      setGruposDiaExpandidos(new Set());
    } else {
      setDiasExpandidos(new Set(treeDias.map(d => d.data)));
      const todosGrupos = new Set();
      treeDias.forEach(d => d.grupos.forEach(g => todosGrupos.add(`${d.data}|${g.grupoCodigo ?? 'sem-grupo'}`)));
      setGruposDiaExpandidos(todosGrupos);
    }
  };

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <KpiComparativo label="Receita produtos" icon={Receipt} color="blue"
          atual={tAtual.receita} mesAnt={tMesAnt.receita} anoAnt={tAnoAnt.receita} />
        <KpiComparativo label="Itens vendidos" icon={Package} color="indigo"
          atual={tAtual.quantidade} mesAnt={tMesAnt.quantidade} anoAnt={tAnoAnt.quantidade}
          formatter={(v) => formatNumero(v, 0)} />
        <KpiMargemPct
          label="Margem %" icon={Percent} color="violet"
          atualPct={margemPctAtual} mesAntPct={margemPctMesAnt} anoAntPct={margemPctAnoAnt} />
        <KpiComparativo label="Margem bruta" icon={TrendingUp}
          color={tAtual.margem >= 0 ? 'emerald' : 'red'}
          atual={tAtual.margem} mesAnt={tMesAnt.margem} anoAnt={tAnoAnt.margem} />
      </div>

      {/* Projecao */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Projeção estatística para o mês</h3>
          <span className="text-[11px] text-gray-400">
            · base {projecoes.atual.diasCobertos}/{projecoes.atual.diasTotalMes} dias
            · {projecoes.atual.isProjecao ? 'projetado linear' : 'mês fechado'}
          </span>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiComparativo label="Projeção faturamento" icon={Receipt} color="blue"
              atual={projecoes.atual.receita} mesAnt={projecoes.mesAnt.receita} anoAnt={projecoes.anoAnt.receita} />
            <KpiComparativo label="Projeção margem" icon={TrendingUp}
              color={projecoes.atual.margem >= 0 ? 'emerald' : 'red'}
              atual={projecoes.atual.margem} mesAnt={projecoes.mesAnt.margem} anoAnt={projecoes.anoAnt.margem} />
            <KpiMargemPct
              label="Projeção margem %" icon={Percent} color="violet"
              atualPct={projecoes.atual.receita > 0 ? (projecoes.atual.margem / projecoes.atual.receita) * 100 : null}
              mesAntPct={projecoes.mesAnt.receita > 0 ? (projecoes.mesAnt.margem / projecoes.mesAnt.receita) * 100 : null}
              anoAntPct={projecoes.anoAnt.receita > 0 ? (projecoes.anoAnt.margem / projecoes.anoAnt.receita) * 100 : null}
            />
            <KpiComparativo label="Ticket médio" icon={ShoppingCart} color="indigo"
              atual={dados.atual.ticketMedio} mesAnt={dados.mesAnterior.ticketMedio} anoAnt={dados.anoAnterior.ticketMedio} />
          </div>
          <p className="text-[10px] text-gray-500">
            Método: extrapolação linear (média diária × dias do mês) para faturamento e margem. Margem %
            comparada em pontos percentuais. Ticket médio é por transação (não extrapolado), comparado
            contra os mesmos períodos de referência.
          </p>
        </div>
      </div>

      {/* Card unico com sub-abas: dia / grupo / abc / graficos */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 flex items-center gap-1 px-2 overflow-x-auto">
          {[
            { k: 'dia',      label: 'Vendas por dia',      icon: Calendar },
            { k: 'grupo',    label: 'Vendas por grupo',    icon: Package },
            { k: 'abc',      label: 'Curva ABC',           icon: BarChart3 },
            { k: 'graficos', label: 'Gráficos analíticos', icon: PieChartIcon },
          ].map(t => {
            const Icon = t.icon;
            const ativo = subTab === t.k;
            return (
              <button key={t.k} onClick={() => setSubTab(t.k)}
                className={`relative flex items-center gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

      {subTab === 'dia' && (
        <>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Vendas por dia &gt; grupo &gt; produto</h3>
          <span className="text-[11px] text-gray-400">· {treeDias.length} dia{treeDias.length === 1 ? '' : 's'} · clique para expandir</span>
          <button onClick={expandirTudoDia}
            className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 font-medium">
            {diasExpandidos.size > 0 ? 'Recolher todos' : 'Expandir todos'}
          </button>
        </div>
        {treeDias.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Sem vendas no período para esse filtro.</div>
        ) : (
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/95 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_0_#e5e7eb]">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Data / Grupo / Produto</th>
                  <th className="px-2 py-2.5">Dia</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Faturamento</th>
                  <th className="px-3 py-2.5 text-right">vs sem. ant</th>
                  <th className="px-3 py-2.5 text-right">Custo</th>
                  <th className="px-3 py-2.5 text-right">Lucro bruto</th>
                  <th className="px-3 py-2.5 text-right">Margem %</th>
                  <th className="px-3 py-2.5 text-right">Preço médio</th>
                  <th className="px-3 py-2.5 text-right">Custo médio</th>
                  <th className="px-3 py-2.5 text-right">Margem R$/un</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {treeDias.map(d => {
                  const aberto = diasExpandidos.has(d.data);
                  return (
                    <React.Fragment key={d.data}>
                      <tr onClick={() => toggleDia(d.data)}
                        className={`cursor-pointer transition-colors ${aberto ? 'bg-blue-50/30' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </motion.div>
                            <span className="font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatDataBR(d.data)}</span>
                            <span className="text-[10px] text-gray-400">({d.grupos.length} grupo{d.grupos.length === 1 ? '' : 's'})</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-[11px] text-gray-600 font-medium uppercase tracking-wider">{d.diaSemana}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 font-semibold">{formatNumero(d.quantidade, 0)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 font-semibold">{formatCurrency(d.receita)}</td>
                        <td className="px-3 py-2 text-right"><MiniVar v={d.varReceitaSemAnt} /></td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-600">{formatCurrency(d.custo)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold ${d.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(d.margem)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] ${d.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{d.margemPct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatCurrency(d.precoMedio)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-600">{formatCurrency(d.custoMedio)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] ${d.margemRs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(d.margemRs)}</td>
                      </tr>
                      {aberto && d.grupos.map(g => {
                        const gKey = `${d.data}|${g.grupoCodigo ?? 'sem-grupo'}`;
                        const gAberto = gruposDiaExpandidos.has(gKey);
                        return (
                          <React.Fragment key={gKey}>
                            <tr onClick={() => toggleGrupoDia(gKey)}
                              className={`cursor-pointer transition-colors ${gAberto ? 'bg-indigo-50/40' : 'bg-gray-50/30 hover:bg-gray-50/60'}`}>
                              <td className="px-3 py-1.5" style={{ paddingLeft: 32 }}>
                                <div className="flex items-center gap-1.5">
                                  <motion.div animate={{ rotate: gAberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                    <ChevronRight className="h-3 w-3 text-gray-400" />
                                  </motion.div>
                                  <span className="text-[11.5px] font-medium text-gray-800 truncate">{g.grupoNome}</span>
                                  <span className="text-[10px] text-gray-400">({g.produtos.length})</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5" />
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatNumero(g.quantidade, 0)}</td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700 font-medium">{formatCurrency(g.receita)}</td>
                              <td className="px-3 py-1.5" />
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-500">{formatCurrency(g.custo)}</td>
                              <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] font-medium ${g.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(g.margem)}</td>
                              <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${g.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{g.margemPct.toFixed(1)}%</td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-600">{formatCurrency(g.precoMedio)}</td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-500">{formatCurrency(g.custoMedio)}</td>
                              <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${g.margemRs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(g.margemRs)}</td>
                            </tr>
                            {gAberto && g.produtos.map(p => (
                              <tr key={`${gKey}-${p.produtoCodigo}`} className="bg-gray-50/20 hover:bg-gray-50/50">
                                <td className="px-3 py-1.5" style={{ paddingLeft: 56 }}>
                                  <span className="text-[11px] text-gray-700 truncate">{p.produtoNome}</span>
                                </td>
                                <td className="px-2 py-1.5" />
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-600">{formatNumero(p.quantidade, 0)}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-600">{formatCurrency(p.receita)}</td>
                                <td className="px-3 py-1.5" />
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-500">{formatCurrency(p.custo)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(p.margem)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[10.5px] ${p.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.margemPct.toFixed(1)}%</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[10.5px] text-gray-600">{formatCurrency(p.precoMedio)}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[10.5px] text-gray-500">{formatCurrency(p.custoMedio)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[10.5px] ${p.margemRs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(p.margemRs)}</td>
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
        )}
        <div className="px-5 py-2 bg-gray-50/60 border-t border-gray-100 text-[10px] text-gray-500">
          Variação semanal do faturamento: dia D vs D-7 (mesmo dia da semana anterior). Buffer de 7 dias antes do início do mês cobre os dias 1-7 do período.
        </div>
        </>
      )}

      {subTab === 'grupo' && (
        <>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-800">Vendas por grupo &gt; produto</h3>
          <span className="text-[11px] text-gray-400">
            · {treeRanking.grupos.length} grupo{treeRanking.grupos.length === 1 ? '' : 's'} · sem combustíveis · vs mesmo período do ano anterior
          </span>
          <button
            onClick={() => setRankingExpandido(rankingExpandido.size === treeRanking.grupos.length
              ? new Set()
              : new Set(treeRanking.grupos.map(g => g.grupoCodigo ?? 'sem-grupo')))}
            className="ml-auto text-[11px] text-violet-600 hover:text-violet-800 font-medium">
            {rankingExpandido.size > 0 ? 'Recolher todos' : 'Expandir todos'}
          </button>
        </div>
        {treeRanking.grupos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum produto vendido neste filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Grupo / Produto</th>
                  <th className="px-3 py-2.5 text-right">Quantidade</th>
                  <th className="px-3 py-2.5 text-right">Faturamento</th>
                  <th className="px-3 py-2.5 text-right">vs mês ant</th>
                  <th className="px-3 py-2.5 text-right">vs ano ant</th>
                  <th className="px-3 py-2.5 text-right">Margem</th>
                  <th className="px-3 py-2.5 text-right">Margem %</th>
                  <th className="px-3 py-2.5 text-right">% total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {treeRanking.grupos.map(g => {
                  const gKey = g.grupoCodigo ?? 'sem-grupo';
                  const aberto = rankingExpandido.has(gKey);
                  return (
                    <React.Fragment key={gKey}>
                      <tr onClick={() => toggleGrupoRanking(gKey)}
                        className={`cursor-pointer transition-colors ${aberto ? 'bg-violet-50/30' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </motion.div>
                            <span className="text-[12.5px] font-semibold text-gray-900">{g.grupoNome}</span>
                            <span className="text-[10px] text-gray-400">({g.qtdProdutos} prod.)</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800 font-semibold">{formatNumero(g.quantidade, 0)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(g.receita)}</td>
                        <td className="px-3 py-2 text-right"><MiniVar v={g.varReceitaMesAnt} /></td>
                        <td className="px-3 py-2 text-right"><MiniVar v={g.varReceitaAnoAnt} /></td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold ${g.margem >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(g.margem)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums text-[11.5px] ${g.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{g.margemPct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-mono text-[11px] tabular-nums text-gray-600">{g.participacao.toFixed(1)}%</span>
                            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                              <div className="h-full bg-violet-400" style={{ width: `${g.participacao}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {aberto && g.produtos.map(p => (
                        <tr key={`${gKey}-${p.produtoCodigo}`} className="bg-gray-50/20 hover:bg-gray-50/50">
                          <td className="px-4 py-1.5" style={{ paddingLeft: 40 }}>
                            <span className="text-[11.5px] text-gray-700 truncate">{p.produtoNome}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{formatNumero(p.quantidade, 0)}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-800">{formatCurrency(p.receita)}</td>
                          <td className="px-3 py-1.5 text-right"><MiniVar v={variacao(p.receita, p.receitaMesAnt)} /></td>
                          <td className="px-3 py-1.5 text-right"><MiniVar v={variacao(p.receita, p.receitaAnoAnt)} /></td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[11px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(p.margem)}</td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[10.5px] ${p.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.margemPct.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className="font-mono text-[10.5px] tabular-nums text-gray-500">{p.participacao.toFixed(2)}%</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total ({treeRanking.grupos.length} grupos)</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">{formatCurrency(treeRanking.totalGeral)}</td>
                  <td colSpan={4} />
                  <td className="px-3 py-3 text-right text-gray-400">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        </>
      )}

      {subTab === 'abc' && <PaneCurvaABC curvaABC={curvaABC} />}

      {subTab === 'graficos' && <PaneGraficosAnaliticos dadosGraficos={dadosGraficos} />}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Curva ABC (Pareto): classifica produtos pelo % cumulativo de receita
// ────────────────────────────────────────────────────────────────────
function PaneCurvaABC({ curvaABC }) {
  const { itens, totalGeral, resumo } = curvaABC;

  if (itens.length === 0) {
    return <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum produto vendido neste filtro.</div>;
  }

  const pctReceita = (cls) => totalGeral > 0 ? (resumo[cls].receita / totalGeral) * 100 : 0;
  const pctQtd = (cls) => itens.length > 0 ? (resumo[cls].qtd / itens.length) * 100 : 0;

  const CLASSE_CFG = {
    A: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-800' },
    B: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   chip: 'bg-amber-100 text-amber-800' },
    C: { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-700',    chip: 'bg-gray-200 text-gray-700' },
  };

  return (
    <>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-800">Curva ABC</h3>
        <span className="text-[11px] text-gray-400">· {itens.length} produto{itens.length === 1 ? '' : 's'} · classificação por % cumulativo de receita</span>
      </div>

      {/* Resumo por classe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 border-b border-gray-100">
        {['A', 'B', 'C'].map(cls => {
          const cfg = CLASSE_CFG[cls];
          const desc = cls === 'A' ? 'até 80% da receita' : cls === 'B' ? '80–95% da receita' : '95–100% da receita';
          return (
            <div key={cls} className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${cfg.chip}`}>{cls}</span>
                <span className="text-[11px] text-gray-500 uppercase tracking-wider">{desc}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Produtos</p>
                  <p className={`text-[18px] font-bold tabular-nums ${cfg.text}`}>{resumo[cls].qtd}</p>
                  <p className="text-[10px] text-gray-500">{pctQtd(cls).toFixed(1)}% dos itens</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Receita</p>
                  <p className={`text-[14px] font-bold tabular-nums ${cfg.text}`}>{formatCurrency(resumo[cls].receita)}</p>
                  <p className="text-[10px] text-gray-500">{pctReceita(cls).toFixed(1)}% do total</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela classificada */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2.5 w-10">#</th>
              <th className="px-4 py-2.5">Produto</th>
              <th className="px-4 py-2.5">Grupo</th>
              <th className="px-4 py-2.5 text-right">Qtd</th>
              <th className="px-4 py-2.5 text-right">Receita</th>
              <th className="px-4 py-2.5 text-right">% individual</th>
              <th className="px-4 py-2.5 text-right">% acumulado</th>
              <th className="px-4 py-2.5 text-right">Margem %</th>
              <th className="px-4 py-2.5 text-center">Classe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map(p => {
              const cfg = CLASSE_CFG[p.classe];
              return (
                <tr key={p.produtoCodigo} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2 text-[11px] text-gray-400 font-mono tabular-nums">{p.rank}</td>
                  <td className="px-4 py-2 text-[12.5px] text-gray-800 font-medium truncate max-w-[300px]">{p.produtoNome}</td>
                  <td className="px-4 py-2 text-[11px] text-gray-500">{p.grupoNome}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatNumero(p.quantidade, 0)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(p.receita)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-600">{p.participacao.toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="font-mono text-[11.5px] tabular-nums text-gray-700 font-medium">{p.acumPct.toFixed(1)}%</span>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full ${p.classe === 'A' ? 'bg-emerald-500' : p.classe === 'B' ? 'bg-amber-500' : 'bg-gray-400'}`}
                          style={{ width: `${p.acumPct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono tabular-nums text-[11.5px] ${p.margemPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.margemPct.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${cfg.chip}`}>{p.classe}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 bg-gray-50/60 border-t border-gray-100 text-[10px] text-gray-500">
        Princípio de Pareto (80/20): geralmente ~20% dos produtos respondem por 80% da receita. Produtos classe A são prioridade de gestão (estoque, negociação, exposição).
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Graficos analiticos: receita diaria, top 10, donut por grupo, margem por grupo
// ────────────────────────────────────────────────────────────────────
const CORES_GRAFICO = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#94a3b8'];

function PaneGraficosAnaliticos({ dadosGraficos }) {
  const { linhaReceita, top10, donut, barrasMargem } = dadosGraficos;

  return (
    <>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-gray-800">Gráficos analíticos</h3>
        <span className="text-[11px] text-gray-400">· visão visual do período</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
        {/* Receita diaria */}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12.5px] font-semibold text-gray-800">Receita diária</p>
            <span className="text-[10px] text-gray-400">{linhaReceita.length} dias</span>
          </div>
          {linhaReceita.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-400">Sem dados no período</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={linhaReceita} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v, n) => [formatCurrency(v), n === 'receita' ? 'Receita' : 'Margem']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="receita" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} name="Receita" />
                <Line type="monotone" dataKey="margem" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} name="Margem" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut: participacao por grupo */}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12.5px] font-semibold text-gray-800">Participação por grupo</p>
            <span className="text-[10px] text-gray-400">top 7 + outros</span>
          </div>
          {donut.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-400">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name"
                  innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {donut.map((_, i) => <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 10 produtos (barras horizontais) */}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12.5px] font-semibold text-gray-800">Top 10 produtos por receita</p>
            <span className="text-[10px] text-gray-400">{top10.length} produtos</span>
          </div>
          {top10.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-xs text-gray-400">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, top10.length * 28)}>
              <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <YAxis type="category" dataKey="produto" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} width={140} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v) => [formatCurrency(v), 'Receita']} />
                <Bar dataKey="receita" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Margem % por grupo (barras) */}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12.5px] font-semibold text-gray-800">Margem % por grupo</p>
            <span className="text-[10px] text-gray-400">{barrasMargem.length} grupos</span>
          </div>
          {barrasMargem.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-400">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, barrasMargem.length * 36)}>
              <BarChart data={barrasMargem} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="grupo" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v) => [`${v.toFixed(1)}%`, 'Margem']} />
                <Bar dataKey="margemPct" radius={[0, 4, 4, 0]}>
                  {barrasMargem.map((d, i) => (
                    <Cell key={i} fill={d.margemPct >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Componentes compartilhados
// ────────────────────────────────────────────────────────────────────

function KpiComparativo({ label, icon: Icon, color, atual, mesAnt, anoAnt, formatter, hint }) {
  const bgColors = {
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    red:     'bg-red-50 text-red-600',
  };
  const fmt = formatter || formatCurrency;
  const varMes = variacao(atual, mesAnt);
  const varAno = variacao(atual, anoAnt);
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${bgColors[color] || bgColors.blue}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{fmt(atual)}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
        <BadgeVariacao label="vs mês ant" variacao={varMes} />
        <BadgeVariacao label="vs ano ant" variacao={varAno} />
      </div>
    </motion.div>
  );
}

// KPI especifico para percentuais: valor atual em destaque + duas badges no rodape
// mostrando a diferenca em pontos percentuais (pp) com o valor historico como sub-label
function KpiMargemPct({ label, icon: Icon, color, atualPct, mesAntPct, anoAntPct }) {
  const bgColors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
  };
  const fmtPct = (v) => v == null ? '—' : `${v.toFixed(1)}%`;
  const deltaPP = (ant) => (atualPct == null || ant == null) ? null : atualPct - ant;

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${bgColors[color] || bgColors.blue}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{fmtPct(atualPct)}</p>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
        <BadgeDeltaPP label={`vs mês ant (${fmtPct(mesAntPct)})`} pp={deltaPP(mesAntPct)} />
        <BadgeDeltaPP label={`vs ano ant (${fmtPct(anoAntPct)})`} pp={deltaPP(anoAntPct)} />
      </div>
    </motion.div>
  );
}

function BadgeDeltaPP({ label, pp }) {
  let tom = 'text-gray-400';
  let Icon = Minus;
  let texto = '—';
  if (pp == null) {
    texto = 'sem base';
  } else if (Math.abs(pp) < 0.05) {
    texto = '0,0pp';
  } else {
    tom = pp > 0 ? 'text-emerald-600' : 'text-red-600';
    Icon = pp > 0 ? TrendingUp : TrendingDown;
    texto = `${pp > 0 ? '+' : ''}${pp.toFixed(1)}pp`;
  }
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <Icon className={`h-3 w-3 flex-shrink-0 ${tom}`} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className={`text-[11px] font-semibold tabular-nums ${tom}`}>{texto}</span>
        <span className="text-[9px] text-gray-400 truncate">{label}</span>
      </div>
    </div>
  );
}

function BadgeVariacao({ label, variacao, inverter }) {
  let tom = 'text-gray-400';
  let Icon = Minus;
  let texto = '—';
  if (variacao == null) {
    texto = 'sem base';
  } else if (Math.abs(variacao) < 0.05) {
    texto = '0,0%';
  } else {
    const positivo = inverter ? variacao < 0 : variacao > 0;
    tom = positivo ? 'text-emerald-600' : 'text-red-600';
    Icon = variacao > 0 ? TrendingUp : TrendingDown;
    texto = `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`;
  }
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <Icon className={`h-3 w-3 flex-shrink-0 ${tom}`} />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className={`text-[11px] font-semibold tabular-nums ${tom}`}>{texto}</span>
        <span className="text-[9px] text-gray-400 truncate">{label}</span>
      </div>
    </div>
  );
}

function LinhaComparativa({ label, atual, ma, aa, bold, inverter, tipo = 'moeda' }) {
  const formatar = (v) => {
    if (tipo === 'pct') return `${v.toFixed(1)}%`;
    if (tipo === 'num') return Number(v).toLocaleString('pt-BR');
    return formatCurrency(v);
  };
  const renderVar = (atualV, anteriorV) => {
    const v = variacao(atualV, anteriorV);
    if (v == null) return <span className="text-[10px] text-gray-400">sem base</span>;
    if (Math.abs(v) < 0.05) return <span className="text-[11px] text-gray-500 tabular-nums">0,0%</span>;
    const positivo = inverter ? v < 0 : v > 0;
    const tom = positivo ? 'text-emerald-600' : 'text-red-600';
    const Icon = v > 0 ? TrendingUp : TrendingDown;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] tabular-nums font-semibold ${tom}`}>
        <Icon className="h-3 w-3" />
        {v > 0 ? '+' : ''}{v.toFixed(1)}%
      </span>
    );
  };
  return (
    <tr className={bold ? 'bg-gray-50/40' : 'hover:bg-gray-50/60'}>
      <td className={`px-4 py-2 text-[12.5px] text-gray-800 ${bold ? 'font-semibold' : ''}`}>{label}</td>
      <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12.5px] ${bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{formatar(atual)}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-600">{formatar(ma)}</td>
      <td className="px-4 py-2 text-right">{renderVar(atual, ma)}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-600">{formatar(aa)}</td>
      <td className="px-4 py-2 text-right">{renderVar(atual, aa)}</td>
    </tr>
  );
}

function MiniVar({ v, inverter }) {
  if (v == null) return <span className="text-[10px] text-gray-400">—</span>;
  if (Math.abs(v) < 0.05) return <span className="text-[11px] text-gray-500 tabular-nums">0%</span>;
  const positivo = inverter ? v < 0 : v > 0;
  const tom = positivo ? 'text-emerald-600' : 'text-red-600';
  const Icon = v > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] tabular-nums font-semibold ${tom}`}>
      <Icon className="h-3 w-3" />
      {v > 0 ? '+' : ''}{v.toFixed(1)}%
    </span>
  );
}

function CategoriaBadge({ cat }) {
  const MAP = {
    combustivel:  { label: 'Combustível',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    automotivos:  { label: 'Automotivos',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    conveniencia: { label: 'Conveniência', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    outros:       { label: 'Outros',       cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  };
  const v = MAP[cat] || MAP.outros;
  return <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${v.cls}`}>{v.label}</span>;
}

function Kpi({ label, valor, icon: Icon, color, raw, hint }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
    amber:   'bg-amber-50 text-amber-600',
    indigo:  'bg-indigo-50 text-indigo-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color] || colors.blue}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={`font-bold text-gray-900 tabular-nums ${raw ? 'text-xl' : 'text-lg'}`}>{valor}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </motion.div>
  );
}
