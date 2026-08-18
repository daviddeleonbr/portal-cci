// Componentes visuais dos relatórios em PDF (reutilizados por Vendas, DRE, Fluxo).
// Só apresentação. Usam os helpers de formatarPtBr e o CSS de relatorioImpressao.css.

import { moeda, pct, variacao, numero, seta, STATUS } from './formatarPtBr';

// Paleta de segmentos (barra de composição) — derivada dos tokens, sem inventar cores.
const CORES_SEG = ['#0f766e', '#fcb619', '#8a9199', '#15803d', '#b45309', '#b91c1c', '#5b8a86', '#c9a227'];

// ─── Selo de status grande (▲ ● ▼ + frase) ────────────────────
export function SeloStatus({ status = 'neutro', frase }) {
  const s = STATUS[status] || STATUS.neutro;
  return (
    <div className={`rd-selo ${status}`}>
      <span className="icone" aria-hidden="true">{s.icone}</span>
      <div className="txt">
        <div className="rotulo">{s.rotulo}</div>
        {frase && <div className="frase">{frase}</div>}
      </div>
    </div>
  );
}

// ─── Cartão de KPI (número grande + variação + explicação) ─────
export function CartaoKpi({ rotulo, valor, variacaoPct, explica }) {
  const temVar = variacaoPct != null && Number.isFinite(Number(variacaoPct));
  const s = temVar ? seta(variacaoPct) : null;
  const tom = s ? (s.tom === 'bom' ? 'tom-bom' : s.tom === 'ruim' ? 'tom-ruim' : 'tom-neutro') : '';
  return (
    <div className="rd-kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {temVar && (
        <div className={`var ${tom}`}>
          <span aria-hidden="true">{s.icone}</span> {variacao(variacaoPct)}
        </div>
      )}
      {explica && <div className="explica">{explica}</div>}
    </div>
  );
}

// ─── Faixa de aviso de qualidade dos dados ─────────────────────
export function FaixaQualidade({ titulo = 'Atenção: os números deste relatório podem estar incompletos.', texto, acao }) {
  return (
    <div className="rd-faixa-alerta">
      <div className="titulo">⚠ {titulo}</div>
      {texto && <p>{texto}</p>}
      {acao && <p className="acao">O que fazer: {acao}</p>}
    </div>
  );
}

