// Componentes das sub-abas avançadas da página Vendas (Combustíveis +
// Auto/Conv). Portados do Autosystem com adaptações pra os dados que
// o Webposto produz (via cci_webposto_vendas_comercial RPC).

/* eslint-disable react/prop-types */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Fuel, ChevronDown, ChevronRight, Loader2, AlertCircle,
  Package, ShoppingCart, Search, TrendingDown, Calendar, Percent,
  LineChart as LineChartIcon,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
// (motion/AnimatePresence/icons já importados acima)
import { formatCurrency } from '../../utils/format';
import { formatDataBR, diaSemanaCurto, formatNumero, ChipVariacaoSemanal } from './VendasCompartilhado';

// ─── Helpers e constantes ───────────────────────────────────────

const COR_BAR_LITROS  = '#fde68a'; // amber-200
const COR_BAR_LUCROL  = '#a7f3d0'; // emerald-200
const COR_LINHA       = '#a78bfa';
const COR_LINHA_DOT   = '#c4b5fd';
const COR_MELHOR      = '#10b981';
const COR_PIOR        = '#f43f5e';

const DIAS_SEMANA_HEAT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function acharMelhorPior(serie, campo) {
  const comDado = (serie || [])
    .map((p, idx) => ({ idx, valor: Number(p[campo]) || 0, temDado: p.faturamento > 0 || p.litros > 0 }))
    .filter(p => p.temDado);
  if (comDado.length === 0) return { melhor: -1, pior: -1 };
  const melhor = comDado.reduce((a, b) => b.valor > a.valor ? b : a);
  const pior   = comDado.reduce((a, b) => b.valor < a.valor ? b : a);
  return { melhor: melhor.idx, pior: melhor.idx === pior.idx ? -1 : pior.idx };
}

function makeDotRenderer(melhor, pior) {
  return (props) => {
    const { cx, cy, index, key } = props;
    if (cx == null || cy == null) return null;
    if (index === melhor) return <circle key={key || index} cx={cx} cy={cy} r={6} fill={COR_MELHOR} stroke="#fff" strokeWidth={2} />;
    if (index === pior)   return <circle key={key || index} cx={cx} cy={cy} r={6} fill={COR_PIOR}   stroke="#fff" strokeWidth={2} />;
    return <circle key={key || index} cx={cx} cy={cy} r={3} fill={COR_LINHA_DOT} stroke={COR_LINHA} strokeWidth={1} />;
  };
}

