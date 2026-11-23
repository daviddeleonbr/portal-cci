// Gráfico de sobras e faltas por tanque, dia a dia (LMC). Fica logo abaixo dos
// cards de combustível, para o combustível escolhido.
//
// Forma: perda/sobra tem sinal → barras DIVERGENTES a partir do zero (falta
// para baixo, sobra para cima). Um gráfico pequeno por tanque (small
// multiples), todos na MESMA escala, para comparar tanques de relance.
// Cores (par divergente validado com o validador da skill de dataviz,
// superfícies do app #ffffff / #1e293b, todos os checks PASS):
//   claro: sobra #2a78d6 · falta #e34948 · escuro: sobra #3987e5 · falta #e66767
// Definidas como variáveis CSS (.grafico-lmc no index.css) — o tema troca sozinho.
// Identidade nunca só pela cor: legenda + tooltip escrevem "Falta"/"Sobra" e a
// posição (abaixo/acima do zero) já diz o sinal. Os números exatos estão na
// tabela "Livro diário" e no detalhe por tanque de cada dia.
// Sem detalhe por tanque no LMC: mostra um gráfico só, com o total do combustível.

import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const fmtLs = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('pt-BR')} L`);
const fmtL = (v) => (v == null ? '—' : `${Math.round(v).toLocaleString('pt-BR')} L`);
const ddmm = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const ddmmaa = (iso) => String(iso).split('-').reverse().join('/');

// Arredonda o limite do eixo pra cima num valor "redondo"
function limiteRedondo(v) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

export default function GraficoTanquesLmc({ dias }) {
  // dias: linhas normalizadas do PainelLmc (um combustível), em qualquer ordem
  const { series, limite } = useMemo(() => {
    const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data));
    const porTanque = new Map();
    ordenados.forEach(l => (l.tanques || []).forEach(t => {
      const fe = num(t.fechamento), es = num(t.escritural);
      const k = String(t.tanqueCodigo);
      if (!porTanque.has(k)) porTanque.set(k, []);
      porTanque.get(k).push({ data: l.data, valor: fe != null && es != null ? fe - es : null, escritural: es, fechamento: fe });
    }));
    let s = [...porTanque.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, pontos]) => ({ chave: k, titulo: `Tanque ${k}`, pontos }));
    if (s.length === 0) {
      // Sem detalhe por tanque: total do combustível
      s = [{ chave: 'total', titulo: 'Total do combustível', pontos: ordenados.map(l => ({
        data: l.data, valor: l.perdaSobra, escritural: l.escritural, fechamento: l.fechamento,
      })) }];
    }
    const max = Math.max(0, ...s.flatMap(x => x.pontos.map(p => Math.abs(p.valor ?? 0))));
    return { series: s, limite: limiteRedondo(max * 1.1) };
  }, [dias]);

  if (dias.length === 0) return null;

  return (
    <section className="grafico-lmc rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm" aria-labelledby="titulo-grafico-lmc">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h3 id="titulo-grafico-lmc" className="text-sm font-semibold text-gray-900">Sobras e faltas por tanque, dia a dia</h3>
          <p className="text-[12px] text-gray-600">Fechamento medido − estoque escritural de cada tanque. Mesma escala em todos.</p>
        </div>
        {/* Legenda: polaridade (2 "séries") — nunca só a cor */}
        <ul className="flex items-center gap-4 text-[12px] text-gray-700" aria-label="Legenda">
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--lmc-sobra)' }} aria-hidden="true" />Sobra (acima de zero)</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--lmc-falta)' }} aria-hidden="true" />Falta (abaixo de zero)</li>
        </ul>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${series.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {series.map(s => {
          const total = s.pontos.reduce((acc, p) => acc + (p.valor ?? 0), 0);
          const nFalta = s.pontos.filter(p => (p.valor ?? 0) <= -0.5).length;
          const nSobra = s.pontos.filter(p => (p.valor ?? 0) >= 0.5).length;
          return (
            <figure key={s.chave} className="min-w-0 rounded-xl border border-gray-100 p-3">
              <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[13px] font-semibold text-gray-900">{s.titulo}</span>
                <span className="text-[12px] text-gray-600">
                  No período: <strong className="tabular-nums text-gray-900">{fmtLs(total)}</strong>
                  {' · '}{nFalta} dia{nFalta === 1 ? '' : 's'} com falta · {nSobra} com sobra
                </span>
              </figcaption>
              <div className="h-44 sm:h-48" role="img"
                aria-label={`${s.titulo}: perda/sobra diária. Total no período ${fmtLs(total)}, ${nFalta} dias com falta e ${nSobra} com sobra.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.pontos} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="var(--lmc-grade)" />
                    <XAxis dataKey="data" tickFormatter={ddmm} tickLine={false} axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--lmc-eixo)' }} minTickGap={14} />
                    <YAxis domain={[-limite, limite]} tickLine={false} axisLine={false} width={52}
                      tick={{ fontSize: 11, fill: 'var(--lmc-eixo)' }}
                      tickFormatter={(v) => `${Math.round(v).toLocaleString('pt-BR')}`} />
                    <ReferenceLine y={0} stroke="var(--lmc-zero)" strokeWidth={1} />
                    <Tooltip cursor={{ fill: 'var(--lmc-cursor)' }} content={<DicaTanque />} />
                    <Bar dataKey="valor" maxBarSize={18} isAnimationActive={false}>
                      {s.pontos.map(p => (
                        <Cell key={p.data}
                          fill={(p.valor ?? 0) < 0 ? 'var(--lmc-falta)' : 'var(--lmc-sobra)'}
                          // ponta arredondada 4px longe do zero (sobra: em cima; falta: embaixo)
                          radius={(p.valor ?? 0) < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function DicaTanque({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = p.valor;
  const rot = v == null ? 'Sem medição' : Math.abs(v) < 0.5 ? 'Sem diferença' : v < 0 ? 'Falta' : 'Sobra';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="font-semibold text-gray-900">{ddmmaa(p.data)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-gray-800">
        {v != null && Math.abs(v) >= 0.5 && (
          <span className="h-2 w-2 rounded-sm" style={{ background: v < 0 ? 'var(--lmc-falta)' : 'var(--lmc-sobra)' }} aria-hidden="true" />
        )}
        {rot}{v != null && Math.abs(v) >= 0.5 ? `: ${fmtLs(v)}` : ''}
      </p>
      <p className="mt-0.5 text-gray-600 tabular-nums">Escritural {fmtL(p.escritural)} · Medido {fmtL(p.fechamento)}</p>
    </div>
  );
}
