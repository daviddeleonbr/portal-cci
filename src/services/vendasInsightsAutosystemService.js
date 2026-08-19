// Analise de vendas com IA (Claude) — variante AUTOSYSTEM.
// Espelha a ESTRUTURA do vendasInsightsService (webposto): um
// `prepararDados...` que monta o payload + um `gerarAnalise...IA` que chama o
// Claude e devolve { insights, usage, raw, stop_reason }. O que muda e a FONTE
// e o modelo de dados: em vez de VENDA_ITEM/PRODUTO/GRUPO do Quality, usamos as
// vendas agregadas do banco remoto Autosystem (buscarVendasAutosystem agregado)
// categorizadas via as_rede_grupo_produto (combustivel/automotivos/conveniencia).
//
// Limitacoes da fonte Autosystem (por isso algumas secoes do webposto somem):
//   • Sem forma de pagamento / administradora na venda → NAO ha secao
//     formas_pagamento (a query de vendas nao traz recebimento/adquirente).
//   • Sem contagem de cupom/venda distinta → NAO ha ticket_medio nem
//     qtd_vendas confiaveis (a linha agrega por produto/vendedor, nao por venda);
//     usamos quantidade e qtd_itens no lugar.
//   • Devolucoes (DC) ja sao excluidas no SQL → nao ha bucket de "canceladas".
//
// O JSON de insights pedido ao Claude e o MESMO schema do vendas webposto
// (menos formas_pagamento), pra que o AnaliseIaView renderize sem mudanca.

import * as autosystemService from './autosystemService';
import {
  chamarClaudeAPI, calcularPeriodos, classificarTipoCombustivel,
  round, variacaoPct,
} from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararRede, mascararEmpresa } from './anonimizarService';

