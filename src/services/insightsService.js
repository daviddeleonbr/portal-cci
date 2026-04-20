// ─── Calcular indicadores chave a partir do dreTree ────────
// Detecta linhas tipicas (receita bruta, deducoes, CMV, despesas, lucro)
// usando heuristicas no nome dos grupos.

function findGrupo(dreTree, regex) {
  for (const node of dreTree) {
    if (regex.test((node.nome || '').toLowerCase())) return node;
  }
  return null;
}

export function calcularKPIs(dreTree) {
  const receitaBruta = findGrupo(dreTree, /receita\s+(operacional\s+)?bruta|receitas?$/i);
  const deducoes = findGrupo(dreTree, /deducao|deducoes/i);
  const receitaLiquida = findGrupo(dreTree, /receita\s+(operacional\s+)?liquida/i);
  const cmv = findGrupo(dreTree, /custo|cmv/i);
  const lucroBruto = findGrupo(dreTree, /lucro\s+bruto|resultado\s+(operacional\s+)?bruto/i);
  const despesasOp = findGrupo(dreTree, /despesa/i);
  const lucroLiquido = findGrupo(dreTree, /resultado\s+(operacional\s+)?liquido|lucro\s+liquido|resultado\s+gerencial/i);

  const valor = (n) => n ? Number(n.totalPeriodo || 0) : 0;
  const receita = valor(receitaBruta);
  const liq = receitaLiquida ? valor(receitaLiquida) : (receita + valor(deducoes));
  const lb = lucroBruto ? valor(lucroBruto) : (liq + valor(cmv));
  const ll = lucroLiquido ? valor(lucroLiquido) : (lb + valor(despesasOp));

  return {
    receitaBruta: receita,
    deducoes: Math.abs(valor(deducoes)),
    receitaLiquida: liq,
    cmv: Math.abs(valor(cmv)),
    lucroBruto: lb,
    despesasOperacionais: Math.abs(valor(despesasOp)),
    lucroLiquido: ll,
    margemBruta: receita > 0 ? (lb / receita) * 100 : 0,
    margemLiquida: receita > 0 ? (ll / receita) * 100 : 0,
    margemBrutaSobreLiquida: liq > 0 ? (lb / liq) * 100 : 0,
  };
}

// Extrai estrutura compacta para enviar ao LLM
export function dreParaPrompt(dreTree, mascara, periodoLabel, cliente, kpis) {
  const linhas = [];
  function walk(nodes, depth = 0) {
    nodes.forEach(n => {
      linhas.push({
        nivel: depth,
        nome: n.nome,
        tipo: n.tipo,
        valor: Number(n.totalPeriodo || 0),
      });
      if (n.children && n.children.length > 0) walk(n.children, depth + 1);
    });
  }
  walk(dreTree);

  return {
    cliente: cliente?.nome,
    cnpj: cliente?.cnpj,
    mascara: mascara?.nome,
    periodo: periodoLabel,
    kpis: {
      receita_bruta: kpis.receitaBruta,
      deducoes: kpis.deducoes,
      receita_liquida: kpis.receitaLiquida,
      cmv: kpis.cmv,
      lucro_bruto: kpis.lucroBruto,
      margem_bruta_pct: Number(kpis.margemBruta.toFixed(2)),
      despesas_operacionais: kpis.despesasOperacionais,
      lucro_liquido: kpis.lucroLiquido,
      margem_liquida_pct: Number(kpis.margemLiquida.toFixed(2)),
    },
    linhas_dre: linhas,
  };
}