function LabelVariacaoMA(props) {
  const { x, y, width, value } = props;
  if (value == null || !Number.isFinite(value)) return null;
  const cor = Math.abs(value) < 0.5 ? '#94a3b8' : value > 0 ? '#059669' : '#e11d48';
  const texto = `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  return (
    <text x={x + width / 2} y={y - 4} fill={cor} textAnchor="middle" fontSize={10} fontWeight={600}>
      {texto}
    </text>
  );
}

function corHeatmap(valor, maxValor) {
  if (!valor || valor <= 0 || maxValor === 0) return { bg: '#f9fafb', text: '#9ca3af' };
  const r = valor / maxValor;
  if (r < 0.15) return { bg: '#fffbeb', text: '#78350f' };
  if (r < 0.30) return { bg: '#fef3c7', text: '#78350f' };
  if (r < 0.50) return { bg: '#fde68a', text: '#78350f' };
  if (r < 0.70) return { bg: '#fcd34d', text: '#7c2d12' };
  if (r < 0.90) return { bg: '#fbbf24', text: '#7c2d12' };
  return                 { bg: '#f59e0b', text: '#ffffff' };
}

function LegendaMelhorPior({ melhorRotulo, piorRotulo }) {
  if (!melhorRotulo && !piorRotulo) return null;
  return (
    <div className="flex items-center gap-2 text-[10.5px]">
      {melhorRotulo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_MELHOR }} />
          Melhor: <strong className="font-semibold">{melhorRotulo}</strong>
        </span>
      )}
      {piorRotulo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_PIOR }} />
          Pior: <strong className="font-semibold">{piorRotulo}</strong>
        </span>
      )}
    </div>
  );
}

// ─── CelulaNumero (local, simplificada) ─────────────────────────

const BARRA_CORES = {
  blue:    'bg-blue-400/70',
  emerald: 'bg-emerald-400/70',
  violet:  'bg-violet-400/70',
  amber:   'bg-amber-400/70',
};
function CelulaNumero({ valor, moeda = true, decimais = 0, sufixo = '', sub, negativoBg = true, divisor = 'leve', barraMax, barraCor = 'blue', corTexto, onClick }) {
  const negativo = negativoBg && valor < 0;
  const txt = moeda ? formatCurrency(valor) : `${formatNumero(valor, decimais)}${sufixo}`;
  const temBarra = barraMax != null && barraMax > 0 && valor > 0;
  const pctBarra = temBarra ? Math.min(100, (Number(valor) / Number(barraMax)) * 100) : 0;
  const cls = [
    'px-2.5 py-2 text-right align-top whitespace-nowrap',
    temBarra ? 'relative pb-3' : '',
    divisor === 'forte' ? 'border-l-2 border-gray-300' : '',
    divisor === 'leve'  ? 'border-l border-gray-100'   : '',
    onClick ? 'cursor-pointer' : '',
  ].filter(Boolean).join(' ');
  const corValor = negativo
    ? 'text-red-700'
    : (corTexto && Number(valor) > 0 ? corTexto : 'text-gray-900');
  return (
    <td className={cls} onClick={onClick}>
      <p className={`font-mono tabular-nums text-[12px] font-semibold leading-tight ${corValor}`}>{txt}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
      {temBarra && (
        <div className="absolute left-2 right-2 bottom-1 h-1 rounded-full overflow-hidden bg-gray-100">
          <div className={`h-full rounded-full ${BARRA_CORES[barraCor]}`} style={{ width: `${pctBarra}%` }} />
        </div>
      )}
    </td>
  );
}

// ─── 1. TreeRealizadoPorCombustivel ─────────────────────────────
// Tree Produto → Data (inverso do "Realizado dia a dia")

export function TreeRealizadoPorCombustivel({ arvore, expandidos, onToggle }) {
  function calcAux(s) {
    const margem    = s.valor > 0 ? (s.valor - s.custo) / s.valor : 0;
    const precoMed  = s.qtd   > 0 ? s.valor / s.qtd : 0;
    const custoMed  = s.qtd   > 0 ? s.custo / s.qtd : 0;
    const lucroL    = s.qtd   > 0 ? (s.valor - s.custo) / s.qtd : 0;
    const lucro     = s.valor - s.custo;
    return { lucro, margem, precoMed, custoMed, lucroL };
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Produto / Data</th>
            <th className="px-2.5 py-2 text-center border-l-2 border-gray-300">Dia</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Litros</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Δ Sem.</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Lucro bruto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Acréscimos</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Descontos</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Margem</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-100">Lucro / L</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(prodNode => {
            const pKey = `prod:${prodNode.codigo}`;
            const aberto = expandidos.has(pKey);
            const aux = calcAux(prodNode.stats);
            return (
              <React.Fragment key={pKey}>
                <tr className="cursor-pointer bg-amber-50/40 hover:bg-amber-50/70 border-t border-amber-100"
                  onClick={() => onToggle(pKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {aberto
                        ? <ChevronDown className="h-3.5 w-3.5 text-amber-600" />
                        : <ChevronRight className="h-3.5 w-3.5 text-amber-600" />}
                      <Fuel className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-[11px] font-semibold text-gray-900 truncate">{prodNode.nome}</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-[11px] text-gray-300 border-l-2 border-gray-300">—</td>
                  <CelulaNumero valor={prodNode.stats.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                  <td className="px-2.5 py-2.5 text-right border-l border-gray-100">
                    <span className="text-[10px] text-gray-300 tabular-nums">—</span>
                  </td>
                  <CelulaNumero valor={prodNode.stats.valor} divisor="forte" />
                  <CelulaNumero valor={aux.lucro} divisor="forte" />
                  <CelulaNumero valor={prodNode.stats.acresc} divisor="forte" corTexto="text-emerald-700" />
                  <CelulaNumero valor={prodNode.stats.desc} divisor="leve" corTexto="text-red-700" />
                  <CelulaNumero valor={aux.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                  <CelulaNumero valor={aux.precoMed} divisor="forte" />
                  <CelulaNumero valor={aux.custoMed} divisor="leve" />
                  <CelulaNumero valor={aux.lucroL} divisor="leve" />
                </tr>
                {aberto && prodNode.dias.map((d, idx) => {
                  const auxD = calcAux({ qtd: d.qtd, valor: d.valor, custo: d.custo });
                  return (
                    <tr key={`${pKey}/d:${d.dia}`}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30`}>
                      <td className="pl-10 pr-3 py-1.5">
                        <p className="text-[12px] text-gray-700">{formatDataBR(d.dia)}</p>
                      </td>
                      <td className="px-2.5 py-1.5 text-center text-[11px] font-medium text-gray-600 border-l-2 border-gray-300">
                        {diaSemanaCurto(d.dia)}
                      </td>
                      <CelulaNumero valor={d.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                      <td className="px-2.5 py-1.5 text-right border-l border-gray-100">
                        <ChipVariacaoSemanal pct={d.varSemana} />
                      </td>
                      <CelulaNumero valor={d.valor} divisor="forte" />
                      <CelulaNumero valor={auxD.lucro} divisor="forte" />
                      <CelulaNumero valor={d.acresc} divisor="forte" corTexto="text-emerald-700" />
                      <CelulaNumero valor={d.desc} divisor="leve" corTexto="text-red-700" />
                      <CelulaNumero valor={auxD.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                      <CelulaNumero valor={auxD.precoMed} divisor="forte" />
                      <CelulaNumero valor={auxD.custoMed} divisor="leve" />
                      <CelulaNumero valor={auxD.lucroL} divisor="leve" />
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 2. HeatmapSemanal ──────────────────────────────────────────

export function HeatmapSemanal({ dados, contagemDias }) {
  const max = useMemo(() => {
    let m = 0;
    (dados || []).forEach(p => p.porDia.forEach(v => { if (v > m) m = v; }));
    return m;
  }, [dados]);
  const totalPorDia = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    (dados || []).forEach(p => p.porDia.forEach((v, i) => { t[i] += v; }));
    return t;
  }, [dados]);
  const totalGeral = totalPorDia.reduce((s, v) => s + v, 0);
  const totalDias = contagemDias?.total || 0;
  const porDiaCount = contagemDias?.porDia || [0, 0, 0, 0, 0, 0, 0];
  const media = (total, count) => (count > 0 ? total / count : 0);

  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-separate table-fixed" style={{ borderSpacing: '4px' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            {DIAS_SEMANA_HEAT.map(d => <col key={d} style={{ width: '9.5%' }} />)}
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 text-left">Combustível</th>
              {DIAS_SEMANA_HEAT.map(d => (
                <th key={d} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-2 text-center">{d}</th>
              ))}
              <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(p => (
              <tr key={p.codigo}>
                <td className="px-3 py-1.5 text-[12px] font-medium text-gray-800 whitespace-nowrap pr-4">
                  <div className="flex items-center gap-1.5">
                    <Fuel className="h-3 w-3 text-amber-600 flex-shrink-0" />
                    <span className="truncate max-w-[200px]">{p.nome}</span>
                  </div>
                </td>
                {p.porDia.map((v, idx) => {
                  const c = corHeatmap(v, max);
                  const cnt = porDiaCount[idx];
                  return (
                    <td key={idx}
                      className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums transition-transform hover:scale-105 hover:ring-1 hover:ring-amber-500"
                      style={{ background: c.bg, color: c.text }}>
                      <div className="text-[11.5px] font-semibold leading-tight">{v > 0 ? formatNumero(v, 0) : '—'}</div>
                      {v > 0 && cnt > 0 && (
                        <div className="text-[9px] opacity-70 leading-tight mt-0.5">média {formatNumero(media(v, cnt), 0)}/dia</div>
                      )}
                    </td>
                  );
                })}
                <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                  <div className="text-[11.5px] font-bold leading-tight">{formatNumero(p.total, 0)}</div>
                  {totalDias > 0 && (
                    <div className="text-[9px] text-gray-500 leading-tight mt-0.5">média {formatNumero(media(p.total, totalDias), 0)}/dia</div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap pr-4 border-t border-gray-200">Total</td>
              {totalPorDia.map((v, idx) => {
                const cnt = porDiaCount[idx];
                return (
                  <td key={idx} className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-gray-100 text-gray-800">
                    <div className="text-[11.5px] font-bold leading-tight">{v > 0 ? formatNumero(v, 0) : '—'}</div>
                    {v > 0 && cnt > 0 && (
                      <div className="text-[9px] text-gray-500 leading-tight mt-0.5">média {formatNumero(media(v, cnt), 0)}/dia</div>
                    )}
                  </td>
                );
              })}
              <td className="rounded-md text-center px-2 py-1.5 font-mono tabular-nums bg-amber-100 text-amber-900">
                <div className="text-[11.5px] font-bold leading-tight">{formatNumero(totalGeral, 0)}</div>
                {totalDias > 0 && (
                  <div className="text-[9px] text-amber-700 leading-tight mt-0.5">média {formatNumero(media(totalGeral, totalDias), 0)}/dia</div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-400 mt-3 px-1">
        Valores em litros. Intensidade da cor proporcional ao total da célula (escala global, max = <strong className="text-gray-600">{formatNumero(max, 0)} L</strong>).
      </p>
    </div>
  );
}

// ─── Paletas e helpers Auto/Conv ────────────────────────────────

const TREE_PALETAS = {
  blue: {
    bgHeader: 'bg-blue-50/40', hoverHeader: 'hover:bg-blue-50/70',
    borderTop: 'border-blue-100',
    chevron: 'text-blue-600', icon: 'text-blue-600', iconSub: 'text-blue-500',
    hoverLeaf: 'hover:bg-blue-50/30',
    kpiText: 'text-blue-700', kpiRing: 'ring-blue-200',
    kpiBg: 'bg-blue-50', kpiBorder: 'border-blue-100', kpiBorderStrong: 'border-blue-300',
    kpiGradient: 'bg-gradient-to-br from-blue-50/60 to-blue-50/40',
    chartIcon: 'text-blue-500', chartBar: '#99f6e4',
    spinner: 'text-blue-600', emptyBg: 'bg-blue-50', emptyIcon: 'text-blue-600',
    focusBorder: 'focus:border-blue-400', focusRing: 'focus:ring-blue-100',
  },
  emerald: {
    bgHeader: 'bg-emerald-50/40', hoverHeader: 'hover:bg-emerald-50/70',
    borderTop: 'border-emerald-100',
    chevron: 'text-emerald-600', icon: 'text-emerald-600', iconSub: 'text-emerald-500',
    hoverLeaf: 'hover:bg-emerald-50/30',
    kpiText: 'text-emerald-700', kpiRing: 'ring-emerald-200',
    kpiBg: 'bg-emerald-50', kpiBorder: 'border-emerald-100', kpiBorderStrong: 'border-emerald-300',
    kpiGradient: 'bg-gradient-to-br from-emerald-50/60 to-teal-50/40',
    chartIcon: 'text-emerald-500', chartBar: '#a7f3d0',
    spinner: 'text-emerald-600', emptyBg: 'bg-emerald-50', emptyIcon: 'text-emerald-600',
    focusBorder: 'focus:border-emerald-400', focusRing: 'focus:ring-emerald-100',
  },
};

const PARETO_METAS = [60, 70, 80, 90];
const CARRINHO_MIN_OPTS = [2, 5, 10, 20, 50];
const CARRINHO_PERIODO_OPTS = [30, 60, 90, 180];

// Dropdown multi-select genérico com busca
export function GrupoMultiSelect({ grupos, selecionadas, onToggle, onToggleTodos, tipo = 'grupo', minWidth = 240 }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => { if (!aberto) setBusca(''); }, [aberto]);
  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(g => (g.nome || '').toLowerCase().includes(q));
  }, [grupos, busca]);
  const todosMarcados = selecionadas.size > 0 && selecionadas.size === grupos.length;
  const plural = `${tipo}s`;
  const label = selecionadas.size === 0
    ? `Todos os ${plural} (${grupos.length})`
    : todosMarcados ? `Todos (${grupos.length})`
    : selecionadas.size === 1
      ? grupos.find(g => selecionadas.has(g.codigo))?.nome || `1 ${tipo}`
      : `${selecionadas.size} ${plural}`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(o => !o)}
        style={{ minWidth }}
        className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-[12px] transition-colors ${
          aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800 bg-white'
                 : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
        }`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <div className="relative border-b border-gray-100">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder={`Buscar ${tipo}...`} autoFocus
                className="w-full pl-8 pr-3 py-2 text-[12px] bg-transparent outline-none" />
            </div>
            <button type="button" onClick={onToggleTodos}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 text-left">
              <input type="checkbox" checked={todosMarcados} onChange={() => {}}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {gruposFiltrados.length === 0 ? (
                <p className="px-3 py-4 text-center text-[12px] text-gray-400">Nenhum {tipo} encontrado</p>
              ) : gruposFiltrados.map(g => {
                const marcada = selecionadas.has(g.codigo);
                return (
                  <label key={g.codigo}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={marcada} onChange={() => onToggle(g.codigo)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <p className="text-[12px] text-gray-800 truncate">{g.nome}</p>
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

// ─── 4. TreeRealizadoAutoGrupo (Grupo → Dia → Produto) ──────────

export function TreeRealizadoAutoGrupo({ arvore, expandidos, onToggle, cor = 'blue' }) {
  const Pal = TREE_PALETAS[cor];
  function calc(s) {
    const lucro = s.valor - s.custo;
    const margem = s.valor > 0 ? lucro / s.valor : 0;
    const precoMed = s.qtd > 0 ? s.valor / s.qtd : 0;
    const custoMed = s.qtd > 0 ? s.custo / s.qtd : 0;
    const lucroMed = s.qtd > 0 ? lucro / s.qtd : 0;
    return { lucro, margem, precoMed, custoMed, lucroMed };
  }
  function LinhaStats({ s }) {
    const c = calc(s);
    return (
      <>
        <CelulaNumero valor={s.qtd} moeda={false} decimais={2} divisor="forte" />
        <CelulaNumero valor={s.valor} divisor="forte" />
        <CelulaNumero valor={s.custo} divisor="leve" />
        <CelulaNumero valor={c.lucro} divisor="forte" />
        <CelulaNumero valor={c.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
        <CelulaNumero valor={c.precoMed} divisor="forte" />
        <CelulaNumero valor={c.custoMed} divisor="leve" />
        <CelulaNumero valor={c.lucroMed} divisor="leve" />
      </>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Grupo / Data / Produto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Qtd</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Custo</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Lucro bruto</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Margem</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Preço méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Custo méd.</th>
            <th className="px-2.5 py-2 text-right border-l border-gray-200">Lucro méd.</th>
          </tr>
        </thead>
        <tbody>
          {arvore.map(gNode => {
            const gKey = `aG:${gNode.codigo ?? 'none'}`;
            const gAberto = expandidos.has(gKey);
            return (
              <React.Fragment key={gKey}>
                <tr className={`cursor-pointer ${Pal.bgHeader} ${Pal.hoverHeader} border-t ${Pal.borderTop}`}
                  onClick={() => onToggle(gKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {gAberto ? <ChevronDown className={`h-3.5 w-3.5 ${Pal.chevron}`} /> : <ChevronRight className={`h-3.5 w-3.5 ${Pal.chevron}`} />}
                      <Package className={`h-3.5 w-3.5 ${Pal.icon}`} />
                      <span className="text-[12.5px] font-semibold text-gray-900 truncate">{gNode.nome}</span>
                    </div>
                  </td>
                  <LinhaStats s={gNode.stats} />
                </tr>
                {gAberto && gNode.dias.map(dNode => {
                  const dKey = `${gKey}/d:${dNode.dia}`;
                  const dAberto = expandidos.has(dKey);
                  return (
                    <React.Fragment key={dKey}>
                      <tr className="cursor-pointer bg-gray-50/50 hover:bg-gray-100/70" onClick={() => onToggle(dKey)}>
                        <td className="pl-10 pr-3 py-2">
                          <div className="flex items-center gap-2">
                            {dAberto ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                            <span className="text-[12px] font-medium text-gray-800">{formatDataBR(dNode.dia)}</span>
                            <span className="text-[10px] text-gray-500">{diaSemanaCurto(dNode.dia)}</span>
                          </div>
                        </td>
                        <LinhaStats s={dNode.stats} />
                      </tr>
                      {dAberto && dNode.produtos.map((p, idx) => (
                        <tr key={`${dKey}/p:${p.codigo}`}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${Pal.hoverLeaf}`}>
                          <td className="pl-16 pr-3 py-1.5">
                            <p className="text-[11.5px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                            <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                          </td>
                          <LinhaStats s={{ qtd: p.qtd, valor: p.valor, custo: p.custo }} />
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
  );
}