// ─── System prompt (cacheado) ─────────────────────────────────
const SYSTEM_PROMPT = `Voce e um consultor senior especializado em postos de combustiveis e loja de conveniencia.

REGRAS DE LINGUAGEM (OBRIGATORIO — quem le e o DONO do posto, sem formacao contabil):
- Portugues simples e direto. Frases de no maximo ~25 palavras. Voz ativa.
- Use SEMPRE acentuação e ortografia corretas do português brasileiro (á é í ó ú â ê ô ã õ ç). Nunca omita acentos (ex.: "análise", "produção", "mês", "média", "combustível", "não", "você").
- NAO use jargao. Faca estas trocas SEMPRE que escrever texto:
  - "YoY" -> "vs. mesmo mes do ano passado"; "MoM" -> "vs. mes passado"
  - "CMV" -> "custo do que foi vendido (CMV)" na 1a vez, depois "custo dos produtos"
  - "ticket medio" -> "valor medio por abastecimento"
  - "pp" -> "pontos percentuais" (por extenso); "granularidade" -> "detalhamento"; "rubrica" -> "conta"
- Explique cada numero pelo efeito no bolso do dono, nao apenas cite o valor.
- As CHAVES do JSON continuam tecnicas; apenas o TEXTO dentro delas muda.
- NAO diga o obvio nem repita fatos genericos do setor. O dono ja sabe que combustivel tem margem baixa e alto volume, e que loja/automotivos rende mais por real vendido. Nunca gaste frase confirmando o que qualquer dono de posto ja sabe (ex.: "cada real em automotivos rende mais que na bomba"). Traga so o que os NUMEROS DELE revelam: desvios, tendencias, comparacoes e valores especificos.

SETOR DE POSTOS DE COMBUSTIVEL:
- Margens tipicas: combustivel 1-4% (alto giro, baixa margem), automotivos 8-20%, conveniencia 25-40% (baixo giro, alta margem)
- Mix ideal: combustivel 70-80% da receita; conveniencia/automotivos elevam o resultado por terem margem alta
- Tipos de combustivel: gasolina comum/aditivada, etanol, diesel S10/S500, GNV
- Sensibilidade a preco: guerra local, elasticidade alta em combustiveis
- A alavanca de resultado quase sempre esta em MIX (empurrar categorias de margem alta) e em CMV/margem por categoria, nao no volume de combustivel

FONTE DE DADOS (ERP Autosystem) — como o payload foi montado:
- Base = vendas do movto (tabela lancto, operacao 'V'), ja EXCLUINDO devolucoes (DC).
- Cada produto se liga a um GRUPO DE PRODUTO; o grupo foi classificado pelo BPO em uma
  CATEGORIA: "combustivel", "automotivos", "conveniencia" — ou fica "sem_categoria" quando
  o grupo ainda nao foi classificado em as_rede_grupo_produto.
- receita = soma de l.valor; CMV/custo = soma do custo (custo_medio do estoque, ou custo de
  composicao para produtos compostos). margem = receita - custo.
- NAO ha forma de pagamento, administradora, taxa de cartao, cupom/ticket nem cancelamento
  nesta fonte. NAO invente esses numeros nem cobre "cadastro de administradora".

O QUE VEM NO PAYLOAD:
- Periodo atual (mes selecionado), comparativo YoY (mesmo mes ano anterior) e tendencia 6 meses.
- totais: faturamento_bruto, cmv, lucro_bruto, margem_pct, quantidade_total, qtd_itens.
- mix_por_categoria: receita/custo/margem/margem_pct/participacao_pct por categoria.
- grupos_granulares: grupos de produto com receita, margem e variacao YoY.
- combustiveis_por_tipo: Gasolina/Diesel S10/Etanol/etc com litros, preco medio, margem, variacao.
- combustiveis_por_produto: cada combustivel pelo NOME (comum vs aditivada, S10 vs S500) com
  litros, preco/litro, custo/litro, margem R$/litro e %, participacao e YoY.
- automotivos_detalhado e conveniencia_detalhado: totais da categoria + grupos com receita,
  margem, % da categoria, variacao YoY e top produtos.
- top_produtos: top 15 por receita. produtos_em_queda/alta/sumiram vs YoY.
- integridade_dados: pct_sem_categoria (faturamento em grupos nao classificados).
- por_empresa (quando ha mais de uma unidade): receita/margem/participacao/litros por empresa.

VERIFICACOES QUE VOCE DEVE FAZER:
1. Se pct_sem_categoria > 5%, flag de "categorias incompletas" (grupos de produto nao
   classificados em Parametros → distorcem o mix). Nao classifique voce mesmo: aponte.
2. Mix: se combustivel domina demais e conveniencia/automotivos estao baixos, aponte a
   oportunidade de crescer as categorias de margem alta.
3. Combustiveis: tipo/produto que cai em litros mas sobe em receita (repasse de preco) ou
   sobe em litros e cai em receita (preco competitivo). Aponte margem R$/litro fraca.
4. Grupos/produtos que sumiram ou dispararam entre YoY e atual.

SUA RESPOSTA DEVE SER UM JSON VALIDO com EXATAMENTE esta estrutura:
{
  "resumo_executivo": {
    "situacao": "saudavel" | "alerta" | "critico",
    "resumo": "3-4 frases objetivas com numeros",
    "destaques_positivos": ["..."],
    "destaques_negativos": ["..."]
  },
  "mix_produto": {
    "interpretacao": "analise do mix receita x margem",
    "concentracao": [{"categoria": "...", "pct_receita": 0, "pct_margem": 0, "comentario": "..."}],
    "top_produtos": [{"nome": "...", "receita": 0, "margem": 0, "participacao_pct": 0, "avaliacao": "..."}]
  },
  "diagnostico_grupos": {
    "interpretacao": "quais grupos puxam resultado vs quais pesam",
    "grupos_problema": [{"grupo": "...", "motivo": "queda de X% ou margem baixa", "acao_sugerida": "..."}],
    "grupos_destaque": [{"grupo": "...", "porque": "crescimento X% ou margem alta"}]
  },
  "combustiveis": {
    "analise_por_tipo": "quantidade e preco por tipo (Gasolina, Diesel, Etanol, GNV) e comportamento",
    "analise_por_produto": "analise individual dos produtos combustiveis pelo nome — comum vs aditivada, S10 vs S500, etc. Inclua quais tem maior margem R$/litro e quais sao gargalos.",
    "tipos_em_queda": [{"tipo": "...", "variacao_litros_pct": 0, "causa_provavel": "..."}],
    "produtos_destaque": [{"produto": "...", "motivo": "margem R$/L alta ou crescimento forte"}],
    "produtos_preocupantes": [{"produto": "...", "motivo": "margem baixa, queda em volume, ou repasse de preco insuficiente"}],
    "mix_ideal": "comentario sobre mix atual"
  },
  "automotivos_analise": {
    "interpretacao": "analise geral da categoria automotivos (% da receita, margem, tendencia YoY)",
    "grupos_destaque": [{"grupo": "...", "receita": 0, "margem_pct": 0, "porque": "..."}],
    "grupos_problema": [{"grupo": "...", "motivo": "...", "acao": "..."}],
    "oportunidades": ["sugestoes para crescer automotivos de alta margem"]
  },
  "conveniencia_analise": {
    "interpretacao": "analise geral da loja (% da receita, margem, tendencia YoY)",
    "grupos_destaque": [{"grupo": "...", "receita": 0, "margem_pct": 0, "porque": "..."}],
    "grupos_problema": [{"grupo": "...", "motivo": "...", "acao": "..."}],
    "mix_recomendado": "qual mix de grupos maximizaria margem na loja",
    "oportunidades": ["..."]
  },
  "volumes_precos": {
    "analise": "volumes, precos, comparacao com faixa de mercado",
    "observacoes": ["..."]
  },
  "alertas_produtos": {
    "produtos_em_queda": [{"produto": "...", "queda_pct": 0, "tipo": "receita|margem|sumiu", "acao": "..."}],
    "produtos_em_alta_para_replicar": [{"produto": "...", "crescimento_pct": 0, "porque_funcionou": "..."}]
  },
  "integridade_dados": {
    "pct_outros": 0,
    "alertas": ["categorias incompletas etc se aplicavel"]
  },
  "comparativo": {
    "vs_yoy": "variacao YoY com numeros",
    "tendencia_direcao": "crescimento|estavel|queda",
    "causas_provaveis": ["..."]
  },
  "alertas": [{"severidade": "alta|media|baixa", "titulo": "...", "detalhe": "com numeros"}],
  "oportunidades": {
    "aumentar_ticket": ["..."],
    "melhorar_mix": ["..."],
    "crescer_conveniencia": ["..."],
    "reduzir_ineficiencias": ["..."]
  },
  "recomendacoes": [{"prioridade": "alta|media|baixa", "acao": "...", "justificativa": "..."}],
  "perguntas_gestor": ["5-7 perguntas"]
}

REGRAS:
- Use SEMPRE os numeros do payload. Nao invente. NAO cite formas de pagamento, taxa de cartao,
  ticket medio nem cancelamentos — essa fonte nao tem esses dados.
- Cite R$ e % com precisao. Para variacao de margem use pp (pontos percentuais).
- Em integridade_dados.pct_outros use o pct_sem_categoria do payload.
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

const SYSTEM_PROMPT_REDE_EXTRA = `

