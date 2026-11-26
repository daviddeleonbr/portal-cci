// Relatório "controller": números do PACOTE de evidências (determinístico) + leitura
// da IA. Cada afirmação mostra o grau (comprovado / provável / hipótese) e as
// evidências (fatos do pacote) que a sustentam; valores que não conferem com os
// dados ficam marcados.
import { createElement, Fragment, useState } from 'react';
import { Loader2, MessageCircleQuestion, Search, Send, AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardList, FileSearch, Gauge, Lightbulb, ListChecks, Scale, SearchCheck, ShieldAlert, Target, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const GRAU = {
  comprovado: { rotulo: 'Comprovado', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  provavel: { rotulo: 'Provável', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
  hipotese: { rotulo: 'Hipótese', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  insuficiente: { rotulo: 'Dados insuficientes', cls: 'border-gray-200 bg-gray-50 text-gray-600' },
};
const SITUACAO = {
  saudavel: { rotulo: 'Saudável', cls: 'bg-emerald-600' },
  alerta: { rotulo: 'Alerta', cls: 'bg-amber-500' },
  critico: { rotulo: 'Crítico', cls: 'bg-orange-600' },
};

function useFatos(pacote) {
  const mapa = new Map((pacote?.fatos || []).map(f => [f.id, f]));
  const fmt = (f) => (!f ? '—' : f.unidade === 'R$' ? formatCurrency(f.valor)
    : f.unidade === '%' ? `${f.valor.toLocaleString('pt-BR')}%` : f.unidade === 'R$/L' ? `R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/L`
      : `${f.valor.toLocaleString('pt-BR')} ${f.unidade}`);
  return { valor: (id) => (id ? mapa.get(id)?.valor ?? null : null), texto: (id) => fmt(mapa.get(id)), fato: (id) => mapa.get(id) };
}

const Card = ({ icon, titulo, children, extra }) => (
  <section className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm break-inside-avoid">
    <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
      {createElement(icon, { className: "h-4 w-4 text-blue-600", "aria-hidden": "true" })}
      <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
      {extra && <span className="ml-auto text-[11px] text-gray-500">{extra}</span>}
    </header>
    <div className="px-5 py-4">{children}</div>
  </section>
);
const Grau = ({ g }) => (GRAU[g] ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${GRAU[g].cls}`}>{GRAU[g].rotulo}</span> : null);

function Evidencias({ ids = [], f }) {
  const lista = (ids || []).map(id => f.fato(id)).filter(Boolean);
  if (!lista.length) return null;
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
      {lista.slice(0, 4).map((x, i) => <span key={x.id}>{i > 0 && ' · '}{x.rotulo}: <strong className="font-medium text-gray-700">{f.texto(x.id)}</strong></span>)}
      {lista.length > 4 && ` · +${lista.length - 4}`}
    </p>
  );
}
function Avisos({ item }) {
  if (!item?._valoresNaoEncontrados?.length && !item?._evidenciasInvalidas?.length) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] text-amber-800">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {item._valoresNaoEncontrados?.length ? `Valor não encontrado nos dados: ${item._valoresNaoEncontrados.map(v => formatCurrency(v)).join(', ')}` : 'Evidência citada não existe no pacote'}
    </p>
  );
}
const Item = ({ titulo, texto, grau, ids, f, item, children }) => (
  <li className="py-3 first:pt-0 last:pb-0">
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {titulo && <p className="text-[13px] font-semibold text-gray-900">{titulo}</p>}
        {texto && <p className="mt-0.5 text-[12.5px] leading-relaxed text-gray-700">{texto}</p>}
        {children}
        <Evidencias ids={ids} f={f} />
        <Avisos item={item} />
      </div>
      <Grau g={grau} />
    </div>
  </li>
);

// Resultado de "Investigar esta conta" (Fase 5)
function Investigacao({ inv, f }) {
  const r = inv?.resposta || {};
  const cam = r.camadas || {};
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-[12px]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-relaxed text-gray-900">{r.resumo}</p>
        <Grau g={r.grau} />
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {[['O que mudou', cam.o_que_mudou], ['Quem explica', cam.quem_explica], ['Cruzamento', cam.cruzamento], ['Pontual ou recorrente', cam.recorrencia],
          ['Causa mais provável', cam.causa_provavel], ['Consequência', cam.consequencia], ['O que fazer', cam.recomendacao]].filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{k}</dt><dd className="leading-relaxed text-gray-800">{v}</dd></div>
        ))}
      </dl>
      {(r.conferir || []).length > 0 && <p className="mt-2 text-gray-700"><strong>Conferir:</strong> {r.conferir.join('; ')}</p>}
      {(r.dados_faltando || []).length > 0 && <p className="mt-1 text-gray-500">Faltou: {r.dados_faltando.join('; ')}</p>}
      <Evidencias ids={r.evidencias} f={f} /><Avisos item={r} />
    </div>
  );
}

// Perguntas do proprietário (Fase 5)
function Perguntas({ perguntas = [], sugeridas = [], onPerguntar, ocupado, f }) {
  const [texto, setTexto] = useState('');
  const enviar = (q) => { const p = (q ?? texto).trim(); if (!p || ocupado) return; onPerguntar(p); setTexto(''); };
  return (
    <Card icon={MessageCircleQuestion} titulo="Pergunte ao controller" extra="respostas com base nos dados desta análise">
      <div className="flex flex-wrap gap-1.5">
        {sugeridas.map(s => (
          <button key={s} type="button" disabled={!!ocupado} onClick={() => enviar(s)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">{s}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar(); }} disabled={!!ocupado}
          placeholder="Faça uma pergunta sobre o caixa deste período…" maxLength={300}
          className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <button type="button" onClick={() => enviar()} disabled={!!ocupado || texto.trim().length < 5}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {ocupado === 'pergunta' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Perguntar
        </button>
      </div>
      <ul className="mt-3 space-y-3">
        {perguntas.slice().reverse().map((p, i) => (
          <li key={i} className="rounded-xl bg-gray-50 p-3">
            <p className="text-[12px] font-semibold text-gray-900">{p.pergunta}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gray-800">{p.resposta?.resposta}</p>
            {(p.resposta?.pontos || []).length > 0 && (
              <ul className="mt-2 space-y-1.5">{p.resposta.pontos.map((x, j) => (
                <li key={j} className="flex items-start gap-2 text-[12px] text-gray-700"><Grau g={x.grau} /><span className="min-w-0 flex-1">{x.texto}<Evidencias ids={x.evidencias} f={f} /><Avisos item={x} /></span></li>
              ))}</ul>
            )}
            {p.resposta?.o_que_falta && <p className="mt-1.5 text-[11.5px] text-gray-500">Faltou: {p.resposta.o_que_falta}</p>}
            {p.resposta?.proximo_passo && <p className="mt-1 text-[11.5px] text-gray-700"><strong>Próximo passo:</strong> {p.resposta.proximo_passo}</p>}
            <Avisos item={p.resposta} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Cascata: atividades do mês atual → variação de caixa
function Cascata({ pacote, f }) {
  const atv = Object.fromEntries((pacote.caixa?.atividades || []).map(a => [a.campo, a]));
  const linhas = [
    ['Operacional', atv.caixaOperacional?.atual],
    ['Investimento', atv.caixaInvestimento?.atual],
    ['Financiamento', atv.caixaFinanciamento?.atual],
    ['Transferências entre contas', atv.transferenciasEntreContas?.atual],
  ].filter(([, id]) => id && Math.abs(f.valor(id)) >= 0.01);
  const total = f.valor(pacote.caixa?.variacao?.atual);
  const max = Math.max(1, ...linhas.map(([, id]) => Math.abs(f.valor(id))), Math.abs(total || 0));
  const barra = (v) => (
    <div className="relative h-4 flex-1 rounded bg-gray-100">
      <div className="absolute top-0 h-4 rounded" style={{ left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / max) * 50}%`, width: `${(Math.abs(v) / max) * 50}%`, background: v >= 0 ? '#10766e' : '#d97706' }} />
      <div className="absolute left-1/2 top-0 h-4 w-px bg-gray-300" />
    </div>
  );
  return (
    <div className="space-y-2">
      {linhas.map(([nome, id]) => (
        <div key={nome} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-44 shrink-0 text-gray-700">{nome}</span>{barra(f.valor(id))}
          <span className="w-32 shrink-0 text-right font-mono tabular-nums text-gray-900">{f.texto(id)}</span>
        </div>
      ))}
      <div className="flex items-center gap-3 border-t border-gray-100 pt-2 text-[12.5px] font-semibold">
        <span className="w-44 shrink-0 text-gray-900">= Variação de caixa</span>{barra(total || 0)}
        <span className="w-32 shrink-0 text-right font-mono tabular-nums text-gray-900">{f.texto(pacote.caixa?.variacao?.atual)}</span>
      </div>
      <p className="text-[11px] text-gray-500">Verde = entrou dinheiro; âmbar = saiu. {pacote.meta?.periodos?.atual}{pacote.meta?.mesEmAndamento ? ` (mês em andamento: ${pacote.meta.diasAtual} dias)` : ''}.</p>
    </div>
  );
}

// onInvestigar(conta) / onPerguntar(texto): Fase 5 (sem eles, os botões não aparecem)
export default function RelatorioController({ insights: ia = {}, pacote = {}, onInvestigar, onPerguntar, ocupado = null, sugeridas = [] }) {
  const f = useFatos(pacote);
  const [abertas, setAbertas] = useState(() => new Set());
  const investigacoes = ia.investigacoes || {};
  const podeInvestigar = !!onInvestigar && (pacote.detalheContas || []).length > 0;
  const investigar = (conta) => {
    setAbertas(s => new Set(s).add(conta));
    if (!investigacoes[conta]) onInvestigar(conta);
  };
  const re = ia.resumo_executivo || {};
  const sit = SITUACAO[re.situacao] || SITUACAO.alerta;
  const per = pacote.meta?.periodos || {};
  const kpi = (rot, comp) => comp?.atual && (
    <div className="rounded-xl border border-gray-200/70 bg-white p-3">
      <p className="text-[11px] font-medium text-gray-500">{rot}</p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-gray-900">{f.texto(comp.atual)}</p>
      <p className="text-[11px] text-gray-500">{per.anterior}: {f.texto(comp.anterior)}{comp.pct != null ? ` · ${comp.pct > 0 ? '+' : ''}${comp.pct.toLocaleString('pt-BR')}%` : ''}</p>
    </div>
  );
  const atv = Object.fromEntries((pacote.caixa?.atividades || []).map(a => [a.campo, a]));
  const problemas = ia._validacao?.problemas || [];
  const pa = ia.plano_acao || {};

  return (
    <div className="space-y-4">
      {problemas.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 no-print">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A conferência automática achou {problemas.length} ponto{problemas.length === 1 ? '' : 's'} na resposta da IA que não bate{problemas.length === 1 ? '' : 'm'} com os dados — estão marcados abaixo. Os números das tabelas vêm direto dos dados.
        </p>
      )}

      {/* A. Resumo executivo */}
      <section className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white ${sit.cls}`}>{sit.rotulo}</span>
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-gray-900">{re.variacao_caixa}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13.5px] leading-relaxed text-gray-800">{re.conclusao}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[['Fator positivo', re.fator_positivo, 'text-emerald-700'], ['Fator negativo', re.fator_negativo, 'text-amber-700'], ['Principal risco', re.principal_risco, 'text-orange-700']].map(([rot, it, cor]) => it && (
              <div key={rot} className="rounded-xl bg-gray-50 p-3">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${cor}`}>{rot}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-gray-800">{it.texto}</p>
                <Evidencias ids={it.evidencias} f={f} /><Avisos item={it} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpi('Variação de caixa', pacote.caixa?.variacao)}
            {kpi('Caixa operacional', atv.caixaOperacional)}
            {kpi('Receita (DRE)', pacote.dre?.receita)}
            {kpi('Resultado (DRE)', pacote.dre?.resultado)}
          </div>
        </div>
      </section>

      {onPerguntar && <Perguntas perguntas={ia.perguntas || []} sugeridas={sugeridas} onPerguntar={onPerguntar} ocupado={ocupado} f={f} />}

      {/* B. Geração de caixa */}
      <Card icon={TrendingUp} titulo="Geração de caixa">
        <Cascata pacote={pacote} f={f} />
        <ul className="mt-4 divide-y divide-gray-100">
          {[['Operacional', ia.geracao_caixa?.operacional], ['Investimento', ia.geracao_caixa?.investimento], ['Financiamento', ia.geracao_caixa?.financiamento], ['Dependência de recursos de fora', ia.geracao_caixa?.dependencia_externa]]
            .filter(([, it]) => it?.texto).map(([rot, it]) => <Item key={rot} titulo={rot} texto={it.texto} grau={it.grau} ids={it.evidencias} f={f} item={it} />)}
        </ul>
      </Card>

      {/* C. Investigação das variações */}
      <Card icon={FileSearch} titulo="O que mais mudou e por quê" extra={`${per.atual} × ${per.anterior}`}>
        {(pacote.caixa?.maioresFatores || []).length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12px]">
              <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr><th className="py-1.5">Conta</th><th className="py-1.5 text-right">{per.anterior}</th><th className="py-1.5 text-right">{per.atual}</th><th className="py-1.5 text-right">Diferença</th><th className="py-1.5 text-right">%</th>{podeInvestigar && <th className="no-print" />}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pacote.caixa.maioresFatores.map(m => (
                  <Fragment key={m.conta + m.caminho}>
                  <tr>
                    <td className="py-1.5 pr-2"><p className="font-medium text-gray-900">{m.conta}</p><p className="text-[10.5px] text-gray-500">{m.caminho} · movimentou em {m.mesesComMovimento6m} de 6 meses</p></td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-gray-600">{f.texto(m.anterior)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-gray-900">{f.texto(m.atual)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums font-semibold text-gray-900">{f.texto(m.diferenca)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{m.pct == null ? '—' : `${m.pct > 0 ? '+' : ''}${m.pct.toLocaleString('pt-BR')}%`}</td>
                    {podeInvestigar && (
                      <td className="py-1.5 pl-2 text-right no-print">
                        <button type="button" onClick={() => (abertas.has(m.conta) && investigacoes[m.conta] ? setAbertas(s => { const n = new Set(s); n.delete(m.conta); return n; }) : investigar(m.conta))}
                          disabled={ocupado === `conta:${m.conta}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60">
                          {ocupado === `conta:${m.conta}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Search className="h-3 w-3" aria-hidden="true" />}
                          {investigacoes[m.conta] ? (abertas.has(m.conta) ? 'Ocultar' : 'Ver investigação') : 'Investigar'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {abertas.has(m.conta) && investigacoes[m.conta] && (
                    <tr><td colSpan={6} className="pb-3 pt-1"><Investigacao inv={investigacoes[m.conta]} f={f} /></td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className="divide-y divide-gray-100">
          {(ia.investigacao_variacoes || []).map((v, i) => (
            <Item key={i} titulo={v.conta} texto={v.explicacao} grau={v.grau} ids={v.evidencias} f={f} item={v}>
              {(v.consequencia || v.recorrencia) && <p className="mt-1 text-[12px] text-gray-600">{v.recorrencia && <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10.5px] text-gray-600">{v.recorrencia}</span>}{v.consequencia}</p>}
            </Item>
          ))}
        </ul>
      </Card>

      {/* D. Cruzamento com a DRE */}
      <Card icon={Scale} titulo="DRE × caixa: o lucro está virando dinheiro?">
        {!pacote.dre && <p className="text-[12.5px] text-gray-500">A DRE não entrou nesta análise (gere a análise de DRE do mês com a máscara selecionada e gere de novo).</p>}
        <ul className="divide-y divide-gray-100">
          {(ia.cruzamento_dre || []).map((c, i) => <Item key={i} titulo={c.titulo} texto={c.texto} grau={c.grau} ids={c.evidencias} f={f} item={c} />)}
        </ul>
        {(pacote.cruzamentoDreCaixa || []).length > 0 && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Regras automáticas</p>
            <ul className="space-y-1.5">{pacote.cruzamentoDreCaixa.map(d => (
              <li key={d.id} className="flex items-start gap-2 text-[12px] text-gray-700"><Grau g={d.grau} /><span><strong>{d.titulo}.</strong> {d.texto}</span></li>
            ))}</ul>
          </div>
        )}
      </Card>

      {/* Transferências entre empresas */}
      {pacote.transferenciasEntreEmpresas && (pacote.transferenciasEntreEmpresas.pares > 0 || pacote.transferenciasEntreEmpresas.semContrapartida?.length > 0) && (
        <Card icon={ArrowRightLeft} titulo="Transferências entre empresas do grupo">
          <p className="text-[12.5px] text-gray-700">
            {pacote.transferenciasEntreEmpresas.modo === 'rede'
              ? <>{pacote.transferenciasEntreEmpresas.pares} transferência(s) casada(s) entre as empresas, somando {f.texto(pacote.transferenciasEntreEmpresas.valorPares)}{pacote.transferenciasEntreEmpresas.eliminadoNoConsolidado ? ' — eliminadas do consolidado (não entraram nem saíram do grupo).' : '.'}</>
              : <>Recebido de outras empresas do grupo no mês: {f.texto(pacote.transferenciasEntreEmpresas.recebidoDoGrupo)} · enviado: {f.texto(pacote.transferenciasEntreEmpresas.enviadoAoGrupo)} (indícios pelo histórico; a outra ponta não foi verificada).</>}
          </p>
        </Card>
      )}

      {/* E. Anomalias */}
      {((ia.anomalias || []).length > 0 || (pacote.pontosDeAtencao || []).length > 0) && (
      <Card icon={SearchCheck} titulo="Anomalias e pontos de atenção">
        <ul className="divide-y divide-gray-100">
          {(ia.anomalias || []).map((a, i) => (
            <Item key={i} titulo={a.titulo} texto={a.texto} ids={a.evidencias} f={f} item={a}>
              {a.conferir && <p className="mt-1 text-[12px] text-gray-600"><strong>Conferir:</strong> {a.conferir}</p>}
            </Item>
          ))}
          {!(ia.anomalias || []).length && (pacote.pontosDeAtencao || []).map((p, i) => <Item key={i} titulo={p.titulo} texto={p.detalhe} f={f} />)}
        </ul>
      </Card>
      )}

      {/* F. Capital de giro */}
      <Card icon={Gauge} titulo="Capital de giro e liquidez" extra={pacote.capitalDeGiro?.dataSaldo ? `saldos em aberto de ${pacote.capitalDeGiro.dataSaldo.split('-').reverse().join('/')}` : null}>
        {pacote.capitalDeGiro && (
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4 text-[12px]">
            {[['A receber em aberto', 'contasReceber'], ['A receber vencido', 'contasReceberVencido'], ['A pagar em aberto', 'contasPagar'], ['A pagar vencido', 'contasPagarVencido']].map(([rot, k]) => pacote.capitalDeGiro[k] && (
              <div key={k} className="rounded-xl bg-gray-50 p-2.5"><p className="text-gray-500">{rot}</p><p className="font-mono font-semibold tabular-nums text-gray-900">{f.texto(pacote.capitalDeGiro[k])}</p></div>
            ))}
          </div>
        )}
        {ia.capital_giro?.avaliacao && <p className="text-[12.5px] leading-relaxed text-gray-700">{ia.capital_giro.avaliacao}</p>}
        <Evidencias ids={ia.capital_giro?.evidencias} f={f} /><Avisos item={ia.capital_giro} />
        {(ia.capital_giro?.dados_ausentes || []).length > 0 && <p className="mt-2 text-[11.5px] text-gray-500">Faltou para calcular: {ia.capital_giro.dados_ausentes.join('; ')}.</p>}
      </Card>

      {/* G. Diagnóstico */}
      <Card icon={ClipboardList} titulo="Diagnóstico e causas">
        <div className="grid gap-4 lg:grid-cols-3">
          {[['Comprovadas pelos dados', ia.diagnostico?.comprovadas, 'comprovado'], ['Prováveis', ia.diagnostico?.provaveis, 'provavel'], ['Hipóteses a confirmar', ia.diagnostico?.hipoteses, 'hipotese']].map(([rot, lista, g]) => (
            <div key={rot}>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-800"><Grau g={g} /> {rot}</p>
              <ul className="space-y-2">{(lista || []).map((d, i) => (
                <li key={i} className="rounded-lg bg-gray-50 p-2.5 text-[12px] leading-relaxed text-gray-700">{d.texto}{d.como_confirmar && <span className="mt-1 block text-gray-500">Como confirmar: {d.como_confirmar}</span>}<Evidencias ids={d.evidencias} f={f} /><Avisos item={d} /></li>
              ))}</ul>
            </div>
          ))}
        </div>
      </Card>

      {/* H. Plano de ação */}
      <Card icon={ListChecks} titulo={pa.situacao_critica ? 'Plano de reversão' : 'Plano de ação'}>
        {pa.situacao_critica && pa.diagnostico_situacao && <p className="mb-3 flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-[12.5px] text-orange-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{pa.diagnostico_situacao}</p>}
        <div className="grid gap-4 lg:grid-cols-3">
          {[['Imediato · 0 a 7 dias', pa.imediatas_0_7_dias], ['Curto prazo · 8 a 30 dias', pa.curto_prazo_8_30_dias], ['Estrutural · 31 a 90 dias', pa.estruturais_31_90_dias]].map(([rot, lista]) => (
            <div key={rot}>
              <p className="mb-2 text-[12px] font-semibold text-gray-800">{rot}</p>
              <ol className="space-y-2">{(lista || []).map((a, i) => (
                <li key={i} className="rounded-lg border border-gray-200 p-2.5 text-[12px]"><p className="font-semibold text-gray-900">{a.acao}</p>{a.por_que && <p className="mt-0.5 text-gray-600">{a.por_que}</p>}<Evidencias ids={a.evidencias} f={f} /><Avisos item={a} /></li>
              ))}</ol>
            </div>
          ))}
        </div>
        {(pa.cenarios || []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[12px] font-semibold text-gray-800">Cenários de recuperação <span className="font-normal text-gray-500">(projeção com premissas — não é resultado)</span></p>
            <div className="grid gap-3 lg:grid-cols-3">{pa.cenarios.map((c, i) => (
              <div key={i} className="rounded-lg bg-gray-50 p-2.5 text-[12px]"><p className="font-semibold capitalize text-gray-900">{c.nome}</p><p className="mt-0.5 text-gray-600">{c.premissas}</p><p className="mt-1 text-gray-800">{c.efeito_no_caixa}</p><Evidencias ids={c.evidencias} f={f} /><Avisos item={c} /></div>
            ))}</div>
          </div>
        )}
        {(pa.indicadores_acompanhamento || []).length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-gray-800"><Target className="h-3.5 w-3.5" aria-hidden="true" /> Para acompanhar</p>
            <ul className="grid gap-1.5 text-[12px] text-gray-700 sm:grid-cols-2">{pa.indicadores_acompanhamento.map((x, i) => <li key={i}>• <strong>{x.indicador}:</strong> {x.referencia}</li>)}</ul>
          </div>
        )}
      </Card>

      {/* I. Conclusão */}
      <Card icon={Lightbulb} titulo="Conclusão do analista">
        <dl className="grid gap-3 text-[12.5px] sm:grid-cols-2">
          {[['Melhorou ou piorou?', ia.conclusao?.melhorou_ou_piorou], ['O que provocou', ia.conclusao?.o_que_provocou], ['Risco mais importante', ia.conclusao?.risco_principal], ['Investigar agora', ia.conclusao?.investigar_agora], ['Maior impacto positivo', ia.conclusao?.maior_impacto_positivo]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k}</dt><dd className="mt-0.5 leading-relaxed text-gray-800">{v}</dd></div>
          ))}
        </dl>
        {(pacote.dadosAusentes || []).length > 0 && (
          <p className="mt-4 flex items-start gap-1.5 border-t border-gray-100 pt-3 text-[11.5px] text-gray-500"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Não entrou nesta análise: {pacote.dadosAusentes.join('; ')}.</p>
        )}
      </Card>
    </div>
  );
}
