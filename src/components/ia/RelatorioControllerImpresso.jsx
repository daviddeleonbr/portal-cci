// Relatório Controller em PDF (A4 retrato, timbrado CCI). Invisível na tela; só
// aparece na impressão. Traz TODAS as análises abertas: resumo, geração de caixa,
// maiores variações com as investigações por conta, DRE × caixa, transferências
// entre empresas, anomalias, capital de giro, diagnóstico, plano de ação, conclusão
// e as perguntas respondidas. Números vêm do pacote (dados); a prosa, da IA.
import './relatorioImpressao.css';
import PapelTimbrado from './PapelTimbrado';
import { moeda, statusDaSituacao } from './formatarPtBr';
import { CartaoKpi, FaixaQualidade, Glossario, NotaConsultor, PlanoAcao, SeloStatus, Tag, TabelaDados } from './componentesRelatorio';

const GRAU = { comprovado: ['bom', 'Comprovado'], provavel: ['atencao', 'Provável'], hipotese: ['neutro', 'Hipótese'], insuficiente: ['neutro', 'Dados insuficientes'] };
const GLOSSARIO = [
  { termo: 'Caixa operacional', def: 'O dinheiro que a operação do posto gerou (vendas recebidas menos pagamentos do dia a dia).' },
  { termo: 'Investimento', def: 'Saídas para melhorar ou ampliar o negócio (obras, equipamentos) e entradas de venda de bens.' },
  { termo: 'Financiamento', def: 'Empréstimos tomados ou pagos, dinheiro dos sócios e transferências entre empresas do grupo.' },
  { termo: 'Variação de caixa', def: 'Quanto sobrou (positivo) ou faltou (negativo) de dinheiro no período.' },
  { termo: 'DRE (competência)', def: 'O resultado do mês pelas vendas e custos do mês, mesmo que ainda não tenham sido pagos ou recebidos. Lucro não é o mesmo que dinheiro em caixa.' },
  { termo: 'Comprovado / provável / hipótese', def: 'Comprovado: os números mostram. Provável: há evidência de apoio. Hipótese: possível, mas falta dado para confirmar.' },
];