ANALISE DE REDE CONSOLIDADA:
Voce esta analisando uma rede com MULTIPLAS empresas. Os campos detalhados
(mix_por_categoria, combustiveis_por_tipo, combustiveis_por_produto, grupos,
automotivos_detalhado, conveniencia_detalhado) ja vem SOMADOS entre as empresas.
NAO diga que "o consolidado nao detalha" — os dados estao la; analise-os como faria
numa unica unidade, so que os numeros sao somas da rede.

Alem do array por_empresa do payload (receita/margem/participacao/litros/variacao por
unidade), inclua tambem no JSON:

  "ranking_empresas": [
    {"posicao": 1, "empresa": "...", "receita": 0, "margem_pct": 0, "participacao_pct": 0, "avaliacao": "destaque|mediano|atencao"}
  ],
  "dispersao": {
    "concentracao": "analise de Pareto (X% da receita em N empresas)",
    "outliers": ["empresas divergentes e porque"],
    "padrao_rede": "o que funciona na rede e pode ser replicado"
  }`;

// ─── Categorias suportadas (espelha as_rede_grupo_produto.categoria) ──
const CATEGORIAS = ['combustivel', 'automotivos', 'conveniencia', 'sem_categoria'];

// ─── Mapas de categorizacao a partir de as_rede_grupo_produto ─────────
// grid tem prioridade; codigo e fallback (mesma logica do RelatorioDRE/DRE IA).
// Retorna { catMap: grupo→categoria, nomeMap: grupo→nome }.
function construirMapasGrupoProduto(gruposProd) {
  const catMap = new Map();
  const nomeMap = new Map();
  (gruposProd || []).forEach(g => {
    const cat = g.categoria || null;
    if (g.grid != null) {
      if (cat) catMap.set(Number(g.grid), cat);
      if (g.nome) nomeMap.set(Number(g.grid), g.nome);
    }
    if (g.codigo != null) {
      if (cat && !catMap.has(Number(g.codigo))) catMap.set(Number(g.codigo), cat);
      if (g.nome && !nomeMap.has(Number(g.codigo))) nomeMap.set(Number(g.codigo), g.nome);
    }
  });
  return { catMap, nomeMap };
}

// ─── Agrega um periodo (opcionalmente so uma empresa) ─────────────────
// Recebe as linhas cruas de buscarVendasAutosystem(agregado:true), onde cada
// linha e (empresa, produto, vendedor) com quantidade/valor/valor_custo/itens.
// Soma por produto (colapsando vendedores) e por categoria.
function agregarPeriodoAS(rows, catMap, nomeMap, empresaFilter = null) {
  const porCategoria = {};
  CATEGORIAS.forEach(c => { porCategoria[c] = { receita: 0, custo: 0 }; });
  const porProduto = new Map();
  let receita = 0, cmv = 0, litrosCombustivel = 0, qtdItens = 0, quantidadeTotal = 0;

  (rows || []).forEach(v => {
    if (empresaFilter != null && Number(v.empresa) !== empresaFilter) return;
    const rec = Number(v.valor || 0);
    const cus = Number(v.valor_custo || 0);
    const qtd = Number(v.quantidade || 0);
    const grupoCod = v.grupo_produto_codigo != null ? Number(v.grupo_produto_codigo) : null;
    const cat = (grupoCod != null && catMap.get(grupoCod)) || 'sem_categoria';
    const bucket = porCategoria[cat] ? cat : 'sem_categoria';

    porCategoria[bucket].receita += rec;
    porCategoria[bucket].custo += cus;
    receita += rec;
    cmv += cus;
    qtdItens += Number(v.itens || 0);
    quantidadeTotal += qtd;
    if (bucket === 'combustivel') litrosCombustivel += qtd;

    const codigo = v.produto_codigo;
    if (!porProduto.has(codigo)) {
      porProduto.set(codigo, {
        codigo,
        nome: v.produto_nome || `#${codigo}`,
        categoria: bucket,
        grupoCodigo: grupoCod,
        grupoNome: (grupoCod != null && nomeMap.get(grupoCod)) || 'Sem grupo',
        quantidade: 0, receita: 0, custo: 0,
      });
    }
    const p = porProduto.get(codigo);
    p.quantidade += qtd;
    p.receita += rec;
    p.custo += cus;
  });

  const lucroBruto = receita - cmv;
  const margemPct = receita > 0 ? (lucroBruto / receita) * 100 : 0;
  return {
    porCategoria, porProduto,
    receita, cmv, lucroBruto, margemPct,
    litrosCombustivel, qtdItens, quantidadeTotal,
  };
}

