import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Loader2, AlertCircle, Building2, Zap, RefreshCw,
  TrendingUp, TrendingDown, Minus, Lightbulb, Target, Droplet, Wrench,
  ShoppingBag, Wallet, Printer, ChevronLeft as ChevLeft, ChevronRight,
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

// ─── Analise Consultor (framework especialista postos de combustivel) ──
// Saida estruturada: Resumo Executivo, Top 3 Problemas, Top 3 Oportunidades,
// Analise Detalhada (Vendas/DRE/Caixa), Recomendacoes Estrategicas.
function gerarInsights(mesesDados, totais) {
  const validos = mesesDados.filter(m => !m.semDados && m.receita > 0);

  const baseVazia = {
    margemTrend: 0, crescimentoReceita: 0, volatilidade: 0,
    shareCombustivel: 0, shareConveniencia: 0, shareAutomotivos: 0,
    shareDescontos: 0, gapCaixaReceita: 0,
    melhorReceita: null, piorReceita: null, melhorMargem: null, piorMargem: null,
    resumoExecutivo: { texto: 'Selecione ao menos 3 meses com dados para gerar a analise consultiva.', saude: 'neutra' },
    problemas: [], oportunidades: [],
    analiseDetalhada: { vendas: [], dre: [], caixa: [] },
    recomendacoes: [],
  };
  if (validos.length < 2) return baseVazia;

  // ─── Helpers ────────────────────────────────────────────
  const slope = (arr) => {
    const n = arr.length;
    const xm = (n - 1) / 2;
    const ym = arr.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    arr.forEach((v, i) => { num += (i - xm) * (v - ym); den += (i - xm) ** 2; });
    return den === 0 ? 0 : num / den;
  };
  const media = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  // ─── Metricas base ──────────────────────────────────────
  const receitas = validos.map(m => m.receita);
  const cmvs = validos.map(m => m.cmv);
  const lucros = validos.map(m => m.lucroBruto);
  const margens = validos.map(m => m.margem);
  const variacoesCaixa = validos.map(m => m.variacaoCaixa);
  const tickets = validos.map(m => m.ticketMedio);

  const slopeReceita = slope(receitas);
  const slopeMargem = slope(margens);
  const slopeCMV = slope(cmvs);
  const slopeLucro = slope(lucros);
  const slopeTicket = slope(tickets);
  const slopeCaixa = slope(variacoesCaixa);

  const mediaReceita = media(receitas);
  const mediaMargem = media(margens);

  const half = Math.max(1, Math.floor(validos.length / 2));
  const metadeInicial = validos.slice(0, half);
  const metadeFinal = validos.slice(-half);
  const rIni = media(metadeInicial.map(m => m.receita));
  const rFim = media(metadeFinal.map(m => m.receita));
  const cmvIni = media(metadeInicial.map(m => m.cmv));
  const cmvFim = media(metadeFinal.map(m => m.cmv));
  const ticketIni = media(metadeInicial.map(m => m.ticketMedio));
  const ticketFim = media(metadeFinal.map(m => m.ticketMedio));
  const crescimentoReceita = rIni > 0 ? ((rFim - rIni) / rIni) * 100 : 0;
  const crescimentoCMV = cmvIni > 0 ? ((cmvFim - cmvIni) / cmvIni) * 100 : 0;
  const crescimentoTicket = ticketIni > 0 ? ((ticketFim - ticketIni) / ticketIni) * 100 : 0;
  const tendenciaReceita = mediaReceita > 0 ? (slopeReceita / mediaReceita) * 100 : 0;
  const margemTrend = slopeMargem;

  const variancia = receitas.reduce((s, v) => s + (v - mediaReceita) ** 2, 0) / receitas.length;
  const volatilidade = mediaReceita > 0 ? (Math.sqrt(variancia) / mediaReceita) * 100 : 0;

  const melhorReceita = [...validos].sort((a, b) => b.receita - a.receita)[0];
  const piorReceita = [...validos].sort((a, b) => a.receita - b.receita)[0];
  const melhorMargem = [...validos].sort((a, b) => b.margem - a.margem)[0];
  const piorMargem = [...validos].sort((a, b) => a.margem - b.margem)[0];

  const totalReceita = totais.receita || 1;
  const shareCombustivel = (totais.receitaCombustivel / totalReceita) * 100;
  const shareConveniencia = (totais.receitaConveniencia / totalReceita) * 100;
  const shareAutomotivos = (totais.receitaAutomotivos / totalReceita) * 100;
  const shareDescontos = (totais.descontos / totalReceita) * 100;
  const shareCanceladas = (totais.vendasCanceladas / totalReceita) * 100;
  const gapCaixaReceita = totais.receita > 0 ? ((totais.entradasCaixa - totais.receita) / totais.receita) * 100 : 0;

  const mesesCaixaNegativo = validos.filter(m => m.variacaoCaixa < 0).length;
  const mesesPrejuizo = validos.filter(m => m.lucroBruto < 0).length;
  const mesesMargemBaixa = validos.filter(m => m.margem > 0 && m.margem < 8).length;

  // ─── Resumo Executivo ───────────────────────────────────
  // Saude: critica (prejuizo/margem<5%/caixa consistente neg) | alerta | boa
  let saude = 'boa';
  if (mesesPrejuizo > 0 || mediaMargem < 5 || (mesesCaixaNegativo > validos.length / 2)) saude = 'critica';
  else if (mediaMargem < 10 || slopeMargem < -0.3 || shareCombustivel > 90 || mesesCaixaNegativo >= 2) saude = 'alerta';

  const resumoExecutivo = {
    saude,
    texto: [
      `O posto gerou ${formatCurrency(totais.receita)} de receita bruta em ${validos.length} mes(es), com margem bruta media de ${mediaMargem.toFixed(2)}%. `,
      `${slopeMargem >= 0 ? 'A margem esta em trajetoria estavel ou de melhora' : 'A margem bruta esta em queda'}; `,
      `${crescimentoReceita >= 0 ? 'a receita cresceu' : 'a receita caiu'} ${formatPct(crescimentoReceita)} comparando o inicio e o fim do periodo. `,
      `Mix atual: combustivel ${shareCombustivel.toFixed(0)}%, conveniencia ${shareConveniencia.toFixed(0)}%, automotivos ${shareAutomotivos.toFixed(0)}%. `,
      `Variacao de caixa consolidada de ${formatCurrency(totais.variacaoCaixa)}${mesesCaixaNegativo > 0 ? ` (${mesesCaixaNegativo} mes(es) com caixa negativo)` : ''}. `,
      saude === 'critica'
        ? 'Leitura geral: situacao critica — exige acao imediata no trinomio preco, custo e capital de giro.'
        : saude === 'alerta'
        ? 'Leitura geral: operacao funcional, mas com sinais de alerta que merecem atencao nas proximas semanas.'
        : 'Leitura geral: indicadores saudaveis; agora e o momento de otimizar e expandir onde o retorno e maior.',
    ].join(''),
  };

  // ─── Problemas (candidatos pontuados por severidade) ─────
  const problemasCandidatos = [];
  if (mesesPrejuizo > 0) {
    problemasCandidatos.push({
      severidade: 10,
      titulo: `Prejuizo bruto em ${mesesPrejuizo} mes(es)`,
      diagnostico: `${mesesPrejuizo} de ${validos.length} meses fecharam com lucro bruto negativo. Isto significa que o posto esta vendendo por um preco inferior ao custo — sem ainda descontar despesas operacionais.`,
      causaRaiz: 'Preco de venda abaixo do custo, estoque girado em periodo de queda de preco da refinaria, ou descontos fora de controle.',
    });
  }
  if (mediaMargem < 8) {
    problemasCandidatos.push({
      severidade: 9,
      titulo: `Margem bruta media critica: ${mediaMargem.toFixed(2)}%`,
      diagnostico: `A margem media do periodo esta ${mediaMargem < 5 ? 'muito abaixo' : 'abaixo'} do minimo saudavel para o setor (10-15%). Todo o esforco operacional pode estar sendo drenado por precificacao ineficiente.`,
      causaRaiz: 'Combustivel respondendo por quase todo o mix e sem compensacao em produtos de maior margem (conveniencia, lubrificantes, servicos).',
    });
  } else if (slopeMargem < -0.5) {
    problemasCandidatos.push({
      severidade: 7,
      titulo: `Margem bruta em queda acelerada: ${slopeMargem.toFixed(2)} p.p./mes`,
      diagnostico: `Perda de ${Math.abs(slopeMargem).toFixed(1)} pontos percentuais por mes. Se a trajetoria continuar, em poucos meses a margem ficara inviavel.`,
      causaRaiz: 'Repasse de alta de custo nao acompanhado no preco final OU politica de desconto mais agressiva que o necessario.',
    });
  }
  if (shareCombustivel > 92 && shareConveniencia < 3) {
    problemasCandidatos.push({
      severidade: 8,
      titulo: `Dependencia extrema do combustivel (${shareCombustivel.toFixed(1)}%)`,
      diagnostico: `Conveniencia e servicos representam menos de ${(100 - shareCombustivel).toFixed(0)}% da receita. Qualquer oscilacao no preco do combustivel impacta diretamente o resultado.`,
      causaRaiz: 'Loja de conveniencia subutilizada, falta de servicos complementares (lavagem, troca de oleo) ou precificacao nao competitiva nesses itens.',
    });
  }
  if (mesesCaixaNegativo >= Math.ceil(validos.length / 2)) {
    problemasCandidatos.push({
      severidade: 9,
      titulo: `Caixa negativo em ${mesesCaixaNegativo} de ${validos.length} meses`,
      diagnostico: `O negocio esta consumindo mais caixa do que gera na maior parte do periodo. Isso tende a escalar para dependencia de credito.`,
      causaRaiz: 'Descasamento entre prazo de recebimento (cartao D+30, frotistas D+15/30) e pagamento de fornecedores (a vista na distribuidora).',
    });
  }
  if (gapCaixaReceita < -20 && totais.entradasCaixa > 0) {
    problemasCandidatos.push({
      severidade: 7,
      titulo: `Receita nao esta virando caixa: gap de ${formatPct(gapCaixaReceita)}`,
      diagnostico: `As entradas de caixa foram ${Math.abs(gapCaixaReceita).toFixed(0)}% inferiores a receita registrada. Indica contas a receber crescentes ou vendas via cartao/duplicata com DSO elevado.`,
      causaRaiz: 'Aumento de venda a prazo, atraso de repasse de adquirente ou inadimplencia de frotistas.',
    });
  }
  if (shareDescontos >= 3) {
    problemasCandidatos.push({
      severidade: 6,
      titulo: `Descontos concedidos altos: ${formatCurrency(totais.descontos)} (${shareDescontos.toFixed(1)}% da receita)`,
      diagnostico: `O equivalente a ${formatPct(shareDescontos)} da receita esta sendo dado em desconto. Em margens apertadas, isso pode consumir todo o lucro.`,
      causaRaiz: 'Politica de desconto descentralizada (gerente/frentista aprovando sem regra clara) OU concorrencia agressiva obrigando a competir em preco.',
    });
  }
  if (shareCanceladas >= 1.5) {
    problemasCandidatos.push({
      severidade: 5,
      titulo: `Vendas canceladas relevantes: ${formatCurrency(totais.vendasCanceladas)} (${shareCanceladas.toFixed(1)}% da receita)`,
      diagnostico: 'Cancelamentos acima de 1% sinalizam problema operacional: erro de emissao, abastecimento errado, cliente desistindo.',
      causaRaiz: 'Treinamento de frentistas, pressao de fila na pista ou problema tecnico nas bombas.',
    });
  }
  if (slopeCMV > 0 && slopeReceita <= 0) {
    problemasCandidatos.push({
      severidade: 8,
      titulo: 'CMV subindo sem aumento de receita',
      diagnostico: 'Custo total de produtos vendidos esta aumentando enquanto a receita esta estavel ou caindo — compressao direta de margem.',
      causaRaiz: 'Repasse de preco da distribuidora sem ajuste no preco de venda ou estoque comprado a preco mais alto sendo escoado agora.',
    });
  }
  if (crescimentoCMV > crescimentoReceita + 5) {
    problemasCandidatos.push({
      severidade: 6,
      titulo: `Custos crescendo mais rapido que a receita (${formatPct(crescimentoCMV - crescimentoReceita)} de diferenca)`,
      diagnostico: `CMV cresceu ${formatPct(crescimentoCMV)} enquanto a receita variou ${formatPct(crescimentoReceita)}. O resultado e perda de eficiencia.`,
      causaRaiz: 'Gestao de compras reativa (sem negociacao) ou mix piorando (vendendo mais produto de baixa margem).',
    });
  }

  const problemas = problemasCandidatos.sort((a, b) => b.severidade - a.severidade).slice(0, 3);

  // ─── Oportunidades ───────────────────────────────────────
  const oportunidadesCandidatas = [];
  if (shareConveniencia < 8) {
    oportunidadesCandidatas.push({
      impacto: 9,
      titulo: 'Expandir loja de conveniencia',
      potencial: `Cada ${(5 - shareConveniencia).toFixed(0)} p.p. adicionais em conveniencia (margem tipica 25-40%) podem elevar a margem bruta consolidada em 1-3 p.p.`,
      acao: 'Reformular sortimento, ativar pontos quentes (caixa, bomba), parcerias com marcas para promocionar giro de alto-margem.',
    });
  }
  if (shareAutomotivos < 3) {
    oportunidadesCandidatas.push({
      impacto: 7,
      titulo: 'Explorar produtos automotivos e servicos',
      potencial: `Aditivo, lubrificante, arla e servicos (troca de oleo, lavagem) tem margem 40-60%. Cada R$ 10 mil/mes em automotivos adiciona ~R$ 4-6 mil de lucro bruto.`,
      acao: 'Treinar frentista para oferecimento consultivo de aditivo/oleo na bomba; parceria com oficina local.',
    });
  }
  if (slopeCaixa > 0 && totais.variacaoCaixa > 0) {
    oportunidadesCandidatas.push({
      impacto: 6,
      titulo: 'Capital de giro com folga — hora de aplicar',
      potencial: `O caixa esta gerando ${formatCurrency(slopeCaixa)} a mais por mes em media. Em 12 meses isso seria ${formatCurrency(slopeCaixa * 12)}.`,
      acao: 'Aplicar o excedente em CDB/Tesouro de curto prazo ou antecipar recebiveis apenas quando a taxa for menor que o custo do dinheiro.',
    });
  }
  if (slopeTicket > 0) {
    oportunidadesCandidatas.push({
      impacto: 6,
      titulo: `Ticket medio subindo (${formatPct(crescimentoTicket)} no periodo)`,
      potencial: 'O cliente esta gastando mais por visita. Sinal verde para intensificar venda cruzada (combustivel + conveniencia + automotivos).',
      acao: 'Treinar frentistas em roteiro de abordagem e criar combo de produtos no caixa.',
    });
  }
  if (shareCombustivel > 85 && mesesCaixaNegativo <= 1) {
    oportunidadesCandidatas.push({
      impacto: 7,
      titulo: 'Estruturar venda B2B para frotas',
      potencial: 'Com caixa estavel e alta dependencia de combustivel, uma carteira B2B de frotas pode trazer volume previsivel e recorrente.',
      acao: 'Criar politica comercial para frotas (preco por volume, prazo de pagamento, relatorio mensal), prospectar construtoras/locadoras locais.',
    });
  }
  if (volatilidade >= 20 && volatilidade < 40) {
    oportunidadesCandidatas.push({
      impacto: 5,
      titulo: `Exploracao de sazonalidade (CV ${volatilidade.toFixed(1)}%)`,
      potencial: `Receita varia entre ${formatCurrency(piorReceita?.receita || 0)} e ${formatCurrency(melhorReceita?.receita || 0)}. Com previsibilidade melhor, da pra comprar mais barato nos meses de queda.`,
      acao: 'Montar calendario comercial: promocoes, estoque planejado e escala de funcionarios ajustada a sazonalidade detectada.',
    });
  }
  if (mediaMargem >= 12) {
    oportunidadesCandidatas.push({
      impacto: 6,
      titulo: `Margem saudavel (${mediaMargem.toFixed(1)}%) — investir em volume`,
      potencial: 'Margem acima de 12% cria espaco pra investir em campanhas agressivas de preco ou fidelidade sem quebrar o resultado.',
      acao: 'Programa de fidelidade (ex: desconto por visita recorrente), campanha em horarios de baixo movimento.',
    });
  }

  const oportunidades = oportunidadesCandidatas.sort((a, b) => b.impacto - a.impacto).slice(0, 3);

  // ─── Analise Detalhada ───────────────────────────────────
  const analiseDetalhada = {
    vendas: [],
    dre: [],
    caixa: [],
  };

  // Vendas
  analiseDetalhada.vendas.push({
    titulo: 'Mix de receita',
    texto: `Combustiveis ${formatCurrency(totais.receitaCombustivel)} (${shareCombustivel.toFixed(1)}%), Conveniencia ${formatCurrency(totais.receitaConveniencia)} (${shareConveniencia.toFixed(1)}%), Automotivos ${formatCurrency(totais.receitaAutomotivos)} (${shareAutomotivos.toFixed(1)}%).`,
  });
  if (melhorReceita && piorReceita && melhorReceita.key !== piorReceita.key) {
    analiseDetalhada.vendas.push({
      titulo: 'Picos e vales',
      texto: `Melhor mes: ${melhorReceita.label} (${formatCurrency(melhorReceita.receita)}). Pior: ${piorReceita.label} (${formatCurrency(piorReceita.receita)}). Diferenca de ${formatCurrency(melhorReceita.receita - piorReceita.receita)} (${((melhorReceita.receita - piorReceita.receita) / (piorReceita.receita || 1) * 100).toFixed(1)}%).`,
    });
  }
  if (tickets.some(t => t > 0)) {
    analiseDetalhada.vendas.push({
      titulo: 'Ticket medio',
      texto: `Media do periodo: ${formatCurrency(totais.ticketMedio)} em ${totais.qtdVendas.toLocaleString('pt-BR')} vendas. Tendencia: ${slopeTicket > 0 ? 'crescente' : slopeTicket < 0 ? 'decrescente' : 'estavel'} (${crescimentoTicket >= 0 ? '+' : ''}${crescimentoTicket.toFixed(1)}% no periodo).`,
    });
  }
  if (shareCanceladas >= 0.5) {
    analiseDetalhada.vendas.push({
      titulo: 'Vendas canceladas',
      texto: `${formatCurrency(totais.vendasCanceladas)} em cancelamentos (${shareCanceladas.toFixed(2)}% da receita). Auditar causa operacional se o indicador persistir.`,
    });
  }

  // DRE
  analiseDetalhada.dre.push({
    titulo: 'Lucro bruto e margem',
    texto: `Receita ${formatCurrency(totais.receita)} − CMV ${formatCurrency(totais.cmv)} = Lucro bruto ${formatCurrency(totais.lucroBruto)}. Margem media ${mediaMargem.toFixed(2)}% (${slopeMargem >= 0 ? 'melhorando' : 'piorando'} ${Math.abs(slopeMargem).toFixed(2)} p.p./mes).`,
  });
  analiseDetalhada.dre.push({
    titulo: 'Comportamento do CMV',
    texto: `Crescimento do CMV: ${formatPct(crescimentoCMV)}; crescimento da receita: ${formatPct(crescimentoReceita)}. ${
      crescimentoCMV > crescimentoReceita
        ? 'CMV avancando mais rapido — sinal de pressao sobre o resultado.'
        : 'Receita acompanhando ou superando CMV — resultado preservado.'
    }`,
  });
  if (totais.descontos > 0 || totais.acrescimos > 0) {
    analiseDetalhada.dre.push({
      titulo: 'Descontos e acrescimos',
      texto: `${formatCurrency(totais.descontos)} em descontos (${shareDescontos.toFixed(2)}% da receita) vs ${formatCurrency(totais.acrescimos)} em acrescimos. Saldo liquido: ${formatCurrency(totais.acrescimos - totais.descontos)}.`,
    });
  }

  // Fluxo de Caixa
  analiseDetalhada.caixa.push({
    titulo: 'Geracao de caixa',
    texto: `Entradas ${formatCurrency(totais.entradasCaixa)} − Saidas ${formatCurrency(totais.saidasCaixa)} = Variacao ${formatCurrency(totais.variacaoCaixa)}. ${
      totais.variacaoCaixa >= 0
        ? 'Negocio gerando caixa no consolidado.'
        : 'Negocio consumindo caixa no consolidado — ponto critico.'
    }`,
  });
  analiseDetalhada.caixa.push({
    titulo: 'Lucro x Caixa',
    texto: `Lucro bruto ${formatCurrency(totais.lucroBruto)} vs variacao de caixa ${formatCurrency(totais.variacaoCaixa)}. Gap de receita/entradas: ${formatPct(gapCaixaReceita)}. ${
      gapCaixaReceita < -10
        ? 'Caixa significativamente abaixo da receita — evidencia de aumento de contas a receber.'
        : gapCaixaReceita > 10
        ? 'Entradas acima da receita — recebimento de vendas anteriores, bom sinal para giro.'
        : 'Caixa alinhado com a receita — conversao saudavel.'
    }`,
  });
  if (mesesCaixaNegativo > 0) {
    const mesesNegativosLabels = validos.filter(m => m.variacaoCaixa < 0).map(m => m.label).join(', ');
    analiseDetalhada.caixa.push({
      titulo: 'Periodos criticos',
      texto: `${mesesCaixaNegativo} mes(es) com caixa negativo: ${mesesNegativosLabels}. Avaliar se foi evento pontual ou tendencia.`,
    });
  }

  // ─── Recomendacoes estrategicas ──────────────────────────
  const recomendacoes = [];
  if (mesesPrejuizo > 0 || mediaMargem < 8) {
    recomendacoes.push({
      acao: 'Revisar precos de combustivel com base em custo real de reposicao (metodo UEPS) e nao em custo medio.',
      justificativa: 'Em momentos de alta de preco na refinaria, usar custo medio subestima o custo de reposicao e corroi a margem.',
    });
  }
  if (shareCombustivel >= 85) {
    recomendacoes.push({
      acao: 'Definir meta de 10% da receita em conveniencia em 6-12 meses.',
      justificativa: 'A cada p.p. que conveniencia ganha (margem 25-40%) vs combustivel (margem 4-8%), a margem consolidada sobe ~0,3 p.p.',
    });
  }
  if (slopeMargem < 0) {
    recomendacoes.push({
      acao: 'Reprecificar o sortimento de conveniencia e automotivos semanalmente com base em pesquisa de concorrencia local.',
      justificativa: 'Nesses itens a elasticidade e menor e voce ganha margem. O combustivel ja esta quase commodity.',
    });
  }
  if (shareDescontos >= 2.5) {
    recomendacoes.push({
      acao: 'Centralizar aprovacao de desconto: regra escrita, teto por perfil de cliente (varejo, fidelidade, frota) e relatorio semanal.',
      justificativa: 'Politica solta de desconto e o vazamento de margem mais silencioso e recorrente do setor.',
    });
  }
  if (gapCaixaReceita < -10) {
    recomendacoes.push({
      acao: 'Mapear DSO por meio de pagamento: cartao, frota, duplicata. Negociar antecipacao onde o custo for menor que 1% a.m.',
      justificativa: 'Receita sem caixa pressiona capital de giro e cria dependencia de conta-garantida/cheque especial, que tem custo bem maior.',
    });
  }
  if (mesesCaixaNegativo >= 2) {
    recomendacoes.push({
      acao: 'Construir reserva operacional equivalente a 30-45 dias de despesa fixa.',
      justificativa: 'Postos operam com margem apertada; um mes ruim de preco da distribuidora pode travar a operacao se nao houver colchao.',
    });
  }
  if (shareConveniencia >= 8 && mediaMargem >= 10) {
    recomendacoes.push({
      acao: 'Implantar programa de fidelidade (pontos ou cashback) com gatilho no app/POS.',
      justificativa: 'Voce ja tem margem para absorver o custo do programa; em troca aumenta frequencia, que e o principal driver de ticket medio.',
    });
  }
  if (recomendacoes.length < 3) {
    recomendacoes.push({
      acao: 'Implantar gestao por centro de custo (pista, conveniencia, lavagem) para isolar performance e decisoes de investimento.',
      justificativa: 'Sem separar os centros, o resultado positivo de um oculta o prejuizo de outro.',
    });
  }

  return {
    margemTrend,
    crescimentoReceita,
    volatilidade,
    shareCombustivel,
    shareConveniencia,
    shareAutomotivos,
    shareDescontos,
    gapCaixaReceita,
    melhorReceita,
    piorReceita,
    melhorMargem,
    piorMargem,
    resumoExecutivo,
    problemas,
    oportunidades,
    analiseDetalhada,
    recomendacoes: recomendacoes.slice(0, 5),
  };
}

