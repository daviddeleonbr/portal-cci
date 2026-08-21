// Relatório de Diagnóstico Geral em PDF — síntese das 3 dimensões (Vendas, DRE,
// Caixa) em linguagem de dono de posto. Mesmo molde/timbrado dos demais.
// Números vêm de `dados.kpis_cross` (só formatados); a prosa vem do `insights`.

import './relatorioImpressao.css';
import PapelTimbrado from './PapelTimbrado';
import { moeda, pct, traduzirRotulo, statusDaSituacao } from './formatarPtBr';
import {
  SeloStatus, CartaoKpi, TabelaDados, CardAlerta, PlanoAcao, Glossario, NotaConsultor,
} from './componentesRelatorio';
import { NotaItemImpressa, NotasConsultorConsolidado, NotasDaSecao, chaveNota } from './notasItens';

const GLOSSARIO_GERAL = [
  { termo: 'Diagnóstico integrado', def: 'A foto do mês juntando as três pontas: o que vendeu, quanto sobrou de lucro e como ficou o caixa.' },
  { termo: 'Gargalo', def: 'O ponto que mais trava o resultado do posto — onde vale a pena atacar primeiro.' },
  { termo: 'Alavanca', def: 'Uma ação que, se feita, melhora vários números ao mesmo tempo (vendas, lucro e caixa).' },
  { termo: 'Ciclo financeiro', def: 'O intervalo entre pagar o fornecedor e receber a venda. Quanto menor, melhor para o caixa.' },
  { termo: 'Margem líquida', def: 'Quanto sobra de lucro final para cada R$ 100 vendidos, depois de tudo.' },
  { termo: 'Fluxo de caixa', def: 'O dinheiro que entra e sai de fato no mês. Diferente do lucro no papel.' },
  { termo: 'Variação de caixa', def: 'Se sobrou ou faltou dinheiro no caixa no mês (entradas menos saídas).' },
  { termo: 'Concentração de risco', def: 'Depender demais de um produto, cliente ou forma de pagamento — se ele falha, o posto sente.' },
  { termo: 'Plano de 90 dias', def: 'A lista de ações para os próximos três meses, com responsável e meta.' },
];

