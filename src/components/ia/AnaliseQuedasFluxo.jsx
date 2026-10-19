// Análise de IA das quedas do Fluxo de Caixa — por empresa, só no admin.
// Aberta da tela de Fluxo de Caixa depois de "Montar Fluxo": usa os dados já
// carregados (sem novas consultas ao ERP), gera com a IA, salva em
// analise_ia_relatorios (aba 'fluxo_quedas', escopo da empresa, mês final do
// período) e imprime o PDF com o papel timbrado.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, Loader2, Printer, Sparkles, TrendingDown } from 'lucide-react';
import Modal from '../ui/Modal';
import { EmpresasMultiSelect } from '../tarefas/CamposTarefas';
import { montarDadosQuedas, temQueda, gerarAnaliseQuedasIA } from '../../services/fluxoQuedasIaService';
import * as analiseIaService from '../../services/analiseIaRelatorioService';
import { formatCurrency } from '../../utils/format';
import PapelTimbrado from './PapelTimbrado';
import { SeloStatus, CartaoKpi, TabelaDados } from './componentesRelatorio';
import { moeda } from './formatarPtBr';
import './relatorioImpressao.css';

const ABA = 'fluxo_quedas';
const GRAV = {
  alta: { rot: 'Alta', cls: 'bg-rose-50 text-rose-700' },
  media: { rot: 'Média', cls: 'bg-amber-50 text-amber-700' },
  baixa: { rot: 'Baixa', cls: 'bg-gray-100 text-gray-600' },
};
const TIPO_QUEDA = { saldo: 'Saldo do mês', entradas: 'Entradas', saidas: 'Saídas' };
const fmtData = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Estado por empresa: { status: 'pendente'|'carregando'|'gerando'|'sem_queda'|'ok'|'erro', row, erro }
const STATUS_EMP = {
  carregando: { rot: '…', cls: 'text-gray-400' },
  pendente: { rot: 'Não analisada', cls: 'text-gray-400' },
  gerando: { rot: 'Analisando…', cls: 'text-teal-600' },
  sem_queda: { rot: 'Sem queda', cls: 'text-emerald-600' },
  ok: { rot: 'Analisada', cls: 'text-rose-600' },
  erro: { rot: 'Erro', cls: 'text-red-600' },
};
const SIMULTANEAS = 3; // análises em paralelo