export default function RelatorioControllerImpresso({ insights: ia = {}, pacote = {}, empresa, periodo, modoRede = false, nota = '' }) {
  const mapa = new Map([...(pacote.fatos || []), ...(pacote.fatosDetalhe || [])].map(f => [f.id, f]));
  const fmt = (id) => {
    const f = mapa.get(id);
    if (!f) return '—';
    if (f.unidade === 'R$') return moeda(f.valor);
    if (f.unidade === '%') return `${f.valor.toLocaleString('pt-BR')}%`;
    if (f.unidade === 'R$/L') return `R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/L`;
    return `${f.valor.toLocaleString('pt-BR')} ${f.unidade}`;
  };
  const num = (id) => mapa.get(id)?.valor ?? null;
  const per = pacote.meta?.periodos || {};
  const re = ia.resumo_executivo || {};
  const problemas = ia._validacao?.problemas || [];
  const pa = ia.plano_acao || {};
  const atv = Object.fromEntries((pacote.caixa?.atividades || []).map(a => [a.campo, a]));
  const investigacoes = ia.investigacoes || {};
  const perguntas = ia.perguntas || [];

  const grau = (g) => (GRAU[g] ? <> <Tag status={GRAU[g][0]}>{GRAU[g][1]}</Tag></> : null);
  // "Base: rótulo R$ x · rótulo R$ y" — as evidências citadas, com os valores
  const base = (ids = []) => {
    const l = (ids || []).map(id => mapa.get(id)).filter(Boolean);
    if (!l.length) return null;
    return <span className="rd-muted" style={{ display: 'block', fontSize: '8pt' }}>Base: {l.slice(0, 5).map(f => `${f.rotulo}: ${fmt(f.id)}`).join(' · ')}</span>;
  };
  const marca = (item) => (item?._valoresNaoEncontrados?.length
    ? <span className="rd-muted" style={{ display: 'block', fontSize: '8pt' }}>⚠ Valor citado pela IA não encontrado nos dados: {item._valoresNaoEncontrados.map(moeda).join(', ')}</span> : null);
  const pctTxt = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p.toLocaleString('pt-BR')}%`);
  const lista = (itens = [], render) => (itens.length ? <ul>{itens.map((x, i) => <li key={i}>{render(x)}</li>)}</ul> : null);
  const kpi = (rot, comp, explica) => comp?.atual && (
    <CartaoKpi rotulo={rot} valor={fmt(comp.atual)} variacaoPct={comp.pct} explica={explica || `${per.anterior}: ${fmt(comp.anterior)}`} />
  );

  return (
    <div className="rd-doc-wrap">
      <PapelTimbrado />
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="rd-doc">
            <h1 className="rd-capa-titulo">Por que o caixa mudou — análise do controller</h1>
            <p className="rd-capa-sub">
              {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''} · {periodo}{modoRede ? ' · rede consolidada' : ''}
              {pacote.meta?.mesEmAndamento ? ` · mês em andamento (${pacote.meta.diasAtual} dias)` : ''}
            </p>

            {problemas.length > 0 && (
              <FaixaQualidade titulo="Conferência automática" texto={`${problemas.length} ponto(s) da leitura da IA não bate(m) com os dados e estão marcados com ⚠. Os números das tabelas vêm direto dos dados.`} />
            )}

            {/* A. Resumo executivo */}
            <SeloStatus status={statusDaSituacao(re.situacao)} frase={re.variacao_caixa} />
            {re.conclusao && <p>{re.conclusao}</p>}
            <div className="rd-kpis">
              {kpi('Variação de caixa', pacote.caixa?.variacao)}
              {kpi('Caixa operacional', atv.caixaOperacional)}
              {kpi('Receita (DRE)', pacote.dre?.receita)}
              {kpi('Resultado (DRE)', pacote.dre?.resultado)}
            </div>
            <section className="rd-secao">
              <h2>Resumo executivo</h2>
              {lista([['Principal fator positivo', re.fator_positivo], ['Principal fator negativo', re.fator_negativo], ['Principal risco', re.principal_risco]].filter(([, x]) => x?.texto), ([rot, x]) => <><span className="rd-forte">{rot}:</span> {x.texto}{base(x.evidencias)}{marca(x)}</>)}
            </section>

            {/* B. Geração de caixa */}
            <section className="rd-secao">
              <h2>Geração de caixa</h2>
              <TabelaDados
                colunas={[{ chave: 'n', titulo: 'Atividade' }, { chave: 'a', titulo: per.anterior, num: true }, { chave: 'b', titulo: per.atual, num: true }, { chave: 'd', titulo: 'Diferença', num: true }, { chave: 'p', titulo: '%', num: true }]}
                linhas={[...(pacote.caixa?.atividades || []).filter(a => !a.indisponivel && (Math.abs(num(a.atual) || 0) + Math.abs(num(a.anterior) || 0)) > 0.01),
                  { nome: '= Variação de caixa', ...pacote.caixa?.variacao }]
                  .map(a => ({ n: a.nome, a: fmt(a.anterior), b: fmt(a.atual), d: fmt(a.diferenca), p: pctTxt(a.pct) }))} />
              {lista([['Operacional', ia.geracao_caixa?.operacional], ['Investimento', ia.geracao_caixa?.investimento], ['Financiamento', ia.geracao_caixa?.financiamento], ['Dependência de recursos de fora', ia.geracao_caixa?.dependencia_externa]].filter(([, x]) => x?.texto), ([rot, x]) => <><span className="rd-forte">{rot}:</span> {x.texto}{grau(x.grau)}{base(x.evidencias)}{marca(x)}</>)}
            </section>

            {/* C. O que mais mudou e por quê */}
            <section className="rd-secao">
              <h2>O que mais mudou e por quê ({per.atual} × {per.anterior})</h2>
              {(pacote.caixa?.maioresFatores || []).length > 0 && (
                <TabelaDados
                  colunas={[{ chave: 'c', titulo: 'Conta' }, { chave: 'a', titulo: per.anterior, num: true }, { chave: 'b', titulo: per.atual, num: true }, { chave: 'd', titulo: 'Diferença', num: true }, { chave: 'p', titulo: '%', num: true }]}
                  linhas={pacote.caixa.maioresFatores.map(m => ({ c: `${m.conta} (${m.caminho})`, a: fmt(m.anterior), b: fmt(m.atual), d: fmt(m.diferenca), p: pctTxt(m.pct) }))} />
              )}
              {lista(ia.investigacao_variacoes || [], (v) => <><span className="rd-forte">{v.conta}:</span> {v.explicacao}{v.consequencia ? ` Consequência: ${v.consequencia}` : ''}{v.recorrencia ? ` (${v.recorrencia})` : ''}{grau(v.grau)}{base(v.evidencias)}{marca(v)}</>)}
              {Object.keys(investigacoes).length > 0 && (
                <>
                  <h3 style={{ fontSize: '10.5pt', margin: '10px 0 4px' }}>Investigação por conta</h3>
                  {Object.values(investigacoes).map((inv) => {
                    const r = inv.resposta || {};
                    const c = r.camadas || {};
                    return (
                      <div key={inv.conta} className="rd-card" style={{ marginBottom: '6px', breakInside: 'avoid' }}>
                        <p><span className="rd-forte">{inv.conta}</span>{grau(r.grau)} — {r.resumo}</p>
                        {lista([['O que mudou', c.o_que_mudou], ['Quem explica', c.quem_explica], ['Cruzamento', c.cruzamento], ['Pontual ou recorrente', c.recorrencia], ['Causa mais provável', c.causa_provavel], ['Consequência', c.consequencia], ['O que fazer', c.recomendacao]].filter(([, x]) => x), ([k, x]) => <><span className="rd-forte">{k}:</span> {x}</>)}
                        {(r.conferir || []).length > 0 && <p className="rd-muted">Conferir: {r.conferir.join('; ')}</p>}
                        {base(r.evidencias)}{marca(r)}
                      </div>
                    );
                  })}
                </>
              )}
            </section>

            {/* D. DRE × caixa */}
            <section className="rd-secao">
              <h2>DRE × caixa: o lucro está virando dinheiro?</h2>
              {!pacote.dre && <p className="rd-muted">A DRE não entrou nesta análise.</p>}
              {pacote.dre && (
                <TabelaDados
                  colunas={[{ chave: 'n', titulo: 'DRE' }, { chave: 'a', titulo: per.anterior, num: true }, { chave: 'b', titulo: per.atual, num: true }, { chave: 'p', titulo: '%', num: true }]}
                  linhas={[['Receita', pacote.dre.receita], ['Lucro bruto', pacote.dre.lucroBruto], ['Resultado', pacote.dre.resultado]].filter(([, c]) => c)
                    .map(([n, c]) => ({ n, a: fmt(c.anterior), b: fmt(c.atual), p: pctTxt(c.pct) }))} />
              )}
              {lista(ia.cruzamento_dre || [], (x) => <><span className="rd-forte">{x.titulo}:</span> {x.texto}{grau(x.grau)}{base(x.evidencias)}{marca(x)}</>)}
              {(pacote.cruzamentoDreCaixa || []).length > 0 && (
                <>
                  <p className="rd-muted" style={{ marginTop: '6px' }}>Regras automáticas (sem IA):</p>
                  {lista(pacote.cruzamentoDreCaixa, (d) => <><span className="rd-forte">{d.titulo}.</span> {d.texto}{grau(d.grau)}</>)}
                </>
              )}
            </section>

            {/* Transferências entre empresas */}
            {pacote.transferenciasEntreEmpresas && (pacote.transferenciasEntreEmpresas.pares > 0 || pacote.transferenciasEntreEmpresas.semContrapartida?.length > 0) && (
              <section className="rd-secao">
                <h2>Transferências entre empresas do grupo</h2>
                <p>
                  {pacote.transferenciasEntreEmpresas.modo === 'rede'
                    ? `${pacote.transferenciasEntreEmpresas.pares} transferência(s) casada(s) entre as empresas, somando ${fmt(pacote.transferenciasEntreEmpresas.valorPares)}${pacote.transferenciasEntreEmpresas.eliminadoNoConsolidado ? ', eliminadas do consolidado (não entraram nem saíram do grupo).' : '.'}`
                    : `Recebido de outras empresas do grupo: ${fmt(pacote.transferenciasEntreEmpresas.recebidoDoGrupo)} · enviado: ${fmt(pacote.transferenciasEntreEmpresas.enviadoAoGrupo)}.`}
                </p>
                {lista(pacote.transferenciasEntreEmpresas.semContrapartida || [], (s) => `Sem contrapartida: ${s.data.split('-').reverse().join('/')} · ${s.sentido} de ${fmt(s.valor)} · ${s.indicio}`)}
              </section>
            )}

            {/* E. Anomalias */}
            {((ia.anomalias || []).length > 0 || (pacote.pontosDeAtencao || []).length > 0) && (
              <section className="rd-secao">
                <h2>Anomalias e pontos de atenção</h2>
                {lista(ia.anomalias || [], (a) => <><span className="rd-forte">{a.titulo}:</span> {a.texto}{a.conferir ? ` Conferir: ${a.conferir}` : ''}{base(a.evidencias)}{marca(a)}</>)}
                {(pacote.pontosDeAtencao || []).length > 0 && (
                  <>
                    <p className="rd-muted" style={{ marginTop: '6px' }}>Detectados por regra (sem IA):</p>
                    {lista(pacote.pontosDeAtencao, (p) => <><span className="rd-forte">{p.titulo}.</span> {p.detalhe}</>)}
                  </>
                )}
              </section>
            )}

            {/* F. Capital de giro */}
            <section className="rd-secao">
              <h2>Capital de giro e liquidez</h2>
              {pacote.capitalDeGiro && (
                <TabelaDados
                  colunas={[{ chave: 'n', titulo: `Em aberto em ${String(pacote.capitalDeGiro.dataSaldo || '').split('-').reverse().join('/')}` }, { chave: 'v', titulo: 'Valor', num: true }]}
                  linhas={[['A receber', 'contasReceber'], ['A receber vencido', 'contasReceberVencido'], ['A pagar', 'contasPagar'], ['A pagar vencido', 'contasPagarVencido'], ['Prazo médio de recebimento (aprox.)', 'pmr'], ['Prazo médio de pagamento (aprox.)', 'pmp']]
                    .filter(([, k]) => pacote.capitalDeGiro[k]).map(([n, k]) => ({ n, v: fmt(pacote.capitalDeGiro[k]) }))} />
              )}
              {ia.capital_giro?.avaliacao && <p>{ia.capital_giro.avaliacao}</p>}
              {base(ia.capital_giro?.evidencias)}{marca(ia.capital_giro)}
              {(ia.capital_giro?.dados_ausentes || []).length > 0 && <p className="rd-muted">Faltou para calcular: {ia.capital_giro.dados_ausentes.join('; ')}.</p>}
            </section>

            {/* Posto */}
            {pacote.posto?.combustiveis?.length > 0 && (
              <section className="rd-secao">
                <h2>Combustíveis ({per.atual})</h2>
                <TabelaDados
                  colunas={[{ chave: 'p', titulo: 'Produto' }, { chave: 'l', titulo: 'Litros', num: true }, { chave: 'pm', titulo: 'Preço médio', num: true }, { chave: 'cm', titulo: 'Custo médio', num: true }, { chave: 'mg', titulo: 'Margem/L', num: true }]}
                  linhas={pacote.posto.combustiveis.map(c => ({ p: c.produto, l: fmt(c.litros), pm: fmt(c.precoMedio), cm: fmt(c.custoMedio), mg: fmt(c.margemPorLitro) }))} />
              </section>
            )}

            {/* G. Diagnóstico */}
            <section className="rd-secao">
              <h2>Diagnóstico e causas</h2>
              {[['Comprovadas pelos dados', ia.diagnostico?.comprovadas], ['Prováveis', ia.diagnostico?.provaveis], ['Hipóteses a confirmar', ia.diagnostico?.hipoteses]].filter(([, l]) => (l || []).length).map(([rot, l]) => (
                <div key={rot}>
                  <p className="rd-forte" style={{ margin: '6px 0 2px' }}>{rot}</p>
                  {lista(l, (d) => <>{d.texto}{d.como_confirmar ? ` Como confirmar: ${d.como_confirmar}` : ''}{base(d.evidencias)}{marca(d)}</>)}
                </div>
              ))}
            </section>

            {/* H. Plano de ação */}
            <section className="rd-secao">
              <h2>{pa.situacao_critica ? 'Plano de reversão' : 'Plano de ação'}</h2>
              {pa.situacao_critica && pa.diagnostico_situacao && <p>{pa.diagnostico_situacao}</p>}
              {[['Imediato (0 a 7 dias)', pa.imediatas_0_7_dias], ['Curto prazo (8 a 30 dias)', pa.curto_prazo_8_30_dias], ['Estrutural (31 a 90 dias)', pa.estruturais_31_90_dias]].filter(([, l]) => (l || []).length).map(([rot, l]) => (
                <div key={rot}>
                  <p className="rd-forte" style={{ margin: '6px 0 2px' }}>{rot}</p>
                  <PlanoAcao acoes={l.map(a => ({ acao: `${a.acao}${a.por_que ? ` — ${a.por_que}` : ''}`, prazo: rot.replace(/.*\((.*)\)/, '$1') }))} />
                </div>
              ))}
              {(pa.cenarios || []).length > 0 && (
                <>
                  <p className="rd-forte" style={{ margin: '6px 0 2px' }}>Cenários de recuperação (projeção com premissas — não é resultado)</p>
                  {lista(pa.cenarios, (c) => <><span className="rd-forte">{c.nome}:</span> {c.premissas} {c.efeito_no_caixa}{base(c.evidencias)}{marca(c)}</>)}
                </>
              )}
              {(pa.indicadores_acompanhamento || []).length > 0 && (
                <>
                  <p className="rd-forte" style={{ margin: '6px 0 2px' }}>Indicadores para acompanhar</p>
                  {lista(pa.indicadores_acompanhamento, (x) => <><span className="rd-forte">{x.indicador}:</span> {x.referencia}</>)}
                </>
              )}
            </section>

            {/* I. Conclusão */}
            <section className="rd-secao">
              <h2>Conclusão do analista</h2>
              {lista([['Melhorou ou piorou?', ia.conclusao?.melhorou_ou_piorou], ['O que provocou', ia.conclusao?.o_que_provocou], ['Risco mais importante', ia.conclusao?.risco_principal], ['Investigar agora', ia.conclusao?.investigar_agora], ['Maior impacto positivo', ia.conclusao?.maior_impacto_positivo]].filter(([, v]) => v), ([k, v]) => <><span className="rd-forte">{k}{k.endsWith('?') ? '' : ':'}</span> {v}</>)}
            </section>

            {/* Perguntas respondidas */}
            {perguntas.length > 0 && (
              <section className="rd-secao">
                <h2>Perguntas ao controller</h2>
                {perguntas.map((p, i) => (
                  <div key={i} style={{ marginBottom: '6px', breakInside: 'avoid' }}>
                    <p className="rd-forte" style={{ margin: '4px 0 2px' }}>{p.pergunta}</p>
                    <p style={{ margin: 0 }}>{p.resposta?.resposta}</p>
                    {lista(p.resposta?.pontos || [], (x) => <>{x.texto}{grau(x.grau)}{base(x.evidencias)}{marca(x)}</>)}
                    {p.resposta?.o_que_falta && <p className="rd-muted">Faltou: {p.resposta.o_que_falta}</p>}
                    {p.resposta?.proximo_passo && <p className="rd-muted">Próximo passo: {p.resposta.proximo_passo}</p>}
                  </div>
                ))}
              </section>
            )}

            <NotaConsultor texto={nota} />

            {(pacote.dadosAusentes || []).length > 0 && (
              <p className="rd-muted" style={{ fontSize: '8.5pt' }}>Não entrou nesta análise: {pacote.dadosAusentes.join('; ')}.</p>
            )}
            <Glossario termos={GLOSSARIO} />
            <div className="rd-rodape">
              Relatório gerado com apoio de inteligência artificial a partir dos dados do sistema; os números das tabelas vêm direto dos dados e as conclusões indicam o grau de certeza.
            </div>
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
