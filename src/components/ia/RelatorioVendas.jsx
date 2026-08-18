// Relatório de Vendas em PDF — redesenhado para o dono de posto entender em 30s.
// Espelha o RelatorioDre: os números vêm do payload `dados` (agregador) — NÃO são
// recalculados aqui, só formatados. A prosa vem do `insights` (IA). Funciona tanto
// para webposto (totais.receita_bruta / tendencia_6m.receita) quanto para autosystem
// (totais.faturamento_bruto / tendencia_6m.faturamento) via fallbacks com ??.

import './relatorioImpressao.css';
import PapelTimbrado from './PapelTimbrado';
import { moeda, pct, variacao, traduzirRotulo, statusDaSituacao } from './formatarPtBr';
import {
  SeloStatus, CartaoKpi, FaixaQualidade, TabelaDados, BarraComposicao,
  MiniTendencia, PlanoAcao, Glossario,
} from './componentesRelatorio';

// Termos de vendas explicados em uma frase (glossário — última página).
const GLOSSARIO_VENDAS = [
  { termo: 'Faturamento', def: 'Tudo o que o posto vendeu no mês — combustível, loja e automotivos somados, antes de tirar o custo.' },
  { termo: 'Custo do que foi vendido (CMV)', def: 'Quanto o posto pagou pelo combustível e produtos que revendeu no mês.' },
  { termo: 'Lucro bruto', def: 'O que sobra da venda depois de pagar só o custo do produto (ainda sem as despesas do posto).' },
  { termo: 'Margem', def: 'Quanto sobra de lucro bruto para cada R$ 100 vendidos. Margem 8% = R$ 8 a cada R$ 100.' },
  { termo: 'Mix de produtos', def: 'A "receita do bolo" de vendas: quanto do faturamento vem de combustível, quanto da loja e quanto de automotivos.' },
  { termo: 'Categoria', def: 'O grupo do produto: combustível (pista), loja de conveniência ou produtos automotivos (óleo, aditivo, etc.).' },
  { termo: 'Giro', def: 'A velocidade com que um produto vende. Combustível gira muito e sobra pouco; a loja gira menos e sobra mais.' },
  { termo: 'Litro / volume', def: 'A quantidade de combustível vendida, medida em litros (separado do valor em reais).' },
  { termo: 'Valor médio por abastecimento', def: 'Em média, quanto cada cliente gastou por passagem no posto.' },
  { termo: 'vs. mesmo mês do ano passado', def: 'Comparação com o mesmo mês do ano anterior (ex.: julho deste ano vs. julho do ano passado).' },
];

// Nomes amigáveis para as categorias do mix.
const CAT_ROTULO = {
  combustivel: 'Combustível (pista)',
  automotivos: 'Produtos automotivos',
  conveniencia: 'Loja de conveniência',
  outros: 'Outros (sem classificação)',
  sem_categoria: 'Sem classificação',
};

