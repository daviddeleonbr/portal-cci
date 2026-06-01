import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown,
  ShoppingCart, TrendingUp, Percent, Fuel, Coins, Droplet,
  Users, Package, Store, Activity, Gauge,
  ArrowRight, ArrowUpRight, ArrowDownLeft, LineChart as LineChartIcon, BarChart3,
  Calendar, AlertTriangle, Clock, CheckCircle2,
  CreditCard, FileText, Receipt, MoreHorizontal, Banknote,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
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

export default function ClienteDashboard() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  // Permissão de financeiro: controla a exibição (e o fetch) dos blocos
  // de Contas a pagar e Contas a receber no dashboard.
  const temPermFinanceiro = (session?.usuario?.permissoes || []).includes('financeiro');
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(new Set());
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

  const dataDe  = useMemo(() => primeiroDiaDoMesIso(), []);
  const dataAte = useMemo(() => isoHoje(), []);
  const redeId = asRede?.id;

  // Mapa de grupos por categoria + nomes + mix
  const [gruposPorCat, setGruposPorCat] = useState({ combustivel: [], automotivos: [], conveniencia: [] });
  const [mapaMix, setMapaMix] = useState(new Map());

  useEffect(() => {
    if (!redeId) return;
    (async () => {
      try {
        const [lista, mixSalvo] = await Promise.all([
          autosystemService.listarGruposProdutoRede(redeId),
          autosystemService.listarMixProdutos(redeId).catch(() => []),
        ]);
        const out = { combustivel: [], automotivos: [], conveniencia: [] };
        (lista || []).forEach(g => {
          if (g.grid == null) return;
          if (out[g.categoria]) out[g.categoria].push(Number(g.grid));
        });
        setGruposPorCat(out);
        const mMix = new Map();
        (mixSalvo || []).forEach(c => mMix.set(Number(c.produto_codigo), c.tipo));
        setMapaMix(mMix);
      } catch { /* noop */ }
    })();
  }, [redeId]);

  const [vendedores, setVendedores] = useState([]);
  const [evolucao12m, setEvolucao12m] = useState([]);
  const [contasPagar, setContasPagar] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCP, setLoadingCP] = useState(false);
  const [loadingCR, setLoadingCR] = useState(false);
  const [erro, setErro] = useState('');

  function somarDias(iso, n) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  async function carregar() {
    if (!redeId || empresasSel.length === 0) return;
    setLoading(true);
    setErro('');
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      // Classificação de mix → arrays
      const produtos_aditivada = [];
      const produtos_comum = [];
      mapaMix.forEach((tipo, codigo) => {
        if (tipo === 'aditivada') produtos_aditivada.push(codigo);
        else if (tipo === 'comum') produtos_comum.push(codigo);
      });
      // Janela 12m
      const hoje = new Date();
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      const m12De  = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-01`;
      const m12Ate = `${fim.getFullYear()}-${pad(fim.getMonth() + 1)}-${pad(fim.getDate())}`;

      const [vendedoresRows, mensal] = await Promise.all([
        autosystemService.buscarProdutividadeAutosystem(redeId, codigos, {
          data_de: dataDe, data_ate: dataAte,
          grupos_combustivel:  gruposPorCat.combustivel,
          grupos_automotivos:  gruposPorCat.automotivos,
          grupos_conveniencia: gruposPorCat.conveniencia,
          produtos_aditivada, produtos_comum,
        }),
        autosystemService.buscarVendasMensalAutosystem(redeId, codigos, {
          data_de: m12De, data_ate: m12Ate,
        }).catch(() => []),
      ]);
      setVendedores(vendedoresRows || []);
      setEvolucao12m(mensal || []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar dashboard');
      setVendedores([]); setEvolucao12m([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [redeId, empresasSelIds, gruposPorCat, mapaMix]);

  // Contas a pagar — janela de 30 dias atrás a 30 dias à frente.
  useEffect(() => {
    if (!temPermFinanceiro) { setContasPagar([]); return; }
    if (!redeId || empresasSel.length === 0) { setContasPagar([]); return; }
    let cancelado = false;
    setLoadingCP(true);
    const hoje = isoHoje();
    const venctoDe  = somarDias(hoje, -30);
    const venctoAte = somarDias(hoje, +30);
    Promise.all(
      empresasSel.map(e =>
        autosystemService.buscarContasPagar(redeId, e.empresa_codigo, {
          vencto_de: venctoDe, vencto_ate: venctoAte,
        }).catch(() => [])
      )
    ).then(lists => {
      if (cancelado) return;
      setContasPagar(lists.flat());
    }).finally(() => { if (!cancelado) setLoadingCP(false); });
    return () => { cancelado = true; };
  }, [redeId, empresasSelIds, temPermFinanceiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contas a receber — mesma janela de 30 dias antes / 30 dias à frente.
  useEffect(() => {
    if (!temPermFinanceiro) { setContasReceber([]); return; }
    if (!redeId || empresasSel.length === 0) { setContasReceber([]); return; }
    let cancelado = false;
    setLoadingCR(true);
    const hoje = isoHoje();
    const venctoDe  = somarDias(hoje, -30);
    const venctoAte = somarDias(hoje, +30);
    Promise.all(
      empresasSel.map(e =>
        autosystemService.buscarContasReceber(redeId, e.empresa_codigo, {
          vencto_de: venctoDe, vencto_ate: venctoAte,
        }).catch(() => [])
      )
    ).then(lists => {
      if (cancelado) return;
      setContasReceber(lists.flat());
    }).finally(() => { if (!cancelado) setLoadingCR(false); });
    return () => { cancelado = true; };
  }, [redeId, empresasSelIds, temPermFinanceiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Totais consolidados
  const totais = useMemo(() => {
    let fat = 0, custo = 0, qtdComb = 0, abast = 0, vendasTot = 0;
    let fatComb = 0, custoComb = 0, fatAuto = 0, custoAuto = 0, fatConv = 0, custoConv = 0;
    let aditiv = 0, comum = 0;
    vendedores.forEach(v => {
      fat       += Number(v.fat_total)         || 0;
      custo     += Number(v.custo_total)       || 0;
      qtdComb   += Number(v.qtd_combustivel)   || 0;
      abast     += Number(v.abastecimentos)    || 0;
      vendasTot += Number(v.vendas_count)      || 0;
      fatComb   += Number(v.fat_combustivel)   || 0;
      custoComb += Number(v.custo_combustivel) || 0;
      fatAuto   += Number(v.fat_automotivos)   || 0;
      custoAuto += Number(v.custo_automotivos) || 0;
      fatConv   += Number(v.fat_conveniencia)  || 0;
      custoConv += Number(v.custo_conveniencia)|| 0;
      aditiv    += Number(v.litros_aditivada)  || 0;
      comum     += Number(v.litros_comum)      || 0;
    });
    const lucro = fat - custo;
    const margem = fat > 0 ? (lucro / fat) * 100 : 0;
    const baseMix = aditiv + comum;
    const mix = baseMix > 0 ? (aditiv / baseMix) * 100 : null;
    const ticketMedio = abast > 0 ? fatComb / abast : 0;
    return {
      fat, custo, lucro, margem,
      qtdComb, abast, vendasTot, mix,
      ticketMedio,
      cats: {
        combustivel: { fat: fatComb, lucro: fatComb - custoComb, qtd: qtdComb },
        automotivos: { fat: fatAuto, lucro: fatAuto - custoAuto },
        conveniencia:{ fat: fatConv, lucro: fatConv - custoConv },
      },
    };
  }, [vendedores]);

  // Top 5 vendedores por faturamento total
  const topVendedores = useMemo(() => {
    return [...vendedores]
      .filter(v => Number(v.fat_total) > 0)
      .sort((a, b) => Number(b.fat_total) - Number(a.fat_total))
      .slice(0, 5);
  }, [vendedores]);

  // Série 12 meses para gráfico
  const serie12m = useMemo(() => {
    const idx = new Map();
    (evolucao12m || []).forEach(r => idx.set(String(r.ano_mes), r));
    const hoje = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
      const row = idx.get(ym);
      const fat = row ? Number(row.valor) || 0 : 0;
      const custo = row ? Number(row.valor_custo) || 0 : 0;
      const litros = row ? Number(row.quantidade) || 0 : 0;
      const lucro = fat - custo;
      const lucroPorLitro = litros > 0 ? lucro / litros : 0;
      out.push({
        rotulo: `${MESES_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
        litros, lucroPorLitro,
      });
    }
    return out;
  }, [evolucao12m]);

  // Buckets de contas a pagar
  const contasBuckets = useMemo(() => {
    const hoje = isoHoje();
    const em7d = somarDias(hoje, 7);
    const v   = { qtd: 0, total: 0 };
    const p7  = { qtd: 0, total: 0 };
    const p30 = { qtd: 0, total: 0 };
    (contasPagar || []).forEach(c => {
      const venc = String(c.vencto || '').slice(0, 10);
      const val = Number(c.valor) || 0;
      if (!venc) return;
      if (venc < hoje)       { v.qtd++;   v.total   += val; }
      else if (venc <= em7d) { p7.qtd++;  p7.total  += val; }
      else                   { p30.qtd++; p30.total += val; }
    });
    return { vencidas: v, prox7: p7, prox30: p30, total: v.total + p7.total + p30.total };
  }, [contasPagar]);

  // Classifica conta a receber pelo prefixo de `conta_debitar` (grupo 1.3.x).
  //   1.3.01    → Cartões
  //   1.3.02    → Cheques
  //   1.3.03.1  → Notas a prazo
  //   1.3.03.2  → Faturas a receber
  //   demais 1.3.* → Outros
  function classificarContaReceber(cod) {
    const s = String(cod || '');
    if (s.startsWith('1.3.01'))   return 'cartoes';
    if (s.startsWith('1.3.02'))   return 'cheques';
    if (s.startsWith('1.3.03.1')) return 'notas';
    if (s.startsWith('1.3.03.2')) return 'faturas';
    return 'outros';
  }

  // Matriz contas a receber por (categoria × bucket).
  // Buckets: vencido (vencto < hoje), hoje (vencto = hoje), aVencer (vencto > hoje).
  const recebMatrix = useMemo(() => {
    const hoje = isoHoje();
    const mk = () => ({ qtd: 0, total: 0 });
    const base = () => ({ vencido: mk(), hoje: mk(), aVencer: mk(), totalLinha: 0 });
    const out = {
      cartoes: base(),
      cheques: base(),
      notas:   base(),
      faturas: base(),
      outros:  base(),
    };
    const totaisBucket = { vencido: mk(), hoje: mk(), aVencer: mk() };
    (contasReceber || []).forEach(c => {
      const venc = String(c.vencto || '').slice(0, 10);
      const val = Number(c.valor) || 0;
      if (!venc) return;
      const cat = classificarContaReceber(c.debito_codigo);
      const bucket = venc < hoje ? 'vencido' : venc === hoje ? 'hoje' : 'aVencer';
      out[cat][bucket].qtd++;
      out[cat][bucket].total += val;
      out[cat].totalLinha += val;
      totaisBucket[bucket].qtd++;
      totaisBucket[bucket].total += val;
    });
    const totalGeral =
      totaisBucket.vencido.total + totaisBucket.hoje.total + totaisBucket.aVencer.total;
    return { categorias: out, totais: totaisBucket, totalGeral };
  }, [contasReceber]);

  // Distribuição por categoria (donut) — usa LUCRO BRUTO por categoria
  const categoriaDonut = useMemo(() => [
    { nome: 'Combustível',  valor: totais.cats.combustivel.lucro,  cor: '#fcd34d' },
    { nome: 'Automotivos',  valor: totais.cats.automotivos.lucro,  cor: '#5eead4' },
    { nome: 'Conveniência', valor: totais.cats.conveniencia.lucro, cor: '#86efac' },
  ].filter(c => c.valor > 0), [totais]);
  const totalDonut = useMemo(
    () => categoriaDonut.reduce((s, c) => s + (c.valor || 0), 0),
    [categoriaDonut],
  );

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Visão Geral" description="Indicadores principais" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Visão Geral" description={asRede?.nome || 'Indicadores principais'}>
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
          Mês corrente
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
        <button onClick={carregar} disabled={loading || empresasSel.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando indicadores...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p>{erro}</p>
        </div>
      ) : (
        <>
          {/* 4 KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Kpi icone={TrendingUp}   cor="emerald" label="Lucro bruto"      valor={formatCurrency(totais.lucro)} negativo={totais.lucro < 0} />
            <Kpi icone={Percent}      cor="emerald" label="Margem"           valor={`${totais.margem.toFixed(1)}%`} negativo={totais.margem < 0} />
            <Kpi icone={Fuel}         cor="amber"   label="Litros vendidos"  valor={`${fmtNum(totais.qtdComb, 0)} L`} />
            <Kpi icone={Droplet}      cor="violet"  label="Mix aditivada"
              valor={totais.mix != null ? `${totais.mix.toFixed(1)}%` : '—'}
              sub={totais.mix == null ? 'classifique' : null} />
          </div>

          {/* Contas a pagar — gated pela permissão 'financeiro' */}
          {temPermFinanceiro && (
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-rose-500" />
              <h3 className="text-[13px] font-semibold text-gray-800">Contas a pagar</h3>
              <span className="text-[11px] text-gray-400">
                · janela de 30 dias · total a pagar {formatCurrency(contasBuckets.total)}
              </span>
              <Link to="/cliente/autosystem/financeiro/contas-pagar"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-rose-700 hover:text-rose-900 font-medium">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loadingCP ? (
              <div className="p-6 flex items-center justify-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                <span className="text-sm">Carregando contas...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                <BucketContas
                  icone={AlertTriangle} cor="rose"
                  label="Vencidas"
                  total={contasBuckets.vencidas.total}
                  qtd={contasBuckets.vencidas.qtd}
                  ehAlerta />
                <BucketContas
                  icone={Clock} cor="amber"
                  label="Próximos 7 dias"
                  total={contasBuckets.prox7.total}
                  qtd={contasBuckets.prox7.qtd} />
                <BucketContas
                  icone={Calendar} cor="blue"
                  label="8 a 30 dias"
                  total={contasBuckets.prox30.total}
                  qtd={contasBuckets.prox30.qtd} />
              </div>
            )}
          </div>

          )}

          {/* Contas a receber — matriz categoria × bucket. Gated pela permissão 'financeiro' */}
          {temPermFinanceiro && (
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
              <h3 className="text-[13px] font-semibold text-gray-800">Contas a receber</h3>
              <span className="text-[11px] text-gray-400">
                · janela de 30 dias · total {formatCurrency(recebMatrix.totalGeral)}
              </span>
              <Link to="/cliente/autosystem/financeiro/contas-receber"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 font-medium">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loadingCR ? (
              <div className="p-6 flex items-center justify-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span className="text-sm">Carregando contas...</span>
              </div>
            ) : recebMatrix.totalGeral === 0 ? (
              <div className="p-8 text-center text-[12.5px] text-gray-400">
                <CheckCircle2 className="h-7 w-7 text-emerald-300 mx-auto mb-2" />
                Nenhuma conta a receber no período.
              </div>
            ) : (
              <>
                {/* KPIs no topo — visão executiva */}
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-b border-gray-100">
                  <KpiReceber
                    icone={AlertTriangle} cor="rose"
                    label="Vencidas"
                    sub="precisam de cobrança"
                    total={recebMatrix.totais.vencido.total}
                    qtd={recebMatrix.totais.vencido.qtd}
                    totalGeral={recebMatrix.totalGeral} />
                  <KpiReceber
                    icone={Clock} cor="amber"
                    label="Vencem hoje"
                    sub="entra hoje no caixa"
                    total={recebMatrix.totais.hoje.total}
                    qtd={recebMatrix.totais.hoje.qtd}
                    totalGeral={recebMatrix.totalGeral} />
                  <KpiReceber
                    icone={Calendar} cor="emerald"
                    label="A vencer"
                    sub="próximos 30 dias"
                    total={recebMatrix.totais.aVencer.total}
                    qtd={recebMatrix.totais.aVencer.qtd}
                    totalGeral={recebMatrix.totalGeral} />
                </div>

                {/* Matriz detalhada: categoria × bucket */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60 border-b border-gray-200">
                      <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-2 text-left">Categoria</th>
                        <th className="px-3 py-2 text-right">Vencidas</th>
                        <th className="px-3 py-2 text-right">Hoje</th>
                        <th className="px-3 py-2 text-right">A vencer</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATEGORIAS_RECEBER.map(cat => {
                        const dados = recebMatrix.categorias[cat.key];
                        const propor = recebMatrix.totalGeral > 0
                          ? (dados.totalLinha / recebMatrix.totalGeral) * 100
                          : 0;
                        const Icone = cat.icone;
                        return (
                          <tr key={cat.key} className="border-t border-gray-100 hover:bg-gray-50/40">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`h-7 w-7 rounded-lg ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                                  <Icone className={`h-3.5 w-3.5 ${cat.icon}`} />
                                </span>
                                <div className="min-w-0">
                                  <p className={`text-[12.5px] font-semibold ${cat.text} leading-tight`}>
                                    {cat.label}
                                  </p>
                                  <div className="mt-1 h-1 w-24 rounded-full bg-gray-100 overflow-hidden">
                                    <div className={`h-full ${cat.barBg}`} style={{ width: `${Math.min(100, propor)}%` }} />
                                  </div>
                                </div>
                              </div>
                            </td>
                            <CelulaReceber qtd={dados.vencido.qtd} total={dados.vencido.total} acento="rose" />
                            <CelulaReceber qtd={dados.hoje.qtd}    total={dados.hoje.total}    acento="amber" />
                            <CelulaReceber qtd={dados.aVencer.qtd} total={dados.aVencer.total} acento="emerald" />
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <p className={`font-mono tabular-nums text-[12.5px] font-bold ${dados.totalLinha > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                {formatCurrency(dados.totalLinha)}
                              </p>
                              <p className="text-[9.5px] text-gray-400 mt-0.5">
                                {propor.toFixed(1)}% do total
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                      <tr className="text-[11.5px] font-bold">
                        <td className="px-4 py-2.5 text-gray-700 uppercase tracking-wider text-[10px]">Total geral</td>
                        <td className="px-3 py-2.5 text-right">
                          <p className={`font-mono tabular-nums ${recebMatrix.totais.vencido.total > 0 ? 'text-rose-700' : 'text-gray-300'}`}>
                            {formatCurrency(recebMatrix.totais.vencido.total)}
                          </p>
                          <p className="text-[9.5px] text-gray-400 font-normal mt-0.5">{recebMatrix.totais.vencido.qtd} doc.</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <p className={`font-mono tabular-nums ${recebMatrix.totais.hoje.total > 0 ? 'text-amber-700' : 'text-gray-300'}`}>
                            {formatCurrency(recebMatrix.totais.hoje.total)}
                          </p>
                          <p className="text-[9.5px] text-gray-400 font-normal mt-0.5">{recebMatrix.totais.hoje.qtd} doc.</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <p className={`font-mono tabular-nums ${recebMatrix.totais.aVencer.total > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                            {formatCurrency(recebMatrix.totais.aVencer.total)}
                          </p>
                          <p className="text-[9.5px] text-gray-400 font-normal mt-0.5">{recebMatrix.totais.aVencer.qtd} doc.</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <p className="font-mono tabular-nums text-gray-900">{formatCurrency(recebMatrix.totalGeral)}</p>
                          <p className="text-[9.5px] text-gray-400 font-normal mt-0.5">100%</p>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {/* Gráfico 12 meses */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Evolução · últimos 12 meses</h3>
                <span className="text-[11px] text-gray-400">· Litros e lucro por litro</span>
              </div>
              <div className="p-3">
                {serie12m.every(p => p.litros === 0) ? (
                  <div className="h-72 flex items-center justify-center text-sm text-gray-400">
                    Sem dados nos últimos 12 meses.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={290}>
                    <ComposedChart data={serie12m} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                        tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k L` : `${v.toFixed(0)} L`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb"
                        tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`} />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === 'Litros')        return [`${fmtNum(value, 2)} L`, name];
                          if (name === 'Lucro / litro') return [formatCurrency(value), name];
                          return [value, name];
                        }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="litros" name="Litros" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="lucroPorLitro" name="Lucro / litro"
                        stroke="#10b981" strokeWidth={2}
                        dot={{ r: 3, fill: '#a7f3d0', stroke: '#10b981', strokeWidth: 1 }}
                        activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Donut por categoria — Lucro bruto */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Lucro bruto por categoria · mês</h3>
              </div>
              <div className="p-3">
                {categoriaDonut.length === 0 ? (
                  <div className="h-72 flex items-center justify-center text-sm text-gray-400">
                    Sem lucro registrado no mês.
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={categoriaDonut} dataKey="valor" nameKey="nome"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                          {categoriaDonut.map((c, i) => <Cell key={i} fill={c.cor} />)}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [formatCurrency(value), name]}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1.5">
                      {categoriaDonut.map(c => {
                        const pct = totalDonut > 0 ? (c.valor / totalDonut) * 100 : 0;
                        return (
                          <div key={c.nome} className="flex items-center gap-2 text-[11.5px]">
                            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: c.cor }} />
                            <span className="text-gray-700 flex-1 truncate">{c.nome}</span>
                            <span className="font-mono tabular-nums font-semibold text-gray-900">{formatCurrency(c.valor)}</span>
                            <span className="font-mono tabular-nums text-gray-400 w-12 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Top 5 vendedores */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <h3 className="text-[13px] font-semibold text-gray-800">Top vendedores · mês</h3>
              <Link to="/cliente/autosystem/comercial/produtividade"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-700 hover:text-blue-900 font-medium">
                Ver detalhamento <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {topVendedores.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-gray-400">
                Nenhuma venda registrada no mês.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2 text-left">Vendedor</th>
                      <th className="px-3 py-2 text-right border-l border-gray-100">Vendas</th>
                      <th className="px-3 py-2 text-right border-l border-gray-100">Faturamento</th>
                      <th className="px-3 py-2 text-right border-l border-gray-100">Lucro bruto</th>
                      <th className="px-3 py-2 text-right border-l border-gray-100">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topVendedores.map((v, i) => {
                      const fatTot   = Number(v.fat_total)   || 0;
                      const custoTot = Number(v.custo_total) || 0;
                      const lucroTot = fatTot - custoTot;
                      const margem   = fatTot > 0 ? (lucroTot / fatTot) * 100 : 0;
                      const transac  = Number(v.transacoes_count) || 0;
                      return (
                        <tr key={`${v.empresa}-${v.vendedor_codigo}`} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-3 py-1.5 text-center font-mono text-[11px] text-blue-700 font-semibold">
                            {i + 1}
                          </td>
                          <td className="px-3 py-1.5">
                            <p className="text-[12.5px] font-medium text-gray-900 truncate max-w-[260px]">
                              {v.vendedor_nome || <span className="italic text-gray-400">sem nome</span>}
                            </p>
                            <p className="text-[9.5px] text-gray-400 font-mono">cód {v.vendedor_codigo}</p>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-700 border-l border-gray-100">
                            {fmtNum(transac)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l border-gray-100">
                            {formatCurrency(fatTot)}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${lucroTot < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                            {formatCurrency(lucroTot)}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${margem < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {margem.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────
function Kpi({ icone: Icone, cor, label, valor, sub, negativo }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',  icon: 'text-blue-600' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
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

function BucketContas({ icone: Icone, cor, label, total, qtd, ehAlerta }) {
  const palette = {
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    text: 'text-rose-700'    },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   text: 'text-amber-700'   },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    text: 'text-blue-700'    },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-700' },
  };
  const Pal = palette[cor] || palette.blue;
  const vazio = qtd === 0;
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-lg ${Pal.bg} flex items-center justify-center flex-shrink-0`}>
          <Icone className={`h-3.5 w-3.5 ${Pal.icon}`} />
        </div>
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold tracking-tight ${vazio ? 'text-gray-300' : ehAlerta ? Pal.text : 'text-gray-900'}`}>
        {vazio ? '—' : formatCurrency(total)}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {vazio ? 'nenhuma conta' : `${qtd} ${qtd === 1 ? 'conta' : 'contas'}`}
      </p>
    </div>
  );
}

// Categorias do contas a receber Autosystem (plano de contas 1.3.x).
const CATEGORIAS_RECEBER = [
  { key: 'cartoes', label: 'Cartões',          icone: CreditCard,     bg: 'bg-blue-50',    icon: 'text-blue-600',    text: 'text-blue-800',    barBg: 'bg-blue-500'    },
  { key: 'cheques', label: 'Cheques',          icone: Banknote,       bg: 'bg-purple-50',  icon: 'text-purple-600',  text: 'text-purple-800',  barBg: 'bg-purple-500'  },
  { key: 'notas',   label: 'Notas a prazo',    icone: FileText,       bg: 'bg-amber-50',   icon: 'text-amber-600',   text: 'text-amber-800',   barBg: 'bg-amber-500'   },
  { key: 'faturas', label: 'Faturas a receber',icone: Receipt,        bg: 'bg-cyan-50',    icon: 'text-cyan-600',    text: 'text-cyan-800',    barBg: 'bg-cyan-500'    },
  { key: 'outros',  label: 'Outros',           icone: MoreHorizontal, bg: 'bg-gray-100',   icon: 'text-gray-600',    text: 'text-gray-800',    barBg: 'bg-gray-500'    },
];

// KPI grande no topo do card de contas a receber.
// Mostra valor + qtd + % do total geral, com cor adequada ao bucket.
function KpiReceber({ icone: Icone, cor, label, sub, total, qtd, totalGeral }) {
  const palette = {
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    accent: 'text-rose-700',    bar: 'bg-rose-500'    },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   accent: 'text-amber-700',   bar: 'bg-amber-500'   },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', accent: 'text-emerald-700', bar: 'bg-emerald-500' },
  };
  const Pal = palette[cor] || palette.emerald;
  const pct = totalGeral > 0 ? (total / totalGeral) * 100 : 0;
  const vazio = qtd === 0;
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg ${Pal.bg} flex items-center justify-center flex-shrink-0`}>
          <Icone className={`h-4 w-4 ${Pal.icon}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
        </div>
        {!vazio && (
          <span className={`ml-auto text-[10px] font-bold ${Pal.accent}`}>
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold tracking-tight ${vazio ? 'text-gray-300' : Pal.accent}`}>
        {vazio ? '—' : formatCurrency(total)}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-[11px] text-gray-500">
          {vazio ? 'nenhum documento' : `${qtd} ${qtd === 1 ? 'documento' : 'documentos'}`}
        </p>
        {!vazio && (
          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full ${Pal.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

// Célula da matriz contas a receber × categoria. Valor + qtd embaixo.
// Acento por bucket: rose (vencido), amber (hoje), emerald (a vencer).
function CelulaReceber({ qtd, total, acento = 'emerald' }) {
  const accentText = {
    rose:    'text-rose-700',
    amber:   'text-amber-700',
    emerald: 'text-emerald-700',
  }[acento];
  const vazio = qtd === 0;
  return (
    <td className="px-3 py-2.5 text-right whitespace-nowrap">
      <p className={`font-mono tabular-nums text-[12.5px] font-semibold ${vazio ? 'text-gray-300' : accentText}`}>
        {vazio ? '—' : formatCurrency(total)}
      </p>
      <p className="text-[9.5px] text-gray-400 mt-0.5">
        {vazio ? '' : `${qtd} doc.`}
      </p>
    </td>
  );
}

function QuickLink({ to, icone: Icone, cor, titulo, desc }) {
  const palette = {
    violet:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  ring: 'hover:ring-blue-200',  text: 'text-blue-700' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    ring: 'hover:ring-blue-200',    text: 'text-blue-700' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'hover:ring-amber-200',   text: 'text-amber-700' },
  };
  const Pal = palette[cor] || palette.violet;
  return (
    <Link to={to}
      className={`group bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:ring-1 ${Pal.ring} transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${Pal.bg} p-2.5 flex-shrink-0`}>
          <Icone className={`h-5 w-5 ${Pal.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold text-gray-900 group-hover:${Pal.text} transition-colors`}>{titulo}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
        </div>
        <ArrowRight className={`h-4 w-4 text-gray-400 group-hover:${Pal.text} transition-colors flex-shrink-0 mt-1`} />
      </div>
    </Link>
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