// ─── Mix por categoria ────────────────────────────────────────────────
function mixPorCategoria(agg) {
  return CATEGORIAS.map(cat => {
    const rec = agg.porCategoria[cat]?.receita || 0;
    const custo = agg.porCategoria[cat]?.custo || 0;
    const margem = rec - custo;
    return {
      categoria: cat,
      receita: round(rec),
      custo: round(custo),
      margem: round(margem),
      margem_pct: rec > 0 ? round((margem / rec) * 100, 2) : 0,
      participacao_pct: agg.receita > 0 ? round((rec / agg.receita) * 100, 2) : 0,
    };
  }).filter(m => m.receita > 0);
}

// ─── Grupos granulares (por grupo de produto) com variacao YoY ────────
function agregarGrupos(porProduto, receitaTotal) {
  const mapa = new Map();
  porProduto.forEach(p => {
    if (p.grupoCodigo == null) return;
    const k = p.grupoCodigo;
    const cur = mapa.get(k) || {
      grupo_codigo: p.grupoCodigo,
      grupo_nome: p.grupoNome,
      categoria: p.categoria,
      receita: 0, custo: 0, qtd_produtos: 0,
    };
    cur.receita += p.receita;
    cur.custo += p.custo;
    cur.qtd_produtos += 1;
    mapa.set(k, cur);
  });
  return Array.from(mapa.values())
    .map(g => ({
      ...g,
      receita: round(g.receita),
      custo: round(g.custo),
      margem: round(g.receita - g.custo),
      margem_pct: g.receita > 0 ? round(((g.receita - g.custo) / g.receita) * 100, 2) : 0,
      participacao_pct: receitaTotal > 0 ? round((g.receita / receitaTotal) * 100, 2) : 0,
    }))
    .sort((a, b) => b.receita - a.receita);
}

// ─── Combustiveis por tipo (Gasolina/Diesel/Etanol/GNV) ───────────────
function agregarCombustiveisPorTipo(porProduto, receitaTotal) {
  const mapa = new Map();
  porProduto.forEach(p => {
    if (p.categoria !== 'combustivel') return;
    const tipo = classificarTipoCombustivel(p.nome);
    const cur = mapa.get(tipo) || { tipo, litros: 0, receita: 0, custo: 0 };
    cur.litros += p.quantidade;
    cur.receita += p.receita;
    cur.custo += p.custo;
    mapa.set(tipo, cur);
  });
  return Array.from(mapa.values())
    .map(t => ({
      tipo: t.tipo,
      litros: round(t.litros, 2),
      receita: round(t.receita),
      custo: round(t.custo),
      preco_medio: t.litros > 0 ? round(t.receita / t.litros, 3) : 0,
      margem_pct: t.receita > 0 ? round(((t.receita - t.custo) / t.receita) * 100, 2) : 0,
      participacao_receita_pct: receitaTotal > 0 ? round((t.receita / receitaTotal) * 100, 2) : 0,
    }))
    .sort((a, b) => b.receita - a.receita);
}

// ─── Detalhamento por PRODUTO combustivel (nome individual) ───────────
function detalharCombustiveisPorProduto(porProduto, receitaTotal) {
  const combs = Array.from(porProduto.values()).filter(p => p.categoria === 'combustivel');
  const receitaCombs = combs.reduce((s, p) => s + p.receita, 0);
  const litrosCombs = combs.reduce((s, p) => s + p.quantidade, 0);
  return combs
    .map(p => ({
      produto: p.nome,
      tipo: classificarTipoCombustivel(p.nome),
      grupo: p.grupoNome,
      litros: round(p.quantidade, 2),
      receita: round(p.receita),
      custo: round(p.custo),
      preco_medio_litro: p.quantidade > 0 ? round(p.receita / p.quantidade, 3) : 0,
      custo_medio_litro: p.quantidade > 0 ? round(p.custo / p.quantidade, 3) : 0,
      margem_rs: round(p.receita - p.custo),
      margem_rs_por_litro: p.quantidade > 0 ? round((p.receita - p.custo) / p.quantidade, 3) : 0,
      margem_pct: p.receita > 0 ? round(((p.receita - p.custo) / p.receita) * 100, 2) : 0,
      participacao_pct_receita_total: receitaTotal > 0 ? round((p.receita / receitaTotal) * 100, 2) : 0,
      participacao_pct_dentro_combustiveis: receitaCombs > 0 ? round((p.receita / receitaCombs) * 100, 2) : 0,
      participacao_pct_litros_combustiveis: litrosCombs > 0 ? round((p.quantidade / litrosCombs) * 100, 2) : 0,
    }))
    .sort((a, b) => b.litros - a.litros);
}