// ─── 5. AnalisePareto ───────────────────────────────────────────

export function AnalisePareto({ dados, grupos, meta, onChangeMeta, gruposSel, onToggleGrupo, onToggleTodos, onLimpar, cor = 'blue' }) {
  const Pal = TREE_PALETAS[cor];
  const cutoffIdx = useMemo(() => {
    if (!dados.list.length) return -1;
    const i = dados.list.findIndex(p => p.pctAcum >= meta);
    return i === -1 ? dados.list.length - 1 : i;
  }, [dados.list, meta]);
  const dentroDaMeta = cutoffIdx >= 0 ? cutoffIdx + 1 : 0;
  const valorDentroMeta = dados.list.slice(0, dentroDaMeta).reduce((s, p) => s + p.valor, 0);
  const pctDentroDaMeta = dados.total > 0 ? (valorDentroMeta / dados.total) * 100 : 0;
  const restanteCount = Math.max(0, dados.list.length - dentroDaMeta);
  const restanteValor = Math.max(0, dados.total - valorDentroMeta);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Meta</span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {PARETO_METAS.map(m => (
              <button key={m} onClick={() => onChangeMeta(m)}
                className={`px-3 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                  meta === m ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}` : 'text-gray-600 hover:text-gray-900'
                }`}>{m}%</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect grupos={grupos} selecionadas={gruposSel}
            onToggle={onToggleGrupo} onToggleTodos={onToggleTodos} />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimpar}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md">Limpar</button>
          )}
        </div>
      </div>

      {dados.list.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-100 rounded-xl">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <Package className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum produto encontrado{gruposSel.size > 0 ? ' nos grupos selecionados' : ''}</p>
        </div>
      ) : (
        <>
          <div className={`rounded-xl ${Pal.kpiGradient} border ${Pal.kpiBorder} p-4`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-[28px] font-bold ${Pal.kpiText} leading-none`}>{dentroDaMeta}</span>
              <span className="text-[13px] text-gray-700">produto{dentroDaMeta === 1 ? '' : 's'} formam</span>
              <span className={`text-[20px] font-bold ${Pal.kpiText} leading-none`}>{pctDentroDaMeta.toFixed(1)}%</span>
              <span className="text-[13px] text-gray-700">do faturamento</span>
              <span className="text-[13px] font-semibold text-gray-900">({formatCurrency(valorDentroMeta)})</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              De um total de <strong className="text-gray-700">{dados.list.length}</strong> produtos · faturamento total <strong className="text-gray-700">{formatCurrency(dados.total)}</strong> · restante: <strong className="text-gray-700">{restanteCount}</strong> produto{restanteCount === 1 ? '' : 's'} ({formatCurrency(restanteValor)})
            </p>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-center w-10">#</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Qtd</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Faturamento</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">% do total</th>
                  <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">% acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.list.map((p, i) => {
                  const dentro = i <= cutoffIdx;
                  return (
                    <React.Fragment key={p.codigo}>
                      <tr className={dentro ? `bg-white ${Pal.hoverLeaf}` : 'bg-gray-50/40 text-gray-400 hover:bg-gray-100/60'}>
                        <td className={`px-3 py-1.5 text-center font-mono text-[11px] ${dentro ? `${Pal.kpiText} font-semibold` : 'text-gray-400'}`}>{i + 1}</td>
                        <td className="px-4 py-1.5">
                          <p className={`text-[12px] truncate max-w-[400px] ${dentro ? 'text-gray-800' : 'text-gray-500'}`}>{p.nome}</p>
                          <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}{p.grupoNome ? ` · ${p.grupoNome}` : ''}</p>
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] border-l border-gray-100">{formatNumero(p.qtd, 2)}</td>
                        <td className={`px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${dentro ? 'text-gray-900' : ''}`}>{formatCurrency(p.valor)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] border-l border-gray-100">{p.pct.toFixed(2)}%</td>
                        <td className={`px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold border-l border-gray-100 ${dentro ? Pal.kpiText : 'text-gray-500'}`}>{p.pctAcum.toFixed(2)}%</td>
                      </tr>
                      {i === cutoffIdx && (i + 1) < dados.list.length && (
                        <tr className={`${Pal.kpiBg} border-y-2 ${Pal.kpiBorderStrong}`}>
                          <td colSpan={6} className={`px-4 py-1.5 text-center text-[11px] font-semibold ${Pal.kpiText}`}>
                            ↑ Top {dentroDaMeta} = {pctDentroDaMeta.toFixed(1)}% · ↓ Restantes {restanteCount} = {(100 - pctDentroDaMeta).toFixed(1)}%
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 6. AnaliseMargem (heatmap por produto) ─────────────────────

export function AnaliseMargem({ loading, produtos, grupos, cor = 'blue' }) {
  const Pal = TREE_PALETAS[cor];
  const [gruposSel, setGruposSel] = useState(() => new Set());
  const [busca, setBusca] = useState('');
  const [soNegativa, setSoNegativa] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter(p => {
      if (gruposSel.size > 0 && !gruposSel.has(p.grupo_codigo)) return false;
      if (soNegativa && !(p.margem < 0)) return false;
      if (q) {
        const nome = String(p.produto_nome || '').toLowerCase();
        const cod = String(p.produto_codigo || '');
        if (!nome.includes(q) && !cod.includes(q)) return false;
      }
      return true;
    });
  }, [produtos, gruposSel, busca, soNegativa]);

  const totais = useMemo(() => {
    let valor = 0, custo = 0;
    filtrados.forEach(p => { valor += p.valor; custo += p.custo; });
    const lucro = valor - custo;
    return { valor, custo, lucro, margem: valor > 0 ? (lucro / valor) * 100 : 0 };
  }, [filtrados]);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className={`h-5 w-5 animate-spin ${Pal.spinner}`} /><span className="text-sm">Carregando análise...</span>
      </div>
    );
  }
  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/40 flex items-center gap-3 flex-wrap">
        <GrupoMultiSelect grupos={grupos} selecionadas={gruposSel}
          onToggle={(c) => setGruposSel(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
          onToggleTodos={() => setGruposSel(prev => prev.size === grupos.length ? new Set() : new Set(grupos.map(g => g.codigo)))} />
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto (nome ou código)..."
            className={`w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white ${Pal.focusBorder} focus:outline-none focus:ring-2 ${Pal.focusRing}`} />
        </div>
        <button type="button" onClick={() => setSoNegativa(o => !o)}
          className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors ${
            soNegativa ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100' : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-700'
          }`}>
          <TrendingDown className="h-3.5 w-3.5" />
          Só margem negativa
        </button>
        <span className="text-[11px] text-gray-500 ml-auto">{filtrados.length} de {produtos.length} produtos</span>
      </div>
      {produtos.length === 0 ? (
        <div className="p-12 text-center">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <Percent className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhuma venda no período</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="p-12 text-center text-[13px] text-gray-500">Nenhum produto corresponde aos filtros.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100 sticky top-0 z-10">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2.5">Grupo</th>
                <th className="px-4 py-2.5">Produto</th>
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5 text-right">Faturamento</th>
                <th className="px-4 py-2.5 text-right">Custo</th>
                <th className="px-4 py-2.5 text-right">Lucro bruto</th>
                <th className="px-4 py-2.5 text-right">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(p => {
                const neg = p.margem < 0;
                return (
                  <tr key={p.produto_codigo} className={neg ? 'bg-red-50/40 hover:bg-red-50/70' : `hover:${Pal.kpiBg}`}>
                    <td className="px-4 py-2 text-[12px] text-gray-700 truncate max-w-[200px]">{p.grupo_nome}</td>
                    <td className="px-4 py-2 text-[12.5px] text-gray-900 font-medium truncate max-w-[300px]">{p.produto_nome}</td>
                    <td className="px-4 py-2 text-[11px] text-gray-500 font-mono">{p.produto_codigo}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-800">{formatCurrency(p.valor)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-gray-600">{formatCurrency(p.custo)}</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] font-semibold ${neg ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(p.lucro)}</td>
                    <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12px] font-bold ${neg ? 'text-red-700' : Pal.kpiText}`}>{p.margem.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50/70 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                  Total ({filtrados.length} produto{filtrados.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900">{formatCurrency(totais.valor)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-700">{formatCurrency(totais.custo)}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucro)}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums text-[12.5px] font-bold ${totais.margem < 0 ? 'text-red-700' : Pal.kpiText}`}>{totais.margem.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 7. LinhaDoTempoAuto ────────────────────────────────────────

export function LinhaDoTempoAuto({
  loading, serie, grupos, produtos,
  gruposSel, onToggleGrupo, onToggleTodosGrupos, onLimparGrupos,
  produtosSel, onToggleProduto, onToggleTodosProdutos, onLimparProdutos,
  cor = 'blue',
}) {
  const Pal = TREE_PALETAS[cor];
  const temDados = (serie || []).some(p => p.faturamento > 0);
  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect grupos={grupos} selecionadas={gruposSel}
            onToggle={onToggleGrupo} onToggleTodos={onToggleTodosGrupos} tipo="grupo" minWidth={220} />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimparGrupos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md">Limpar</button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> Produto
          </span>
          <GrupoMultiSelect grupos={produtos} selecionadas={produtosSel}
            onToggle={onToggleProduto} onToggleTodos={onToggleTodosProdutos} tipo="produto" minWidth={240} />
          {produtosSel.size > 0 && (
            <button type="button" onClick={onLimparProdutos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md">Limpar</button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="h-72 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className={`h-5 w-5 animate-spin ${Pal.spinner}`} /><span className="text-sm">Carregando linha do tempo...</span>
        </div>
      ) : !temDados ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <Package className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm">Sem dados no período / filtros selecionados.</p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2 px-2 pb-2">
            <LineChartIcon className={`h-4 w-4 ${Pal.chartIcon}`} />
            <h4 className="text-[13px] font-semibold text-gray-800">Faturamento & Margem · últimos 12 meses</h4>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
              <YAxis yAxisId="left"
                tickFormatter={(v) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`}
                tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
              <YAxis yAxisId="right" orientation="right"
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Faturamento') return [formatCurrency(value), name];
                  if (name === 'Margem') return [`${Number(value).toFixed(1)}%`, name];
                  return [value, name];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="faturamento" name="Faturamento" fill={Pal.chartBar} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="fatVarMA" content={<LabelVariacaoMA />} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                stroke="#a78bfa" strokeWidth={2}
                dot={{ r: 3, fill: '#c4b5fd', stroke: '#a78bfa', strokeWidth: 1 }}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── 8. CarrinhoCompras ─────────────────────────────────────────

export function CarrinhoCompras({
  loading, erro, pares, totalPares, totalTransacoes,
  grupos, gruposSel, onToggleGrupo, onToggleTodos, onLimparGrupos,
  minTransacoes, onChangeMin, busca, onChangeBusca,
  periodoDias, onChangePeriodoDias,
  cor = 'blue',
}) {
  const Pal = TREE_PALETAS[cor];
  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className={`h-5 w-5 animate-spin ${Pal.spinner}`} /><span className="text-sm">Analisando cesta de compras...</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div><p className="font-medium">Não foi possível carregar a análise</p><p className="text-red-700 mt-1">{erro}</p></div>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3" /> Período
          </span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {CARRINHO_PERIODO_OPTS.map(n => (
              <button key={n} onClick={() => onChangePeriodoDias(n)}
                className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                  periodoDias === n ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}` : 'text-gray-600 hover:text-gray-900'
                }`}>{n}d</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Grupo
          </span>
          <GrupoMultiSelect grupos={grupos} selecionadas={gruposSel}
            onToggle={onToggleGrupo} onToggleTodos={onToggleTodos} tipo="grupo" minWidth={220} />
          {gruposSel.size > 0 && (
            <button type="button" onClick={onLimparGrupos}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 px-2 py-1 rounded-md">Limpar</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Mínimo</span>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {CARRINHO_MIN_OPTS.map(n => (
              <button key={n} onClick={() => onChangeMin(n)}
                className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-colors ${
                  minTransacoes === n ? `bg-white ${Pal.kpiText} shadow-sm ring-1 ${Pal.kpiRing}` : 'text-gray-600 hover:text-gray-900'
                }`}>≥ {n}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={busca} onChange={e => onChangeBusca(e.target.value)}
              placeholder="Buscar por produto..."
              className={`w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white ${Pal.focusBorder} focus:outline-none focus:ring-2 ${Pal.focusRing}`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`rounded-xl ${Pal.kpiGradient} border ${Pal.kpiBorder} p-4`}>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Transações no período</p>
          <p className={`text-[22px] font-bold ${Pal.kpiText} leading-tight mt-1`}>{formatNumero(totalTransacoes, 0)}</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">notas fiscais distintas</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Pares analisados</p>
          <p className="text-[22px] font-bold text-gray-900 leading-tight mt-1">{formatNumero(totalPares, 0)}</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">
            {pares.length === totalPares ? 'todos visíveis' : `${formatNumero(pares.length, 0)} visíveis após filtros`}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Par mais frequente</p>
          {pares.length > 0 ? (
            <>
              <p className="text-[12px] font-semibold text-gray-900 leading-tight mt-1 truncate">{pares[0].produto_a_nome} + {pares[0].produto_b_nome}</p>
              <p className="text-[10.5px] text-gray-500 mt-0.5">{formatNumero(Number(pares[0].transacoes_juntas), 0)} transações juntas</p>
            </>
          ) : <p className="text-[12px] text-gray-400 mt-2">—</p>}
        </div>
      </div>
      {pares.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-100 rounded-xl">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${Pal.emptyBg} mb-3`}>
            <ShoppingCart className={`h-6 w-6 ${Pal.emptyIcon}`} />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum par de produtos atende aos filtros</p>
          <p className="text-xs text-gray-500 mt-1">Tente reduzir o mínimo de transações ou ajustar os grupos selecionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-center w-10">#</th>
                <th className="px-4 py-2 text-left">Produto A</th>
                <th className="px-4 py-2 text-left border-l border-gray-200">Produto B</th>
                <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Transações juntas</th>
                <th className="px-2.5 py-2 text-right border-l border-gray-200">% das transações</th>
                <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Valor das vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pares.map((p, i) => {
                const transacoes = Number(p.transacoes_juntas) || 0;
                const valor = Number(p.valor_juntas) || 0;
                const supportPct = totalTransacoes > 0 ? (transacoes / totalTransacoes) * 100 : 0;
                return (
                  <tr key={`${p.produto_a}-${p.produto_b}`} className={Pal.hoverLeaf}>
                    <td className={`px-3 py-1.5 text-center font-mono text-[11px] ${Pal.kpiText} font-semibold`}>{i + 1}</td>
                    <td className="px-4 py-1.5">
                      <p className="text-[12px] text-gray-800 truncate max-w-[300px]">{p.produto_a_nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {p.produto_a}</p>
                    </td>
                    <td className="px-4 py-1.5 border-l border-gray-100">
                      <p className="text-[12px] text-gray-800 truncate max-w-[300px]">{p.produto_b_nome}</p>
                      <p className="text-[9.5px] text-gray-400 font-mono">cód {p.produto_b}</p>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12.5px] font-bold text-gray-900 border-l-2 border-gray-300">{formatNumero(transacoes, 0)}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[11.5px] text-gray-600 border-l border-gray-100">{supportPct.toFixed(2)}%</td>
                    <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900 border-l-2 border-gray-300">{formatCurrency(valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 3. Evolucao12mCombustivel ──────────────────────────────────

export function Evolucao12mCombustivel({ loading, serie, produtos, produtoSelecionado, onChangeProduto }) {
  const temDados = (serie || []).some(p => p.faturamento > 0 || p.litros > 0);
  const ml = useMemo(() => acharMelhorPior(serie, 'lucro'),     [serie]);
  const mm = useMemo(() => acharMelhorPior(serie, 'margemPct'), [serie]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4 text-amber-600" />
          <span className="text-[12px] font-semibold text-gray-700">Combustível:</span>
          <select value={produtoSelecionado || '__todos'}
            onChange={(e) => onChangeProduto(e.target.value)}
            disabled={loading || produtos.length === 0}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-[12px] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 min-w-[220px]">
            {produtos.length > 1 && <option value="__todos">Todos os combustíveis</option>}
            {produtos.map(p => <option key={p.codigo} value={String(p.codigo)}>{p.nome}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="text-sm">Carregando evolução...</span>
        </div>
      ) : !temDados ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
            <Fuel className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm">Sem dados de combustível nos últimos 12 meses.</p>
        </div>
      ) : (
        <>
          {/* Gráfico 1: Litros + Lucro bruto */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-blue-500" />
                <h4 className="text-[13px] font-semibold text-gray-800">Litros & Lucro bruto</h4>
              </div>
              <LegendaMelhorPior
                melhorRotulo={ml.melhor >= 0 ? serie[ml.melhor].rotulo : null}
                piorRotulo={ml.pior >= 0 ? serie[ml.pior].rotulo : null} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis yAxisId="left"
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k L` : `${v.toFixed(0)} L`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <YAxis yAxisId="right" orientation="right"
                  tickFormatter={(v) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Litros')      return [`${formatNumero(value, 2)} L`, name];
                    if (name === 'Lucro bruto') return [formatCurrency(value), name];
                    return [value, name];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="litros" name="Litros" radius={[4, 4, 0, 0]}>
                  {serie.map((_, idx) => (
                    <Cell key={`b1-${idx}`}
                      fill={idx === ml.melhor ? COR_MELHOR : idx === ml.pior ? COR_PIOR : COR_BAR_LITROS} />
                  ))}
                  <LabelList dataKey="litrosVarMA" content={<LabelVariacaoMA />} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="lucro" name="Lucro bruto"
                  stroke={COR_LINHA} strokeWidth={2}
                  dot={makeDotRenderer(ml.melhor, ml.pior)}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico 2: Lucro/litro + Margem */}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-emerald-500" />
                <h4 className="text-[13px] font-semibold text-gray-800">Lucro por litro & Margem</h4>
              </div>
              <LegendaMelhorPior
                melhorRotulo={mm.melhor >= 0 ? serie[mm.melhor].rotulo : null}
                piorRotulo={mm.pior >= 0 ? serie[mm.pior].rotulo : null} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={serie} margin={{ top: 24, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#e5e7eb" />
                <YAxis yAxisId="left"
                  tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <YAxis yAxisId="right" orientation="right"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Lucro / litro') return [formatCurrency(value), name];
                    if (name === 'Margem')        return [`${Number(value).toFixed(1)}%`, name];
                    return [value, name];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="lucroL" name="Lucro / litro" radius={[4, 4, 0, 0]}>
                  {serie.map((_, idx) => (
                    <Cell key={`b2-${idx}`}
                      fill={idx === mm.melhor ? COR_MELHOR : idx === mm.pior ? COR_PIOR : COR_BAR_LUCROL} />
                  ))}
                  <LabelList dataKey="lucroLVarMA" content={<LabelVariacaoMA />} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Margem"
                  stroke={COR_LINHA} strokeWidth={2}
                  dot={makeDotRenderer(mm.melhor, mm.pior)}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
