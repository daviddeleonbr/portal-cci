// Relatório de Fluxo de Caixa em PDF — redesenhado para o dono de posto entender
// em 30s. Espelha o RelatorioDre: os números vêm do payload `dados` (agregador) —
// NÃO são recalculados aqui, só formatados. A prosa vem do `insights` (IA).
// Mesma estrutura de payload para webposto e autosystem (fluxoInsights*Service).

import './relatorioImpressao.css';
import PapelTimbrado from './PapelTimbrado';
import { moeda, pct, variacao, traduzirRotulo, statusDaSituacao } from './formatarPtBr';
import {
  SeloStatus, CartaoKpi, FaixaQualidade, TabelaDados, BarraComposicao,
  MiniTendencia, PlanoAcao, Glossario,
} from './componentesRelatorio';

// Termos de fluxo de caixa explicados em uma frase (glossário — última página).
const GLOSSARIO_FLUXO = [
  { termo: 'Fluxo de caixa', def: 'O vai-e-vem do dinheiro no mês: tudo o que entrou no caixa/banco e tudo o que saiu.' },
  { termo: 'Entradas', def: 'Todo dinheiro que entrou no caixa e nos bancos no mês (recebimentos de venda, cartão, pix, etc.).' },
  { termo: 'Saídas', def: 'Todo dinheiro que saiu: pagamento à distribuidora, salários, impostos, contas do posto.' },
  { termo: 'Variação de caixa (sobrou / faltou)', def: 'Entradas menos saídas. Positivo = sobrou dinheiro no mês; negativo = faltou e o caixa encolheu.' },
  { termo: 'Saldo', def: 'Quanto de dinheiro o posto tem disponível em caixa e bancos num momento.' },
  { termo: 'Conta gerencial', def: 'O "apelido" de cada tipo de gasto ou recebimento (ex.: Compra de combustível, Folha, Energia).' },
  { termo: 'Grupo', def: 'Um conjunto de contas parecidas agrupadas (ex.: todas as despesas com pessoal em "Folha").' },
  { termo: 'Concentração de risco', def: 'Quando uma só conta responde por uma fatia muito grande das saídas — se ela variar, o caixa sente na hora.' },
  { termo: 'Tendência', def: 'A direção do caixa ao longo dos últimos meses: melhorando, estável ou piorando.' },
  { termo: 'Liquidez', def: 'A capacidade do posto de ter dinheiro em mãos para pagar as contas em dia.' },
];