// ─── Detalhamento de uma categoria POR GRUPO + top produtos + YoY ─────
function detalharCategoriaPorGrupo(porProduto, receitaTotalGeral, categoriaAlvo, porProdutoYoY = null) {
  const itensCat = Array.from(porProduto.values()).filter(p => p.categoria === categoriaAlvo);
  if (itensCat.length === 0) return null;
  const itensYoYCat = porProdutoYoY
    ? Array.from(porProdutoYoY.values()).filter(p => p.categoria === categoriaAlvo)
    : [];

  const totReceita = itensCat.reduce((s, p) => s + p.receita, 0);
  const totCusto = itensCat.reduce((s, p) => s + p.custo, 0);
  const totReceitaYoY = itensYoYCat.reduce((s, p) => s + p.receita, 0);
  const totCustoYoY = itensYoYCat.reduce((s, p) => s + p.custo, 0);

  const grupos = new Map();
  itensCat.forEach(p => {
    const k = p.grupoCodigo ?? 'sem-grupo';
    const cur = grupos.get(k) || {
      grupo_codigo: p.grupoCodigo,
      grupo_nome: p.grupoNome || 'Sem grupo',
      receita: 0, custo: 0, qtd_produtos: 0, produtos: [],
    };
    cur.receita += p.receita;
    cur.custo += p.custo;
    cur.qtd_produtos += 1;
    cur.produtos.push(p);
    grupos.set(k, cur);
  });

  const gruposYoY = new Map();
  itensYoYCat.forEach(p => {
    const k = p.grupoCodigo ?? 'sem-grupo';
    const cur = gruposYoY.get(k) || { receita: 0, custo: 0 };
    cur.receita += p.receita;
    cur.custo += p.custo;
    gruposYoY.set(k, cur);
  });
  const mapYoYProd = new Map();
  itensYoYCat.forEach(p => mapYoYProd.set(p.codigo, p));

  const gruposArr = Array.from(grupos.values())
    .map(g => {
      const margem = g.receita - g.custo;
      const margemPct = g.receita > 0 ? (margem / g.receita) * 100 : 0;
      const yoy = gruposYoY.get(g.grupo_codigo ?? 'sem-grupo') || { receita: 0, custo: 0 };
      const margemYoyPct = yoy.receita > 0 ? ((yoy.receita - yoy.custo) / yoy.receita) * 100 : 0;
      const topProdutos = g.produtos
        .slice()
        .sort((a, b) => b.receita - a.receita)
        .slice(0, 5)
        .map(p => {
          const prev = mapYoYProd.get(p.codigo);
          return {
            produto: p.nome,
            receita: round(p.receita),
            margem_pct: p.receita > 0 ? round(((p.receita - p.custo) / p.receita) * 100, 2) : 0,
            participacao_grupo_pct: g.receita > 0 ? round((p.receita / g.receita) * 100, 2) : 0,
            variacao_receita_yoy_pct: prev ? variacaoPct(p.receita, prev.receita) : null,
          };
        });
      return {
        grupo: g.grupo_nome,
        receita: round(g.receita),
        custo: round(g.custo),
        margem: round(margem),
        margem_pct: round(margemPct, 2),
        participacao_categoria_pct: totReceita > 0 ? round((g.receita / totReceita) * 100, 2) : 0,
        participacao_total_pct: receitaTotalGeral > 0 ? round((g.receita / receitaTotalGeral) * 100, 2) : 0,
        qtd_produtos: g.qtd_produtos,
        variacao_receita_yoy_pct: yoy.receita > 0 ? variacaoPct(g.receita, yoy.receita) : null,
        variacao_margem_yoy_pp: round(margemPct - margemYoyPct, 2),
        top_produtos: topProdutos,
      };
    })
    .sort((a, b) => b.receita - a.receita);

  return {
    categoria: categoriaAlvo,
    totais: {
      receita: round(totReceita),
      custo: round(totCusto),
      margem: round(totReceita - totCusto),
      margem_pct: totReceita > 0 ? round(((totReceita - totCusto) / totReceita) * 100, 2) : 0,
      participacao_receita_total_pct: receitaTotalGeral > 0
        ? round((totReceita / receitaTotalGeral) * 100, 2) : 0,
      receita_yoy: round(totReceitaYoY),
      variacao_receita_yoy_pct: totReceitaYoY > 0 ? variacaoPct(totReceita, totReceitaYoY) : null,
      margem_yoy_pct: totReceitaYoY > 0
        ? round(((totReceitaYoY - totCustoYoY) / totReceitaYoY) * 100, 2) : 0,
    },
    qtd_grupos: gruposArr.length,
    qtd_produtos: itensCat.length,
    grupos: gruposArr,
  };
}

