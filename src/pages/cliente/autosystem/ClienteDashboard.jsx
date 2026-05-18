import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown,
  ShoppingCart, TrendingUp, Percent, Fuel, Coins, Droplet,
  Users, Package, Store, Activity, Gauge,
  ArrowRight, ArrowUpRight, LineChart as LineChartIcon, BarChart3,
  Calendar, AlertTriangle, Clock,
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
  const [loading, setLoading] = useState(false);
  const [loadingCP, setLoadingCP] = useState(false);
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
  }, [redeId, empresasSelIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Distribuição por categoria (donut)
  const categoriaDonut = useMemo(() => [
    { nome: 'Combustível',  valor: totais.cats.combustivel.fat,  cor: '#fcd34d' },
    { nome: 'Automotivos',  valor: totais.cats.automotivos.fat,  cor: '#93c5fd' },
    { nome: 'Conveniência', valor: totais.cats.conveniencia.fat, cor: '#86efac' },
  ].filter(c => c.valor > 0), [totais]);

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
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
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

          {/* Contas a pagar */}
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

          {/* Quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <QuickLink to="/cliente/autosystem/comercial/vendas"
              icone={ShoppingCart} cor="violet" titulo="Vendas"
              desc="Análise detalhada por categoria, grupo e produto" />
            <QuickLink to="/cliente/autosystem/comercial/operacao"
              icone={Activity}     cor="blue"   titulo="Operação"
              desc="Bombas, bicos, uso e aferições" />
            <QuickLink to="/cliente/autosystem/comercial/produtividade"
              icone={Gauge}        cor="amber"  titulo="Produtividade"
              desc="Performance e ranking de vendedores" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {/* Gráfico 12 meses */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-violet-500" />
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

            {/* Donut por categoria */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Por categoria · mês</h3>
              </div>
              <div className="p-3">
                {categoriaDonut.length === 0 ? (
                  <div className="h-72 flex items-center justify-center text-sm text-gray-400">
                    Sem vendas no mês.
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
                        const pct = totais.fat > 0 ? (c.valor / totais.fat) * 100 : 0;
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
              <Users className="h-4 w-4 text-violet-500" />
              <h3 className="text-[13px] font-semibold text-gray-800">Top vendedores · mês</h3>
              <Link to="/cliente/autosystem/comercial/produtividade"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-violet-700 hover:text-violet-900 font-medium">
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
                        <tr key={`${v.empresa}-${v.vendedor_codigo}`} className="hover:bg-violet-50/30 transition-colors">
                          <td className="px-3 py-1.5 text-center font-mono text-[11px] text-violet-700 font-semibold">
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
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600' },
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
    rose:  { bg: 'bg-rose-50',  icon: 'text-rose-600',  text: 'text-rose-700'  },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', text: 'text-amber-700' },
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  text: 'text-blue-700'  },
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

function QuickLink({ to, icone: Icone, cor, titulo, desc }) {
  const palette = {
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'hover:ring-violet-200',  text: 'text-violet-700' },
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
            aberto ? 'border-violet-400 ring-2 ring-violet-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
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
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
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
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 mt-0.5" />
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
