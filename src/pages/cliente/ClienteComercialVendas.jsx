import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShoppingCart, Fuel, Package, Store, TrendingUp, TrendingDown, Minus,
  Loader2, AlertCircle, RefreshCw, Receipt, LayoutGrid, Percent, ChevronRight,
} from 'lucide-react';
import React from 'react';
import PageHeader from '../../components/ui/PageHeader';
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
  const chaveApiSessao = session?.chaveApi?.chave || null;

  const [loadingDados, setLoadingDados] = useState(false);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [produtosMap, setProdutosMap] = useState(new Map());
  const [gruposCatMap, setGruposCatMap] = useState(new Map());
  const [geradoEm, setGeradoEm] = useState(null);
  const [tab, setTab] = useState('overview');
  const [mesSelecionado, setMesSelecionado] = useState(() => mesKeyHoje());
  const [apenasDiasFechados, setApenasDiasFechados] = useState(true);

  const periodos = useMemo(
    () => calcularPeriodos(mesSelecionado, new Date(), apenasDiasFechados),
    [mesSelecionado, apenasDiasFechados]
  );
  const mesMax = mesKeyHoje();

  const carregar = useCallback(async () => {
    if (!cliente?.empresa_codigo) return;
    setLoadingDados(true);
    setErro(null);
    try {
      let apiKey = chaveApiSessao;
      if (!apiKey) {
        const chaves = await mapService.listarChavesApi();
        const chave = chaves.find(c => c.id === cliente.chave_api_id);
        if (!chave) throw new Error('Chave API nao encontrada para esta empresa');
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
          empresaCodigo: cliente.empresa_codigo,
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
          empresaCodigo: cliente.empresa_codigo,
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
  }, [cliente, chaveApiSessao, periodos, produtosMap, gruposCatMap]);

  useEffect(() => {
    if (cliente?.empresa_codigo) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id, mesSelecionado, apenasDiasFechados]);

  if (!cliente?.id) return <Navigate to="/cliente/dashboard" replace />;

  const abas = [
    { key: 'overview',     label: 'Overview',     icon: LayoutGrid },
    { key: 'combustiveis', label: 'Combustiveis', icon: Fuel },
    { key: 'produtos',     label: 'Produtos',     icon: Package },
    { key: 'conveniencia', label: 'Conveniencia', icon: Store },
  ];

  return (
    <div>
      <PageHeader
        title="Vendas"
        description={`${cliente.nome} · ${periodos.atual.label} · ${formatDataBR(periodos.atual.dataInicial)} a ${formatDataBR(periodos.atual.dataFinal)}${periodos.atual.ehMesCorrente ? ' (parcial)' : ''}`}
      >
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Mes</span>
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

      {/* Tarja com os 3 periodos comparados */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PeriodoTag label="Selecionado" periodo={periodos.atual} destacado />
          <PeriodoTag label="Mes anterior" periodo={periodos.mesAnterior} />
          <PeriodoTag label="Ano anterior" periodo={periodos.anoAnterior} />
        </div>
      </div>

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
          <p className="text-sm font-medium text-gray-800">Buscando vendas dos 3 periodos...</p>
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
          {tab === 'conveniencia' && <AbaConveniencia dados={dados} />}
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
        <KpiComparativo label="Combustiveis"    icon={Fuel}          color="amber"   atual={dados.atual.receitaCombustivel} mesAnt={dados.mesAnterior.receitaCombustivel} anoAnt={dados.anoAnterior.receitaCombustivel} />
        <KpiComparativo label="Conveniencia"    icon={Store}         color="emerald" atual={dados.atual.receitaConveniencia} mesAnt={dados.mesAnterior.receitaConveniencia} anoAnt={dados.anoAnterior.receitaConveniencia} />
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
                <th className="px-4 py-2.5 text-right">Mes atual</th>
                <th className="px-4 py-2.5 text-right">Mes anterior</th>
                <th className="px-4 py-2.5 text-right">Var</th>
                <th className="px-4 py-2.5 text-right">Ano anterior</th>
                <th className="px-4 py-2.5 text-right">Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <LinhaComparativa label="Receita Combustiveis" atual={dados.atual.receitaCombustivel} ma={dados.mesAnterior.receitaCombustivel} aa={dados.anoAnterior.receitaCombustivel} />
              <LinhaComparativa label="Receita Automotivos"  atual={dados.atual.receitaAutomotivos}  ma={dados.mesAnterior.receitaAutomotivos}  aa={dados.anoAnterior.receitaAutomotivos} />
              <LinhaComparativa label="Receita Conveniencia" atual={dados.atual.receitaConveniencia} ma={dados.mesAnterior.receitaConveniencia} aa={dados.anoAnterior.receitaConveniencia} />
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
          Variacao em verde = evolucao positiva; em vermelho = regressao. Para CMV, descontos e canceladas, a variacao <strong>negativa</strong> e considerada positiva (reducao de custo).
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
      .sort((a, b) => a.data.localeCompare(b.data));

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
        <KpiComparativo label="Receita combustiveis" icon={Fuel} color="amber"
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
          <h3 className="text-sm font-semibold text-gray-800">Projecao estatistica para o mes</h3>
          <span className="text-[11px] text-gray-400">
            · base {projecoes.atual.diasCobertos}/{projecoes.atual.diasTotalMes} dias
            · {projecoes.atual.isProjecao ? 'projetado linear' : 'mes fechado'}
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
            <div className="py-6 text-center text-sm text-gray-500">Sem base de combustiveis para projetar.</div>
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
                    <th className="px-3 py-2">vs mes ant</th>
                    <th className="px-3 py-2">vs ano ant</th>
                    <th className="px-3 py-2 border-l border-gray-200">Atual</th>
                    <th className="px-3 py-2">vs mes ant</th>
                    <th className="px-3 py-2">vs ano ant</th>
                    <th className="px-3 py-2 border-l border-gray-200">Atual</th>
                    <th className="px-3 py-2">vs mes ant</th>
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
            Metodo: extrapolacao linear (media diaria × dias do mes). Comparacao contra projecoes equivalentes de mes anterior e ano anterior (calculadas com a mesma base de dias).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">Vendas por combustivel</h3>
          <span className="text-[11px] text-gray-400">· {produtos.length} produto{produtos.length === 1 ? '' : 's'}</span>
        </div>
        {produtos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhuma venda de combustivel no periodo.</div>
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
                  <th className="px-4 py-2.5 text-right">Var mes ant</th>
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
          <h3 className="text-sm font-semibold text-gray-800">Vendas por dia &gt; combustivel</h3>
          <span className="text-[11px] text-gray-400">· {treeDias.length} dia{treeDias.length === 1 ? '' : 's'} · clique para expandir</span>
          <button onClick={() => setDiasExpandidos(treeDias.length === diasExpandidos.size ? new Set() : new Set(treeDias.map(d => d.data)))}
            className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 font-medium">
            {diasExpandidos.size > 0 ? 'Recolher todos' : 'Expandir todos'}
          </button>
        </div>
        {treeDias.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Sem vendas de combustivel no periodo.</div>
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
          Comparacao com semana anterior: dia D vs D-7. Inclui os 7 dias antes do inicio do mes para cobrir os dias 1-7 do periodo selecionado.
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Aba Produtos
// ────────────────────────────────────────────────────────────────────

function AbaProdutos({ dados }) {
  const [filtroCategoria, setFiltroCategoria] = useState('todos');

  const { produtos, total, resumos } = useMemo(() => {
    let itens = Array.from(dados.atual.porProduto.values());
    const totais = {
      todos: itens.reduce((s, p) => s + p.totalVenda, 0),
      combustivel: itens.filter(p => p.categoria === 'combustivel').reduce((s, p) => s + p.totalVenda, 0),
      automotivos: itens.filter(p => p.categoria === 'automotivos').reduce((s, p) => s + p.totalVenda, 0),
      conveniencia: itens.filter(p => p.categoria === 'conveniencia').reduce((s, p) => s + p.totalVenda, 0),
      outros: itens.filter(p => p.categoria === 'outros').reduce((s, p) => s + p.totalVenda, 0),
    };
    if (filtroCategoria !== 'todos') {
      itens = itens.filter(p => p.categoria === filtroCategoria);
    }
    const total = itens.reduce((s, p) => s + p.totalVenda, 0);
    const processados = itens.map(p => ({
      ...p,
      participacao: total > 0 ? (p.totalVenda / total) * 100 : 0,
      margem: p.totalVenda - p.totalCusto,
      varReceitaMesAnt: dados.mesAnterior.porProduto.get(p.produtoCodigo)?.totalVenda ?? null,
    })).sort((a, b) => b.totalVenda - a.totalVenda);
    return { produtos: processados, total, resumos: totais };
  }, [dados, filtroCategoria]);

  const CATEGORIAS = [
    { key: 'todos',        label: 'Todos',        valor: resumos.todos },
    { key: 'combustivel',  label: 'Combustiveis', valor: resumos.combustivel },
    { key: 'automotivos',  label: 'Automotivos',  valor: resumos.automotivos },
    { key: 'conveniencia', label: 'Conveniencia', valor: resumos.conveniencia },
    { key: 'outros',       label: 'Outros',       valor: resumos.outros },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {CATEGORIAS.map(c => (
          <button key={c.key} onClick={() => setFiltroCategoria(c.key)}
            className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-colors ${
              filtroCategoria === c.key
                ? 'border-blue-400 bg-blue-50/40 text-blue-800'
                : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
            }`}>
            <span className="text-[10px] uppercase tracking-wider opacity-70">{c.label}</span>
            <span className="text-[13px] font-semibold font-mono tabular-nums">{formatCurrency(c.valor)}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800">Ranking de produtos</h3>
          <span className="text-[11px] text-gray-400">· {produtos.length} produto{produtos.length === 1 ? '' : 's'}</span>
        </div>
        {produtos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum produto vendido neste filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5 w-10">#</th>
                  <th className="px-4 py-2.5">Produto</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-4 py-2.5 text-right">Qtd</th>
                  <th className="px-4 py-2.5 text-right">Receita</th>
                  <th className="px-4 py-2.5 text-right">% total</th>
                  <th className="px-4 py-2.5 text-right">Margem</th>
                  <th className="px-4 py-2.5 text-right">Var mes ant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {produtos.map((p, i) => (
                  <tr key={p.produtoCodigo} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-[11px] text-gray-400 font-mono tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2 text-[12.5px] text-gray-800">
                      <p className="font-medium truncate max-w-[260px]">{p.produtoNome}</p>
                      {p.grupoNome && <p className="text-[10px] text-gray-400">{p.grupoNome}</p>}
                    </td>
                    <td className="px-4 py-2">
                      <CategoriaBadge cat={p.categoria} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatNumero(p.quantidade, p.categoria === 'combustivel' ? 2 : 0)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(p.totalVenda)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-mono text-[11px] tabular-nums text-gray-600">{p.participacao.toFixed(1)}%</span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-blue-400" style={{ width: `${p.participacao}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(p.margem)}
                    </td>
                    <td className="px-4 py-2 text-right"><MiniVar v={variacao(p.totalVenda, p.varReceitaMesAnt)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={4}>Total ({produtos.length} produtos)</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">{formatCurrency(total)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">100%</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Aba Conveniencia
// ────────────────────────────────────────────────────────────────────

function AbaConveniencia({ dados }) {
  const { porGrupo, produtos, totalReceita } = useMemo(() => {
    const itens = Array.from(dados.atual.porProduto.values()).filter(p => p.categoria === 'conveniencia');
    const totalReceita = itens.reduce((s, p) => s + p.totalVenda, 0);
    const grupos = new Map();
    itens.forEach(p => {
      const g = grupos.get(p.grupoCodigo) || {
        grupoCodigo: p.grupoCodigo,
        grupoNome: p.grupoNome || 'Sem grupo',
        quantidade: 0, totalVenda: 0, totalCusto: 0, produtos: 0,
      };
      g.quantidade += p.quantidade;
      g.totalVenda += p.totalVenda;
      g.totalCusto += p.totalCusto;
      g.produtos += 1;
      grupos.set(p.grupoCodigo, g);
    });
    const porGrupo = Array.from(grupos.values())
      .map(g => ({
        ...g,
        margem: g.totalVenda - g.totalCusto,
        participacao: totalReceita > 0 ? (g.totalVenda / totalReceita) * 100 : 0,
      }))
      .sort((a, b) => b.totalVenda - a.totalVenda);
    const produtos = itens
      .map(p => ({
        ...p,
        margem: p.totalVenda - p.totalCusto,
        participacao: totalReceita > 0 ? (p.totalVenda / totalReceita) * 100 : 0,
        varReceitaMesAnt: dados.mesAnterior.porProduto.get(p.produtoCodigo)?.totalVenda ?? null,
      }))
      .sort((a, b) => b.totalVenda - a.totalVenda)
      .slice(0, 30);
    return { porGrupo, produtos, totalReceita };
  }, [dados]);

  const totalCusto  = porGrupo.reduce((s, g) => s + g.totalCusto, 0);
  const margemTotal = totalReceita - totalCusto;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Receita conveniencia" valor={formatCurrency(totalReceita)} icon={Store} color="emerald" />
        <Kpi label="Margem" valor={formatCurrency(margemTotal)} icon={TrendingUp} color={margemTotal >= 0 ? 'emerald' : 'red'} hint={totalReceita > 0 ? `${((margemTotal / totalReceita) * 100).toFixed(1)}%` : null} />
        <Kpi label="Grupos" valor={porGrupo.length} icon={LayoutGrid} color="blue" raw />
        <Kpi label="Itens vendidos"
          valor={formatNumero(porGrupo.reduce((s, g) => s + g.quantidade, 0), 0)}
          icon={Package} color="indigo" raw />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-800">Receita por grupo</h3>
        </div>
        {porGrupo.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhuma venda de conveniencia no periodo.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Grupo</th>
                  <th className="px-4 py-2.5 text-right">Qtd itens</th>
                  <th className="px-4 py-2.5 text-right">Receita</th>
                  <th className="px-4 py-2.5 text-right">% total</th>
                  <th className="px-4 py-2.5 text-right">Margem</th>
                  <th className="px-4 py-2.5 text-right">Produtos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {porGrupo.map(g => (
                  <tr key={g.grupoCodigo || 'sem-grupo'} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-[12.5px] text-gray-800 font-medium">{g.grupoNome}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatNumero(g.quantidade, 0)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(g.totalVenda)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-mono text-[11px] tabular-nums text-gray-600">{g.participacao.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-emerald-400" style={{ width: `${g.participacao}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] ${g.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(g.margem)}
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] text-gray-500 tabular-nums">{g.produtos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-800">Top 30 produtos (conveniencia)</h3>
        </div>
        {produtos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum produto de conveniencia no periodo.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5 w-10">#</th>
                  <th className="px-4 py-2.5">Produto</th>
                  <th className="px-4 py-2.5">Grupo</th>
                  <th className="px-4 py-2.5 text-right">Qtd</th>
                  <th className="px-4 py-2.5 text-right">Receita</th>
                  <th className="px-4 py-2.5 text-right">% total</th>
                  <th className="px-4 py-2.5 text-right">Margem</th>
                  <th className="px-4 py-2.5 text-right">Var mes ant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {produtos.map((p, i) => (
                  <tr key={p.produtoCodigo} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-[11px] text-gray-400 font-mono tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2 text-[12.5px] text-gray-800 font-medium truncate max-w-[260px]">{p.produtoNome}</td>
                    <td className="px-4 py-2 text-[11px] text-gray-500">{p.grupoNome}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{formatNumero(p.quantidade, 0)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(p.totalVenda)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[11px] text-gray-600">{p.participacao.toFixed(1)}%</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] ${p.margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(p.margem)}
                    </td>
                    <td className="px-4 py-2 text-right"><MiniVar v={variacao(p.totalVenda, p.varReceitaMesAnt)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Componentes compartilhados
// ────────────────────────────────────────────────────────────────────

function PeriodoTag({ label, periodo, destacado }) {
  return (
    <div className={`rounded-lg p-2.5 ${destacado ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
      <p className={`text-[9.5px] font-semibold uppercase tracking-[0.15em] mb-0.5 ${destacado ? 'text-blue-700' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-[13px] font-semibold ${destacado ? 'text-blue-900' : 'text-gray-800'}`}>{periodo.label}</p>
      <p className="text-[10.5px] text-gray-500 font-mono tabular-nums mt-0.5">{formatDataBR(periodo.dataInicial)} a {formatDataBR(periodo.dataFinal)}</p>
    </div>
  );
}

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
        <BadgeVariacao label="vs mes ant" variacao={varMes} />
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
        <BadgeDeltaPP label={`vs mes ant (${fmtPct(mesAntPct)})`} pp={deltaPP(mesAntPct)} />
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
    combustivel:  { label: 'Combustivel',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    automotivos:  { label: 'Automotivos',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    conveniencia: { label: 'Conveniencia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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
