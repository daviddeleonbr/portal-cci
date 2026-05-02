// Diagnostico Geral com IA — consome resultados JSON das 3 analises (vendas/dre/fluxo)
// e pede a Claude uma sintese cross-cut: vendas -> margem -> caixa.

import { chamarClaudeAPI, round } from './iaSharedHelpers';

const SYSTEM_PROMPT = `Você e um consultor estrategico senior para postos de combustível. Sua missao e conectar as 3 dimensões (Vendas, DRE, Caixa) em um diagnóstico integrado.

CONCEITOS:
- Receita sobe mas margem cai = mix pior ou pressao de preco
- Margem sobe mas caixa cai = problema de prazo, inadimplencia ou investimento
- Tudo sobe mas lucro liquido não cresce = despesas administrativas pesando
- Concentração em poucos produtos ou clientes = risco de liquidez
- Ciclo financeiro: recebimentos rapidos (cartão/pix), pagamentos a 7-30d; quando pagamentos antecedem recebimentos, caixa sofre

VOCE RECEBE:
- sintese_vendas: situação + destaques + top 3 recomendacoes das vendas
- sintese_dre: idem da DRE
- sintese_fluxo: idem do Fluxo de Caixa
- kpis_cross: números chave reconciliados entre as 3 dimensões

SUA RESPOSTA DEVE SER UM JSON VALIDO com EXATAMENTE esta estrutura:
{
  "diagnostico_integrado": "paragrafo de 5-8 frases contando a historia completa: vendas → margem → caixa",
  "gargalos_criticos": [
    {"gargalo": "...", "evidencia_cross": "cite números das 3 dimensões que sustentam", "impacto": "alto|medio|baixo"}
  ],
  "alavancas_prioritarias": [
    {"alavanca": "...", "efeito_vendas": "...", "efeito_dre": "...", "efeito_caixa": "..."}
  ],
  "contradicoes": [
    {"observacao": "ex: receita subiu X% mas caixa caiu Y%", "o_que_investigar": "..."}
  ],
  "plano_90_dias": [
    {"semana": "S1-S2|S3-S4|M2|M3", "ação": "ação concreta", "responsavel_sugerido": "gestor|financeiro|operação|comercial", "kpi_alvo": "metrica + meta numérica"}
  ],
  "perguntas_chave_gestor": ["5-7 perguntas estrategicas que o gestor deve responder"]
}

REGRAS:
- Conecte as 3 dimensões. Não repita análise isolada.
- Cite números. Se vendas_sintese tem "+15% receita" e dre_sintese tem "-2pp margem", conecte.
- Seja específico: "reduzir despesa X em Y%" em vez de "reduzir despesas".
- Plano 90 dias deve ser executavel em 12 semanas.
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

// ─── Extrai resumo compacto de cada analise ────────────────────
function sintetizar(insights) {
  if (!insights) return null;
  return {
    situacao: insights.resumo_executivo?.situacao
      ?? insights.resumo_executivo?.situacao_caixa
      ?? 'alerta',
    resumo: insights.resumo_executivo?.resumo
      ?? insights.resumo_executivo?.sintese
      ?? insights.resumo_executivo?.saude_liquidez
      ?? '',
    destaques_positivos: insights.resumo_executivo?.destaques_positivos
      ?? insights.resumo_executivo?.pontos_positivos
      ?? [],
    destaques_negativos: insights.resumo_executivo?.destaques_negativos
      ?? insights.resumo_executivo?.pontos_negativos
      ?? insights.resumo_executivo?.alertas_agudos
      ?? [],
    recomendacoes_top3: (insights.recomendacoes || []).slice(0, 3).map(r => ({
      prioridade: r.prioridade,
      acao: r.acao,
      impacto: r.impacto_esperado ?? r.efeito_em_caixa ?? r.justificativa ?? '',
    })),
  };
}

// ─── Agregador para diagnostico geral ──────────────────────────
// Recebe os 3 resultados da IA (ja gerados) + opcionalmente dados crus para KPIs cross
export function agregarDadosDiagnosticoGeral({ cliente, periodoLabel, vendas, dre, fluxo }) {
  const kpisCross = {};
  if (dre?.dados?.periodo_atual?.kpis) {
    kpisCross.receita_bruta = dre.dados.periodo_atual.kpis.receita_bruta;
    kpisCross.margem_bruta_pct = dre.dados.periodo_atual.kpis.margem_bruta_pct;
    kpisCross.margem_liquida_pct = dre.dados.periodo_atual.kpis.margem_liquida_pct;
    kpisCross.lucro_liquido = dre.dados.periodo_atual.kpis.lucro_liquido;
  }
  if (fluxo?.dados?.periodo_atual) {
    kpisCross.variacao_caixa = fluxo.dados.periodo_atual.variacao_caixa;
    kpisCross.entradas_caixa = fluxo.dados.periodo_atual.entradas_total;
    kpisCross.saidas_caixa = fluxo.dados.periodo_atual.saidas_total;
  }
  if (vendas?.dados?.totais) {
    kpisCross.qtd_vendas = vendas.dados.totais.qtd_vendas;
    kpisCross.ticket_medio = vendas.dados.totais.ticket_medio;
  }

  return {
    empresa: {
      nome: cliente?.nome || 'Empresa',
      cnpj: cliente?.cnpj || null,
    },
    periodo: periodoLabel,
    sintese_vendas: sintetizar(vendas?.insights),
    sintese_dre: sintetizar(dre?.insights),
    sintese_fluxo: sintetizar(fluxo?.insights),
    kpis_cross: kpisCross,
  };
}

export async function gerarDiagnosticoGeralIA(dados, apiKey) {
  const user = `Síntese estrategica de um posto de combustível combinando as 3 análises:\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({
    apiKey,
    system: [{ type: 'text', text: SYSTEM_PROMPT }],
    user,
  });
}
