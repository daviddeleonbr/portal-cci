// Componentes compartilhados de Vendas — portados do Autosystem pra
// reuso no Webposto. Tudo aqui é UI pura: recebe `arvore` (Empresa →
// Categoria → Grupo → Produto) e demais props, e renderiza.
//
// Estrutura `arvore` em utils/vendasArvoreWebposto.js (igual à do
// Autosystem). Manter os mesmos `stats` { qtd|fat|lucro: {atual,ma,aa} }.

/* eslint-disable react/prop-types */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Building2, LayoutGrid,
  ChevronDown, ChevronRight, Package, Fuel, Store, ShoppingCart,
  LineChart as LineChartIcon, MoreHorizontal,
} from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { CATEGORIAS } from '../../utils/vendasArvoreWebposto';

// ─── Formatters / helpers ────────────────────────────────────

export function formatNumero(v, casas = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '0';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export function formatNumeroCompact(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pt-BR')}k`;
  return formatNumero(n, 0);
}
export function formatCurrencyCompact(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')}k`;
  return formatCurrency(n);
}
export function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function diaSemanaCurto(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return DIAS_SEMANA_CURTO[new Date(y, m - 1, d).getDay()];
}

// ─── Paletas ─────────────────────────────────────────────────

export const CAT_PALETA = {
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: 'text-amber-600',   border: 'border-amber-200' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'text-blue-600',    border: 'border-blue-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600', border: 'border-emerald-200' },
  gray:    { bg: 'bg-gray-50',    text: 'text-gray-700',    icon: 'text-gray-600',    border: 'border-gray-200' },
};

export const TREE_PALETAS_CATEGORIA = {
  blue: {
    bgHeader: 'bg-blue-50/40', hoverHeader: 'hover:bg-blue-50/70',
    borderTop: 'border-blue-100',
    chevron: 'text-blue-600', icon: 'text-blue-600', iconSub: 'text-blue-500',
    hoverLeaf: 'hover:bg-blue-50/30',
  },
  emerald: {
    bgHeader: 'bg-emerald-50/40', hoverHeader: 'hover:bg-emerald-50/70',
    borderTop: 'border-emerald-100',
    chevron: 'text-emerald-600', icon: 'text-emerald-600', iconSub: 'text-emerald-500',
    hoverLeaf: 'hover:bg-emerald-50/30',
  },
  amber: {
    bgHeader: 'bg-amber-50/40', hoverHeader: 'hover:bg-amber-50/70',
    borderTop: 'border-amber-100',
    chevron: 'text-amber-600', icon: 'text-amber-600', iconSub: 'text-amber-500',
    hoverLeaf: 'hover:bg-amber-50/30',
  },
};

// ─── Compare helpers (badge / chip) ──────────────────────────

export function compararLucro(atual, anoAnterior) {
  if (!Number.isFinite(anoAnterior) || anoAnterior === 0) return null;
  const pct = (atual - anoAnterior) / Math.abs(anoAnterior);
  if (Math.abs(pct) < 0.0005) return { pct: 0, Icone: Minus, tone: 'flat' };
  return pct > 0
    ? { pct, Icone: TrendingUp, tone: 'up' }
    : { pct, Icone: TrendingDown, tone: 'down' };
}
const COMP_STYLE = {
  up:   'text-emerald-700 bg-emerald-50 ring-emerald-200',
  down: 'text-red-700 bg-red-50 ring-red-200',
  flat: 'text-gray-600 bg-gray-50 ring-gray-200',
};

export function BadgeComparacaoAA({ atual, anoAnterior, rotulo = 'AA' }) {
  const cmp = compararLucro(atual, anoAnterior);
  if (!cmp) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 text-gray-500 bg-gray-50 ring-gray-200">
        sem dados {rotulo}
      </span>
    );
  }
  const Icone = cmp.Icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ${COMP_STYLE[cmp.tone]}`}>
      <Icone className="h-2.5 w-2.5" />
      {cmp.tone === 'flat' ? '0,0%' : `${cmp.pct > 0 ? '+' : ''}${(cmp.pct * 100).toFixed(1)}%`}
      <span className="text-gray-400 font-normal">vs {rotulo}</span>
    </span>
  );
}

export function ChipVariacaoSemanal({ pct }) {
  if (pct == null) return <span className="text-[10px] text-gray-300 tabular-nums">—</span>;
  if (Math.abs(pct) < 0.0005) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500 tabular-nums">
        <Minus className="h-2.5 w-2.5" /> 0%
      </span>
    );
  }
  const positivo = pct > 0;
  const Icone = positivo ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
      positivo ? 'text-emerald-600' : 'text-red-600'
    }`}>
      <Icone className="h-3 w-3" />
      {positivo ? '+' : ''}{(pct * 100).toFixed(1)}%
    </span>
  );
}

// ─── Sparkline (SVG, sem Recharts) ───────────────────────────