// `empresas`: [{ id, nome, cnpj, empresa_codigo }] (1 = empresa única).
// `contexto`: { dadosPorMes, meses, grupos, mapeamentos, tipoPorConta, titulosPorPagamento, chaveApiId, asRedeId, modoRede }
// `onImprimindo(bool)`: avisa a tela de Fluxo para desligar o CSS de impressão
// dela (margens/tabelas) enquanto o relatório com timbrado é impresso.
export default function AnaliseQuedasFluxo({ empresas, contexto, onFechar, onImprimindo }) {
  const [selecionadas, setSelecionadas] = useState(empresas.length === 1 ? [empresas[0].id] : []);
  const [estados, setEstados] = useState(() => Object.fromEntries(empresas.map(e => [e.id, { status: 'carregando' }])));
  const [vendoId, setVendoId] = useState(empresas[0]?.id || null);
  const [rodando, setRodando] = useState(false);
  const [imprimir, setImprimir] = useState(null); // [ids] em impressão
  const [copiado, setCopiado] = useState(false);

  const ultimo = contexto.meses[contexto.meses.length - 1];
  const escopoDe = (id) => analiseIaService.montarEscopo({ tipo: 'empresa', clienteId: id });
  const atualiza = (id, patch) => setEstados(m => ({ ...m, [id]: { ...m[id], ...patch } }));

  // Análises já salvas (mês final do período) de todas as empresas.
  useEffect(() => {
    if (!ultimo) return undefined;
    let cancel = false;
    empresas.forEach(e => {
      analiseIaService.carregarRelatorios({ escopo: escopoDe(e.id), ano: ultimo.ano, mes: ultimo.mes })
        .then(map => { if (!cancel) atualiza(e.id, map?.[ABA] ? { status: 'ok', row: map[ABA] } : { status: 'pendente' }); })
        .catch(() => { if (!cancel) atualiza(e.id, { status: 'pendente' }); });
    });
    return () => { cancel = true; };
  }, [empresas, ultimo]);

  const analisarUma = async (emp) => {
    atualiza(emp.id, { status: 'gerando', erro: null });
    try {
      const dados = montarDadosQuedas({ ...contexto, empresaCodigo: contexto.modoRede ? emp.empresa_codigo : null, empresa: emp });
      if (!temQueda(dados)) { atualiza(emp.id, { status: 'sem_queda' }); return; }
      const r = await gerarAnaliseQuedasIA(dados);
      await analiseIaService.salvarResultadoIa({
        escopo: escopoDe(emp.id), aba: ABA, ano: ultimo.ano, mes: ultimo.mes,
        chaveApiId: contexto.chaveApiId, asRedeId: contexto.asRedeId, clienteId: emp.id,
        insights: r.insights, dados, usage: r.usage,
      });
      atualiza(emp.id, { status: 'ok', row: { insights: r.insights, dados, gerado_em: new Date().toISOString() } });
    } catch (e) { atualiza(emp.id, { status: 'erro', erro: e.message }); }
  };

  // Fila com até SIMULTANEAS análises ao mesmo tempo.
  const analisar = async (ids) => {
    const fila = empresas.filter(e => ids.includes(e.id));
    if (!fila.length) return;
    setRodando(true);
    setVendoId(fila[0].id);
    let i = 0;
    const trabalhador = async () => { while (i < fila.length) { const emp = fila[i++]; await analisarUma(emp); } };
    await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, fila.length) }, trabalhador));
    setRodando(false);
  };

  // Imprime só os documentos (portal fora do #root) e limpa depois.
  useEffect(() => {
    if (!imprimir) return undefined;
    document.body.classList.add('imprimindo-quedas');
    onImprimindo?.(true);
    const fim = () => { document.body.classList.remove('imprimindo-quedas'); onImprimindo?.(false); setImprimir(null); };
    window.addEventListener('afterprint', fim, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t); window.removeEventListener('afterprint', fim);
      document.body.classList.remove('imprimindo-quedas'); onImprimindo?.(false);
    };
  }, [imprimir, onImprimindo]);

  const comAnalise = empresas.filter(e => estados[e.id]?.status === 'ok' && estados[e.id]?.row?.insights);
  const vendo = empresas.find(e => e.id === vendoId);
  const estVendo = vendo ? estados[vendo.id] : null;
  const rede = empresas.length > 1;

  return (
    <Modal open onClose={onFechar} size="xxl"
      title={<span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-rose-500" /> Análise de quedas do fluxo (IA)</span>}
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[11.5px] text-gray-500">Período: <strong>{contexto.meses.map(m => m.label).join(', ')}</strong> — comparação mês a mês, uma análise por empresa.</span>
          {comAnalise.length > 1 && (
            <button onClick={() => setImprimir(comAnalise.map(e => e.id))} disabled={rodando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Printer className="h-4 w-4" /> PDF de todas ({comAnalise.length})
            </button>
          )}
          {estVendo?.status === 'ok' && (
            <button onClick={() => setImprimir([vendo.id])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Printer className="h-4 w-4" /> PDF desta empresa
            </button>
          )}
        </div>
      )}>
      <div className="space-y-4">
        {/* O que analisar */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
          {rede && (
            <div className="min-w-0 flex-1">
              <EmpresasMultiSelect empresas={empresas} value={selecionadas} onChange={setSelecionadas} placeholder="Selecione as empresas para analisar" />
            </div>
          )}
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {rede && (
              <button onClick={() => analisar(empresas.map(e => e.id))} disabled={rodando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analisar rede inteira ({empresas.length})
              </button>
            )}
            <button onClick={() => analisar(selecionadas)} disabled={rodando || !selecionadas.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50">
              {rede ? <>Analisar selecionadas ({selecionadas.length})</> : <><Sparkles className="h-4 w-4" /> {estVendo?.status === 'ok' ? 'Gerar novamente' : 'Gerar análise'}</>}
            </button>
          </div>
        </div>

        <div className={rede ? 'grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]' : ''}>
          {/* Empresas e situação de cada análise */}
          {rede && (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
              {empresas.map(e => {
                const st = STATUS_EMP[estados[e.id]?.status] || STATUS_EMP.pendente;
                const grav = estados[e.id]?.row?.insights?.gravidade;
                return (
                  <li key={e.id}>
                    <button onClick={() => setVendoId(e.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${vendoId === e.id ? 'bg-gray-50' : ''}`}>
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${grav === 'alta' ? 'bg-rose-500' : grav === 'media' ? 'bg-amber-500' : grav === 'baixa' ? 'bg-gray-400' : 'bg-transparent'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${vendoId === e.id ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{e.nome}</span>
                        <span className={`text-[11px] ${st.cls}`}>
                          {estados[e.id]?.status === 'gerando' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}{st.rot}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Análise da empresa em foco */}
          <div className="min-w-0">
            {!vendo ? <Vazio texto="Escolha uma empresa." />
              : estVendo?.status === 'carregando' ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
              : estVendo?.status === 'gerando' ? <Vazio texto={`A IA está investigando as quedas de ${vendo.nome}. Isso pode levar alguns minutos…`} carregando />
              : estVendo?.status === 'sem_queda' ? <Vazio texto={`${vendo.nome}: não houve queda no período — o caixa não ficou negativo, as entradas não caíram e as saídas não subiram de um mês para o outro.`} />
              : estVendo?.status === 'erro' ? <Vazio texto={`Erro ao analisar ${vendo.nome}: ${estVendo.erro}`} />
              : estVendo?.status !== 'ok' ? <Vazio texto={`${vendo.nome} ainda não foi analisada neste período. Use “Analisar rede inteira” ou selecione as empresas e clique em “Analisar selecionadas”.`} />
              : (
                <>
                  {rede && <p className="mb-2 text-sm font-semibold text-gray-900">{vendo.nome}</p>}
                  <ResultadoTela ins={estVendo.row.insights} dados={estVendo.row.dados} geradoEm={estVendo.row.gerado_em} copiado={copiado}
                    onCopiar={async () => { try { await navigator.clipboard.writeText(estVendo.row.insights.mensagem_proprietario || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ } }} />
                </>
              )}
          </div>
        </div>
      </div>

      {imprimir && createPortal(
        <div className="quedas-print">
          {empresas.filter(e => imprimir.includes(e.id) && estados[e.id]?.row?.insights).map((e, i) => (
            <div key={e.id} style={i > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}>
              <DocumentoQuedas ins={estados[e.id].row.insights} dados={estados[e.id].row.dados} empresa={e} />
            </div>
          ))}
        </div>,
        document.body,
      )}
      <style>{`
        @media print {
          /* Só o relatório no documento: qualquer outro elemento (app, portais,
             avisos) fora — senão algo largo faz o navegador reduzir a escala e o
             timbrado (210×297mm) deixa de casar com a folha. */
          body.imprimindo-quedas > *:not(.quedas-print) { display: none !important; }
          html:has(body.imprimindo-quedas), body.imprimindo-quedas {
            width: auto !important; min-width: 0 !important; height: auto !important;
            overflow: visible !important; zoom: 1 !important;
          }
          body.imprimindo-quedas .quedas-print .rd-doc-wrap { display: block !important; }
        }
      `}</style>
    </Modal>
  );
}

function Vazio({ texto, carregando = false }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
      {carregando && <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-teal-600" />}
      {texto}
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{titulo}</h3>
      {children}
    </section>
  );
}

function ResultadoTela({ ins, dados, geradoEm, onCopiar, copiado }) {
  const g = GRAV[ins.gravidade] || GRAV.media;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.cls}`}>Gravidade {g.rot}</span>
          <span className="text-[11px] text-gray-400">Gerada em {fmtData(geradoEm)}{dados?.periodo ? ` · ${dados.periodo}` : ''}</span>
        </div>
        <p className="text-sm leading-relaxed text-gray-800">{ins.resumo}</p>
      </div>

      {dados?.serie?.length > 0 && (
        <Secao titulo="Caixa mês a mês (grupos da máscara)">
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wider text-gray-500">
                <tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2 text-right">Entradas</th><th className="px-3 py-2 text-right">Saídas</th><th className="px-3 py-2 text-right">Sobrou / faltou</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados.serie.map(m => (
                  <tr key={m.mes}>
                    <td className="px-3 py-2 text-gray-800">{m.mes}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(m.entradas)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{formatCurrency(m.saidas)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${m.resultado < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(m.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {ins.quedas?.length > 0 && (
        <Secao titulo="Onde caiu">
          <ul className="space-y-2">
            {ins.quedas.map((q, i) => (
              <li key={i} className="rounded-lg border border-gray-100 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-900">{q.item}</span>
                  <span className="rounded bg-gray-100 px-1.5 text-[11px] text-gray-600">{TIPO_QUEDA[q.tipo] || q.tipo} · {q.mes}</span>
                  {q.diferenca != null && <span className="ml-auto font-mono text-[13px] font-semibold tabular-nums text-rose-600">{formatCurrency(q.diferenca)}</span>}
                </div>
                {(q.valor_antes != null || q.valor_depois != null) && (
                  <p className="mt-0.5 text-[12px] text-gray-500">{formatCurrency(q.valor_antes)} → {formatCurrency(q.valor_depois)}</p>
                )}
                {q.explicacao && <p className="mt-1 text-[13px] text-gray-700">{q.explicacao}</p>}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {ins.causas?.length > 0 && (
        <Secao titulo="Por que caiu — erros prováveis de gestão">
          <ul className="space-y-2">
            {ins.causas.map((c, i) => {
              const gc = GRAV[c.gravidade] || GRAV.media;
              return (
                <li key={i} className="rounded-lg border border-rose-100 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{c.erro}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${gc.cls}`}>{gc.rot}</span>
                      </div>
                      {c.evidencia && <p className="mt-1 text-[12.5px] text-gray-600"><strong>Evidência:</strong> {c.evidencia}</p>}
                      {c.impacto && <p className="mt-0.5 text-[12.5px] text-gray-600"><strong>Impacto:</strong> {c.impacto}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Secao>
      )}

      {ins.solucoes?.length > 0 && (
        <Secao titulo="O que fazer">
          <ol className="space-y-2">
            {ins.solucoes.map((s, i) => (
              <li key={i} className="rounded-lg border border-emerald-100 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">{i + 1}. {s.acao}</p>
                {s.como && <p className="mt-1 text-[12.5px] text-gray-700">{s.como}</p>}
                <p className="mt-1 text-[12px] text-emerald-700">
                  {s.resultado_esperado}{s.prazo ? ` · Prazo: ${s.prazo}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </Secao>
      )}

      {ins.mensagem_proprietario && (
        <Secao titulo="Mensagem para o proprietário">
          <div className="rounded-lg border border-teal-200 bg-gray-50 p-3">
            <p className="whitespace-pre-line text-sm text-gray-800">{ins.mensagem_proprietario}</p>
            <button onClick={onCopiar} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-teal-700 hover:underline">
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? 'Copiado' : 'Copiar mensagem'}
            </button>
          </div>
        </Secao>
      )}
    </div>
  );
}

// ─── Documento A4 (papel timbrado) ──────────────────────────────
export function DocumentoQuedas({ ins, dados, empresa }) {
  const serie = dados?.serie || [];
  const ult = serie[serie.length - 1];
  const status = ins.gravidade === 'alta' ? 'critico' : ins.gravidade === 'baixa' ? 'bom' : 'atencao';
  return (
    <div className="rd-doc-wrap">
      <PapelTimbrado />
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="rd-doc">
            <h1 className="rd-capa-titulo">Por que o caixa caiu</h1>
            <p className="rd-capa-sub">
              {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''}{dados?.periodo ? ` · ${dados.periodo}` : ''}
            </p>
            <SeloStatus status={status} frase={ins.resumo} />

            {ult && (
              <div className="rd-kpis">
                <CartaoKpi rotulo={`Entradas (${ult.mes})`} valor={moeda(ult.entradas)} explica="Dinheiro que entrou pelos grupos do fluxo de caixa." />
                <CartaoKpi rotulo={`Saídas (${ult.mes})`} valor={moeda(ult.saidas)} explica="Dinheiro que saiu pelos grupos do fluxo de caixa." />
                <CartaoKpi rotulo={ult.resultado < 0 ? 'Faltou no caixa' : 'Sobrou no caixa'} valor={moeda(ult.resultado)} explica="Entradas menos saídas no mês." />
              </div>
            )}

            {serie.length > 0 && (
              <section className="rd-secao">
                <h2>O caixa mês a mês</h2>
                <TabelaDados
                  colunas={[
                    { chave: 'mes', titulo: 'Mês' },
                    { chave: 'entradas', titulo: 'Entradas', num: true, render: (v) => moeda(v) },
                    { chave: 'saidas', titulo: 'Saídas', num: true, render: (v) => moeda(v) },
                    { chave: 'resultado', titulo: 'Sobrou / faltou', num: true, render: (v) => moeda(v) },
                  ]}
                  linhas={serie} />
              </section>
            )}

            {ins.quedas?.length > 0 && (
              <section className="rd-secao">
                <h2>Onde caiu</h2>
                <ul>
                  {ins.quedas.map((q, i) => (
                    <li key={i}><span className="destaque">{q.item} ({TIPO_QUEDA[q.tipo] || q.tipo}, {q.mes}):</span>{' '}
                      {q.valor_antes != null && q.valor_depois != null ? `${moeda(q.valor_antes)} → ${moeda(q.valor_depois)}. ` : ''}{q.explicacao}</li>
                  ))}
                </ul>
              </section>
            )}

            {ins.causas?.length > 0 && (
              <section className="rd-secao">
                <h2>Por que caiu</h2>
                {ins.causas.map((c, i) => (
                  <div key={i}>
                    <h3>{i + 1}. {c.erro}</h3>
                    {c.evidencia && <p><span className="destaque">O que os números mostram:</span> {c.evidencia}</p>}
                    {c.impacto && <p><span className="destaque">Efeito no caixa:</span> {c.impacto}</p>}
                  </div>
                ))}
              </section>
            )}

            {ins.solucoes?.length > 0 && (
              <section className="rd-secao">
                <h2>O que fazer</h2>
                {/* Lista própria (não o PlanoAcao): o "resultado esperado" da IA é
                    frase longa — na coluna de valor (sem quebra) ele alargava a
                    linha além da folha e o navegador encolhia o PDF inteiro. */}
                {ins.solucoes.map((s, i) => (
                  <div key={i}>
                    <h3>{i + 1}. {s.acao}</h3>
                    {s.como && <p>{s.como}</p>}
                    {s.resultado_esperado && <p><span className="destaque">Resultado esperado:</span> {s.resultado_esperado}</p>}
                    {s.prazo && <p><span className="destaque">Prazo:</span> {s.prazo}</p>}
                  </div>
                ))}
              </section>
            )}

            {ins.mensagem_proprietario && (
              <section className="rd-secao">
                <h2>Recado da CCI</h2>
                <p>{ins.mensagem_proprietario}</p>
              </section>
            )}
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