export default function RelatorioVendas({ insights, dados, empresa, periodo, modoRede = false }) {
  // ── Extração defensiva dos KPIs (webposto x autosystem x rede consolidada) ──
  const totais = dados?.totais || {};
  const consolidado = dados?.consolidado || {};
  const faturamento = Number(totais.faturamento_bruto ?? totais.receita_bruta ?? consolidado.receita_bruta ?? 0);
  const cmv = Number(totais.cmv ?? consolidado.cmv ?? 0);
  const lucroBruto = Number(totais.lucro_bruto ?? consolidado.lucro_bruto ?? (faturamento - cmv));
  const margem = Number(totais.margem_pct ?? consolidado.margem_pct ?? (faturamento > 0 ? (lucroBruto / faturamento) * 100 : 0));

  const serie = dados?.tendencia_6m || [];
  const yoy = dados?.comparativo_yoy || {};
  const mix = dados?.mix_por_categoria || dados?.mix_consolidado || [];
  const integ = dados?.integridade_dados || {};

  // ── Detecção de inconsistência (mix muito incompleto ou custo maior que a venda) ──
  const pctSemCategoria = Number(integ.pct_sem_categoria ?? integ.pct_outros ?? 0);
  const custoMaiorQueVenda = faturamento > 0 && cmv > faturamento * 1.5;
  const inconsistente = faturamento <= 0 || pctSemCategoria > 15 || custoMaiorQueVenda;

  // ── vs mês passado (MoM) a partir da série de 6 meses (faturamento) ──
  const fatSerie = (s) => Number(s?.faturamento ?? s?.receita ?? 0);
  const mesAtualSerie = serie[serie.length - 1];
  const mesAnteriorSerie = serie[serie.length - 2];
  const momPct = (mesAnteriorSerie && fatSerie(mesAnteriorSerie) !== 0)
    ? ((fatSerie(mesAtualSerie) - fatSerie(mesAnteriorSerie)) / Math.abs(fatSerie(mesAnteriorSerie))) * 100
    : null;

  // ── Selo de status (frase em português simples, derivada dos números) ──
  let status, frase;
  if (inconsistente) {
    status = 'critico';
    frase = 'Os números de vendas estão incompletos — parte do faturamento não está classificada. Corrija a categorização antes de tirar conclusões.';
  } else if (lucroBruto > 0 && margem >= 8) {
    status = 'bom';
    frase = `O posto vendeu ${moeda(faturamento)} e sobrou ${moeda(lucroBruto)} de lucro bruto (margem ${pct(margem)}). Boa base — proteja essa margem e empurre as categorias que sobram mais.`;
  } else if (lucroBruto > 0) {
    status = 'atencao';
    frase = `O posto vendeu ${moeda(faturamento)}, mas a margem está apertada (${pct(margem)}). Dá para melhorar vendendo mais loja e automotivos, que sobram mais que o combustível.`;
  } else {
    status = 'critico';
    frase = `A venda deste mês (${moeda(faturamento)}) não cobriu o custo dos produtos. É preciso rever preços e mix com urgência.`;
  }
  // Se a IA sinalizou situação pior que a calculada, respeita.
  const sIA = statusDaSituacao(insights?.resumo_executivo?.situacao);
  if (!inconsistente && sIA === 'critico') status = 'critico';

  const trad = (t) => traduzirRotulo(t || '');

  // ── Itens da barra de composição (peso de cada categoria no faturamento) ──
  const itensMix = (mix || [])
    .filter(m => Number(m.receita) > 0)
    .map(m => ({ rotulo: CAT_ROTULO[m.categoria] || m.categoria, valor: m.receita }));

  // ── Oportunidades (objeto de listas) achatadas numa lista única ──
  const opo = insights?.oportunidades || {};
  const oportunidades = [].concat(
    opo.aumentar_ticket || opo.aumentar_receita || [],
    opo.melhorar_mix || [],
    opo.crescer_conveniencia || [],
    opo.reduzir_ineficiencias || opo.reduzir_custos || [],
  ).filter(Boolean);

  const recomendacoes = insights?.recomendacoes || [];
  const perguntas = insights?.perguntas_gestor || insights?.perguntas_chave_gestor || [];
  const alertasProd = insights?.alertas_produtos || {};

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
          <h1 className="rd-capa-titulo">Como foram as vendas do seu posto</h1>
          <p className="rd-capa-sub">
            {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''} · {periodo}{modoRede ? ' · rede consolidada' : ''}
          </p>

          {/* Faixa de qualidade (quando inconsistente) */}
          {inconsistente && (
            <FaixaQualidade
              texto={pctSemCategoria > 15
                ? `Uma parte grande do faturamento (${pct(pctSemCategoria)}) está em produtos sem categoria definida. Enquanto isso não for classificado, o "mix" e as margens por categoria abaixo não refletem a realidade do posto.`
                : 'O custo dos produtos vendidos está maior que o próprio faturamento reconhecido. Isso indica venda não lançada ou custo mal cadastrado — os percentuais abaixo ficam distorcidos.'}
              acao="peça à CCI para classificar os grupos de produto em Parâmetros e conferir os custos cadastrados."
            />
          )}

          {/* Selo de status */}
          <SeloStatus status={status} frase={frase} />

          {/* Cartões-chave */}
          <div className="rd-kpis">
            <CartaoKpi rotulo="Faturamento" valor={moeda(faturamento)} explica="Tudo o que o posto vendeu no mês." />
            <CartaoKpi rotulo="Custo do que foi vendido (CMV)" valor={moeda(cmv)} explica="Quanto o posto pagou pelos produtos que revendeu." />
            <CartaoKpi rotulo="Lucro bruto" valor={moeda(lucroBruto)} explica="O que sobrou da venda depois de pagar o custo do produto." />
            <CartaoKpi
              rotulo="Margem"
              valor={inconsistente ? '—' : pct(margem)}
              explica={inconsistente ? 'Não confiável enquanto o mix estiver incompleto.' : 'Quanto sobra de lucro bruto a cada R$ 100 vendidos.'} />
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

          {/* ── Mix de produtos ── */}
          {(itensMix.length > 0 || insights?.mix_produto) && (
            <section className="rd-secao">
              <h2>De onde vem o seu faturamento</h2>
              <p className="rd-oque-e">O que é isso? Mostra o peso de cada tipo de venda no total. O combustível quase sempre é a maior fatia, mas quem costuma sobrar mais é a loja e os automotivos.</p>
              {itensMix.length > 0 && <BarraComposicao itens={itensMix} />}
              {insights?.mix_produto?.interpretacao && <p>{trad(insights.mix_produto.interpretacao)}</p>}
              {insights?.mix_produto?.concentracao?.length > 0 && (
                <TabelaDados
                  colunas={[
                    { chave: 'categoria', titulo: 'Categoria', render: (v) => CAT_ROTULO[v] || v },
                    { chave: 'pct_receita', titulo: '% do faturamento', num: true, render: (v) => pct(v) },
                    { chave: 'pct_margem', titulo: '% do lucro', num: true, render: (v) => pct(v) },
                    { chave: 'comentario', titulo: 'Observação', render: (v) => trad(v) || '—' },
                  ]}
                  linhas={insights.mix_produto.concentracao}
                />
              )}
            </section>
          )}

          {/* ── Combustível, loja e automotivos ── */}
          {(insights?.combustiveis || insights?.conveniencia_analise || insights?.automotivos_analise) && (
            <section className="rd-secao">
              <h2>Combustível, loja e automotivos</h2>
              <p className="rd-oque-e">O que é isso? Um olhar em cada frente do posto. O combustível traz volume; a loja e os automotivos, mesmo vendendo menos, ajudam a segurar a margem.</p>
              {insights?.combustiveis?.analise_por_tipo && (
                <><h3>Combustível</h3><p>{trad(insights.combustiveis.analise_por_tipo)}</p></>
              )}
              {insights?.combustiveis?.analise_por_produto && <p>{trad(insights.combustiveis.analise_por_produto)}</p>}
              {insights?.conveniencia_analise?.interpretacao && (
                <><h3>Loja de conveniência</h3><p>{trad(insights.conveniencia_analise.interpretacao)}</p></>
              )}
              {insights?.automotivos_analise?.interpretacao && (
                <><h3>Produtos automotivos</h3><p>{trad(insights.automotivos_analise.interpretacao)}</p></>
              )}
            </section>
          )}

          {/* ── Grupos que puxam ou pesam ── */}
          {insights?.diagnostico_grupos && (insights.diagnostico_grupos.grupos_problema?.length > 0 || insights.diagnostico_grupos.grupos_destaque?.length > 0) && (
            <section className="rd-secao">
              <h2>O que está puxando e o que está pesando</h2>
              <p className="rd-oque-e">O que é isso? Os grupos de produto que mais ajudaram e os que mais atrapalharam o resultado do mês.</p>
              {insights.diagnostico_grupos.grupos_destaque?.length > 0 && (
                <>
                  <h3>Ajudaram o resultado</h3>
                  <ul>{insights.diagnostico_grupos.grupos_destaque.map((g, i) => (
                    <li key={i}><span className="rd-forte">{g.grupo}:</span> {trad(g.porque)}</li>
                  ))}</ul>
                </>
              )}
              {insights.diagnostico_grupos.grupos_problema?.length > 0 && (
                <>
                  <h3>Atrapalharam o resultado</h3>
                  <ul>{insights.diagnostico_grupos.grupos_problema.map((g, i) => (
                    <li key={i}><span className="rd-forte">{g.grupo}:</span> {trad(g.motivo)}{g.acao_sugerida ? ` — ${trad(g.acao_sugerida)}` : ''}</li>
                  ))}</ul>
                </>
              )}
            </section>
          )}

          {/* ── Produtos em queda / em alta ── */}
          {(alertasProd.produtos_em_queda?.length > 0 || alertasProd.produtos_em_alta_para_replicar?.length > 0) && (
            <section className="rd-secao">
              <h2>Produtos que mudaram de patamar</h2>
              <p className="rd-oque-e">O que é isso? Produtos que caíram muito (para investigar) e produtos que dispararam (para repetir o que deu certo).</p>
              {alertasProd.produtos_em_queda?.length > 0 && (
                <>
                  <h3>Caíram — vale investigar</h3>
                  <ul>{alertasProd.produtos_em_queda.map((p, i) => (
                    <li key={i}>
                      <span className="rd-forte">{p.produto}</span>
                      {p.tipo === 'sumiu' ? ' — sumiu das vendas' : p.queda_pct != null ? ` — caiu ${pct(Math.abs(Number(p.queda_pct)))}` : ''}
                      {p.acao ? `. ${trad(p.acao)}` : ''}
                    </li>
                  ))}</ul>
                </>
              )}
              {alertasProd.produtos_em_alta_para_replicar?.length > 0 && (
                <>
                  <h3>Dispararam — repita o que funcionou</h3>
                  <ul>{alertasProd.produtos_em_alta_para_replicar.map((p, i) => (
                    <li key={i}>
                      <span className="rd-forte">{p.produto}</span>
                      {p.crescimento_pct != null ? ` — subiu ${pct(Number(p.crescimento_pct))}` : ''}
                      {p.porque_funcionou ? `. ${trad(p.porque_funcionou)}` : ''}
                    </li>
                  ))}</ul>
                </>
              )}
            </section>
          )}

          {/* ── Tendência (6 meses) ── */}
          {serie.length >= 2 && (
            <section className="rd-secao">
              <h2>Como vem evoluindo</h2>
              <p className="rd-oque-e">O que é isso? A linha do faturamento nos últimos meses. Um mês marcado com ⚠ pode ter dado faltando.</p>
              <MiniTendencia
                titulo="Faturamento por mês"
                serie={serie.map(s => ({ mes: s.mes, valor: fatSerie(s) }))}
              />
              {insights?.comparativo?.tendencia_direcao && <p>Direção da tendência: <span className="rd-forte">{trad(insights.comparativo.tendencia_direcao)}</span>.</p>}
              {insights?.comparativo?.vs_yoy && <p>{trad(insights.comparativo.vs_yoy)}</p>}
            </section>
          )}

          {/* ── Ranking de empresas (só rede) ── */}
          {modoRede && insights?.ranking_empresas?.length > 0 && (
            <section className="rd-secao">
              <h2>Comparativo entre as unidades da rede</h2>
              <p className="rd-oque-e">O que é isso? Cada posto da rede lado a lado, do que mais fatura ao que menos fatura.</p>
              <TabelaDados
                className="longa"
                colunas={[
                  { chave: 'posicao', titulo: '#', render: (v) => v ?? '—' },
                  { chave: 'empresa', titulo: 'Unidade' },
                  { chave: 'receita', titulo: 'Faturamento', num: true, render: (v) => moeda(v) },
                  { chave: 'margem_pct', titulo: 'Margem', num: true, render: (v) => pct(v) },
                  { chave: 'participacao_pct', titulo: '% da rede', num: true, render: (v) => pct(v) },
                  { chave: 'avaliacao', titulo: 'Avaliação', render: (v) => trad(v) || '—' },
                ]}
                linhas={insights.ranking_empresas}
              />
              {insights?.dispersao?.concentracao && <p>{trad(insights.dispersao.concentracao)}</p>}
              {insights?.dispersao?.padrao_rede && <p>{trad(insights.dispersao.padrao_rede)}</p>}
            </section>
          )}

          {/* ── Oportunidades ── */}
          {oportunidades.length > 0 && (
            <section className="rd-secao">
              <h2>Onde dá para vender e sobrar mais</h2>
              <p className="rd-oque-e">O que é isso? Ideias práticas para aumentar o faturamento e, principalmente, o que sobra no fim.</p>
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
                ganho: r.impacto_esperado_valor ?? null,
              }))} />
              {recomendacoes.some(r => r.justificativa || r.impacto_esperado || r.impacto) && (
                <ul>
                  {recomendacoes.filter(r => r.justificativa || r.impacto_esperado || r.impacto).map((r, i) => (
                    <li key={i}><span className="rd-forte">{trad(r.acao)}:</span> {trad(r.justificativa || r.impacto_esperado || r.impacto)}</li>
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
          <Glossario termos={GLOSSARIO_VENDAS} />

        {/* Rodapé */}
        <div className="rd-rodape">
          Relatório gerado com apoio de inteligência artificial e revisão da CCI. Leia junto com o relatório de vendas detalhado.
          {' '}Os valores em reais são reais; percentuais marcados com "—" foram omitidos por inconsistência nos dados de origem.
        </div>

      </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