// ─── Chamada API Anthropic ──────────────────────────────────
const SYSTEM_PROMPT = `Voce e um especialista em analise financeira e gestao de postos de combustiveis, com foco em geracao de insights praticos para tomada de decisao.

Considere as particularidades do setor de combustiveis:
- Margens normalmente apertadas em combustiveis (1-4%)
- Importancia das receitas de conveniencia (loja, servicos)
- Impacto de taxas de cartao e meios de pagamento
- Custos operacionais relevantes (funcionarios, energia, manutencao)
- Alta concorrencia e sensibilidade a preco

Sua resposta deve ser um JSON valido com EXATAMENTE esta estrutura:
{
  "resumo_executivo": {
    "situacao": "saudavel" | "alerta" | "critico",
    "resumo": "2-3 frases sobre situacao geral",
    "pontos_positivos": ["...", "..."],
    "pontos_negativos": ["...", "..."]
  },
  "margens": {
    "interpretacao": "analise das margens com numeros",
    "causas": ["..."]
  },
  "custos_despesas": {
    "maiores_itens": [{"nome": "...", "valor": 0, "pct_receita": 0, "comentario": "..."}],
    "avaliacao": "alto" | "controlado" | "preocupante",
    "excessos": ["..."]
  },
  "atencao": {
    "gargalos": ["..."],
    "riscos": ["..."],
    "dependencias": ["..."]
  },
  "oportunidades": {
    "aumentar_margem": ["..."],
    "reduzir_custos": ["..."],
    "sugestoes_praticas": ["..."]
  },
  "estrategicos": ["3-5 recomendacoes acionaveis"],
  "perguntas": ["5-7 perguntas para o gestor refletir"]
}

REGRAS:
- Use os numeros da DRE para justificar tudo. Nao seja generico.
- Sempre cite valores e percentuais.
- Linguagem simples e direta.
- Tom consultivo - como alguem ajudando o dono a ganhar mais dinheiro.
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

export async function gerarInsightsIA(dreData, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analise esta DRE de um posto de combustiveis:\n\n${JSON.stringify(dreData, null, 2)}`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr;
    try { parsedErr = JSON.parse(errText); } catch (_) { /* ignore */ }
    const msg = parsedErr?.error?.message || errText;

    if (msg.toLowerCase().includes('credit balance')) {
      const e = new Error('Sua conta Anthropic esta sem creditos. Acesse console.anthropic.com > Plans & Billing para adicionar creditos.');
      e.code = 'NO_CREDITS';
      throw e;
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Chave de API invalida ou sem permissao. Verifique em console.anthropic.com > API Keys.');
      e.code = 'INVALID_KEY';
      throw e;
    }
    if (res.status === 429) {
      const e = new Error('Limite de requisicoes atingido. Aguarde alguns segundos e tente novamente.');
      e.code = 'RATE_LIMIT';
      throw e;
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data.content[0].text;

  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Resposta da IA nao esta em formato JSON valido');
  }
}