function InsightsConsultor({ insights, totais }) {
  const saudeCfg = {
    boa:     { color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', label: 'SAUDE BOA', Icon: TrendingUp },
    alerta:  { color: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-200',   label: 'SINAIS DE ALERTA', Icon: AlertCircle },
    critica: { color: 'text-red-700',     bg: 'bg-red-50',     ring: 'ring-red-200',     label: 'SITUACAO CRITICA', Icon: AlertCircle },
    neutra:  { color: 'text-gray-600',    bg: 'bg-gray-50',    ring: 'ring-gray-200',    label: 'DADOS INSUFICIENTES', Icon: Lightbulb },
  };
  const saude = saudeCfg[insights.resumoExecutivo?.saude || 'neutra'];

  return (
    <div className="space-y-5">
      {/* 1. RESUMO EXECUTIVO + MIX */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden ${saude.bg}`}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <saude.Icon className={`h-4 w-4 ${saude.color}`} />
            <h3 className={`text-sm font-bold ${saude.color} uppercase tracking-wider`}>1. Resumo executivo</h3>
            <span className={`ml-auto text-[10px] font-bold ${saude.color} ring-1 ${saude.ring} bg-white/60 rounded-full px-2 py-0.5`}>
              {saude.label}
            </span>
          </div>
          <div className="p-5">
            <p className={`text-[13px] leading-relaxed ${saude.color === 'text-emerald-700' ? 'text-emerald-900' : saude.color === 'text-amber-700' ? 'text-amber-900' : saude.color === 'text-red-700' ? 'text-red-900' : 'text-gray-700'}`}>
              {insights.resumoExecutivo?.texto}
            </p>
          </div>
        </div>
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
      </div>

      {/* 2. TOP 3 PROBLEMAS */}
      <div className="bg-white rounded-2xl border border-red-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-red-100 bg-red-50/40 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <h3 className="text-sm font-bold text-red-900 uppercase tracking-wider">2. Principais problemas encontrados</h3>
          <span className="text-[11px] text-red-600/70">· ordenados por severidade</span>
        </div>
        <div className="p-4">
          {insights.problemas.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Nenhum problema critico detectado neste periodo.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {insights.problemas.map((p, i) => (
                <div key={i} className="rounded-xl border border-red-200 bg-white p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[13px] font-bold text-red-900 leading-tight">{p.titulo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Diagnostico</p>
                    <p className="text-[11.5px] text-gray-700 leading-relaxed">{p.diagnostico}</p>
                  </div>
                  <div className="mt-auto pt-2 border-t border-red-100">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Causa raiz</p>
                    <p className="text-[11.5px] text-gray-700 leading-relaxed">{p.causaRaiz}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. TOP 3 OPORTUNIDADES */}
      <div className="bg-white rounded-2xl border border-emerald-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-emerald-100 bg-emerald-50/40 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">3. Oportunidades de melhoria</h3>
          <span className="text-[11px] text-emerald-600/70">· ordenadas por impacto</span>
        </div>
        <div className="p-4">
          {insights.oportunidades.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Sem oportunidades evidentes detectadas automaticamente neste periodo.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {insights.oportunidades.map((o, i) => (
                <div key={i} className="rounded-xl border border-emerald-200 bg-white p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[13px] font-bold text-emerald-900 leading-tight">{o.titulo}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Potencial</p>
                    <p className="text-[11.5px] text-gray-700 leading-relaxed">{o.potencial}</p>
                  </div>
                  <div className="mt-auto pt-2 border-t border-emerald-100">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Como ativar</p>
                    <p className="text-[11.5px] text-gray-700 leading-relaxed">{o.acao}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. ANALISE DETALHADA */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">4. Analise detalhada</h3>
          <span className="text-[11px] text-gray-500">· leitura cruzada por bloco</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <BlocoDetalhe icon={ShoppingBag} titulo="Vendas" cor="text-cyan-700" itens={insights.analiseDetalhada.vendas} />
          <BlocoDetalhe icon={Target} titulo="DRE" cor="text-violet-700" itens={insights.analiseDetalhada.dre} />
          <BlocoDetalhe icon={Wallet} titulo="Fluxo de Caixa" cor="text-emerald-700" itens={insights.analiseDetalhada.caixa} />
        </div>
      </div>

      {/* 5. RECOMENDACOES ESTRATEGICAS */}
      <div className="bg-white rounded-2xl border border-violet-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-violet-100 bg-violet-50/40 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-bold text-violet-900 uppercase tracking-wider">5. Recomendacoes estrategicas</h3>
          <span className="text-[11px] text-violet-600/70">· acoes priorizadas para os proximos 30-90 dias</span>
        </div>
        <div className="p-4 space-y-2.5">
          {insights.recomendacoes.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-violet-100 bg-violet-50/30 p-3">
              <span className="h-6 w-6 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-violet-900 leading-snug">{r.acao}</p>
                <p className="text-[11.5px] text-gray-700 mt-1 leading-relaxed">
                  <span className="font-semibold text-gray-600">Por que: </span>
                  {r.justificativa}
                </p>
              </div>
            </div>
          ))}
          {insights.recomendacoes.length === 0 && (
            <p className="text-sm text-gray-500 italic">Sem recomendacoes nesta analise.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BlocoDetalhe({ icon: Icon, titulo, cor, itens }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${cor}`} />
        <p className={`text-[12px] font-bold ${cor} uppercase tracking-wider`}>{titulo}</p>
      </div>
      {itens.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">Sem dados no periodo.</p>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((it, i) => (
            <li key={i} className="text-[12px]">
              <p className="font-semibold text-gray-800 mb-0.5">{it.titulo}</p>
              <p className="text-[11.5px] text-gray-600 leading-relaxed">{it.texto}</p>
            </li>
          ))}
        </ul>
      )}
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