// ─── Tabela de dados genérica ──────────────────────────────────
// colunas: [{ chave, titulo, num?, render? }]  ·  linhas: [obj]
export function TabelaDados({ colunas, linhas, className = '' }) {
  if (!linhas?.length) return null;
  return (
    <table className={`rd-tabela ${className}`}>
      <thead>
        <tr>{colunas.map(c => <th key={c.chave} className={c.num ? 'num' : ''}>{c.titulo}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i}>
            {colunas.map(c => (
              <td key={c.chave} className={c.num ? 'num' : ''}>
                {c.render ? c.render(l[c.chave], l) : (l[c.chave] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Barra de composição 100% (peso de cada grupo) ────────────
// itens: [{ rotulo, valor }] — os % são calculados sobre a soma (só exibição).
export function BarraComposicao({ itens, minPct = 3 }) {
  const lista = (itens || []).filter(i => Number(i.valor) > 0);
  const total = lista.reduce((s, i) => s + Number(i.valor || 0), 0);
  if (total <= 0) return null;
  const comPct = lista.map((i, idx) => ({
    ...i,
    p: (Number(i.valor) / total) * 100,
    cor: CORES_SEG[idx % CORES_SEG.length],
  })).sort((a, b) => b.p - a.p);
  return (
    <div className="rd-barra">
      <div className="trilho">
        {comPct.map((i, idx) => (
          <div key={idx} className="seg" style={{ width: `${i.p}%`, background: i.cor }}
            title={`${i.rotulo}: ${pct(i.p)}`}>
            {i.p >= minPct ? pct(i.p, 0) : ''}
          </div>
        ))}
      </div>
      <div className="legenda">
        {comPct.map((i, idx) => (
          <span key={idx} className="item">
            <span className="bolinha" style={{ background: i.cor }} />
            {i.rotulo} — {pct(i.p)} ({moeda(i.valor)})
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Mini-gráfico de tendência (6 meses) em SVG inline ─────────
// serie: [{ mes, valor }] — marca mês anômalo (valor 0) com ícone de alerta.
export function MiniTendencia({ serie, formato = 'moeda', titulo }) {
  const dados = (serie || []).filter(Boolean);
  if (dados.length < 2) return null;
  const W = 680, H = 150, padX = 30, padY = 22;
  const vals = dados.map(d => Number(d.valor || 0));
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  const range = max - min || 1;
  const stepX = (W - padX * 2) / (dados.length - 1);
  const x = i => padX + i * stepX;
  const y = v => H - padY - ((v - min) / range) * (H - padY * 2);
  const pontos = dados.map((d, i) => ({ ...d, cx: x(i), cy: y(Number(d.valor || 0)), zero: Number(d.valor || 0) === 0 }));
  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ');
  const fmt = (v) => formato === 'moeda' ? moeda(v) : numero(v);
  return (
    <div className="rd-tendencia">
      {titulo && <div className="legenda" style={{ fontWeight: 700, color: 'var(--grafite)' }}>{titulo}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo || 'Tendência 6 meses'}>
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#e2dfd7" strokeWidth="1" />
        {y(0) < H - padY && <line x1={padX} y1={y(0)} x2={W - padX} y2={y(0)} stroke="#e2dfd7" strokeWidth="1" strokeDasharray="3 3" />}
        <path d={linha} fill="none" stroke="#0f766e" strokeWidth="2" />
        {pontos.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r={p.zero ? 4 : 3} fill={p.zero ? '#b91c1c' : '#0f766e'} />
            {p.zero && <text x={p.cx} y={p.cy - 8} textAnchor="middle" fontSize="12" fill="#b91c1c">⚠</text>}
            <text x={p.cx} y={H - padY + 12} textAnchor="middle" fontSize="9" fill="#8a9199">{p.mes}</text>
          </g>
        ))}
      </svg>
      <div className="legenda">
        {pontos.some(p => p.zero)
          ? <>⚠ Mês com valor zero pode indicar dado faltando. </>
          : null}
        {fmt(vals[0])} → {fmt(vals[vals.length - 1])}
      </div>
    </div>
  );
}

// ─── Card de alerta (nível traduzido) ──────────────────────────
const NIVEL_MAP = {
  alta: { classe: 'urgente', rotulo: 'Urgente' },
  media: { classe: 'importante', rotulo: 'Importante' },
  baixa: { classe: 'quando-der', rotulo: 'Quando der' },
};
export function CardAlerta({ severidade = 'media', risco, mitigacao }) {
  const n = NIVEL_MAP[String(severidade).toLowerCase()] || NIVEL_MAP.media;
  return (
    <div className="rd-card alerta">
      <div className="cab"><span className={`nivel ${n.classe}`}>{n.rotulo}</span></div>
      <div><span className="rd-forte">{risco}</span></div>
      {mitigacao && <div className="rd-oque-fazer" style={{ marginTop: '2mm' }}><span className="rot">O que fazer</span> — {mitigacao}</div>}
    </div>
  );
}

// ─── Card de oportunidade (ganho em R$) ────────────────────────
export function CardOportunidade({ titulo, texto, ganho }) {
  return (
    <div className="rd-card oport">
      {titulo && <div className="cab"><span className="rd-forte">{titulo}</span></div>}
      {texto && <div>{texto}</div>}
      {ganho != null && <div className="ganho">Ganho estimado: {typeof ganho === 'number' ? moeda(ganho) : ganho}</div>}
    </div>
  );
}

// ─── Plano de ação (checkbox, responsável, prazo, ganho) ───────
// acoes: [{ acao, responsavel, prazo, ganho }]
export function PlanoAcao({ acoes }) {
  if (!acoes?.length) return null;
  return (
    <div className="rd-plano">
      {acoes.map((a, i) => (
        <div key={i} className="linha">
          <span className="quad" aria-hidden="true" />
          <div>
            <div className="acao">{a.acao}</div>
            {(a.responsavel || a.prazo) && (
              <div className="meta">
                {a.responsavel ? `Responsável: ${a.responsavel}` : ''}
                {a.responsavel && a.prazo ? ' · ' : ''}
                {a.prazo ? `Prazo: ${a.prazo}` : ''}
              </div>
            )}
          </div>
          <div className="ganho">{a.ganho != null ? (typeof a.ganho === 'number' ? moeda(a.ganho) : a.ganho) : ''}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Glossário ─────────────────────────────────────────────────
export function Glossario({ termos }) {
  if (!termos?.length) return null;
  return (
    <section className="rd-secao rd-glossario">
      <h2>Glossário — o que cada termo quer dizer</h2>
      <dl>
        {termos.map((t, i) => (
          <div key={i}>
            <dt>{t.termo}</dt>
            <dd>{t.def}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─── Tag inline de status ──────────────────────────────────────
export function Tag({ status = 'atencao', children }) {
  const s = STATUS[status] || STATUS.atencao;
  return <span className={`rd-tag ${status}`}><span aria-hidden="true">{s.icone}</span> {children}</span>;
}
