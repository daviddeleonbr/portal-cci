// Relatório de DRE em PDF — redesenhado para o dono de posto entender em 30s.
// Números vêm do payload `dados` (agregador) — NÃO são recalculados aqui,
// só formatados. A prosa vem do `insights` (IA). Layout leigo: Página 1 de
// resumo, faixa de qualidade quando há inconsistência, seções "O que é /
// Como está / O que fazer", plano de ação, perguntas e glossário.

import './relatorioImpressao.css';
import PapelTimbrado from './PapelTimbrado';
import { moeda, pct, variacao, traduzirRotulo, statusDaSituacao } from './formatarPtBr';
import {
  SeloStatus, CartaoKpi, FaixaQualidade, TabelaDados, BarraComposicao,
  MiniTendencia, PlanoAcao, Glossario, Tag, NotaConsultor,
} from './componentesRelatorio';
import { NotaItemImpressa, NotasConsultorConsolidado, NotasDaSecao, chaveNota } from './notasItens';

// Termos do DRE explicados em uma frase (glossário — última página).
const GLOSSARIO_DRE = [
  { termo: 'DRE', def: 'Demonstração do Resultado — o "resumo de lucros e perdas" do mês: mostra o que entrou, o que saiu e o que sobrou.' },
  { termo: 'Faturamento (receita bruta)', def: 'Tudo o que o posto vendeu no mês, antes de tirar impostos e custos.' },
  { termo: 'Deduções', def: 'Impostos e devoluções descontados direto do faturamento.' },
  { termo: 'Receita líquida', def: 'O faturamento depois de tirar os impostos sobre a venda.' },
  { termo: 'Custo do que foi vendido (CMV)', def: 'Quanto o posto pagou pelo combustível e produtos que revendeu.' },
  { termo: 'Lucro bruto', def: 'O que sobra da venda depois de pagar o custo do produto, antes das despesas.' },
  { termo: 'Despesas operacionais', def: 'Gastos para o posto funcionar: salários, energia, aluguel, manutenção, etc.' },
  { termo: 'Lucro (ou prejuízo) líquido', def: 'O que realmente sobrou no bolso no fim do mês, depois de tudo.' },
  { termo: 'Margem', def: 'Quanto sobra de lucro para cada R$ 100 vendidos. Margem 5% = R$ 5 de lucro a cada R$ 100.' },
  { termo: 'vs. mesmo mês do ano passado', def: 'Comparação com o mesmo mês do ano anterior (ex.: julho deste ano vs. julho do ano passado).' },
];

