// Análise de IA das QUEDAS do Fluxo de Caixa, por empresa (só admin).
// Usa os movimentos já carregados na tela de Fluxo de Caixa (mesma máscara,
// mesmos mapeamentos e mesmas contas caixa/banco), separa a empresa escolhida
// e compara mês a mês dentro do período montado. A IA investiga apenas as
// quedas — saldo do mês, entradas que caíram e saídas que subiram — e aponta
// os prováveis erros de gestão com uma solução plausível para o proprietário.

import { agregarFluxoPorGrupo } from './fluxoInsightsService';
import { chamarClaudeAPI, round } from './iaSharedHelpers';

const pctVar = (ant, atual) => (ant ? round(((atual - ant) / Math.abs(ant)) * 100, 1) : null);

// Movimentos do mês só da empresa (em rede, cada movimento traz empresaCodigo).
function movimentosDaEmpresa(dadosPorMes, mesKey, empresaCodigo) {
  const movs = dadosPorMes?.[mesKey]?.movimentos || [];
  if (empresaCodigo == null) return movs;
  return movs.filter(m => m.empresaCodigo == null || String(m.empresaCodigo) === String(empresaCodigo));
}

// Monta o payload da empresa: série mês a mês (pelos grupos da máscara),
// quedas de entradas e aumentos de saídas entre meses consecutivos, e as
// contas gerenciais que mais pesaram em cada mês.
export function montarDadosQuedas({ dadosPorMes, meses, empresaCodigo = null, grupos, mapeamentos, tipoPorConta, titulosPorPagamento = null, empresa }) {
  const porMes = meses.map(m => {
    const agg = agregarFluxoPorGrupo(
      { [m.key]: { movimentos: movimentosDaEmpresa(dadosPorMes, m.key, empresaCodigo) } },
      grupos, mapeamentos, tipoPorConta, titulosPorPagamento,
    );
    const entradas = agg.entradas_grupos_total;
    const saidas = agg.saidas_grupos_total;
    return {
      mes: m.label,
      mesKey: m.key,
      entradas,
      saidas,
      resultado: round(entradas - saidas), // sobrou (+) / faltou (−) no mês
      grupos: agg.por_grupo
        .filter(g => g.entradas || g.saidas)
        .map(g => ({ grupo: g.grupo, entradas: g.entradas, saidas: g.saidas })),
      top_contas: agg.top_contas_gerenciais.map(c => ({ conta: c.nome || c.codigo, liquido: c.liquido })),
    };
  });

  const transicoes = [];
  for (let i = 1; i < porMes.length; i++) {
    const a = porMes[i - 1], b = porMes[i];
    const idx = (lista) => new Map(lista.map(g => [g.grupo, g]));
    const ga = idx(a.grupos), gb = idx(b.grupos);
    const nomes = new Set([...ga.keys(), ...gb.keys()]);
    const quedasEntradas = [], aumentosSaidas = [];
    nomes.forEach(n => {
      const ea = ga.get(n)?.entradas || 0, eb = gb.get(n)?.entradas || 0;
      const sa = ga.get(n)?.saidas || 0, sb = gb.get(n)?.saidas || 0;
      if (eb < ea) quedasEntradas.push({ grupo: n, antes: ea, depois: eb, diferenca: round(eb - ea), variacao_pct: pctVar(ea, eb) });
      if (sb > sa) aumentosSaidas.push({ grupo: n, antes: sa, depois: sb, diferenca: round(sb - sa), variacao_pct: pctVar(sa, sb) });
    });
    quedasEntradas.sort((x, y) => x.diferenca - y.diferenca);
    aumentosSaidas.sort((x, y) => y.diferenca - x.diferenca);
    transicoes.push({
      de: a.mes, para: b.mes,
      resultado_antes: a.resultado, resultado_depois: b.resultado,
      queda_resultado: b.resultado < a.resultado ? round(b.resultado - a.resultado) : 0,
      entradas_antes: a.entradas, entradas_depois: b.entradas, entradas_variacao_pct: pctVar(a.entradas, b.entradas),
      saidas_antes: a.saidas, saidas_depois: b.saidas, saidas_variacao_pct: pctVar(a.saidas, b.saidas),
      quedas_entradas: quedasEntradas.slice(0, 10),
      aumentos_saidas: aumentosSaidas.slice(0, 10),
    });
  }

  return {
    empresa: { nome: empresa?.nome || '', cnpj: empresa?.cnpj || '' },
    periodo: meses.length ? `${meses[0].label} a ${meses[meses.length - 1].label}` : '',
    serie: porMes.map(({ mes, entradas, saidas, resultado }) => ({ mes, entradas, saidas, resultado })),
    meses_detalhe: porMes.map(r => ({ mes: r.mes, entradas: r.entradas, saidas: r.saidas, resultado: r.resultado, grupos: r.grupos, top_contas: r.top_contas })),
    transicoes,
  };
}