export function Sparkline({ serie, cor = '#3b82f6', altura = 28 }) {
  const gradId = useMemo(() => `spark-grad-${Math.random().toString(36).slice(2, 9)}`, []);
  const pontos = serie.map(p => Number(p.margemPct) || 0);
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const range = max - min || 1;
  const W = 100, H = altura;
  const stepX = pontos.length > 1 ? W / (pontos.length - 1) : 0;
  const padTop = 2, padBot = 2;
  const y = (v) => H - padBot - ((v - min) / range) * (H - padTop - padBot);
  const coords = pontos.map((v, i) => [i * stepX, y(v)]);
  function suavizar(pts) {
    if (pts.length < 2) return '';
    const T = 0.5;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) * T / 3;
      const cp1y = p1[1] + (p2[1] - p0[1]) * T / 3;
      const cp2x = p2[0] - (p3[0] - p1[0]) * T / 3;
      const cp2y = p2[1] - (p3[1] - p1[1]) * T / 3;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  const linha = suavizar(coords);
  const area  = `${linha} L ${W} ${H} L 0 ${H} Z`;
  const ultimo = coords[coords.length - 1] || [0, H];
  const ultimoVal = pontos[pontos.length - 1] || 0;
  return (
    <div className="relative" title={`Última: ${ultimoVal.toFixed(1)}%`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={cor} stopOpacity={0.35} />
            <stop offset="60%"  stopColor={cor} stopOpacity={0.12} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={linha} fill="none" stroke={cor} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={ultimo[0]} cy={ultimo[1]} r="1.8" fill={cor} stroke="white" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

// Placeholder animado pra o espaço da sparkline enquanto ela carrega.
// Mantém a altura do card estável (sem "pulo" quando os dados chegam)
// e dá feedback visual de que algo está vindo.
export function SparklineSkeleton({ altura = 28, cor = '#3b82f6' }) {
  return (
    <div className="relative overflow-hidden rounded-sm" style={{ height: altura }}>
      <div className="absolute inset-0 opacity-[0.08]" style={{ background: cor }} />
      <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-[shimmer_1.5s_linear_infinite]"
        style={{ background: `linear-gradient(90deg, transparent, ${cor}55, transparent)` }} />
      {/* Linha tracejada base — sugere onde a curva vai aparecer */}
      <svg viewBox="0 0 100 28" width="100%" height={altura} preserveAspectRatio="none" className="absolute inset-0">
        <path d="M 0 22 L 15 18 L 30 20 L 45 12 L 60 14 L 75 8 L 90 10 L 100 6"
          stroke={cor} strokeOpacity="0.25" strokeWidth="1.2" fill="none"
          strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(0); }
          100% { transform: translateX(450%); }
        }
      `}</style>
    </div>
  );
}

// ─── KpiLucroLayout (Visão geral) ────────────────────────────

function KpiLucroLayout({
  icone, bgIcone, label, categoria, lucro, lucroProjecao, temProj, margem,
  lucroAnoAnterior, faturamento, faturamentoProjecao, qtd, qtdLabel,
  serieMargem, sparklineCor = '#3b82f6', ring, seriesLoading = false,
}) {
  const tendenciaMargem = (() => {
    if (!serieMargem || serieMargem.length < 3) return null;
    const ultimo = serieMargem[serieMargem.length - 1].margemPct;
    const anteriores = serieMargem.slice(0, -1).filter(p => p.margemPct > 0);
    if (anteriores.length === 0) return null;
    const media = anteriores.reduce((s, p) => s + p.margemPct, 0) / anteriores.length;
    if (media === 0) return null;
    const diff = ultimo - media;
    return { diff, sentido: diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'flat' };
  })();

  return (
    <div className={`bg-white rounded-xl border border-gray-200/70 ${ring || ''} shadow-sm flex flex-col h-full overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div className={`h-7 w-7 rounded-md ${bgIcone} flex items-center justify-center flex-shrink-0`}>{icone}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 leading-tight truncate">{label}</p>
          <p className="text-[10.5px] text-gray-700 leading-tight truncate font-medium">{categoria}</p>
        </div>
        <BadgeComparacaoAA atual={lucro} anoAnterior={lucroAnoAnterior} />
      </div>

      <div className="px-3 pt-3 pb-1.5 flex-1 flex flex-col justify-center">
        <p className={`text-[22px] font-bold tracking-tight tabular-nums truncate leading-none ${lucro < 0 ? 'text-red-700' : 'text-gray-900'}`} title={formatCurrency(lucro)}>
          {formatCurrency(lucro)}
        </p>
        {faturamento != null && faturamento > 0 && (
          <div className="mt-3 space-y-0.5">
            <p className="text-[10.5px] text-gray-500 leading-tight truncate" title={`Faturamento: ${formatCurrency(faturamento)}`}>
              <span className="text-gray-400">Faturamento </span>
              <span className="font-semibold text-gray-700 tabular-nums">{formatCurrency(faturamento)}</span>
            </p>
            {faturamentoProjecao != null && Math.abs(faturamentoProjecao - faturamento) > 0.01 && (
              <p className="text-[10.5px] leading-tight truncate" title={`Projeção: ${formatCurrency(faturamentoProjecao)}`}>
                <span className="text-blue-500/80">Proj. mês </span>
                <span className="font-semibold text-blue-700 tabular-nums">{formatCurrency(faturamentoProjecao)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {(seriesLoading || (serieMargem && serieMargem.length >= 2)) && (
        <div className="px-3 pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[8.5px] uppercase tracking-wider text-gray-400 font-semibold">Margem 12m</span>
            {seriesLoading ? (
              <span className="text-[9px] font-semibold text-gray-300 inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-pulse" />
                carregando…
              </span>
            ) : tendenciaMargem && tendenciaMargem.sentido !== 'flat' ? (
              <span className={`text-[9px] font-semibold tabular-nums inline-flex items-center gap-0.5 ${
                tendenciaMargem.sentido === 'up' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {tendenciaMargem.sentido === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {tendenciaMargem.diff > 0 ? '+' : ''}{tendenciaMargem.diff.toFixed(1)}pp
              </span>
            ) : null}
          </div>
          {seriesLoading
            ? <SparklineSkeleton altura={28} cor={sparklineCor} />
            : <Sparkline serie={serieMargem} cor={sparklineCor} altura={28} />}
        </div>
      )}

      <div className={`grid ${qtd != null ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/40`}>
        {qtd != null && (
          <div className="px-2.5 py-2 min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">{qtdLabel || 'Qtd'}</p>
            <p className="text-[11.5px] font-semibold tabular-nums text-gray-800 leading-tight truncate" title={`${formatNumero(qtd, 0)}`}>
              {formatNumeroCompact(qtd)}
            </p>
          </div>
        )}
        <div className="px-2.5 py-2 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">Margem</p>
          <p className="text-[11.5px] font-semibold tabular-nums text-gray-800 leading-tight truncate">{(margem * 100).toFixed(1)}%</p>
        </div>
        <div className="px-2.5 py-2 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold leading-tight">Proj. mês</p>
          <p className={`text-[11.5px] font-semibold tabular-nums leading-tight truncate ${temProj ? 'text-blue-700' : 'text-gray-400'}`}
            title={temProj ? formatCurrency(lucroProjecao) : '—'}>
            {temProj ? formatCurrencyCompact(lucroProjecao) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function KpiLucro({ cat, lucro, lucroProjecao, margem, lucroAnoAnterior, faturamento, faturamentoProjecao, qtd, serieMargem, seriesLoading }) {
  const Icone = cat.icone;
  const Pal = CAT_PALETA[cat.cor];
  const temProj = lucroProjecao != null && Math.abs(lucroProjecao - lucro) > 0.01;
  const CORES_SPARK = { blue: '#3b82f6', amber: '#f59e0b', emerald: '#10b981' };
  const qtdLabel = cat.key === 'combustivel' ? 'Litros' : 'Qtd';
  return (
    <KpiLucroLayout
      icone={<Icone className={`h-4 w-4 ${Pal.icon}`} />}
      bgIcone={Pal.bg}
      label="Lucro bruto"
      categoria={cat.label}
      lucro={lucro}
      lucroProjecao={lucroProjecao}
      temProj={temProj}
      margem={margem}
      lucroAnoAnterior={lucroAnoAnterior}
      faturamento={faturamento}
      faturamentoProjecao={faturamentoProjecao}
      qtd={qtd}
      qtdLabel={qtdLabel}
      serieMargem={serieMargem}
      seriesLoading={seriesLoading}
      sparklineCor={CORES_SPARK[cat.cor] || '#3b82f6'}
    />
  );
}

export function KpiLucroGlobal({ lucro, lucroProjecao, margem, lucroAnoAnterior, faturamento, faturamentoProjecao, serieMargem, seriesLoading }) {
  const temProj = lucroProjecao != null && Math.abs(lucroProjecao - lucro) > 0.01;
  return (
    <KpiLucroLayout
      icone={<ShoppingCart className="h-4 w-4 text-blue-600" />}
      bgIcone="bg-blue-50"
      label="Lucro bruto"
      categoria="Global"
      lucro={lucro}
      lucroProjecao={lucroProjecao}
      temProj={temProj}
      margem={margem}
      lucroAnoAnterior={lucroAnoAnterior}
      faturamento={faturamento}
      faturamentoProjecao={faturamentoProjecao}
      serieMargem={serieMargem}
      seriesLoading={seriesLoading}
      sparklineCor="#2563eb"
      ring="ring-1 ring-blue-200"
    />
  );
}

// ─── KpiCombustivelDashboard (Combustíveis / Auto / Conv) ────

export function KpiCombustivelDashboard({
  label, icone: Icone, cor = 'amber',
  valor, valorAA, valorProj,
  atual, anoAnterior, temProj, negativo,
  serie, seriesLoading = false,
}) {
  const CORES = {
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'ring-amber-100',   spark: '#f59e0b' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-100', spark: '#10b981' },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'ring-violet-100',  spark: '#8b5cf6' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    ring: 'ring-rose-100',    spark: '#f43f5e' },
  };
  const C = CORES[cor] || CORES.amber;
  const temAA = anoAnterior !== undefined && anoAnterior !== null;
  const serieSpark = (serie || []).map(v => ({ margemPct: Number(v) || 0 }));

  return (
    <div className="bg-white rounded-xl border border-gray-200/70 shadow-sm flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 leading-tight truncate flex-1">{label}</p>
        <div className={`h-7 w-7 rounded-md ${C.bg} ring-1 ${C.ring} flex items-center justify-center flex-shrink-0`}>
          <Icone className={`h-3.5 w-3.5 ${C.icon}`} />
        </div>
      </div>
      <div className="px-3 pt-2 pb-1.5 flex-1 flex flex-col justify-center">
        <p className={`text-[22px] font-bold tracking-tight tabular-nums truncate leading-none ${negativo ? 'text-red-700' : 'text-gray-900'}`} title={valor}>
          {valor}
        </p>
        {temAA && (
          <div className="mt-1.5"><BadgeComparacaoAA atual={atual} anoAnterior={anoAnterior} /></div>
        )}
        {(temAA || temProj) && (
          <div className="mt-3 space-y-0.5">
            {temAA && (
              <p className="text-[10.5px] text-gray-500 leading-tight truncate" title={`Ano anterior: ${valorAA}`}>
                <span className="text-gray-400">Ano anterior </span>
                <span className="font-semibold text-gray-700 tabular-nums">{valorAA}</span>
              </p>
            )}
            {temProj && (
              <p className="text-[10.5px] leading-tight truncate" title={`Projeção do mês: ${valorProj}`}>
                <span className="text-blue-500/80">Proj. mês </span>
                <span className="font-semibold text-blue-700 tabular-nums">{valorProj}</span>
              </p>
            )}
          </div>
        )}
      </div>
      {seriesLoading ? (
        <div className="px-3 pb-1.5"><SparklineSkeleton altura={26} cor={C.spark} /></div>
      ) : serieSpark.length >= 2 ? (
        <div className="px-3 pb-1.5"><Sparkline serie={serieSpark} cor={C.spark} altura={26} /></div>
      ) : null}
    </div>
  );
}

// ─── TabelaPostoCategoria (Visão geral) ──────────────────────

export function TabelaPostoCategoria({ arvore, multiEmpresa, onAbrirDetalhe }) {
  const CATEGORIAS_TABELA = useMemo(
    () => CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)),
    [],
  );
  const getCatStats = (empNode, key) => {
    const cat = (empNode.categorias || []).find(c => c.categoria.key === key);
    if (!cat) return { atual: 0, aa: 0 };
    return { atual: cat.stats.lucro.atual || 0, aa: cat.stats.lucro.aa || 0 };
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <LayoutGrid className="h-4 w-4 text-blue-500" />
        <h3 className="text-[13px] font-semibold text-gray-800">Lucro bruto por posto</h3>
        <span className="text-[11px] text-gray-400">· valor realizado + variação vs mesmo período do ano anterior</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">{multiEmpresa ? 'Posto' : 'Geral'}</th>
              {CATEGORIAS_TABELA.map(cat => {
                const Pal = CAT_PALETA[cat.cor];
                const Icone = cat.icone;
                return (
                  <th key={cat.key} className="px-3 py-2 text-right">
                    <span className={`inline-flex items-center gap-1.5 ${Pal.text}`}>
                      <Icone className={`h-3 w-3 ${Pal.icon}`} />
                      {cat.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {arvore.map((empNode) => (
              <tr key={`emp:${empNode.empresa_codigo}`}
                className={`border-t border-gray-100 transition-colors ${onAbrirDetalhe ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
                onClick={() => onAbrirDetalhe && onAbrirDetalhe(empNode)}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                      <Building2 className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-gray-900 truncate leading-tight">{empNode.nome}</p>
                      {empNode.empresa_codigo != null && (
                        <p className="text-[9.5px] text-gray-500 font-mono leading-tight">cód {empNode.empresa_codigo}</p>
                      )}
                    </div>
                  </div>
                </td>
                {CATEGORIAS_TABELA.map(cat => {
                  const s = getCatStats(empNode, cat.key);
                  return (
                    <td key={cat.key} className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-mono tabular-nums text-[12.5px] font-semibold ${s.atual < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatCurrency(s.atual)}
                        </span>
                        <BadgeComparacaoAA atual={s.atual} anoAnterior={s.aa} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DetalhamentoSetor (Visão geral) ─────────────────────────

export function DetalhamentoSetor({ arvore }) {
  const SETORES = useMemo(
    () => CATEGORIAS.filter(c => ['combustivel', 'automotivos', 'conveniencia'].includes(c.key)),
    [],
  );
  const [setorAtivo, setSetorAtivo] = useState('combustivel');
  const setor = SETORES.find(s => s.key === setorAtivo) || SETORES[0];
  const sufixoQtd = setorAtivo === 'combustivel' ? ' L' : '';
  const labelQtd  = setorAtivo === 'combustivel' ? 'Litros' : 'Quantidade';
  const labelLbUn = setorAtivo === 'combustivel' ? 'L.B. por litro' : 'L.B. por un.';

  const linhas = useMemo(() => {
    return arvore.map(emp => {
      const cat = (emp.categorias || []).find(c => c.categoria.key === setorAtivo);
      const s = cat?.stats || { qtd: { atual: 0, aa: 0 }, fat: { atual: 0, aa: 0 }, lucro: { atual: 0, aa: 0 } };
      const custoAtual = s.fat.atual - s.lucro.atual;
      return {
        empresa_codigo: emp.empresa_codigo, nome: emp.nome,
        qtdAtual: s.qtd.atual, qtdAA: s.qtd.aa,
        fatAtual: s.fat.atual, fatAA: s.fat.aa,
        lucroAtual: s.lucro.atual, lucroAA: s.lucro.aa,
        margem: s.fat.atual > 0 ? s.lucro.atual / s.fat.atual : 0,
        precoVenda: s.qtd.atual > 0 ? s.fat.atual / s.qtd.atual : 0,
        precoCusto: s.qtd.atual > 0 ? custoAtual / s.qtd.atual : 0,
        lbUn:       s.qtd.atual > 0 ? s.lucro.atual / s.qtd.atual : 0,
      };
    }).filter(l => l.fatAtual > 0 || l.lucroAtual !== 0)
      .sort((a, b) => b.lucroAtual - a.lucroAtual);
  }, [arvore, setorAtivo]);

  const totais = useMemo(() => {
    const tot = linhas.reduce((acc, l) => {
      acc.qtdAtual += l.qtdAtual; acc.qtdAA += l.qtdAA;
      acc.fatAtual += l.fatAtual; acc.fatAA += l.fatAA;
      acc.lucroAtual += l.lucroAtual; acc.lucroAA += l.lucroAA;
      return acc;
    }, { qtdAtual: 0, qtdAA: 0, fatAtual: 0, fatAA: 0, lucroAtual: 0, lucroAA: 0 });
    const custo = tot.fatAtual - tot.lucroAtual;
    return {
      ...tot,
      margem: tot.fatAtual > 0 ? tot.lucroAtual / tot.fatAtual : 0,
      precoVenda: tot.qtdAtual > 0 ? tot.fatAtual / tot.qtdAtual : 0,
      precoCusto: tot.qtdAtual > 0 ? custo / tot.qtdAtual : 0,
      lbUn:       tot.qtdAtual > 0 ? tot.lucroAtual / tot.qtdAtual : 0,
    };
  }, [linhas]);

  const maxQtd = Math.max(...linhas.map(l => l.qtdAtual), 0);
  const maxMargem = Math.max(...linhas.map(l => l.margem), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-800">Detalhamento por setor</h3>
          <p className="text-[10.5px] text-gray-500 mt-0.5">Vendas setorizadas — clique no setor para alternar</p>
        </div>
        <div className="ml-auto inline-flex items-center rounded-lg border border-blue-200 bg-blue-50/40 p-0.5">
          {SETORES.map(s => {
            const Icone = s.icone;
            const ativo = setorAtivo === s.key;
            const Pal = CAT_PALETA[s.cor];
            return (
              <button key={s.key} onClick={() => setSetorAtivo(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  ativo ? `bg-white shadow-sm ${Pal.text}` : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icone className="h-3 w-3" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Posto</th>
              <th className="px-3 py-2 text-right">{labelQtd}</th>
              <th className="px-3 py-2 text-right border-l border-gray-100">Faturamento</th>
              <th className="px-3 py-2 text-right border-l border-gray-100">Lucro bruto</th>
              <th className="px-3 py-2 text-right border-l border-gray-100">Margem</th>
              <th className="px-3 py-2 text-right border-l border-gray-100">Preço venda</th>
              <th className="px-3 py-2 text-right border-l border-gray-100">{labelLbUn}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[12px] text-gray-400">Sem vendas no período.</td></tr>
            ) : linhas.map(l => (
              <tr key={`linha:${l.empresa_codigo}`} className="border-t border-gray-100 hover:bg-blue-50/30">
                <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800 truncate">{l.nome}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 relative">
                  {formatNumero(l.qtdAtual, 0)}{sufixoQtd}
                  {maxQtd > 0 && (
                    <div className="absolute bottom-0.5 left-2 right-2 h-1 bg-blue-50 rounded-full">
                      <div className="h-full bg-blue-400/60 rounded-full" style={{ width: `${(l.qtdAtual / maxQtd) * 100}%` }} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 border-l border-gray-100">{formatCurrency(l.fatAtual)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${l.lucroAtual < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(l.lucroAtual)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100 relative">
                  {(l.margem * 100).toFixed(2)}%
                  {maxMargem > 0 && (
                    <div className="absolute bottom-0.5 left-2 right-2 h-1 bg-amber-50 rounded-full">
                      <div className="h-full bg-amber-400/60 rounded-full" style={{ width: `${(l.margem / maxMargem) * 100}%` }} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{formatCurrency(l.precoVenda)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{formatCurrency(l.lbUn)}</td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900">{formatNumero(totais.qtdAtual, 0)}{sufixoQtd}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.fatAtual)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${totais.lucroAtual < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucroAtual)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.precoVenda)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.lbUn)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── TabelaProjecaoCombustivel + TabelaProjecaoCategoria ─────

export function TabelaProjecaoCombustivel({ produtos, totais, projetar }) {
  const linhas = produtos || [];
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <Fuel className="h-4 w-4 text-amber-500" />
        <div>
          <h3 className="text-[13px] font-semibold text-gray-800 leading-tight">Projeção por combustível</h3>
          <p className="text-[10.5px] text-gray-500 leading-tight">Valores realizados + projeção para o fechamento do mês</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="px-4 py-2 align-bottom">Combustível</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Litros</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Lucro bruto</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Margem</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">L.B. / litro</th>
            </tr>
            <tr className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[12px] text-gray-400">Nenhum combustível com vendas no período.</td></tr>
            ) : linhas.map(p => {
              const litrosProj = projetar(p.qtd);
              const lucroProj  = projetar(p.lucro);
              return (
                <tr key={p.codigo} className="border-t border-gray-100 hover:bg-amber-50/30">
                  <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800 truncate" title={p.nome}>{p.nome}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 border-l border-gray-100">{formatNumero(p.qtd, 0)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-700 font-semibold">{formatNumero(litrosProj, 0)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${p.lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(p.lucro)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${lucroProj < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(lucroProj)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{(p.margem * 100).toFixed(2)}%</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${p.lbL < 0 ? 'text-red-700' : 'text-gray-700'}`}>{formatCurrency(p.lbL)}</td>
                </tr>
              );
            })}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatNumero(totais.qtd, 0)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-700">{formatNumero(projetar(totais.qtd), 0)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucro)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${projetar(totais.lucro) < 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatCurrency(projetar(totais.lucro))}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.luPorL)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function TabelaProjecaoCategoria({ titulo, descricao, icone: Icone = Package, cor = 'blue', linhas, totais, projetar }) {
  const items = linhas || [];
  const corHeader = { blue: 'text-blue-500', emerald: 'text-emerald-500' }[cor] || 'text-blue-500';
  const corProj = 'text-blue-700';
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-b from-white to-gray-50/40">
        <Icone className={`h-4 w-4 ${corHeader}`} />
        <div>
          <h3 className="text-[13px] font-semibold text-gray-800 leading-tight">{titulo}</h3>
          <p className="text-[10.5px] text-gray-500 leading-tight">{descricao}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[920px]">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr className="text-left text-[9.5px] font-semibold text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="px-4 py-2 align-bottom">Grupo</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Faturamento</th>
              <th colSpan={2} className="px-3 py-1.5 text-center border-l border-gray-200">Lucro bruto</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Margem</th>
              <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l border-gray-200">Ticket médio</th>
            </tr>
            <tr className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
              <th className="px-3 pb-1.5 text-right border-l border-gray-200">Realizado</th>
              <th className="px-3 pb-1.5 text-right">Proj. mês</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[12px] text-gray-400">Sem vendas no período.</td></tr>
            ) : items.map(g => {
              const fatProj = projetar(g.valor);
              const lucroProj = projetar(g.lucro);
              return (
                <tr key={g.codigo ?? g.nome} className="border-t border-gray-100 hover:bg-blue-50/30">
                  <td className="px-4 py-2 text-[12.5px] font-medium text-gray-800 truncate" title={g.nome}>{g.nome}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 border-l border-gray-100">{formatCurrency(g.valor)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${corProj}`}>{formatCurrency(fatProj)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-100 ${g.lucro < 0 ? 'text-red-700' : 'text-gray-800'}`}>{formatCurrency(g.lucro)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${lucroProj < 0 ? 'text-red-700' : corProj}`}>{formatCurrency(lucroProj)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{(g.margem * 100).toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 border-l border-gray-100">{g.ticket > 0 ? formatCurrency(g.ticket) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td className="px-4 py-2 text-[12.5px] text-gray-900">Total</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{formatCurrency(totais.valor)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${corProj}`}>{formatCurrency(projetar(totais.valor))}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums border-l border-gray-200 ${totais.lucro < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(totais.lucro)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${projetar(totais.lucro) < 0 ? 'text-red-700' : corProj}`}>{formatCurrency(projetar(totais.lucro))}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{(totais.margem * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900 border-l border-gray-200">{totais.ticket > 0 ? formatCurrency(totais.ticket) : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── CelulaNumero (compartilhada pelas trees) ────────────────

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

// ─── TreeRealizadoDia (Combustíveis) ─────────────────────────

export function TreeRealizadoDia({ arvore, expandidos, onToggle }) {
  const [linhaSelecionada, setLinhaSelecionada] = useState(null);
  const toggleLinha = (k) => setLinhaSelecionada(prev => prev === k ? null : k);
  function calcAux(s) {
    const margem = s.valor > 0 ? (s.valor - s.custo) / s.valor : 0;
    const precoMed = s.qtd > 0 ? s.valor / s.qtd : 0;
    const custoMed = s.qtd > 0 ? s.custo / s.qtd : 0;
    const lucroL = s.qtd > 0 ? (s.valor - s.custo) / s.qtd : 0;
    const lucro = s.valor - s.custo;
    return { lucro, margem, precoMed, custoMed, lucroL };
  }
  function maxProdutos(produtos) {
    return produtos.reduce((acc, p) => {
      const a = calcAux({ qtd: p.qtd, valor: p.valor, custo: p.custo });
      acc.valor  = Math.max(acc.valor,  p.valor);
      acc.lucro  = Math.max(acc.lucro,  a.lucro);
      acc.margem = Math.max(acc.margem, a.margem * 100);
      return acc;
    }, { valor: 0, lucro: 0, margem: 0 });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Data / Produto</th>
            <th className="px-2.5 py-2 text-center border-l-2 border-gray-300">Dia</th>
            <th className="px-2.5 py-2 text-right border-l-2 border-gray-300">Litros</th>
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
          {arvore.map(dNode => {
            const diaKey = `dia:${dNode.dia}`;
            const aberto = expandidos.has(diaKey);
            const aux = calcAux(dNode.stats);
            return (
              <React.Fragment key={diaKey}>
                <tr className="cursor-pointer bg-amber-50/40 hover:bg-amber-50/70 border-t border-amber-100"
                  onClick={() => onToggle(diaKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {aberto ? <ChevronDown className="h-3.5 w-3.5 text-amber-600" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-600" />}
                      <span className="text-[13px] font-semibold text-gray-900">{formatDataBR(dNode.dia)}</span>
                      <span className="text-[10px] text-gray-400">· {dNode.produtos.length} prod.</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-[11px] font-medium text-gray-600 border-l-2 border-gray-300">
                    {diaSemanaCurto(dNode.dia)}
                  </td>
                  <CelulaNumero valor={dNode.stats.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                  <CelulaNumero valor={dNode.stats.valor} divisor="forte" />
                  <CelulaNumero valor={aux.lucro} divisor="forte" />
                  <CelulaNumero valor={dNode.stats.acresc} divisor="forte" corTexto="text-emerald-700" />
                  <CelulaNumero valor={dNode.stats.desc} divisor="leve" corTexto="text-red-700" />
                  <CelulaNumero valor={aux.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} />
                  <CelulaNumero valor={aux.precoMed} divisor="forte" />
                  <CelulaNumero valor={aux.custoMed} divisor="leve" />
                  <CelulaNumero valor={aux.lucroL} divisor="leve" />
                </tr>
                {aberto && (() => {
                  const maxP = maxProdutos(dNode.produtos);
                  return dNode.produtos.map((p, idx) => {
                    const auxP = calcAux({ qtd: p.qtd, valor: p.valor, custo: p.custo });
                    const rowKey = `${diaKey}/p:${p.codigo}`;
                    const sel = linhaSelecionada === rowKey;
                    return (
                      <tr key={rowKey}
                        onClick={() => toggleLinha(rowKey)}
                        className={`cursor-pointer transition-colors ${
                          sel ? 'bg-yellow-100 hover:bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                              : `${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-amber-50/30`
                        }`}>
                        <td className="pl-10 pr-3 py-1.5">
                          <p className="text-[12px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                          <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                        </td>
                        <td className="px-2.5 py-1.5 border-l-2 border-gray-300" />
                        <CelulaNumero valor={p.qtd} moeda={false} decimais={2} sufixo=" L" divisor="forte" />
                        <CelulaNumero valor={p.valor} divisor="forte" barraMax={maxP.valor} barraCor="blue" />
                        <CelulaNumero valor={auxP.lucro} divisor="forte" barraMax={maxP.lucro} barraCor="emerald" />
                        <CelulaNumero valor={p.acresc} divisor="forte" corTexto="text-emerald-700" />
                        <CelulaNumero valor={p.desc} divisor="leve" corTexto="text-red-700" />
                        <CelulaNumero valor={auxP.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} barraMax={maxP.margem} barraCor="violet" />
                        <CelulaNumero valor={auxP.precoMed} divisor="forte" />
                        <CelulaNumero valor={auxP.custoMed} divisor="leve" />
                        <CelulaNumero valor={auxP.lucroL} divisor="leve" />
                      </tr>
                    );
                  });
                })()}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── TreeRealizadoAutoDia (Automotivos / Conveniência) ───────

export function TreeRealizadoAutoDia({ arvore, expandidos, onToggle, cor = 'blue' }) {
  const Pal = TREE_PALETAS_CATEGORIA[cor];
  const [linhaSelecionada, setLinhaSelecionada] = useState(null);
  const toggleLinha = (k) => setLinhaSelecionada(prev => prev === k ? null : k);

  function calc(s) {
    const lucro = s.valor - s.custo;
    const margem = s.valor > 0 ? lucro / s.valor : 0;
    const precoMed = s.qtd > 0 ? s.valor / s.qtd : 0;
    const custoMed = s.qtd > 0 ? s.custo / s.qtd : 0;
    const lucroMed = s.qtd > 0 ? lucro / s.qtd : 0;
    return { lucro, margem, precoMed, custoMed, lucroMed };
  }
  function maxProdutosDoGrupo(produtos) {
    return produtos.reduce((acc, p) => {
      const c = calc({ qtd: p.qtd, valor: p.valor, custo: p.custo });
      acc.valor  = Math.max(acc.valor, p.valor);
      acc.lucro  = Math.max(acc.lucro, c.lucro);
      acc.margem = Math.max(acc.margem, c.margem * 100);
      return acc;
    }, { valor: 0, lucro: 0, margem: 0 });
  }

  function LinhaStats({ s, onClick, barras }) {
    const c = calc(s);
    return (
      <>
        <CelulaNumero valor={s.qtd} moeda={false} decimais={2} divisor="forte" onClick={onClick} />
        <CelulaNumero valor={s.valor} divisor="forte" onClick={onClick} barraMax={barras?.valor} barraCor="blue" />
        <CelulaNumero valor={s.custo} divisor="leve" onClick={onClick} />
        <CelulaNumero valor={c.lucro} divisor="forte" onClick={onClick} barraMax={barras?.lucro} barraCor="emerald" />
        <CelulaNumero valor={c.margem * 100} moeda={false} decimais={1} sufixo="%" divisor="forte" negativoBg={false} onClick={onClick} barraMax={barras?.margem} barraCor="violet" />
        <CelulaNumero valor={c.precoMed} divisor="forte" onClick={onClick} />
        <CelulaNumero valor={c.custoMed} divisor="leve" onClick={onClick} />
        <CelulaNumero valor={c.lucroMed} divisor="leve" onClick={onClick} />
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-y border-gray-200 sticky top-0 z-10">
          <tr className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Data / Grupo / Produto</th>
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
          {arvore.map(dNode => {
            const dKey = `aD:${dNode.dia}`;
            const dAberto = expandidos.has(dKey);
            return (
              <React.Fragment key={dKey}>
                <tr className={`cursor-pointer ${Pal.bgHeader} ${Pal.hoverHeader} border-t ${Pal.borderTop}`}
                  onClick={() => onToggle(dKey)}>
                  <td className="pl-4 pr-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {dAberto ? <ChevronDown className={`h-3.5 w-3.5 ${Pal.chevron}`} /> : <ChevronRight className={`h-3.5 w-3.5 ${Pal.chevron}`} />}
                      <span className="text-[12.5px] font-semibold text-gray-900">{formatDataBR(dNode.dia)}</span>
                      <span className="text-[10px] text-gray-500">{diaSemanaCurto(dNode.dia)}</span>
                    </div>
                  </td>
                  <LinhaStats s={dNode.stats} />
                </tr>
                {dAberto && dNode.grupos.map(gNode => {
                  const gKey = `${dKey}/g:${gNode.codigo ?? 'none'}`;
                  const gAberto = expandidos.has(gKey);
                  const gSel = linhaSelecionada === gKey;
                  const gRowBg = gSel
                    ? 'bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                    : 'bg-gray-50/50 hover:bg-gray-100/70';
                  const maxP = maxProdutosDoGrupo(gNode.produtos);
                  return (
                    <React.Fragment key={gKey}>
                      <tr className={gRowBg}>
                        <td className="pl-10 pr-3 py-2 cursor-pointer" onClick={() => onToggle(gKey)}>
                          <div className="flex items-center gap-2">
                            {gAberto ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                            <Package className={`h-3.5 w-3.5 ${Pal.iconSub}`} />
                            <span className="text-[12px] font-medium text-gray-800 truncate">{gNode.nome}</span>
                          </div>
                        </td>
                        <LinhaStats s={gNode.stats} onClick={() => toggleLinha(gKey)} />
                      </tr>
                      {gAberto && gNode.produtos.map((p, idx) => {
                        const pKey = `${gKey}/p:${p.codigo}`;
                        const pSel = linhaSelecionada === pKey;
                        const pRowBg = pSel
                          ? 'bg-yellow-100 hover:bg-yellow-100 ring-1 ring-inset ring-yellow-300'
                          : `${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${Pal.hoverLeaf}`;
                        return (
                          <tr key={pKey} onClick={() => toggleLinha(pKey)}
                            className={`cursor-pointer ${pRowBg}`}>
                            <td className="pl-16 pr-3 py-1.5">
                              <p className="text-[11.5px] text-gray-700 truncate max-w-[360px]">{p.nome}</p>
                              <p className="text-[9.5px] text-gray-400 font-mono">cód {p.codigo}</p>
                            </td>
                            <LinhaStats s={{ qtd: p.qtd, valor: p.valor, custo: p.custo }} barras={maxP} />
                          </tr>
                        );
                      })}
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

// ─── Agregadores auxiliares ──────────────────────────────────

export function agregarGruposDaCategoria(arvore, categoriaKey) {
  const mapa = new Map();
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== categoriaKey) return;
      (cat.grupos || []).forEach(grupo => {
        const k = String(grupo.codigo ?? grupo.nome);
        let cur = mapa.get(k);
        if (!cur) { cur = { codigo: grupo.codigo, nome: grupo.nome, valor: 0, lucro: 0, itens: 0 }; mapa.set(k, cur); }
        (grupo.produtos || []).forEach(p => {
          cur.valor += Number(p.fat?.atual) || 0;
          cur.lucro += Number(p.lucro?.atual) || 0;
          cur.itens += 1;
        });
      });
    });
  });
  return Array.from(mapa.values())
    .filter(g => g.valor > 0 || g.lucro !== 0)
    .map(g => ({ ...g, margem: g.valor > 0 ? g.lucro / g.valor : 0, ticket: g.itens > 0 ? g.valor / g.itens : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function agregarProdutosCombustivel(arvore) {
  const mapa = new Map();
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== 'combustivel') return;
      (cat.grupos || []).forEach(grupo => {
        (grupo.produtos || []).forEach(p => {
          const k = String(p.codigo);
          let cur = mapa.get(k);
          if (!cur) { cur = { codigo: p.codigo, nome: p.nome, qtd: 0, valor: 0, lucro: 0 }; mapa.set(k, cur); }
          cur.qtd   += Number(p.qtd?.atual) || 0;
          cur.valor += Number(p.fat?.atual) || 0;
          cur.lucro += Number(p.lucro?.atual) || 0;
        });
      });
    });
  });
  return Array.from(mapa.values())
    .filter(p => p.qtd > 0 || p.valor > 0)
    .map(p => ({ ...p, margem: p.valor > 0 ? p.lucro / p.valor : 0, lbL: p.qtd > 0 ? p.lucro / p.qtd : 0 }))
    .sort((a, b) => b.qtd - a.qtd);
}