export default function RelatorioDre({ insights, dados, empresa, periodo, modoRede = false, nota = '', notasItens = {} }) {
  const kpis = dados?.periodo_atual?.kpis || {};
  const yoy = dados?.comparativo_yoy || {};
  const serie = dados?.tendencia_6m || [];
  const baseReceita = Number(dados?.base_receita_para_pct || kpis.receita_bruta || 0);

  // ── Detecção de inconsistência (ex.: receita reconhecida ínfima vs custo enorme) ──
  const custosTotais = Number(kpis.cmv || 0) + Number(kpis.despesas_operacionais || 0);
  const razaoCusto = baseReceita > 0 ? custosTotais / baseReceita : Infinity;
  const inconsistente = baseReceita <= 0 || (custosTotais > 0 && razaoCusto > 3);

  // ── vs mês passado (MoM) a partir da série de 6 meses ──
  const molValor = (s) => Number(s?.receita_liquida ?? 0);
  const mesAtualSerie = serie[serie.length - 1];
  const mesAnteriorSerie = serie[serie.length - 2];
  const momPct = (mesAnteriorSerie && molValor(mesAnteriorSerie) !== 0)
    ? ((molValor(mesAtualSerie) - molValor(mesAnteriorSerie)) / Math.abs(molValor(mesAnteriorSerie))) * 100
    : null;

  // ── Selo de status (frase em português simples) ──
  const lucro = Number(kpis.lucro_liquido || 0);
  const margem = Number(kpis.margem_liquida_pct || 0);
  let status, frase;
  if (inconsistente) {
    status = 'critico';
    frase = 'Os números estão incompletos — algumas vendas não entraram no faturamento. Corrija antes de tomar decisões com base neste relatório.';
  } else if (lucro > 0 && margem >= 3) {
    status = 'bom';
    frase = `O posto deu lucro de ${moeda(lucro)} no mês, com margem de ${pct(margem)}. Continue no caminho e proteja essa margem.`;
  } else if (lucro > 0) {
    status = 'atencao';
    frase = `O posto deu um lucro apertado (${moeda(lucro)}, margem ${pct(margem)}). Dá para melhorar cortando desperdício.`;
  } else {
    status = 'critico';
    frase = `O posto fechou o mês no vermelho (${moeda(lucro)}). É preciso agir sobre custos e preços agora.`;
  }
  // Se a IA sinalizou situação, respeita quando for pior que a calculada.
  const sIA = statusDaSituacao(insights?.resumo_executivo?.situacao);
  if (!inconsistente && sIA === 'critico') status = 'critico';

  const trad = (t) => traduzirRotulo(t || '');
  const pctOuNota = (v) => inconsistente ? '—' : pct(v); // suprime % absurdo

  // ── Cartões de custo para a barra de composição ──
  const itensCusto = [];
  if (Number(kpis.cmv) > 0) itensCusto.push({ rotulo: 'Custo do combustível/produtos (CMV)', valor: kpis.cmv });
  if (Number(kpis.despesas_operacionais) > 0) itensCusto.push({ rotulo: 'Despesas para operar', valor: kpis.despesas_operacionais });

  const recomendacoes = insights?.recomendacoes || [];
  const perguntas = insights?.perguntas_gestor || insights?.perguntas_chave_gestor || [];

  // Notas por tópico no contexto de cada seção (pelo título do card na tela).
  const nt = (t) => <NotaItemImpressa chave={chaveNota('topico', t)} notas={notasItens} rotulo={t} />;
  const TOPICOS_INLINE = ['Resumo executivo', 'Margens', 'Linhas críticas da DRE', 'Custos e despesas', 'Tendência', 'Recomendacoes estrategicas', 'Perguntas para o gestor refletir'];
  const sobras = (chave) => chave.startsWith('topico:') && !TOPICOS_INLINE.map(t => chaveNota('topico', t)).includes(chave);

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
          <h1 className="rd-capa-titulo">Como foi o mês do seu posto</h1>
          <p className="rd-capa-sub">
            {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''} · {periodo}{modoRede ? ' · rede consolidada' : ''}
          </p>

          {/* Faixa de qualidade (quando inconsistente) */}
          {inconsistente && (
            <FaixaQualidade
              texto="Algumas vendas não estão entrando na conta de faturamento (o faturamento reconhecido está muito abaixo dos custos). Enquanto isso não for corrigido, as margens e percentuais abaixo não refletem a realidade do posto."
              acao="peça ao seu contador para conferir se todas as vendas do mês foram lançadas na receita."
            />
          )}

          {/* Selo de status */}
          <SeloStatus status={status} frase={frase} />

          {/* Cartões-chave */}
          <div className="rd-kpis">
            <CartaoKpi rotulo="Faturamento" valor={moeda(kpis.receita_bruta)} explica="Tudo o que o posto vendeu no mês." />
            <CartaoKpi rotulo="Custos e despesas" valor={moeda(custosTotais)} explica="Combustível/produtos comprados + gastos para operar." />
            <CartaoKpi
              rotulo={lucro < 0 ? 'Prejuízo' : 'Lucro do mês'}
              valor={moeda(lucro)}
              explica="O que sobrou (ou faltou) depois de pagar tudo." />
            <CartaoKpi
              rotulo="Margem de lucro"
              valor={inconsistente ? '—' : pct(margem)}
              explica={inconsistente ? 'Não confiável enquanto o faturamento estiver incompleto.' : 'Quanto sobra de lucro a cada R$ 100 vendidos.'} />
            <CartaoKpi
              rotulo="vs. mês passado"
              valor={momPct != null ? variacao(momPct) : '—'}
              variacaoPct={momPct != null ? momPct : undefined}
              explica="Faturamento comparado ao mês anterior." />
            <CartaoKpi
              rotulo="vs. mesmo mês do ano passado"
              valor={yoy.variacao_receita_pct != null ? variacao(yoy.variacao_receita_pct) : '—'}
              variacaoPct={yoy.variacao_receita_pct}
              explica="Faturamento comparado a um ano atrás." />
          </div>

          {/* Nota geral do consultor + nota do resumo (no contexto do topo) */}
          <NotaConsultor texto={nota} />
          {nt('Resumo executivo')}

          {/* ── Margens ── */}
          <section className="rd-secao">
            <h2>Sua margem de lucro</h2>
            <p className="rd-oque-e">O que é isso? É quanto sobra de lucro para cada R$ 100 que o posto vende. Margem baixa significa vender muito e sobrar pouco.</p>
            {insights?.margens?.interpretacao_yoy && <p>{trad(insights.margens.interpretacao_yoy)}</p>}
            {insights?.margens?.interpretacao && <p>{trad(insights.margens.interpretacao)}</p>}
            {insights?.margens?.causas?.length > 0 && (
              <>
                <h3>Por que a margem está assim</h3>
                <ul>{insights.margens.causas.map((c, i) => <li key={i}>{trad(c)}</li>)}</ul>
              </>
            )}
            {inconsistente && (
              <p className="rd-muted"><em>Percentuais de margem omitidos: o faturamento reconhecido está inconsistente (veja o aviso no topo).</em></p>
            )}
            {nt('Margens')}
          </section>

          {/* ── Para onde vai o dinheiro (barra de composição) ── */}
          {itensCusto.length > 0 && (
            <section className="rd-secao">
              <h2>Para onde vai o dinheiro</h2>
              <p className="rd-oque-e">O que é isso? Mostra o peso de cada tipo de gasto. A maior fatia é quase sempre o combustível que o posto compra para revender.</p>
              <BarraComposicao itens={itensCusto} />
            </section>
          )}

          {/* ── Linhas que mais mudaram / críticas ── */}
          {insights?.linhas_criticas?.length > 0 && (
            <section className="rd-secao">
              <h2>Contas que mais pesaram</h2>
              <p className="rd-oque-e">O que é isso? As contas de despesa que mais mudaram em relação ao ano passado — onde vale a pena olhar de perto.</p>
              <TabelaDados
                className="longa"
                colunas={[
                  { chave: 'linha', titulo: 'Conta / item de despesa' },
                  { chave: 'valor_atual', titulo: 'Este mês', num: true, render: (v) => moeda(v) },
                  { chave: 'valor_yoy', titulo: 'Ano passado', num: true, render: (v) => moeda(v) },
                  { chave: 'var', titulo: 'Variação', num: true, render: (_, l) => {
                      const vp = l.variacao_yoy_pct ?? l.variacao_pct;
                      return vp != null ? variacao(vp) : '—';
                    } },
                ]}
                linhas={insights.linhas_criticas}
              />
              {insights.linhas_criticas.some(l => l.comentario) && (
                <ul>
                  {insights.linhas_criticas.filter(l => l.comentario).map((l, i) => (
                    <li key={i}><span className="rd-forte">{l.linha}:</span> {trad(l.comentario)}</li>
                  ))}
                </ul>
              )}
              {insights.linhas_criticas.map((l, i) => (
                <NotaItemImpressa key={i} chave={chaveNota('linha-critica', l.linha)} notas={notasItens} rotulo={l.linha} />
              ))}
              {nt('Linhas críticas da DRE')}
            </section>
          )}

          {/* ── Custos e despesas (avaliação + excessos) ── */}
          {insights?.custos_despesas && (
            <section className="rd-secao">
              <h2>Onde dá para economizar</h2>
              <p className="rd-oque-e">O que é isso? Os maiores gastos do mês e onde pode haver desperdício.</p>
              {insights.custos_despesas.avaliacao && (
                <p>Situação geral dos gastos: <Tag status={status === 'bom' ? 'bom' : 'atencao'}>{trad(insights.custos_despesas.avaliacao)}</Tag></p>
              )}
              {insights.custos_despesas.maiores_itens?.length > 0 && (
                <TabelaDados
                  colunas={[
                    { chave: 'nome', titulo: 'Gasto' },
                    { chave: 'valor', titulo: 'Valor', num: true, render: (v) => moeda(v) },
                    { chave: 'pct_receita', titulo: '% do faturamento', num: true, render: (v) => pctOuNota(v) },
                    { chave: 'comentario', titulo: 'Observação', render: (v) => trad(v) || '—' },
                  ]}
                  linhas={insights.custos_despesas.maiores_itens}
                />
              )}
              {insights.custos_despesas.excessos?.length > 0 && (
                <>
                  <h3>Possíveis desperdícios</h3>
                  <ul>{insights.custos_despesas.excessos.map((e, i) => <li key={i}>{trad(e)}</li>)}</ul>
                </>
              )}
              {nt('Custos e despesas')}
              <NotasDaSecao notas={notasItens} prefixo="custo-item" />
            </section>
          )}

          {/* ── Tendência (6 meses) ── */}
          {serie.length >= 2 && (
            <section className="rd-secao">
              <h2>Como vem evoluindo</h2>
              <p className="rd-oque-e">O que é isso? A linha do faturamento nos últimos meses. Um mês marcado com ⚠ pode ter dado faltando.</p>
              <MiniTendencia
                titulo="Faturamento líquido por mês"
                serie={serie.map(s => ({ mes: s.mes, valor: s.receita_liquida }))}
              />
              {insights?.tendencia?.resumo_6m && <p>{trad(insights.tendencia.resumo_6m)}</p>}
              {nt('Tendência')}
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
                ganho: r.impacto_esperado_valor ?? null,
              }))} />
              {recomendacoes.some(r => r.justificativa || r.impacto_esperado || r.impacto) && (
                <ul>
                  {recomendacoes.filter(r => r.justificativa || r.impacto_esperado || r.impacto).map((r, i) => (
                    <li key={i}><span className="rd-forte">{trad(r.acao)}:</span> {trad(r.justificativa || r.impacto_esperado || r.impacto)}</li>
                  ))}
                </ul>
              )}
              {nt('Recomendacoes estrategicas')}
            </section>
          )}

          {/* ── Perguntas para o gestor ── */}
          {perguntas.length > 0 && (
            <section className="rd-secao">
              <h2>Perguntas para você pensar</h2>
              <ol style={{ paddingLeft: '6mm' }}>
                {perguntas.map((p, i) => <li key={i}>{trad(p)}</li>)}
              </ol>
              {nt('Perguntas para o gestor refletir')}
            </section>
          )}

          {/* Notas de tópicos sem seção própria neste relatório */}
          <NotasConsultorConsolidado notas={notasItens} titulo="Outras observações do consultor" filtro={sobras} />

          {/* ── Glossário ── */}
          <Glossario termos={GLOSSARIO_DRE} />

        {/* Rodapé */}
        <div className="rd-rodape">
          Relatório gerado com apoio de inteligência artificial e revisão da CCI. Leia junto com a DRE detalhada.
          {' '}Os valores em reais são reais; percentuais marcados com "—" foram omitidos por inconsistência nos dados de origem.
        </div>

      </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