export default function RelatorioFluxo({ insights, dados, empresa, periodo, modoRede = false }) {
  // ── Extração defensiva dos KPIs (webposto x autosystem têm o mesmo formato) ──
  const pa = dados?.periodo_atual || {};
  const entradas = Number(pa.entradas_total ?? 0);
  const saidas = Number(pa.saidas_total ?? 0);
  const variacaoCaixa = Number(pa.variacao_caixa ?? (entradas - saidas));

  const serie = dados?.tendencia_6m || [];
  const yoy = dados?.comparativo_yoy || {};
  const porGrupo = pa.por_grupo || [];
  const alertasDados = dados?.alertas || {};

  // ── Detecção de inconsistência (sem movimento nenhum) ──
  const inconsistente = entradas <= 0 && saidas <= 0;

  // ── vs mês passado (MoM) a partir da série de 6 meses (entradas) ──
  const entSerie = (s) => Number(s?.entradas ?? 0);
  const mesAtualSerie = serie[serie.length - 1];
  const mesAnteriorSerie = serie[serie.length - 2];
  const momEntradasPct = (mesAnteriorSerie && entSerie(mesAnteriorSerie) !== 0)
    ? ((entSerie(mesAtualSerie) - entSerie(mesAnteriorSerie)) / Math.abs(entSerie(mesAnteriorSerie))) * 100
    : null;

  // ── Selo de status (frase em português simples, derivada dos números) ──
  const faltouMuito = entradas > 0 && variacaoCaixa < -0.1 * entradas;
  let status, frase;
  if (inconsistente) {
    status = 'critico';
    frase = 'Não há movimento de caixa lançado neste período. Confira se as contas bancárias e o caixa foram conciliados antes de usar este relatório.';
  } else if (variacaoCaixa > 0) {
    status = 'bom';
    frase = `Sobrou ${moeda(variacaoCaixa)} no caixa no mês: entrou mais do que saiu. Continue segurando as saídas e reforce a reserva.`;
  } else if (!faltouMuito) {
    status = 'atencao';
    frase = `Faltou ${moeda(Math.abs(variacaoCaixa))} no caixa no mês (saiu um pouco mais do que entrou). Fique de olho nas maiores saídas para não virar rotina.`;
  } else {
    status = 'critico';
    frase = `Faltou ${moeda(Math.abs(variacaoCaixa))} no caixa no mês — o caixa encolheu de forma relevante. Aja sobre as maiores saídas e o prazo de pagamento agora.`;
  }
  // Se a IA sinalizou situação pior que a calculada, respeita.
  const sIA = statusDaSituacao(insights?.resumo_executivo?.situacao_caixa || insights?.resumo_executivo?.situacao);
  if (!inconsistente && sIA === 'critico') status = 'critico';

  const trad = (t) => traduzirRotulo(t || '');

  // ── Itens da barra de composição (peso de cada grupo nas saídas) ──
  const itensSaidas = (porGrupo || [])
    .filter(g => Number(g.saidas) > 0)
    .map(g => ({ rotulo: g.grupo, valor: g.saidas }));
  if (Number(pa.sem_plano?.saidas) > 0) {
    itensSaidas.push({ rotulo: 'Saídas sem classificação', valor: pa.sem_plano.saidas });
  }

  // ── Oportunidades (objeto de listas) achatadas numa lista única ──
  const opo = insights?.oportunidades || {};
  const oportunidades = [].concat(
    opo.aumentar_entradas || [],
    opo.reduzir_saidas || [],
    opo.otimizar_prazo || [],
  ).filter(Boolean);

  const recomendacoes = insights?.recomendacoes || [];
  const perguntas = insights?.perguntas_gestor || insights?.perguntas_chave_gestor || [];
  const concentracoes = insights?.concentracoes || [];

  return (
    <div className="rd-doc-wrap">
      <PapelTimbrado />
      {/* Tabela de layout: thead/tfoot reservam a margem de topo/rodapé em CADA
          página (o timbrado passa por trás, colado nas bordas). */}
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td>
      <div className="rd-doc">

        {/* Cabeçalho */}
          <h1 className="rd-capa-titulo">Para onde foi o dinheiro do seu posto</h1>
          <p className="rd-capa-sub">
            {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''} · {periodo}{modoRede ? ' · rede consolidada' : ''}
          </p>

          {/* Faixa de qualidade (quando não há movimento) */}
          {inconsistente && (
            <FaixaQualidade
              texto="Não encontramos entradas nem saídas de caixa neste período. Isso costuma indicar que a conciliação das contas bancárias/caixa ainda não foi feita para o mês."
              acao="peça à CCI para conferir a conciliação bancária e de caixa do período."
            />
          )}

          {/* Selo de status */}
          <SeloStatus status={status} frase={frase} />

          {/* Cartões-chave */}
          <div className="rd-kpis">
            <CartaoKpi rotulo="Entradas" valor={moeda(entradas)} explica="Todo dinheiro que entrou no caixa e nos bancos." />
            <CartaoKpi rotulo="Saídas" valor={moeda(saidas)} explica="Todo dinheiro que saiu para pagar as contas." />
            <CartaoKpi
              rotulo={variacaoCaixa < 0 ? 'Faltou no caixa' : 'Sobrou no caixa'}
              valor={moeda(variacaoCaixa)}
              explica="Entradas menos saídas: o que sobrou (ou faltou) no mês." />
            <CartaoKpi
              rotulo="Entradas vs. mês passado"
              valor={momEntradasPct != null ? variacao(momEntradasPct) : '—'}
              variacaoPct={momEntradasPct != null ? momEntradasPct : undefined}
              explica="Entradas comparadas ao mês anterior." />
            <CartaoKpi
              rotulo="Entradas vs. ano passado"
              valor={yoy.variacao_entradas_pct != null ? variacao(yoy.variacao_entradas_pct) : '—'}
              variacaoPct={yoy.variacao_entradas_pct}
              explica="Entradas comparadas ao mesmo mês do ano passado." />
            <CartaoKpi
              rotulo="Saídas vs. ano passado"
              valor={yoy.variacao_saidas_pct != null ? variacao(yoy.variacao_saidas_pct) : '—'}
              variacaoPct={yoy.variacao_saidas_pct != null ? -yoy.variacao_saidas_pct : undefined}
              explica="Saídas comparadas ao mesmo mês do ano passado (subir é ruim para o caixa)." />
          </div>

          {/* ── O que sobrou ou faltou ── */}
          {insights?.variacao_caixa && (
            <section className="rd-secao">
              <h2>Por que sobrou (ou faltou) dinheiro</h2>
              <p className="rd-oque-e">O que é isso? A explicação do resultado do caixa no mês: o que puxou o dinheiro para cima e o que puxou para baixo.</p>
              {insights.variacao_caixa.interpretacao && <p>{trad(insights.variacao_caixa.interpretacao)}</p>}
              {insights.variacao_caixa.causas_principais?.length > 0 && (
                <>
                  <h3>Principais causas</h3>
                  <ul>{insights.variacao_caixa.causas_principais.map((c, i) => <li key={i}>{trad(c)}</li>)}</ul>
                </>
              )}
            </section>
          )}

          {/* ── Para onde vai o dinheiro (barra de composição) ── */}
          {itensSaidas.length > 0 && (
            <section className="rd-secao">
              <h2>Para onde vai o dinheiro</h2>
              <p className="rd-oque-e">O que é isso? Mostra o peso de cada tipo de saída no mês. A maior fatia costuma ser a compra de combustível da distribuidora.</p>
              <BarraComposicao itens={itensSaidas} />
            </section>
          )}

          {/* ── Contas que mais pesaram (grupos da MÁSCARA de fluxo, não contas cruas do ERP) ── */}
          {porGrupo.length > 0 && (
            <section className="rd-secao">
              <h2>Contas que mais pesaram</h2>
              <p className="rd-oque-e">O que é isso? As contas da sua estrutura de fluxo de caixa (máscara) que mais movimentaram dinheiro no mês — onde vale a pena olhar de perto para economizar.</p>
              <TabelaDados
                className="longa"
                colunas={[
                  { chave: 'grupo', titulo: 'Conta (máscara de fluxo)', render: (v) => trad(v) },
                  { chave: 'saidas', titulo: 'Saídas', num: true, render: (v) => moeda(v) },
                  { chave: 'entradas', titulo: 'Entradas', num: true, render: (v) => moeda(v) },
                  { chave: 'pct', titulo: '% das saídas', num: true, render: (_, l) => saidas > 0 ? pct((Number(l.saidas || 0) / saidas) * 100) : '—' },
                ]}
                linhas={[...porGrupo]
                  .filter(g => Number(g.entradas || 0) > 0 || Number(g.saidas || 0) > 0)
                  .sort((a, b) => (Number(b.saidas || 0) + Number(b.entradas || 0)) - (Number(a.saidas || 0) + Number(a.entradas || 0)))
                  .slice(0, 15)}
              />
            </section>
          )}

          {/* ── Concentração de risco ── */}
          {(concentracoes.length > 0 || alertasDados.concentracao_risco?.length > 0) && (
            <section className="rd-secao">
              <h2>Cuidado com a dependência de poucas contas</h2>
              <p className="rd-oque-e">O que é isso? Quando uma só conta responde por uma fatia enorme das saídas, qualquer variação nela mexe muito no caixa. Vale acompanhar de perto.</p>
              {concentracoes.length > 0 ? (
                <ul>{concentracoes.map((c, i) => (
                  <li key={i}>
                    <span className="rd-forte">{c.grupo || c.conta_gerencial || c.conta}</span>
                    {c.pct_do_total != null ? ` — ${pct(c.pct_do_total)} das saídas` : ''}
                    {c.risco ? `. ${trad(c.risco)}` : ''}
                    {c.sugestao ? ` ${trad(c.sugestao)}` : ''}
                  </li>
                ))}</ul>
              ) : (
                <ul>{alertasDados.concentracao_risco.map((c, i) => (
                  <li key={i}>
                    <span className="rd-forte">{c.conta}</span>
                    {c.pct_das_saidas != null ? ` — ${pct(c.pct_das_saidas)} das saídas` : ''}
                    {c.valor != null ? ` (${moeda(c.valor)})` : ''}
                  </li>
                ))}</ul>
              )}
            </section>
          )}

          {/* ── Tendência (6 meses) ── */}
          {serie.length >= 2 && (
            <section className="rd-secao">
              <h2>Como vem evoluindo</h2>
              <p className="rd-oque-e">O que é isso? Quanto sobrou ou faltou no caixa a cada mês. Vários meses seguidos no negativo acendem o alerta de liquidez.</p>
              <MiniTendencia
                titulo="Sobra/falta de caixa por mês"
                serie={serie.map(s => ({ mes: s.mes, valor: Number(s.variacao_caixa ?? 0) }))}
              />
              {insights?.tendencia?.resumo_6m && <p>{trad(insights.tendencia.resumo_6m)}</p>}
              {insights?.tendencia?.risco_liquidez_proximos_meses && (
                <p>Risco de faltar caixa nos próximos meses: <span className="rd-forte">{trad(insights.tendencia.risco_liquidez_proximos_meses)}</span>.</p>
              )}
            </section>
          )}

          {/* ── Saídas crescentes / padrão dos grupos ── */}
          {insights?.padrao_grupos?.saidas_crescentes?.length > 0 && (
            <section className="rd-secao">
              <h2>Gastos que estão subindo</h2>
              <p className="rd-oque-e">O que é isso? Os grupos de saída que cresceram em relação ao ano passado — os primeiros lugares para procurar economia.</p>
              <ul>{insights.padrao_grupos.saidas_crescentes.map((s, i) => (
                <li key={i}>
                  <span className="rd-forte">{s.grupo}</span>
                  {s.variacao_yoy_pct != null ? ` — subiu ${pct(Number(s.variacao_yoy_pct))} vs. ano passado` : ''}
                  {s.comentario ? `. ${trad(s.comentario)}` : ''}
                </li>
              ))}</ul>
            </section>
          )}

          {/* ── Oportunidades ── */}
          {oportunidades.length > 0 && (
            <section className="rd-secao">
              <h2>Como segurar mais dinheiro no caixa</h2>
              <p className="rd-oque-e">O que é isso? Ideias práticas para aumentar as entradas, reduzir as saídas e ganhar prazo de pagamento.</p>
              <ul>{oportunidades.map((o, i) => <li key={i}>{trad(o)}</li>)}</ul>
            </section>
          )}

          {/* ── Plano de ação ── */}
          {recomendacoes.length > 0 && (
            <section className="rd-secao">
              <h2>O que fazer nesta semana</h2>
              <p className="rd-oque-e">Marque cada ação conforme for resolvendo. Comece pelas de cima.</p>
              <PlanoAcao acoes={recomendacoes.map(r => ({
                acao: trad(r.acao),
                responsavel: r.responsavel_sugerido || null,
                prazo: r.prazo || (r.prioridade === 'alta' ? 'esta semana' : r.prioridade === 'media' ? 'este mês' : 'quando der'),
                ganho: r.efeito_em_caixa_valor ?? null,
              }))} />
              {recomendacoes.some(r => r.justificativa || r.efeito_em_caixa || r.impacto) && (
                <ul>
                  {recomendacoes.filter(r => r.justificativa || r.efeito_em_caixa || r.impacto).map((r, i) => (
                    <li key={i}><span className="rd-forte">{trad(r.acao)}:</span> {trad(r.justificativa || r.efeito_em_caixa || r.impacto)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ── Perguntas para o gestor ── */}
          {perguntas.length > 0 && (
            <section className="rd-secao">
              <h2>Perguntas para você pensar</h2>
              <ol style={{ paddingLeft: '6mm' }}>
                {perguntas.map((p, i) => <li key={i}>{trad(p)}</li>)}
              </ol>
            </section>
          )}

          {/* ── Glossário ── */}
          <Glossario termos={GLOSSARIO_FLUXO} />

        {/* Rodapé */}
        <div className="rd-rodape">
          Relatório gerado com apoio de inteligência artificial e revisão da CCI. Leia junto com o relatório de fluxo de caixa detalhado.
          {' '}Os valores em reais são reais; percentuais marcados com "—" foram omitidos por falta de dados de origem.
        </div>

      </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