// ─── Analise rule-based (sem IA) ─────────────────────────────
// Heuristicas baseadas em benchmarks do setor de combustiveis
export function gerarInsightsLocal(dreTree, kpis) {
  const insights = {
    resumo_executivo: { situacao: 'alerta', resumo: '', pontos_positivos: [], pontos_negativos: [] },
    margens: { interpretacao: '', causas: [] },
    custos_despesas: { maiores_itens: [], avaliacao: 'controlado', excessos: [] },
    atencao: { gargalos: [], riscos: [], dependencias: [] },
    oportunidades: { aumentar_margem: [], reduzir_custos: [], sugestoes_praticas: [] },
    estrategicos: [],
    perguntas: [],
  };

  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (v) => `${v.toFixed(2)}%`;

  // ─── Diagnostico de margens ─────────────────────────────
  // Setor de postos: margem bruta tipica 4-12%, margem liquida 1-4%
  const mb = kpis.margemBruta;
  const ml = kpis.margemLiquida;

  if (ml < 0) {
    insights.resumo_executivo.situacao = 'critico';
    insights.resumo_executivo.resumo = `O posto esta operando com PREJUIZO de ${fmt(Math.abs(kpis.lucroLiquido))} no periodo. Margem liquida de ${pct(ml)} indica que despesas e custos superam a receita.`;
    insights.resumo_executivo.pontos_negativos.push(`Resultado liquido negativo: ${fmt(kpis.lucroLiquido)}`);
  } else if (ml < 1) {
    insights.resumo_executivo.situacao = 'critico';
    insights.resumo_executivo.resumo = `Margem liquida de ${pct(ml)} esta abaixo do minimo saudavel para o setor (1-4%). Lucro de ${fmt(kpis.lucroLiquido)} sobre ${fmt(kpis.receitaBruta)} de receita.`;
    insights.resumo_executivo.pontos_negativos.push(`Margem liquida muito baixa (${pct(ml)})`);
  } else if (ml < 2) {
    insights.resumo_executivo.situacao = 'alerta';
    insights.resumo_executivo.resumo = `Margem liquida de ${pct(ml)} esta no limite inferior do setor (1-4%). Negocio operando com pouca folga.`;
    insights.resumo_executivo.pontos_positivos.push('Resultado positivo, mas com folga limitada');
  } else if (ml >= 4) {
    insights.resumo_executivo.situacao = 'saudavel';
    insights.resumo_executivo.resumo = `Margem liquida de ${pct(ml)} esta excelente para o setor. Negocio gerando ${fmt(kpis.lucroLiquido)} de lucro sobre ${fmt(kpis.receitaBruta)} de receita.`;
    insights.resumo_executivo.pontos_positivos.push(`Margem liquida acima da media do setor (${pct(ml)})`);
  } else {
    insights.resumo_executivo.situacao = 'saudavel';
    insights.resumo_executivo.resumo = `Margem liquida de ${pct(ml)} esta dentro do esperado para postos de combustivel (1-4%). Lucro de ${fmt(kpis.lucroLiquido)}.`;
    insights.resumo_executivo.pontos_positivos.push('Margens dentro do padrao do setor');
  }

  if (mb > 8) {
    insights.resumo_executivo.pontos_positivos.push(`Margem bruta forte (${pct(mb)}) - boa precificacao`);
  } else if (mb < 4) {
    insights.resumo_executivo.pontos_negativos.push(`Margem bruta apertada (${pct(mb)}) - rever precos ou negociar com fornecedores`);
  }

  // ─── Margens detalhadas ─────────────────────────────────
  insights.margens.interpretacao =
    `Margem bruta de ${pct(mb)} (lucro bruto de ${fmt(kpis.lucroBruto)} sobre receita bruta de ${fmt(kpis.receitaBruta)}). ` +
    `Margem liquida de ${pct(ml)} (lucro liquido de ${fmt(kpis.lucroLiquido)}). ` +
    `O ideal para postos de combustiveis e margem bruta entre 4-12% e liquida entre 1-4%.`;

  if (mb < 4) {
    insights.margens.causas.push('Possivel guerra de precos com concorrentes locais');
    insights.margens.causas.push('Mix de produtos focado em combustiveis (margens menores)');
    insights.margens.causas.push('Custo de aquisicao alto - renegociar com distribuidoras');
  }
  if (kpis.deducoes > kpis.receitaBruta * 0.1) {
    insights.margens.causas.push(`Deducoes elevadas (${fmt(kpis.deducoes)} = ${pct(kpis.deducoes/kpis.receitaBruta*100)}) - revisar tributacao`);
  }
  if (ml < mb / 3) {
    insights.margens.causas.push('Despesas operacionais consomem grande parte do lucro bruto');
  }

  // ─── Maiores custos e despesas ──────────────────────────
  // Encontrar nodes com totais negativos (despesas/custos)
  const todosCustos = [];
  function coletar(nodes, depth = 0) {
    nodes.forEach(n => {
      const v = Math.abs(Number(n.totalPeriodo || 0));
      if (n.tipo !== 'subtotal' && n.tipo !== 'resultado' && Number(n.totalPeriodo || 0) < 0 && v > 0) {
        todosCustos.push({ nome: n.nome, valor: v, depth });
      }
      if (n.children && n.children.length > 0) coletar(n.children, depth + 1);
    });
  }
  coletar(dreTree);
  todosCustos.sort((a, b) => b.valor - a.valor);

  insights.custos_despesas.maiores_itens = todosCustos.slice(0, 5).map(c => ({
    nome: c.nome,
    valor: c.valor,
    pct_receita: kpis.receitaBruta > 0 ? Number((c.valor / kpis.receitaBruta * 100).toFixed(2)) : 0,
    comentario: c.valor > kpis.receitaBruta * 0.1
      ? `Representa mais de 10% da receita - merece atencao`
      : `Dentro do esperado para o porte`,
  }));

  const totalDespesas = kpis.despesasOperacionais + kpis.cmv;
  const pctDespesas = kpis.receitaBruta > 0 ? totalDespesas / kpis.receitaBruta * 100 : 0;
  if (pctDespesas > 95) {
    insights.custos_despesas.avaliacao = 'preocupante';
    insights.custos_despesas.excessos.push(`Custos + despesas consomem ${pct(pctDespesas)} da receita - praticamente sem margem`);
  } else if (pctDespesas > 90) {
    insights.custos_despesas.avaliacao = 'alto';
  } else {
    insights.custos_despesas.avaliacao = 'controlado';
  }

  if (kpis.despesasOperacionais > kpis.lucroBruto * 0.7) {
    insights.custos_despesas.excessos.push('Despesas operacionais muito altas em relacao ao lucro bruto');
  }

  // ─── Atencao ────────────────────────────────────────────
  if (ml < 1) {
    insights.atencao.gargalos.push('Margem liquida muito baixa - qualquer queda de receita gera prejuizo');
  }
  if (kpis.cmv > kpis.receitaBruta * 0.85) {
    insights.atencao.gargalos.push(`CMV em ${pct(kpis.cmv/kpis.receitaBruta*100)} da receita - revisar negociacao com distribuidoras`);
  }
  insights.atencao.riscos.push('Volatilidade do preco do combustivel pode comprimir ainda mais as margens');
  insights.atencao.riscos.push('Concorrencia local pode forcar reducao de preco');
  if (kpis.despesasOperacionais > kpis.receitaLiquida * 0.1) {
    insights.atencao.riscos.push('Estrutura de despesas alta - risco em meses de menor movimento');
  }
  insights.atencao.dependencias.push('Receita altamente concentrada em combustiveis - dependencia de poucos produtos');
  if (kpis.lucroBruto > 0 && kpis.despesasOperacionais / kpis.lucroBruto > 0.5) {
    insights.atencao.dependencias.push('Lucro bruto sustenta operacao - qualquer queda compromete o resultado');
  }

  // ─── Oportunidades ──────────────────────────────────────
  insights.oportunidades.aumentar_margem.push('Investir em loja de conveniencia (margens 25-40%, vs 1-4% combustivel)');
  insights.oportunidades.aumentar_margem.push('Adicionar servicos de troca de oleo, lavagem e calibragem');
  if (mb < 6) {
    insights.oportunidades.aumentar_margem.push('Revisar pricing - alinhar com concorrencia local sem perder margem');
  }
  insights.oportunidades.aumentar_margem.push('Programa de fidelidade para aumentar ticket medio');

  insights.oportunidades.reduzir_custos.push('Renegociar taxas de cartao - chegam a 2-3% da receita em postos');
  insights.oportunidades.reduzir_custos.push('Analisar consumo energetico (bombas, iluminacao) - potencial 15-30% economia com LED + automacao');
  insights.oportunidades.reduzir_custos.push('Otimizar escala de funcionarios baseada em movimento por horario');

  insights.oportunidades.sugestoes_praticas.push('Cadastro de clientes corporativos (frota) - vendas a prazo com margem maior');
  insights.oportunidades.sugestoes_praticas.push('Acordos de exclusividade com distribuidora para descontos por volume');
  insights.oportunidades.sugestoes_praticas.push('Revisar mix de combustiveis (gasolina aditivada, diesel S10) - margens maiores');

  // ─── Estrategicos ───────────────────────────────────────
  if (ml < 2) {
    insights.estrategicos.push(`Diagnostico urgente de custos: revisar TODOS os contratos (energia, internet, seguros, manutencao) e cortar 5-10% das despesas operacionais`);
  }
  insights.estrategicos.push(`Aumentar receita de loja de conveniencia para no minimo 15% do faturamento total - margens entre 25-40% transformam o resultado liquido`);
  insights.estrategicos.push('Implementar dashboard diario de margem por produto - acompanhar a margem de cada combustivel separadamente para identificar oportunidades');
  if (kpis.receitaBruta > 0) {
    insights.estrategicos.push(`Estabelecer meta mensal: aumentar margem liquida para ${pct(Math.max(2, ml + 0.5))} no proximo trimestre`);
  }
  insights.estrategicos.push('Avaliar adicao de servicos: troca de oleo express, calibragem digital, lavagem - geram margens 20-50% e fidelizacao');

  // ─── Perguntas ──────────────────────────────────────────
  insights.perguntas.push('Qual a margem real de cada tipo de combustivel (gasolina, diesel, etanol)?');
  insights.perguntas.push('Quanto a loja de conveniencia representa do faturamento e qual sua margem?');
  insights.perguntas.push('Qual o ticket medio por cliente e qual a meta?');
  insights.perguntas.push('As taxas de cartao estao otimizadas? Quando foram renegociadas pela ultima vez?');
  insights.perguntas.push('Existe controle de produtividade por funcionario (vendas/hora)?');
  if (kpis.lucroBruto > 0) {
    insights.perguntas.push(`Qual a estrategia para aumentar ${pct(mb)} de margem bruta nos proximos 6 meses?`);
  }
  insights.perguntas.push('Qual o investimento em marketing/programas de fidelidade?');

  return insights;
}

// localStorage helpers para api key
export function salvarApiKey(key) {
  try { localStorage.setItem('anthropic_api_key', key); } catch (_) {}
}

export function carregarApiKey() {
  try { return localStorage.getItem('anthropic_api_key') || ''; } catch (_) { return ''; }
}

export function limparApiKey() {
  try { localStorage.removeItem('anthropic_api_key'); } catch (_) {}
}