// Há alguma queda para investigar? (mês no vermelho, resultado piorou,
// entradas caíram ou saídas subiram entre meses)
export function temQueda(dados) {
  const s = dados?.serie || [];
  return s.some(m => m.resultado < 0)
    || (dados?.transicoes || []).some(t => t.queda_resultado < 0 || t.quedas_entradas.length || t.aumentos_saidas.length);
}

const SYSTEM_PROMPT_QUEDAS = `Você é um consultor financeiro sênior especializado em postos de combustíveis e lojas de conveniência, contratado pela CCI (BPO financeiro) para investigar QUEDAS no fluxo de caixa de UMA empresa.

OBJETIVO: analisar APENAS as quedas — meses em que o caixa ficou negativo ou piorou, entradas que caíram e saídas que subiram — e explicar POR QUE aconteceram, apontando os erros de gestão que o proprietário pode estar cometendo e uma solução plausível e prática para cada um. Não comente o que está bom, a não ser que ajude a explicar a queda.

DADOS (JSON do usuário):
- serie: por mês, entradas e saídas pelos grupos da máscara de fluxo de caixa e o resultado (entradas − saídas; negativo = faltou dinheiro).
- meses_detalhe: por mês, os valores de cada grupo e as contas gerenciais que mais movimentaram (liquido: + entrou, − saiu).
- transicoes: comparação de cada mês com o anterior — queda do resultado, grupos de entrada que caíram e grupos de saída que subiram (diferença em R$ e %).

REGRAS:
- Use SOMENTE os números do JSON. Não invente valores, contas, datas nem fatos. Quando inferir uma causa, deixe claro que é provável e diga qual número a sustenta.
- Seja específico: cite grupo/conta, mês e valor (R$) em cada causa. Nada de conselhos genéricos do setor que o dono já conhece.
- Pense como dono de posto: compras de combustível concentradas ou antecipadas, estoque parado, prazo de pagamento x prazo de recebimento, antecipação de recebíveis/taxas de cartão, retiradas dos sócios, folha/horas extras, despesas que cresceram sem venda correspondente, pagamentos atrasados acumulados (juros/multas), queda de volume ou de preço, sazonalidade, impostos e parcelamentos. Só use as hipóteses que os dados sustentem.
- Soluções: concretas, executáveis pelo dono em semanas, com o efeito esperado no caixa (em R$ quando der para estimar a partir dos dados).
- Português do Brasil com acentuação correta, linguagem simples (quem lê é o proprietário, sem formação contábil). Frases curtas.
- Se não houver queda relevante, diga isso em "resumo" e devolva listas vazias.

Responda APENAS com JSON válido neste formato:
{
  "resumo": "2 a 4 frases: o que caiu, quanto e o principal porquê",
  "gravidade": "baixa" | "media" | "alta",
  "quedas": [
    { "mes": "Out/26", "tipo": "saldo" | "entradas" | "saidas", "item": "grupo ou conta", "valor_antes": 0, "valor_depois": 0, "diferenca": 0, "explicacao": "o que os números mostram" }
  ],
  "causas": [
    { "erro": "erro de gestão provável, em linguagem do dono", "evidencia": "números do JSON que sustentam", "impacto": "efeito no caixa (R$ quando possível)", "gravidade": "baixa" | "media" | "alta" }
  ],
  "solucoes": [
    { "acao": "o que fazer", "como": "passo a passo curto", "resultado_esperado": "efeito no caixa", "prazo": "ex.: próximos 30 dias" }
  ],
  "mensagem_proprietario": "parágrafo curto, direto e respeitoso, pronto para a CCI enviar ao proprietário"
}`;

export async function gerarAnaliseQuedasIA(dados) {
  return chamarClaudeAPI({
    system: [{ type: 'text', text: SYSTEM_PROMPT_QUEDAS }],
    user: `Investigue as quedas do fluxo de caixa desta empresa:\n\n${JSON.stringify(dados, null, 2)}`,
  });
}