// ─── Produtos em queda/alta/sumiram (vs YoY) ──────────────────────────
// Chaveado por codigo do produto (grid), estavel entre periodos.
function detectarAlertasProduto(porProdutoAtual, porProdutoYoY) {
  const em_queda = [];
  const em_alta = [];
  const sumiram = [];
  const mapYoY = new Map(Array.from(porProdutoYoY.values()).map(p => [p.codigo, p]));

  porProdutoAtual.forEach(atual => {
    const prev = mapYoY.get(atual.codigo);
    if (!prev) return;
    const varReceita = variacaoPct(atual.receita, prev.receita);
    const margemAtual = atual.receita > 0 ? ((atual.receita - atual.custo) / atual.receita) * 100 : 0;
    const margemPrev = prev.receita > 0 ? ((prev.receita - prev.custo) / prev.receita) * 100 : 0;
    const deltaMargem = margemAtual - margemPrev;

    if (varReceita != null && varReceita <= -20 && atual.receita >= 100) {
      em_queda.push({
        produto: atual.nome, categoria: atual.categoria, grupo: atual.grupoNome,
        receita_atual: round(atual.receita), receita_yoy: round(prev.receita),
        variacao_pct: round(varReceita, 2), tipo: 'receita',
      });
    } else if (deltaMargem <= -5 && atual.receita >= 100) {
      em_queda.push({
        produto: atual.nome, categoria: atual.categoria, grupo: atual.grupoNome,
        receita_atual: round(atual.receita),
        margem_atual_pct: round(margemAtual, 2), margem_yoy_pct: round(margemPrev, 2),
        variacao_margem_pp: round(deltaMargem, 2), tipo: 'margem',
      });
    } else if (varReceita != null && varReceita >= 20 && atual.receita >= 100) {
      em_alta.push({
        produto: atual.nome, categoria: atual.categoria, grupo: atual.grupoNome,
        receita_atual: round(atual.receita), receita_yoy: round(prev.receita),
        crescimento_pct: round(varReceita, 2),
      });
    }
  });

  porProdutoYoY.forEach(prev => {
    if (prev.receita < 100) return;
    const atual = porProdutoAtual.get(prev.codigo);
    if (!atual || atual.receita === 0) {
      sumiram.push({
        produto: prev.nome, categoria: prev.categoria, grupo: prev.grupoNome,
        receita_yoy: round(prev.receita),
      });
    }
  });

  return {
    em_queda: em_queda
      .sort((a, b) => Math.abs(b.variacao_pct || b.variacao_margem_pp) - Math.abs(a.variacao_pct || a.variacao_margem_pp))
      .slice(0, 10),
    em_alta: em_alta.sort((a, b) => b.crescimento_pct - a.crescimento_pct).slice(0, 5),
    sumiram: sumiram.sort((a, b) => b.receita_yoy - a.receita_yoy).slice(0, 5),
  };
}

