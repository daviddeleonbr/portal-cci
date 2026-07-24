// Tokens de cor para gráficos (Recharts), sensíveis ao tema.
//
// O CSS (index.css) já cuida de grade/eixo/tooltip padrão no dark, mas as
// cores de EIXO/GRADE/TEXTO e principalmente as SÉRIES (Bar/Line/Area/Cell)
// vão como props em JS — então precisam vir daqui. Use com o hook useIsDark:
//   const dark = useIsDark();
//   const c = coresGrafico(dark);
//   <CartesianGrid stroke={c.grade} /> <XAxis tick={{ fill: c.texto }} />
//   <Tooltip contentStyle={c.tooltip.contentStyle} itemStyle={c.tooltip.itemStyle} />
//   <Bar fill={c.serie[0]} />

// Paleta de séries — teal/brand primeiro, depois cores de apoio. Tons um pouco
// mais claros no dark p/ contrastar com o fundo slate.
const SERIE_LIGHT = ['#0d9488', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#f97316', '#0ea5e9'];
const SERIE_DARK  = ['#2dd4bf', '#60a5fa', '#fcd34d', '#c4b5fd', '#fca5a5', '#6ee7b7', '#fdba74', '#7dd3fc'];

export function coresGrafico(dark) {
  return {
    eixo:   dark ? '#334155' : '#e2e8f0',   // linha do eixo
    grade:  dark ? '#334155' : '#e5e7eb',   // linhas de grade
    texto:  dark ? '#94a3b8' : '#6b7280',   // rótulos/ticks
    cursor: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
    serie:  dark ? SERIE_DARK : SERIE_LIGHT,
    tooltip: {
      contentStyle: {
        backgroundColor: dark ? '#1e293b' : '#ffffff',
        border: `1px solid ${dark ? '#334155' : '#e5e7eb'}`,
        borderRadius: 10,
        boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.08)',
        color: dark ? '#e2e8f0' : '#0f172a',
      },
      labelStyle: { color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 },
      itemStyle: { color: dark ? '#cbd5e1' : '#334155' },
    },
  };
}

// Atalho: a n-ésima cor de série (cicla).
export function corSerie(dark, i) {
  const p = dark ? SERIE_DARK : SERIE_LIGHT;
  return p[i % p.length];
}
