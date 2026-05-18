import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCw, Building2, ChevronDown,
  Users, Fuel, Package, Store, ShoppingCart, TrendingUp, Percent,
  Search, Coins, Calendar, BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import { useClienteSession } from '../../../hooks/useAuth';
import * as autosystemService from '../../../services/autosystemService';
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

// Paletas das categorias (alinhadas com o resto do portal)
const CAT_PALETA = {
  combustivel:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icone: Fuel,    chartFill: '#fcd34d' },
  automotivos:  { bg: 'bg-blue-50',    text: 'text-blue-700',    icone: Package, chartFill: '#93c5fd' },
  conveniencia: { bg: 'bg-emerald-50', text: 'text-emerald-700', icone: Store,   chartFill: '#86efac' },
};

export default function ClienteComercialProdutividade() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set(empresasDisponiveis.map(c => c.id))
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

  // Período: usuário escolhe data inicial e final. Default = mês atual.
  const [dataDe, setDataDe] = useState(primeiroDiaDoMesIso());
  const [dataAte, setDataAte] = useState(isoHoje());
  const periodoDias = useMemo(() => diasEntre(dataDe, dataAte), [dataDe, dataAte]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  // Mapa de grupos por categoria (vem da classificação salva no Supabase)
  const [gruposPorCat, setGruposPorCat] = useState({
    combustivel: [], automotivos: [], conveniencia: [],
  });

  const redeId = asRede?.id;

  // Carrega mapeamento de grupos → categoria uma vez por rede
  useEffect(() => {
    if (!redeId) { setGruposPorCat({ combustivel: [], automotivos: [], conveniencia: [] }); return; }
    (async () => {
      try {
        const lista = await autosystemService.listarGruposProdutoRede(redeId);
        const out = { combustivel: [], automotivos: [], conveniencia: [] };
        (lista || []).forEach(g => {
          if (g.grid == null) return;
          if (out[g.categoria]) out[g.categoria].push(Number(g.grid));
        });
        setGruposPorCat(out);
      } catch { /* noop */ }
    })();
  }, [redeId]);

  async function carregar() {
    if (!redeId || empresasSel.length === 0) return;
    if (!dataDe || !dataAte || dataDe > dataAte) return;
    setLoading(true);
    setErro('');
    try {
      const codigos = empresasSel.map(e => Number(e.empresa_codigo)).filter(Number.isFinite);
      const rows = await autosystemService.buscarProdutividadeAutosystem(redeId, codigos, {
        data_de: dataDe, data_ate: dataAte,
        grupos_combustivel:  gruposPorCat.combustivel,
        grupos_automotivos:  gruposPorCat.automotivos,
        grupos_conveniencia: gruposPorCat.conveniencia,
      });
      setVendedores(rows || []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar produtividade');
      setVendedores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [redeId, empresasSelIds, dataDe, dataAte, gruposPorCat]);

  // Empresa map (para mostrar nome na tabela quando multi-empresa)
  const mapaEmpresas = useMemo(() => {
    const m = new Map();
    empresasDisponiveis.forEach(e => {
      const c = Number(e.empresa_codigo);
      if (Number.isFinite(c)) m.set(c, e.nome || `Empresa ${c}`);
    });
    return m;
  }, [empresasDisponiveis]);
  const multiEmpresa = empresasSel.length > 1;

  // Enriquece cada vendedor com derivações (lucro, margem, ticket)
  const vendedoresEnriquecidos = useMemo(() => {
    return (vendedores || []).map(v => {
      const fatTotal = Number(v.fat_total) || 0;
      const custoTotal = Number(v.custo_total) || 0;
      const qtdTotal = Number(v.qtd_total) || 0;
      const transacoes = Number(v.transacoes_count) || 0;
      const lucroTotal = fatTotal - custoTotal;
      const margem = fatTotal > 0 ? (lucroTotal / fatTotal) * 100 : 0;
      const ticketMedio = transacoes > 0 ? fatTotal / transacoes : 0;
      const lucroCombustivel  = (Number(v.fat_combustivel)  || 0) - (Number(v.custo_combustivel)  || 0);
      const lucroAutomotivos  = (Number(v.fat_automotivos)  || 0) - (Number(v.custo_automotivos)  || 0);
      const lucroConveniencia = (Number(v.fat_conveniencia) || 0) - (Number(v.custo_conveniencia) || 0);
      return {
        ...v,
        fatTotal, custoTotal, qtdTotal, lucroTotal, margem, ticketMedio, transacoes,
        abastecimentos:    Number(v.abastecimentos)        || 0,
        qtdCombustivel:    Number(v.qtd_combustivel)       || 0,
        fatCombustivel:    Number(v.fat_combustivel)       || 0,
        lucroCombustivel,
        vendasAutomotivos: Number(v.vendas_automotivos)    || 0,
        fatAutomotivos:    Number(v.fat_automotivos)       || 0,
        lucroAutomotivos,
        vendasConveniencia:Number(v.vendas_conveniencia)   || 0,
        fatConveniencia:   Number(v.fat_conveniencia)      || 0,
        lucroConveniencia,
      };
    });
  }, [vendedores]);

  // Filtrados por busca (nome)
  const vendedoresFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return vendedoresEnriquecidos;
    return vendedoresEnriquecidos.filter(v => (v.vendedor_nome || '').toLowerCase().includes(q));
  }, [vendedoresEnriquecidos, busca]);

  // KPIs
  const kpis = useMemo(() => {
    let totFat = 0, totLucro = 0, totLitros = 0, totAbast = 0, totVendas = 0;
    vendedoresEnriquecidos.forEach(v => {
      totFat   += v.fatTotal;
      totLucro += v.lucroTotal;
      totLitros += v.qtdCombustivel;
      totAbast += v.abastecimentos;
      totVendas += v.transacoes;
    });
    const margemMedia = totFat > 0 ? (totLucro / totFat) * 100 : 0;
    return {
      totalVendedores: vendedoresEnriquecidos.length,
      faturamento: totFat, lucro: totLucro, margem: margemMedia,
      litros: totLitros, abastecimentos: totAbast, vendas: totVendas,
    };
  }, [vendedoresEnriquecidos]);

  // Top 10 por faturamento (para gráfico)
  const top10 = useMemo(
    () => vendedoresEnriquecidos.slice(0, 10).map(v => ({
      nome: v.vendedor_nome || `cód ${v.vendedor_codigo}`,
      faturamento: v.fatTotal,
      lucro: v.lucroTotal,
    })),
    [vendedoresEnriquecidos],
  );

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Produtividade" description="Vendas por vendedor" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Produtividade" description={asRede?.nome || 'Vendas por vendedor'}>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} max={dataAte}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          <span className="text-[10px] text-gray-400">e</span>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} min={dataDe}
            className="h-9 rounded-lg border border-gray-200 px-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
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
        <button onClick={carregar} disabled={loading || empresasSel.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm">Carregando produtividade...</span>
        </div>
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
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 mb-3">
            <Users className="h-6 w-6 text-violet-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum vendedor encontrado no período</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
            <Kpi icone={Users}        cor="violet" label="Vendedores ativos" valor={fmtNum(kpis.totalVendedores)} />
            <Kpi icone={ShoppingCart} cor="violet" label={`Faturamento · ${periodoDias}d`} valor={formatCurrency(kpis.faturamento)} />
            <Kpi icone={TrendingUp}   cor="emerald" label="Lucro bruto" valor={formatCurrency(kpis.lucro)}
              negativo={kpis.lucro < 0} />
            <Kpi icone={Percent}      cor="emerald" label="Margem média" valor={`${kpis.margem.toFixed(1)}%`} />
            <Kpi icone={Fuel}         cor="amber"  label="Litros vendidos" valor={`${fmtNum(kpis.litros, 0)} L`} />
            <Kpi icone={Coins}        cor="blue"   label="Abastecimentos" valor={fmtNum(kpis.abastecimentos)}
              sub={`${fmtNum(kpis.vendas)} vendas total`} />
          </div>

          {/* Top 10 ranking */}
          {top10.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Top 10 · Faturamento por vendedor</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={Math.max(180, top10.length * 36)}>
                  <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number"
                      tickFormatter={(v) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`}
                      tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                    <YAxis type="category" dataKey="nome" width={170}
                      tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === 'Faturamento') return [formatCurrency(value), name];
                        return [value, name];
                      }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Bar dataKey="faturamento" name="Faturamento" radius={[0, 4, 4, 0]}>
                      {top10.map((_, i) => (
                        <Cell key={`top-${i}`} fill={i === 0 ? '#7c3aed' : '#c4b5fd'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabela de vendedores */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Detalhamento por vendedor</h3>
                <span className="text-[11px] text-gray-400">
                  · {fmtNum(vendedoresFiltrados.length)} / {fmtNum(vendedoresEnriquecidos.length)} · últimos {periodoDias} dias
                </span>
              </div>
              <div className="flex-1" />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por vendedor..."
                  className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-center w-10">#</th>
                    <th className="px-3 py-2 text-left">Vendedor</th>
                    {multiEmpresa && <th className="px-3 py-2 text-left border-l border-gray-100">Empresa</th>}
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300">Vendas</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Ticket médio</th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Lucro</th>
                    <th className="px-3 py-2 text-right border-l border-gray-100">Margem</th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300" title="Combustível">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Fuel className="h-3 w-3 text-amber-600" /> Combust.
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300" title="Automotivos">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Package className="h-3 w-3 text-blue-600" /> Automot.
                      </span>
                    </th>
                    <th className="px-3 py-2 text-right border-l-2 border-gray-300" title="Conveniência">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Store className="h-3 w-3 text-emerald-600" /> Conven.
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendedoresFiltrados.map((v, i) => (
                    <tr key={`${v.empresa}-${v.vendedor_codigo}`} className="hover:bg-violet-50/30 transition-colors">
                      <td className="px-3 py-1.5 text-center font-mono text-[11px] text-violet-700 font-semibold">
                        {i + 1}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className="text-[12.5px] font-semibold text-gray-900 truncate max-w-[260px]">
                          {v.vendedor_nome || <span className="italic text-gray-400">sem nome</span>}
                        </p>
                        <p className="text-[9.5px] text-gray-400 font-mono">cód {v.vendedor_codigo}</p>
                      </td>
                      {multiEmpresa && (
                        <td className="px-3 py-1.5 text-[11.5px] text-gray-600 border-l border-gray-100 truncate max-w-[140px]">
                          {mapaEmpresas.get(Number(v.empresa)) || `Empresa ${v.empresa}`}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-700 border-l-2 border-gray-300">
                        {fmtNum(v.transacoes)}
                        <span className="block text-[9.5px] text-gray-400">{fmtNum(v.abastecimentos)} abast.</span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-700 border-l border-gray-100">
                        {formatCurrency(v.ticketMedio)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">
                        {formatCurrency(v.fatTotal)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${v.lucroTotal < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                        {formatCurrency(v.lucroTotal)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${v.margem < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {v.margem.toFixed(1)}%
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l-2 border-gray-300">
                        {v.fatCombustivel > 0 ? formatCurrency(v.fatCombustivel) : <span className="text-gray-300">—</span>}
                        {v.qtdCombustivel > 0 && (
                          <span className="block text-[9.5px] text-gray-400">{fmtNum(v.qtdCombustivel, 0)} L</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l-2 border-gray-300">
                        {v.fatAutomotivos > 0 ? formatCurrency(v.fatAutomotivos) : <span className="text-gray-300">—</span>}
                        {v.vendasAutomotivos > 0 && (
                          <span className="block text-[9.5px] text-gray-400">{fmtNum(v.vendasAutomotivos)} vendas</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] text-gray-800 border-l-2 border-gray-300">
                        {v.fatConveniencia > 0 ? formatCurrency(v.fatConveniencia) : <span className="text-gray-300">—</span>}
                        {v.vendasConveniencia > 0 && (
                          <span className="block text-[9.5px] text-gray-400">{fmtNum(v.vendasConveniencia)} vendas</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// KPI card
function Kpi({ icone: Icone, cor, label, valor, sub, negativo }) {
  const palette = {
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600' },
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

// Multi-select de empresas (mesmo padrão da Operação)
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
