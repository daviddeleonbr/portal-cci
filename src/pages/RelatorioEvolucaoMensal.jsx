import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Loader2, AlertCircle, Building2, Zap, RefreshCw,
  TrendingUp, TrendingDown, Minus, Lightbulb, Target, Droplet, Wrench,
  ShoppingBag, Printer, ChevronLeft as ChevLeft, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import { agregarVendasItens } from '../services/mapeamentoVendasService';
import { formatCurrency } from '../utils/format';

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ymd(d) { return d.toISOString().split('T')[0]; }
function rangeMes(ano, mes) {
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0);
  return { dataInicial: ymd(inicio), dataFinal: ymd(fim) };
}
function formatPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sinal = v > 0 ? '+' : '';
  return `${sinal}${v.toFixed(1)}%`;
}
function formatCurrencyCompact(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

export default function RelatorioEvolucaoMensal() {
  const { clienteId } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const today = new Date();
  const [mesFinal, setMesFinal] = useState({ ano: today.getFullYear(), mes: today.getMonth() + 1 });
  const [qtdMeses, setQtdMeses] = useState(6); // 3, 6 ou 12
  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ atual: 0, total: 0, mensagem: '' });
  const [dadosCarregados, setDadosCarregados] = useState(false);
  const [reportSolicitado, setReportSolicitado] = useState(false);
  const [error, setError] = useState(null);

  const [dadosPorMes, setDadosPorMes] = useState({});    // { mesKey: { vendaItens, vendas, movimentos } }
  const [produtosMap, setProdutosMap] = useState(new Map());
  const [gruposCatMap, setGruposCatMap] = useState(new Map());

  const meses = useMemo(() => {
    const arr = [];
    for (let i = qtdMeses - 1; i >= 0; i--) {
      let y = mesFinal.ano;
      let m = mesFinal.mes - i;
      while (m < 1) { m += 12; y--; }
      arr.push({
        ano: y, mes: m,
        key: `${y}-${String(m).padStart(2, '0')}`,
        label: `${MESES_NOMES[m - 1]}/${String(y).slice(2)}`,
      });
    }
    return arr;
  }, [mesFinal, qtdMeses]);

  // ─── Init: cliente ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const c = await clientesService.buscarCliente(clienteId);
        setCliente(c);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, [clienteId]);

  useEffect(() => {
    setReportSolicitado(false);
    setDadosCarregados(false);
    setDadosPorMes({});
  }, [mesFinal, qtdMeses]);

  const carregarDados = useCallback(async () => {
    if (!cliente) return;
    if (!cliente.usa_webposto || !cliente.chave_api_id) {
      setError('Evolucao Mensal disponivel apenas para clientes Webposto (integracao Quality API).');
      return;
    }
    try {
      setLoadingDados(true);
      setDadosCarregados(false);
      setError(null);

      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para este cliente');

      // Catalogos
      setLoadingProgress({ atual: 0, total: 1, mensagem: 'Carregando catalogos de produtos e grupos...' });
      if (produtosMap.size === 0) {
        const [prods, grps] = await Promise.all([
          qualityApi.buscarProdutos(chave.chave).catch(() => []),
          qualityApi.buscarGrupos(chave.chave).catch(() => []),
        ]);
        const pMap = new Map();
        (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
        const gMap = new Map();
        (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
        setProdutosMap(pMap);
        setGruposCatMap(gMap);
      }

      const total = meses.length;
      let concluidas = 0;
      setLoadingProgress({ atual: 0, total, mensagem: `Buscando vendas e caixa de ${meses.length} mes(es)...` });

      const results = await Promise.all(meses.map(async m => {
        const r = rangeMes(m.ano, m.mes);
        const filtros = { dataInicial: r.dataInicial, dataFinal: r.dataFinal, empresaCodigo: cliente.empresa_codigo };
        const [vendaItens, vendas, movimentos] = await Promise.all([
          qualityApi.buscarVendaItens(chave.chave, filtros).catch(() => []),
          qualityApi.buscarVendas(chave.chave, filtros).catch(() => []),
          qualityApi.buscarMovimentoConta(chave.chave, filtros).catch(() => []),
        ]);
        concluidas++;
        setLoadingProgress({
          atual: concluidas, total,
          mensagem: `${m.label}: ${vendaItens?.length || 0} itens · ${vendas?.length || 0} vendas · ${movimentos?.length || 0} movimentos`,
        });
        return { key: m.key, vendaItens: vendaItens || [], vendas: vendas || [], movimentos: movimentos || [] };
      }));

      const mapa = {};
      results.forEach(r => { mapa[r.key] = r; });
      setDadosPorMes(mapa);
      setDadosCarregados(true);
    } catch (err) {
      setError('Erro ao buscar dados: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, meses, produtosMap]);

  const handleGerar = () => {
    setReportSolicitado(true);
    carregarDados();
  };

  // ─── Agregacao por mes ────────────────────────────────────
  const mesesDados = useMemo(() => {
    return meses.map(m => {
      const d = dadosPorMes[m.key];
      if (!d) {
        return {
          ...m,
          receita: 0, cmv: 0, lucroBruto: 0, margem: 0,
          receitaCombustivel: 0, receitaAutomotivos: 0, receitaConveniencia: 0,
          cmvCombustivel: 0, cmvAutomotivos: 0, cmvConveniencia: 0,
          descontos: 0, acrescimos: 0, impostos: 0, vendasCanceladas: 0,
          qtdVendas: 0, ticketMedio: 0,
          entradasCaixa: 0, saidasCaixa: 0, variacaoCaixa: 0,
          semDados: true,
        };
      }
      const vendasMap = new Map();
      (d.vendas || []).forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));
      const t = agregarVendasItens(d.vendaItens, vendasMap, produtosMap, gruposCatMap);

      const receita = t.receita_combustivel + t.receita_automotivos + t.receita_conveniencia;
      const cmv = t.cmv_combustivel + t.cmv_automotivos + t.cmv_conveniencia;
      const lucroBruto = receita - cmv;
      const margem = receita > 0 ? (lucroBruto / receita) * 100 : 0;

      const qtdVendas = (d.vendas || []).filter(v => v.cancelada !== 'S').length;
      const ticketMedio = qtdVendas > 0 ? receita / qtdVendas : 0;

      let entradasCaixa = 0, saidasCaixa = 0;
      (d.movimentos || []).forEach(mv => {
        const valor = Math.abs(Number(mv.valor || 0));
        if (mv.tipo === 'Crédito') entradasCaixa += valor;
        else saidasCaixa += valor;
      });
      const variacaoCaixa = entradasCaixa - saidasCaixa;

      return {
        ...m,
        receita, cmv, lucroBruto, margem,
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
        qtdVendas, ticketMedio,
        entradasCaixa, saidasCaixa, variacaoCaixa,
      };
    });
  }, [meses, dadosPorMes, produtosMap, gruposCatMap]);

  // ─── Totais / medias do periodo ───────────────────────────
  const totais = useMemo(() => {
    const mesesValidos = mesesDados.filter(m => !m.semDados && m.receita > 0);
    const nValidos = mesesValidos.length || 1;
    const sum = (fn) => mesesDados.reduce((s, m) => s + fn(m), 0);
    const receita = sum(m => m.receita);
    const cmv = sum(m => m.cmv);
    const lucroBruto = receita - cmv;
    const margemMedia = receita > 0 ? (lucroBruto / receita) * 100 : 0;
    const qtdVendas = sum(m => m.qtdVendas);
    const ticketMedio = qtdVendas > 0 ? receita / qtdVendas : 0;
    const receitaMedia = receita / nValidos;
    return {
      receita, cmv, lucroBruto, margemMedia,
      descontos: sum(m => m.descontos),
      acrescimos: sum(m => m.acrescimos),
      vendasCanceladas: sum(m => m.vendasCanceladas),
      qtdVendas, ticketMedio,
      receitaMedia,
      entradasCaixa: sum(m => m.entradasCaixa),
      saidasCaixa: sum(m => m.saidasCaixa),
      variacaoCaixa: sum(m => m.variacaoCaixa),
      nValidos,
      receitaCombustivel: sum(m => m.receitaCombustivel),
      receitaAutomotivos: sum(m => m.receitaAutomotivos),
      receitaConveniencia: sum(m => m.receitaConveniencia),
    };
  }, [mesesDados]);

  // ─── Analise consultoria (gera insights automaticos) ──────
  const insights = useMemo(() => gerarInsights(mesesDados, totais), [mesesDados, totais]);

  const chartDataReceitaMix = mesesDados.map(m => ({
    label: m.label,
    Combustiveis: Math.round(m.receitaCombustivel),
    Automotivos: Math.round(m.receitaAutomotivos),
    Conveniencia: Math.round(m.receitaConveniencia),
  }));

  const chartDataMargem = mesesDados.map(m => ({
    label: m.label,
    'Margem Bruta (%)': Number(m.margem.toFixed(2)),
  }));

  const chartDataCaixa = mesesDados.map(m => ({
    label: m.label,
    Entradas: Math.round(m.entradasCaixa),
    Saidas: Math.round(m.saidasCaixa),
    Variacao: Math.round(m.variacaoCaixa),
  }));

  const navMes = (delta) => {
    setMesFinal(prev => {
      let m = prev.mes + delta;
      let y = prev.ano;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      return { ano: y, mes: m };
    });
  };

  const periodoLabel = `${meses[0]?.label} → ${meses[meses.length - 1]?.label}`;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-cyan-500" /></div>;
  }
  if (!cliente) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">Cliente nao encontrado</div>;
  }

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/admin/relatorios-cliente/${clienteId}`)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">Evolucao Mensal</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{cliente.nome}</span>
              {cliente.usa_webposto && (
                <span className="inline-flex items-center gap-1 text-amber-600 ml-1">
                  <Zap className="h-2.5 w-2.5" /> Webposto
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reportSolicitado && (
            <button onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Printer className="h-4 w-4" /> PDF
            </button>
          )}
        </div>
      </motion.div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-5 shadow-sm no-print">
        <div className="grid grid-cols-1 sm:grid-cols-[220px_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Mes final</label>
            <div className="flex items-center gap-1 h-10 rounded-lg border border-gray-200 bg-white px-1">
              <button onClick={() => navMes(-1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevLeft className="h-3.5 w-3.5" />
              </button>
              <select value={mesFinal.mes}
                onChange={e => setMesFinal(p => ({ ...p, mes: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {MESES_NOMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
              </select>
              <select value={mesFinal.ano}
                onChange={e => setMesFinal(p => ({ ...p, ano: Number(e.target.value) }))}
                className="text-sm border-0 focus:outline-none bg-transparent">
                {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => navMes(1)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Periodo</label>
            <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 h-10">
              {[3, 6, 12].map(q => (
                <button key={q} onClick={() => setQtdMeses(q)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                    qtdMeses === q ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>{q} meses</button>
              ))}
            </div>
          </div>
          <button onClick={handleGerar} disabled={loadingDados}
            className="flex items-center gap-2 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar analise
          </button>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Periodo</p>
            <p className="text-[11px] text-gray-700 font-mono">{periodoLabel}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {!reportSolicitado ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/20">
            <BarChart3 className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Escolha o periodo e clique em "Gerar analise"</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Cruzamos <strong>VENDA_ITEM</strong> + <strong>MOVIMENTO_CONTA</strong> pra gerar uma leitura consultiva do desempenho mes a mes: receita, margem, mix e caixa.
          </p>
        </div>
      ) : loadingDados ? (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm px-6 py-16 text-center no-print">
          <Loader2 className="h-7 w-7 text-cyan-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-800 mb-1">{loadingProgress.mensagem}</p>
          <p className="text-xs text-gray-400">{loadingProgress.atual} de {loadingProgress.total}</p>
        </div>
      ) : !dadosCarregados ? null : (
        <div className="space-y-5">
          {/* KPIs consolidados */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Receita bruta" valor={formatCurrency(totais.receita)} sub={`media/mes: ${formatCurrency(totais.receitaMedia)}`} color="cyan" />
            <KpiCard label="Lucro bruto" valor={formatCurrency(totais.lucroBruto)} sub={`CMV ${formatCurrency(totais.cmv)}`} color="emerald" />
            <KpiCard label="Margem bruta" valor={`${totais.margemMedia.toFixed(2)}%`} sub="receita - CMV / receita" color="violet"
              trend={insights.margemTrend} />
            <KpiCard label="Ticket medio" valor={formatCurrency(totais.ticketMedio)} sub={`${totais.qtdVendas.toLocaleString('pt-BR')} vendas`} color="amber" />
          </div>

          {/* Graficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">Receita por categoria (R$)</h3>
                <p className="text-[11px] text-gray-400">Combustiveis · Automotivos · Conveniencia</p>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataReceitaMix}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                      tickFormatter={formatCurrencyCompact} />
                    <Tooltip formatter={(v) => formatCurrency(v)} labelStyle={{ fontSize: 12, fontWeight: 600 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Combustiveis" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="Automotivos" stackId="a" fill="#64748b" />
                    <Bar dataKey="Conveniencia" stackId="a" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">Margem bruta (%)</h3>
                <p className="text-[11px] text-gray-400">lucro bruto / receita</p>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataMargem}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelStyle={{ fontSize: 12, fontWeight: 600 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Margem Bruta (%)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Grafico de Caixa */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Entradas vs saidas de caixa (MOVIMENTO_CONTA)</h3>
              <p className="text-[11px] text-gray-400">comparar com receita bruta revela a velocidade de recebimento</p>
            </div>
            <div className="p-4" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataCaixa}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                    tickFormatter={formatCurrencyCompact} />
                  <Tooltip formatter={(v) => formatCurrency(v)} labelStyle={{ fontSize: 12, fontWeight: 600 }}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Entradas" fill="#10b981" />
                  <Bar dataKey="Saidas" fill="#ef4444" />
                  <Bar dataKey="Variacao" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela mensal */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Detalhamento mensal</h3>
              <p className="text-[11px] text-gray-400">{periodoLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Mes</th>
                    <th className="px-4 py-2.5 text-right">Receita</th>
                    <th className="px-4 py-2.5 text-right">CMV</th>
                    <th className="px-4 py-2.5 text-right">Lucro bruto</th>
                    <th className="px-4 py-2.5 text-right">Margem %</th>
                    <th className="px-4 py-2.5 text-right">Qtd vendas</th>
                    <th className="px-4 py-2.5 text-right">Ticket medio</th>
                    <th className="px-4 py-2.5 text-right">Entradas cx</th>
                    <th className="px-4 py-2.5 text-right">Saidas cx</th>
                    <th className="px-4 py-2.5 text-right">Variacao cx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mesesDados.map(m => (
                    <tr key={m.key} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2 font-medium text-gray-800">{m.label}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-900">{formatCurrency(m.receita)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-red-600">{formatCurrency(m.cmv)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">{formatCurrency(m.lucroBruto)}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${m.margem >= 15 ? 'text-emerald-700' : m.margem >= 8 ? 'text-amber-600' : 'text-red-600'}`}>
                        {m.margem.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-600">{m.qtdVendas.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(m.ticketMedio)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-600">+{formatCurrency(m.entradasCaixa)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-red-600">-{formatCurrency(m.saidasCaixa)}</td>
                      <td className={`px-4 py-2 text-right font-mono tabular-nums font-semibold ${m.variacaoCaixa >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {m.variacaoCaixa >= 0 ? '+' : ''}{formatCurrency(m.variacaoCaixa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/60 border-t border-gray-200">
                  <tr className="font-semibold text-[12px]">
                    <td className="px-4 py-3 text-gray-700">Total / Medio</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">{formatCurrency(totais.receita)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">{formatCurrency(totais.cmv)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">{formatCurrency(totais.lucroBruto)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${totais.margemMedia >= 15 ? 'text-emerald-700' : totais.margemMedia >= 8 ? 'text-amber-600' : 'text-red-700'}`}>
                      {totais.margemMedia.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">{totais.qtdVendas.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">{formatCurrency(totais.ticketMedio)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">+{formatCurrency(totais.entradasCaixa)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">-{formatCurrency(totais.saidasCaixa)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${totais.variacaoCaixa >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {totais.variacaoCaixa >= 0 ? '+' : ''}{formatCurrency(totais.variacaoCaixa)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Analise do Consultor */}
          <InsightsConsultor insights={insights} totais={totais} />
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ label, valor, sub, color = 'cyan', trend }) {
  const bgMap = {
    cyan: 'from-cyan-500/15 to-blue-500/5 text-cyan-700',
    emerald: 'from-emerald-500/15 to-teal-500/5 text-emerald-700',
    violet: 'from-violet-500/15 to-fuchsia-500/5 text-violet-700',
    amber: 'from-amber-500/15 to-orange-500/5 text-amber-700',
  };
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  return (
    <div className={`rounded-2xl border border-gray-200/60 bg-gradient-to-br ${bgMap[color]} p-4 shadow-sm`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-xl font-bold text-gray-900 tracking-tight">{valor}</p>
        {trend != null && Number.isFinite(trend) && (
          <span className={`inline-flex items-center text-[11px] font-semibold ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            <TrendIcon className="h-3 w-3 mr-0.5" />
            {formatPct(trend)}
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Insights (consultoria) ──────────────────────────────────
function gerarInsights(mesesDados, totais) {
  const validos = mesesDados.filter(m => !m.semDados && m.receita > 0);
  if (validos.length < 2) {
    return {
      tendenciaReceita: 0, margemTrend: 0,
      crescimento3m: 0, volatilidade: 0,
      observacoes: [],
      recomendacoes: ['Periodo muito curto para gerar insights. Selecione ao menos 3 meses com dados.'],
    };
  }

  // Regressao linear simples (slope normalizado) para receita e margem
  const slope = (arr) => {
    const n = arr.length;
    const xm = (n - 1) / 2;
    const ym = arr.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    arr.forEach((v, i) => { num += (i - xm) * (v - ym); den += (i - xm) ** 2; });
    return den === 0 ? 0 : num / den;
  };
  const media = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const receitas = validos.map(m => m.receita);
  const margens = validos.map(m => m.margem);
  const slopeReceita = slope(receitas);
  const slopeMargem = slope(margens);
  const mediaReceita = media(receitas);
  // Tendencia em % sobre a media
  const tendenciaReceita = mediaReceita > 0 ? (slopeReceita / mediaReceita) * 100 : 0;
  const margemTrend = slopeMargem; // p.p./mes (direta)

  // Crescimento: media dos ultimos 3 vs primeiros 3 (ou metade/metade se tiver menos de 6)
  const half = Math.max(1, Math.floor(validos.length / 2));
  const metadeInicial = validos.slice(0, half);
  const metadeFinal = validos.slice(-half);
  const rIni = media(metadeInicial.map(m => m.receita));
  const rFim = media(metadeFinal.map(m => m.receita));
  const crescimentoReceita = rIni > 0 ? ((rFim - rIni) / rIni) * 100 : 0;

  // Volatilidade (desvio padrao / media)
  const variancia = receitas.reduce((s, v) => s + (v - mediaReceita) ** 2, 0) / receitas.length;
  const volatilidade = mediaReceita > 0 ? (Math.sqrt(variancia) / mediaReceita) * 100 : 0;

  // Melhor e pior mes
  const melhorReceita = [...validos].sort((a, b) => b.receita - a.receita)[0];
  const piorReceita = [...validos].sort((a, b) => a.receita - b.receita)[0];
  const melhorMargem = [...validos].sort((a, b) => b.margem - a.margem)[0];
  const piorMargem = [...validos].sort((a, b) => a.margem - b.margem)[0];

  // Mix
  const totalReceita = totais.receita || 1;
  const shareCombustivel = (totais.receitaCombustivel / totalReceita) * 100;
  const shareConveniencia = (totais.receitaConveniencia / totalReceita) * 100;
  const shareAutomotivos = (totais.receitaAutomotivos / totalReceita) * 100;

  // Descontos
  const shareDescontos = totalReceita > 0 ? (totais.descontos / totalReceita) * 100 : 0;

  // Caixa: diferenca entre receita e entradasCaixa
  const entradasCaixa = totais.entradasCaixa;
  const gapCaixaReceita = totais.receita > 0 ? ((entradasCaixa - totais.receita) / totais.receita) * 100 : 0;

  // ─── Observacoes (leitura) ───────────────────────────────
  const observacoes = [];

  if (Math.abs(crescimentoReceita) >= 5) {
    observacoes.push({
      tipo: crescimentoReceita > 0 ? 'positivo' : 'negativo',
      titulo: `Receita ${crescimentoReceita > 0 ? 'cresceu' : 'caiu'} ${formatPct(crescimentoReceita)} na segunda metade do periodo`,
      texto: `Media inicial ${formatCurrency(rIni)} vs media final ${formatCurrency(rFim)}. ${
        crescimentoReceita > 0
          ? 'Mantenha o combustivel que motiva o crescimento e expanda o que esta puxando.'
          : 'Investigue queda de volume vs queda de preco e reforce a acao comercial.'
      }`,
    });
  }

  if (Math.abs(slopeMargem) >= 0.3) {
    observacoes.push({
      tipo: slopeMargem > 0 ? 'positivo' : 'negativo',
      titulo: `Margem bruta ${slopeMargem > 0 ? 'melhorando' : 'deteriorando'} ~${Math.abs(slopeMargem).toFixed(1)} p.p./mes`,
      texto: slopeMargem > 0
        ? 'A cada mes a margem aumenta de forma consistente — sinal de poder de precificacao ou melhor mix.'
        : 'Margem esta caindo — revisar precos, custo de aquisicao e mix de produtos (conveniencia tem margem mais alta que combustivel).',
    });
  }

  if (shareCombustivel >= 85) {
    observacoes.push({
      tipo: 'atencao',
      titulo: `Receita muito concentrada em combustivel (${shareCombustivel.toFixed(1)}%)`,
      texto: `Combustiveis rendem margem baixa. Conveniencia representa apenas ${shareConveniencia.toFixed(1)}% e costuma trazer margem 3-5x maior. Avalie layout da loja, sortimento e campanhas cruzadas.`,
    });
  } else if (shareConveniencia >= 15) {
    observacoes.push({
      tipo: 'positivo',
      titulo: `Conveniencia saudavel: ${shareConveniencia.toFixed(1)}% da receita`,
      texto: 'Mix diversificado reduz dependencia do preco de combustivel. Mantenha ativa a vitrine e a gestao de perecivel.',
    });
  }

  if (shareDescontos >= 2) {
    observacoes.push({
      tipo: 'atencao',
      titulo: `Descontos concedidos somam ${formatCurrency(totais.descontos)} (${shareDescontos.toFixed(1)}% da receita)`,
      texto: 'Volume de descontos alto. Verifique politica promocional e se descontos estao chegando ao cliente-alvo (B2B ou fidelidade).',
    });
  }

  if (Math.abs(gapCaixaReceita) >= 15 && totais.entradasCaixa > 0) {
    observacoes.push({
      tipo: gapCaixaReceita < 0 ? 'atencao' : 'informativo',
      titulo: `Gap entre receita e entradas de caixa: ${formatPct(gapCaixaReceita)}`,
      texto: gapCaixaReceita < 0
        ? 'Entradas de caixa estao menores que a receita registrada. Pode indicar vendas a prazo (duplicatas nao recebidas) ou cartoes a compensar. Monitorar aging.'
        : 'Entradas de caixa acima da receita do periodo — provavelmente recebimento de vendas de periodos anteriores.',
    });
  }

  if (volatilidade >= 25) {
    observacoes.push({
      tipo: 'atencao',
      titulo: `Alta volatilidade de receita (${volatilidade.toFixed(1)}% do coeficiente de variacao)`,
      texto: `Melhor mes: ${melhorReceita.label} (${formatCurrency(melhorReceita.receita)}). Pior: ${piorReceita.label} (${formatCurrency(piorReceita.receita)}). Identificar sazonalidade ajuda no planejamento de estoque e compras.`,
    });
  }

  if (melhorMargem && piorMargem && (melhorMargem.margem - piorMargem.margem) >= 3) {
    observacoes.push({
      tipo: 'informativo',
      titulo: `Melhor margem: ${melhorMargem.label} (${melhorMargem.margem.toFixed(2)}%); pior: ${piorMargem.label} (${piorMargem.margem.toFixed(2)}%)`,
      texto: `Diferenca de ${(melhorMargem.margem - piorMargem.margem).toFixed(2)} p.p. entre os dois meses. Analise o que mudou na precificacao ou mix.`,
    });
  }

  // ─── Recomendacoes acionaveis ─────────────────────────────
  const recomendacoes = [];

  if (shareCombustivel >= 80) {
    recomendacoes.push('Diversificar receita via conveniencia e servicos (troca de oleo, lavagem) pode elevar a margem consolidada em 3-7 p.p. sem exigir mais caixa.');
  }
  if (slopeMargem < 0) {
    recomendacoes.push('Reprecifique produtos de conveniencia com base em competitividade local — sao eles que puxam a margem quando o combustivel esta pressionado.');
  }
  if (shareDescontos >= 3) {
    recomendacoes.push('Audite sua politica de descontos: separe frota (B2B) de varejo e documente criterios para aprovacao acima de X%.');
  }
  if (totais.variacaoCaixa < 0 && crescimentoReceita >= 0) {
    recomendacoes.push('Receita crescendo + caixa caindo sugere aumento de capital de giro: avalie prazos de recebimento (cartao, frotistas) vs pagamento de fornecedores.');
  }
  if (totais.ticketMedio > 0 && validos.length >= 3) {
    const ticketIni = media(metadeInicial.map(m => m.ticketMedio));
    const ticketFim = media(metadeFinal.map(m => m.ticketMedio));
    const deltaTicket = ticketIni > 0 ? ((ticketFim - ticketIni) / ticketIni) * 100 : 0;
    if (Math.abs(deltaTicket) >= 5) {
      recomendacoes.push(
        `Ticket medio ${deltaTicket > 0 ? 'subiu' : 'caiu'} ${formatPct(deltaTicket)} no periodo. ${
          deltaTicket > 0
            ? 'Reforce o cross-sell no frentista para manter o aumento.'
            : 'Avalie se a queda e de preco (combustivel) ou de mix (cliente migrando para itens baratos).'
        }`
      );
    }
  }
  if (shareConveniencia < 5 && shareCombustivel >= 90) {
    recomendacoes.push('Loja de conveniencia pouco relevante — definir meta de 10% da receita em 6 meses via reformas de ponta de gondola e parceria com marcas.');
  }
  if (recomendacoes.length === 0) {
    recomendacoes.push('Indicadores estaveis. Foque em aprofundar a gestao por centro de custo e pricing dinamico de conveniencia.');
  }

  return {
    tendenciaReceita,
    margemTrend,
    crescimentoReceita,
    volatilidade,
    melhorReceita,
    piorReceita,
    melhorMargem,
    piorMargem,
    shareCombustivel,
    shareConveniencia,
    shareAutomotivos,
    shareDescontos,
    gapCaixaReceita,
    observacoes,
    recomendacoes,
  };
}

function InsightsConsultor({ insights, totais }) {
  const iconMap = {
    positivo: { Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
    negativo: { Icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-200' },
    atencao: { Icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' },
    informativo: { Icon: Lightbulb, color: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200' },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Mix de receita */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-gray-800">Mix de receita</h3>
        </div>
        <div className="p-4 space-y-3">
          <MixLinha icon={Droplet} label="Combustiveis" valor={totais.receitaCombustivel} total={totais.receita} color="amber" />
          <MixLinha icon={Wrench} label="Automotivos" valor={totais.receitaAutomotivos} total={totais.receita} color="slate" />
          <MixLinha icon={ShoppingBag} label="Conveniencia" valor={totais.receitaConveniencia} total={totais.receita} color="emerald" />
        </div>
      </div>

      {/* Observacoes */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">Analise do consultor</h3>
          <span className="text-[11px] text-gray-400">· observacoes automaticas + recomendacoes estrategicas</span>
        </div>
        <div className="p-4 space-y-3">
          {insights.observacoes.length === 0 && (
            <p className="text-xs text-gray-500 italic">Nenhuma anomalia relevante detectada no periodo — indicadores dentro da banda tipica.</p>
          )}
          {insights.observacoes.map((o, i) => {
            const cfg = iconMap[o.tipo] || iconMap.informativo;
            return (
              <div key={i} className={`rounded-lg ${cfg.bg} ring-1 ${cfg.ring} p-3 flex items-start gap-2.5`}>
                <cfg.Icon className={`h-4 w-4 ${cfg.color} flex-shrink-0 mt-0.5`} />
                <div className="min-w-0">
                  <p className={`text-[12.5px] font-semibold ${cfg.color}`}>{o.titulo}</p>
                  <p className="text-[11.5px] text-gray-700 mt-0.5 leading-relaxed">{o.texto}</p>
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider mb-2">Recomendacoes estrategicas</p>
            <ul className="space-y-1.5">
              {insights.recomendacoes.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function MixLinha({ icon: Icon, label, valor, total, color }) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  const barBg = color === 'amber' ? 'bg-amber-500' : color === 'slate' ? 'bg-slate-500' : 'bg-emerald-500';
  const iconBg = color === 'amber' ? 'bg-amber-50 text-amber-600' : color === 'slate' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-600';
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className={`rounded-md ${iconBg} p-1`}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[12px] font-medium text-gray-800 flex-1">{label}</span>
        <span className="text-[12px] font-mono font-semibold text-gray-900 tabular-nums">{formatCurrency(valor)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${barBg} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5 text-right font-mono">{pct.toFixed(1)}% da receita</p>
    </div>
  );
}