// ─── Agrega o payload de UM recorte (rede inteira ou uma empresa) ─────
// Reusa o agregador cru + os aggregators granulares. `atualAgg`/`yoyAgg` sao
// resultados de agregarPeriodoAS ja recortados no escopo desejado.
function montarSecoesVendas(atualAgg, yoyAgg) {
  // Grupos granulares com variacao YoY por grupo
  const gruposGranulares = agregarGrupos(atualAgg.porProduto, atualAgg.receita);
  if (yoyAgg) {
    const yoyGrupos = agregarGrupos(yoyAgg.porProduto, yoyAgg.receita);
    const mapYoYGrupo = new Map(yoyGrupos.map(g => [g.grupo_codigo, g]));
    gruposGranulares.forEach(g => {
      const prev = mapYoYGrupo.get(g.grupo_codigo);
      g.receita_yoy = prev?.receita || 0;
      g.variacao_receita_pct = variacaoPct(g.receita, g.receita_yoy);
      g.variacao_margem_pp = round(g.margem_pct - (prev?.margem_pct || 0), 2);
    });
  }

  // Combustiveis por tipo com variacao YoY
  const combustiveisPorTipo = agregarCombustiveisPorTipo(atualAgg.porProduto, atualAgg.receita);
  if (yoyAgg) {
    const yoyTipos = agregarCombustiveisPorTipo(yoyAgg.porProduto, yoyAgg.receita);
    const mapYoYTipo = new Map(yoyTipos.map(t => [t.tipo, t]));
    combustiveisPorTipo.forEach(t => {
      const prev = mapYoYTipo.get(t.tipo);
      t.litros_yoy = prev?.litros || 0;
      t.variacao_litros_pct = variacaoPct(t.litros, t.litros_yoy);
      t.preco_medio_yoy = prev?.preco_medio || 0;
      t.variacao_preco_pct = variacaoPct(t.preco_medio, t.preco_medio_yoy);
      t.receita_yoy = prev?.receita || 0;
      t.variacao_receita_pct = variacaoPct(t.receita, t.receita_yoy);
    });
  }

  // Combustiveis por produto com variacao YoY (chave = codigo)
  const combustiveisPorProduto = detalharCombustiveisPorProduto(atualAgg.porProduto, atualAgg.receita);
  if (yoyAgg) {
    const mapNomeCodigo = new Map(
      Array.from(atualAgg.porProduto.values()).map(p => [p.nome, p.codigo]),
    );
    combustiveisPorProduto.forEach(cp => {
      const codigo = mapNomeCodigo.get(cp.produto);
      const prev = codigo != null ? yoyAgg.porProduto.get(codigo) : null;
      cp.litros_yoy = prev ? round(prev.quantidade, 2) : 0;
      cp.receita_yoy = prev ? round(prev.receita) : 0;
      cp.variacao_litros_pct = variacaoPct(cp.litros, cp.litros_yoy);
      cp.variacao_receita_pct = variacaoPct(cp.receita, cp.receita_yoy);
    });
  }

  const automotivosDetalhado = detalharCategoriaPorGrupo(
    atualAgg.porProduto, atualAgg.receita, 'automotivos', yoyAgg?.porProduto,
  );
  const conveniênciaDetalhado = detalharCategoriaPorGrupo(
    atualAgg.porProduto, atualAgg.receita, 'conveniencia', yoyAgg?.porProduto,
  );

  const alertas = yoyAgg
    ? detectarAlertasProduto(atualAgg.porProduto, yoyAgg.porProduto)
    : { em_queda: [], em_alta: [], sumiram: [] };

  const topProdutos = Array.from(atualAgg.porProduto.values())
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 15)
    .map(p => ({
      nome: p.nome,
      categoria: p.categoria,
      grupo: p.grupoNome,
      quantidade: round(p.quantidade, 2),
      receita: round(p.receita),
      custo: round(p.custo),
      margem_pct: p.receita > 0 ? round(((p.receita - p.custo) / p.receita) * 100, 2) : 0,
    }));

  // Integridade: quanto do faturamento esta em grupos sem categoria
  const recSemCat = atualAgg.porCategoria.sem_categoria?.receita || 0;
  const pctSemCat = atualAgg.receita > 0 ? (recSemCat / atualAgg.receita) * 100 : 0;
  const alertasInteg = [];
  if (pctSemCat > 5) {
    alertasInteg.push(`${round(pctSemCat, 1)}% do faturamento esta em grupos de produto sem categoria — classifique-os em Parametros para o mix ficar preciso.`);
  }

  return {
    totais: {
      faturamento_bruto: round(atualAgg.receita),
      cmv: round(atualAgg.cmv),
      lucro_bruto: round(atualAgg.lucroBruto),
      margem_pct: round(atualAgg.margemPct, 2),
      quantidade_total: round(atualAgg.quantidadeTotal, 2),
      qtd_itens: atualAgg.qtdItens,
    },
    volume_combustivel: {
      litros_total: round(atualAgg.litrosCombustivel, 2),
      preco_medio_litro: atualAgg.litrosCombustivel > 0
        ? round((atualAgg.porCategoria.combustivel?.receita || 0) / atualAgg.litrosCombustivel, 3)
        : null,
    },
    mix_por_categoria: mixPorCategoria(atualAgg),
    grupos_granulares: gruposGranulares.slice(0, 15),
    combustiveis_por_tipo: combustiveisPorTipo,
    combustiveis_por_produto: combustiveisPorProduto,
    automotivos_detalhado: automotivosDetalhado,
    conveniencia_detalhado: conveniênciaDetalhado,
    top_produtos: topProdutos,
    produtos_em_queda: alertas.em_queda,
    produtos_em_alta: alertas.em_alta,
    produtos_sumiram: alertas.sumiram,
    integridade_dados: {
      pct_sem_categoria: round(pctSemCat, 2),
      receita_sem_categoria: round(recSemCat),
      alertas: alertasInteg,
    },
  };
}