export default function RelatorioGeral({ insights, dados, empresa, periodo, modoRede = false, nota = '', notasItens = {} }) {
  const kc = dados?.kpis_cross || {};
  const lucro = kc.lucro_liquido != null ? Number(kc.lucro_liquido) : null;
  const margem = kc.margem_liquida_pct != null ? Number(kc.margem_liquida_pct) : null;
  const varCaixa = kc.variacao_caixa != null ? Number(kc.variacao_caixa) : null;
  const receita = kc.receita_bruta != null ? Number(kc.receita_bruta) : null;

  const gargalos = insights?.gargalos_criticos || [];
  const alavancas = insights?.alavancas_prioritarias || [];
  const contradicoes = insights?.contradicoes || [];
  const plano = insights?.plano_90_dias || [];
  const perguntas = insights?.perguntas_chave_gestor || insights?.perguntas_gestor || [];

  // ── Selo de status (frase em português simples) ──
  const temGargaloAlto = gargalos.some(g => String(g.impacto || '').toLowerCase() === 'alto');
  let status, frase;
  if ((lucro != null && lucro < 0) || (varCaixa != null && varCaixa < 0) || temGargaloAlto) {
    status = 'critico';
    frase = 'O mês acende alerta em pelo menos uma das três pontas (vendas, lucro ou caixa). Comece pelos gargalos abaixo.';
  } else if (margem != null && margem < 3) {
    status = 'atencao';
    frase = 'O posto está no positivo, mas com folga apertada. Dá para melhorar sem grandes riscos.';
  } else {
    status = 'bom';
    frase = 'As três pontas — vendas, lucro e caixa — estão saudáveis no mês. Proteja o que está funcionando.';
  }
  const sIA = statusDaSituacao(insights?.resumo_executivo?.situacao);
  if (sIA === 'critico') status = 'critico';

  const trad = (t) => traduzirRotulo(t || '');

  // Notas por tópico: renderizadas NO CONTEXTO de cada seção. `nt` imprime a
  // nota daquele tópico (pelo título do card na tela); `sobras` filtra, para o
  // fim, só os tópicos anotados que não têm seção própria aqui.
  const nt = (t) => <NotaItemImpressa chave={chaveNota('topico', t)} notas={notasItens} rotulo={t} />;
  const TOPICOS_INLINE = ['Resumo executivo', 'Diagnóstico integrado', 'Gargalos críticos', 'Alavancas prioritarias', 'Contradicoes a investigar', 'Plano de 90 dias'];
  const sobras = (chave) => chave.startsWith('topico:') && !TOPICOS_INLINE.map(t => chaveNota('topico', t)).includes(chave);

  return (
    <div className="rd-doc-wrap">
      <PapelTimbrado />
      <table className="rd-layout">
        <thead><tr><td><div className="rd-espaco-topo" aria-hidden="true" /></td></tr></thead>
        <tfoot><tr><td><div className="rd-espaco-base" aria-hidden="true" /></td></tr></tfoot>
        <tbody><tr><td>
      <div className="rd-doc">

        {/* Cabeçalho */}
        <h1 className="rd-capa-titulo">O mês do seu posto, ponta a ponta</h1>
        <p className="rd-capa-sub">
          {empresa?.nome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ''} · {periodo}{modoRede ? ' · rede consolidada' : ''}
        </p>

        {/* Selo de status */}
        <SeloStatus status={status} frase={frase} />

        {/* Cartões-chave (do cruzamento das 3 análises) */}
        <div className="rd-kpis">
          <CartaoKpi rotulo="Faturamento" valor={receita != null ? moeda(receita) : '—'} explica="Tudo o que o posto vendeu no mês." />
          <CartaoKpi rotulo={lucro != null && lucro < 0 ? 'Prejuízo' : 'Lucro do mês'} valor={lucro != null ? moeda(lucro) : '—'} explica="O que sobrou (ou faltou) depois de tudo." />
          <CartaoKpi rotulo="Margem de lucro" valor={margem != null ? pct(margem) : '—'} explica="Quanto sobra de lucro a cada R$ 100 vendidos." />
          <CartaoKpi
            rotulo={varCaixa != null && varCaixa < 0 ? 'Faltou no caixa' : 'Sobrou no caixa'}
            valor={varCaixa != null ? moeda(varCaixa) : '—'}
            explica="Dinheiro que de fato entrou menos o que saiu no mês." />
        </div>

        {/* Nota geral do consultor + nota do Resumo (topo, no contexto do resumo) */}
        <NotaConsultor texto={nota} />
        {nt('Resumo executivo')}

        {/* ── Diagnóstico integrado (a história) ── */}
        {insights?.diagnostico_integrado && (
          <section className="rd-secao">
            <h2>A história do mês</h2>
            <p className="rd-oque-e">O que é isso? A leitura das três pontas juntas: o que a venda gerou, quanto virou lucro e como isso caiu (ou não) no caixa.</p>
            <p>{trad(insights.diagnostico_integrado)}</p>
            {nt('Diagnóstico integrado')}
          </section>
        )}

        {/* ── Gargalos críticos ── */}
        {gargalos.length > 0 && (
          <section className="rd-secao">
            <h2>O que mais trava o resultado</h2>
            <p className="rd-oque-e">O que é isso? Os pontos que mais pesam contra o posto agora — atacar aqui rende mais.</p>
            {gargalos.map((g, i) => (
              <div key={i}>
                <CardAlerta
                  severidade={String(g.impacto || 'media').toLowerCase() === 'alto' ? 'alta' : String(g.impacto || '').toLowerCase() === 'baixo' ? 'baixa' : 'media'}
                  risco={trad(g.gargalo)}
                  mitigacao={g.evidencia_cross ? trad(g.evidencia_cross) : null}
                />
                <NotaItemImpressa chave={chaveNota('gargalo', g.gargalo)} notas={notasItens} rotulo={trad(g.gargalo)} />
              </div>
            ))}
            {nt('Gargalos críticos')}
          </section>
        )}

        {/* ── Alavancas prioritárias ── */}
        {alavancas.length > 0 && (
          <section className="rd-secao">
            <h2>Onde mexer primeiro</h2>
            <p className="rd-oque-e">O que é isso? Ações que melhoram vários números de uma vez — venda, lucro e caixa.</p>
            {alavancas.map((a, i) => (
              <div key={i} className="rd-card oport">
                <div className="cab"><span className="rd-forte">{trad(a.alavanca)}</span></div>
                {a.efeito_vendas && <div><span className="rd-forte">Nas vendas:</span> {trad(a.efeito_vendas)}</div>}
                {a.efeito_dre && <div><span className="rd-forte">No lucro:</span> {trad(a.efeito_dre)}</div>}
                {a.efeito_caixa && <div><span className="rd-forte">No caixa:</span> {trad(a.efeito_caixa)}</div>}
              </div>
            ))}
            {nt('Alavancas prioritarias')}
            <NotasDaSecao notas={notasItens} prefixo="alavanca" />
          </section>
        )}

        {/* ── Contradições ── */}
        {contradicoes.length > 0 && (
          <section className="rd-secao">
            <h2>Coisas que não batem — investigar</h2>
            <p className="rd-oque-e">O que é isso? Sinais que parecem se contradizer e merecem uma olhada de perto.</p>
            <ul>
              {contradicoes.map((c, i) => (
                <li key={i}>
                  <span className="rd-forte">{trad(c.observacao)}</span>{c.o_que_investigar ? ` — ${trad(c.o_que_investigar)}` : ''}
                  <NotaItemImpressa chave={chaveNota('contradicao', c.observacao)} notas={notasItens} rotulo={trad(c.observacao)} />
                </li>
              ))}
            </ul>
            {nt('Contradicoes a investigar')}
          </section>
        )}

        {/* ── Plano de 90 dias ── */}
        {plano.length > 0 && (
          <section className="rd-secao">
            <h2>Plano dos próximos 90 dias</h2>
            <p className="rd-oque-e">O que é isso? O passo a passo para os próximos três meses, com quem faz e a meta.</p>
            <TabelaDados
              className="longa"
              colunas={[
                { chave: 'semana', titulo: 'Quando' },
                { chave: 'acao', titulo: 'O que fazer', render: (_, l) => trad(l['ação'] ?? l.acao) },
                { chave: 'responsavel_sugerido', titulo: 'Quem', render: (v) => trad(v) || '—' },
                { chave: 'kpi_alvo', titulo: 'Meta', render: (v) => trad(v) || '—' },
              ]}
              linhas={plano}
            />
            {nt('Plano de 90 dias')}
            <NotasDaSecao notas={notasItens} prefixo="plano-item" />
          </section>
        )}

        {/* ── Oportunidades (se houver) ── */}
        {insights?.recomendacoes?.length > 0 && (
          <section className="rd-secao">
            <h2>Ações recomendadas</h2>
            <PlanoAcao acoes={insights.recomendacoes.map(r => ({
              acao: trad(r.acao),
              prazo: r.prazo || null,
              ganho: r.impacto_esperado_valor ?? null,
            }))} />
          </section>
        )}

        {/* ── Perguntas ── */}
        {perguntas.length > 0 && (
          <section className="rd-secao">
            <h2>Perguntas para você pensar</h2>
            <ol style={{ paddingLeft: '6mm' }}>
              {perguntas.map((p, i) => <li key={i}>{trad(p)}</li>)}
            </ol>
          </section>
        )}

        {/* Notas de tópicos sem seção própria neste relatório */}
        <NotasConsultorConsolidado notas={notasItens} titulo="Outras observações do consultor" filtro={sobras} />

        {/* ── Glossário ── */}
        <Glossario termos={GLOSSARIO_GERAL} />

        {/* Rodapé */}
        <div className="rd-rodape">
          Diagnóstico integrado gerado com apoio de inteligência artificial e revisão da CCI, combinando as análises de Vendas, DRE e Fluxo de Caixa do mês.
        </div>

      </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