// ─── Orquestrador: monta o payload completo (rede ou empresa unica) ───
// params: { rede, empresaCodigos, empresas, mesRef, onProgress }
//   - rede: linha as_rede ({ id, nome })
//   - empresaCodigos: number[] (grids das empresas da rede)
//   - empresas (opcional): [{ empresa_codigo, nome }] p/ nomear a aba por empresa
export async function prepararDadosVendasAutosystem({ rede, empresaCodigos, empresas = [], mesRef, onProgress }) {
  if (!rede?.id) throw new Error('Rede Autosystem inválida (sem id).');
  const redeId = rede.id;
  const codigos = (empresaCodigos || []).map(Number).filter(c => Number.isFinite(c));
  if (codigos.length === 0) throw new Error('Nenhuma empresa Autosystem informada.');

  const periodos = calcularPeriodos(mesRef);

  onProgress?.('Carregando categorização de grupos de produto...');
  const gruposProd = await autosystemService.listarGruposProdutoRede(redeId).catch(() => []);
  const { catMap, nomeMap } = construirMapasGrupoProduto(gruposProd);

  // Fetch de cada periodo (atual, yoy, e os 6 meses da tendencia). Cada chamada
  // ja traz TODAS as empresas selecionadas (a linha carrega o campo `empresa`),
  // entao recortamos por empresa em memoria para o `por_empresa`.
  const fetchPeriodo = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const rows = await autosystemService.buscarVendasAutosystem(
      redeId, codigos,
      { data_de: p.dataInicial, data_ate: p.dataFinal, agregado: true },
    ).catch(() => []);
    return { key: p.key, rows };
  };

  const [atualData, yoyData, ...serieData] = await Promise.all([
    fetchPeriodo(periodos.atual, `${periodos.atual.label} (atual)`),
    fetchPeriodo(periodos.yoy, `${periodos.yoy.label} (YoY)`),
    ...periodos.tendencia6m.map(p => fetchPeriodo(p, p.label)),
  ]);

  const atualAgg = agregarPeriodoAS(atualData.rows, catMap, nomeMap);
  const yoyAgg = agregarPeriodoAS(yoyData.rows, catMap, nomeMap);

  // Tendencia 6m consolidada (rede inteira)
  const tendencia6m = periodos.tendencia6m.map((p, i) => {
    const agg = agregarPeriodoAS(serieData[i].rows, catMap, nomeMap);
    return {
      mes: p.label,
      faturamento: round(agg.receita),
      lucro_bruto: round(agg.lucroBruto),
      margem_pct: round(agg.margemPct, 2),
      litros: round(agg.litrosCombustivel, 2),
      quantidade: round(agg.quantidadeTotal, 2),
    };
  });

  const secoes = montarSecoesVendas(atualAgg, yoyAgg);

  // Comparativo YoY (topo)
  const comparativoYoy = {
    periodo: periodos.yoy.label,
    faturamento: round(yoyAgg.receita),
    lucro_bruto: round(yoyAgg.lucroBruto),
    margem_pct: round(yoyAgg.margemPct, 2),
    variacao_receita_pct: variacaoPct(atualAgg.receita, yoyAgg.receita),
    variacao_lucro_pct: variacaoPct(atualAgg.lucroBruto, yoyAgg.lucroBruto),
    variacao_margem_pp: round(atualAgg.margemPct - yoyAgg.margemPct, 2),
  };

  // Por empresa (so com multiplas unidades)
  const ativo = demoAtivo();
  const nomePorCodigo = new Map(
    (empresas || []).map(e => [Number(e.empresa_codigo), e]),
  );
  const nomeEmpresa = (ec) => {
    const emp = nomePorCodigo.get(ec);
    if (ativo) return mascararEmpresa(emp || { empresa_codigo: ec }, true);
    return emp?.nome || `Empresa #${ec}`;
  };

  const porEmpresa = codigos.length > 1
    ? codigos.map(ec => {
        const eAtual = agregarPeriodoAS(atualData.rows, catMap, nomeMap, ec);
        const eYoY = agregarPeriodoAS(yoyData.rows, catMap, nomeMap, ec);
        return {
          empresa_codigo: ec,
          nome: nomeEmpresa(ec),
          faturamento: round(eAtual.receita),
          cmv: round(eAtual.cmv),
          lucro_bruto: round(eAtual.lucroBruto),
          margem_pct: round(eAtual.margemPct, 2),
          litros_combustivel: round(eAtual.litrosCombustivel, 2),
          participacao_pct: atualAgg.receita > 0
            ? round((eAtual.receita / atualAgg.receita) * 100, 2) : 0,
          variacao_receita_pct: variacaoPct(eAtual.receita, eYoY.receita),
          mix_por_categoria: mixPorCategoria(eAtual),
        };
      }).sort((a, b) => b.faturamento - a.faturamento)
    : [];

  return {
    empresa: {
      nome: ativo ? mascararRede(rede?.nome, rede?.id, true) : (rede?.nome || 'Rede'),
      cnpj: null,
      qtd_empresas: codigos.length,
    },
    periodo: periodos.atual.label,
    ...secoes,
    comparativo_yoy: comparativoYoy,
    tendencia_6m: tendencia6m,
    por_empresa: porEmpresa,
  };
}

// ─── Chamada Claude ────────────────────────────────────────────
// Mesma assinatura e retorno de gerarAnaliseVendasIA (webposto): devolve
// { insights, usage, raw, stop_reason } via chamarClaudeAPI. modoRede acrescenta
// o bloco de rede (ranking_empresas + dispersao) ao system prompt.
export async function gerarAnaliseVendasAutosystemIA(dados, apiKey, { modoRede = false } = {}) {
  const systemBlocks = [{ type: 'text', text: SYSTEM_PROMPT }];
  if (modoRede) systemBlocks.push({ type: 'text', text: SYSTEM_PROMPT_REDE_EXTRA });
  const user = modoRede
    ? `Análise a performance comercial desta REDE de postos (Autosystem):\n\n${JSON.stringify(dados, null, 2)}`
    : `Análise a performance comercial deste posto (Autosystem):\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({ apiKey, system: systemBlocks, user });
}
