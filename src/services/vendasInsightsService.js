// Analise de vendas com IA (Claude). Dois modos: por empresa e rede consolidada.
// Inclui comparacoes temporais YoY + trimestre vs trimestre + tendencia 6 meses.
// Modelo e cache gerenciados por iaSharedHelpers (Claude Opus 4.7 adaptive).

import { classificarItem } from './mapeamentoVendasService';
import * as qualityApi from './qualityApiService';
import {
  chamarClaudeAPI, calcularPeriodos, classificarTipoCombustivel,
  round, variacaoPct,
} from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararEmpresa, mascararRede, mascararCnpj } from './anonimizarService';

export { carregarApiKey, salvarApiKey, limparApiKey } from './iaSharedHelpers';

// ─── System prompt (cacheado) ─────────────────────────────────
const SYSTEM_PROMPT = `Voce e um consultor senior especializado em postos de combustiveis e loja de conveniencia.

SETOR DE POSTOS DE COMBUSTIVEL:
- Margens tipicas: combustivel 1-4%, automotivos 8-20%, conveniencia 25-40%
- Mix ideal: combustivel 70-80% da receita; conveniencia >=15% (margens altas = transforma resultado)
- Tipos de combustivel: gasolina comum/aditivada, etanol, diesel S10/S500, GNV
- Grupos de conveniencia: bebidas, lanches, cigarros, salgados, higiene
- Sensibilidade a preco: guerra local, elasticidade alta em combustiveis
- Taxas de cartao: 2-3% da receita (cartao de credito), 0.5-1.5% (debito/pix)
- KPI operacional: litros/bico/dia, ticket medio, conversao loja

MODELO DE DADOS (Quality Webposto) — como os dados sao relacionados:
- VENDA_ITEM e a base de analise de vendas (cada item de cada venda).
  Se conecta a VENDA por vendaCodigo, a PRODUTO por produtoCodigo e a EMPRESA por empresaCodigo.
- VENDA tem o campo situacao: "A" = autorizada/efetivada, "C" = cancelada, "T" = todas.
  SO devem ser analisadas vendas com situacao = "A". Vendas canceladas ("C") vao para bucket separado de perda.
- PRODUTO se conecta a GRUPO por grupoCodigo. Tem tipoProduto ("C" = combustivel, "P" = produto) E tem a
  coluna dedicada combustivel (true/false), que e o identificador preferencial de combustiveis.
- GRUPO tem campo tipoGrupo ("Pista" ou "Conveniencia").
- VENDA_FORMA_PAGAMENTO se conecta a VENDA por vendaCodigo. O valor esta em valorPagamento.
  Tem administradoraCodigo; quando nao e null, cruza com ADMINISTRADORA para obter a taxa real
  (percentualComissao), o tipo e a descricao da administradora.
- ADMINISTRADORA tem descricao, tipo e percentualComissao (taxa real da operadora).

REGRAS DE CLASSIFICACAO POR CATEGORIA (ja aplicadas no payload):
- Combustivel = PRODUTO.combustivel === true OU produto.tipoProduto === "C" (gasolina, diesel, etanol, GNV)
- Automotivos = grupo.tipoGrupo === "Pista" E produto.tipoProduto === "P" (lubrificante, aditivo, Arla, filtro, fluidos)
- Conveniencia = grupo.tipoGrupo === "Conveniencia" (loja: bebidas, lanches, cigarros, limpeza, etc)
- Outros = tudo que nao se enquadra (pode indicar cadastro incompleto)

VOCE RECEBE NO PAYLOAD:
- Periodo atual (mes selecionado), comparativo YoY (mesmo mes ano anterior, elimina sazonalidade),
  comparativo trimestre vs trimestre, tendencia dos ultimos 6 meses
- Mix por categoria (combustivel/automotivos/conveniencia)
- Grupos granulares (ex: Bebidas, Cigarros, Lanches dentro de conveniencia) com variacao YoY
- Combustiveis separados por tipo (Gasolina/Diesel S10/Etanol/etc) com litros, preco medio e variacao
- DETALHAMENTO POR PRODUTO combustivel (combustiveis_por_produto): lista cada produto combustivel
  pelo NOME individual (ex: "Gasolina Comum", "Gasolina Aditivada", "Diesel S10", "Etanol Comum"),
  com litros, preco medio/litro, custo medio/litro, margem em R$/litro e margem %, participacao
  dentro da categoria combustiveis (% receita e % litros), e comparativo YoY de volume e receita.
  Use isso para analisar performance de cada combustivel especifico (ex: aditivada vs comum tem
  qual margem? Qual cresceu/caiu mais em volume? Qual tem maior margem R$/L?).
- DETALHAMENTO DE AUTOMOTIVOS (automotivos_detalhado): totais da categoria + GRUPOS com receita,
  margem, % dentro da categoria, % receita total, variacao YoY por grupo e top 5 produtos do grupo.
  Use isso para analisar cada tipo de automotivo (Lubrificantes, Arla, Aditivos, Filtros, etc).
- DETALHAMENTO DE CONVENIENCIA (conveniencia_detalhado): mesma estrutura que automotivos, com os
  grupos da loja (Bebidas, Cigarros, Lanches, Higiene, etc). Use para identificar quais grupos
  de conveniencia puxam resultado e quais tem margem baixa.
- Top 15 produtos por receita
- Produtos em queda (>=20% YoY), em alta (>=20% YoY), e que sumiram (tinham YoY e nao tem atual)
- FORMAS DE PAGAMENTO (formas_pagamento): mix em R$ e % por forma/administradora, qtd transacoes,
  ticket medio, variacao YoY, concentracao de risco, custo da maquineta.
  IMPORTANTE: cada linha tem campo "fonte_taxa":
  - "real (ADMINISTRADORA)" = taxa vem da coluna percentualComissao da administradora cadastrada.
    Use essa taxa sem questionar — e o custo real pago a operadora.
  - "estimada" = fallback por heuristica (quando nao ha administradora associada a forma).
    Trate como aproximacao; sugira ao gestor cadastrar a administradora para obter o custo real.

VERIFICACOES QUE VOCE DEVE FAZER:
1. Cadastro: se ha muito "Outros" (> 5% da receita), flag de "cadastro incompleto" (produtos sem
   tipoProduto ou grupo sem tipoGrupo corretos).
2. Vendas canceladas: se canceladas > 2% da receita bruta, flag de alerta operacional.
3. Formas de pagamento: detectar concentracao de risco (ex: credito > 70% = fluxo de caixa
   dependente de prazo da adquirente), crescimento de PIX (barato) vs cartao (caro),
   presenca de prazo/fiado (risco de inadimplencia), custo efetivo da maquineta estimado.
4. Mix de combustiveis: se algum tipo cai em litros mas sobe em receita (repasse de preco) ou
   sobe em litros e cai em receita (preco competitivo).
5. Grupos que "sumiram" ou "apareceram" entre YoY e atual.

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
    "analise_por_produto": "analise individual dos produtos combustiveis pelo nome — comum vs aditivada, S10 vs S500, etc. Inclua quais produtos tem maior margem em R$/litro e quais sao os gargalos.",
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
  "formas_pagamento": {
    "interpretacao": "analise do mix de formas de pagamento com numeros",
    "distribuicao": [{"forma": "...", "valor": 0, "pct_receita": 0, "qtd_transacoes": 0, "ticket_medio": 0, "variacao_yoy_pct": 0}],
    "concentracao_risco": "alerta se alguma forma > 50% ou mudanca brusca vs YoY",
    "custo_maquineta_estimado": "estimativa em R$ e % da receita (credito * 2.5% + debito * 1% + prazo/fiado risco inadimplencia)",
    "recomendacoes": ["sugestoes praticas de incentivo a pix, renegociacao de taxa, controle de fiado, etc"]
  },
  "integridade_dados": {
    "pct_outros": 0,
    "vendas_canceladas_pct": 0,
    "alertas": ["cadastro incompleto", "cancelamentos elevados", etc se aplicavel]
  },
  "comparativo": {
    "vs_yoy": "variacao YoY com numeros",
    "vs_trimestre": "variacao trimestre vs trimestre",
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
- Use SEMPRE os numeros do payload. Nao invente.
- Cite R$ e % com precisao.
- YoY elimina sazonalidade; trimestre suaviza ruido; tendencia 6m = direcao.
- Para variacao de margem use pp (pontos percentuais).
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

const SYSTEM_PROMPT_REDE_EXTRA = `

ANALISE DE REDE CONSOLIDADA:
Voce esta analisando uma rede com MULTIPLAS empresas. O payload da REDE inclui os MESMOS
campos detalhados que o de empresa individual, consolidados por soma entre as empresas:
- combustiveis_por_tipo: litros/receita/margem somados por tipo (Gasolina, Diesel, Etanol, GNV)
- combustiveis_por_produto: litros/receita/margem somados pelo NOME do produto entre as empresas
  (ex: "Gasolina Comum" soma o que cada empresa vendeu desse produto). Inclui "empresas_com_produto"
  = em quantas unidades da rede o produto esta cadastrado/vendido.
- automotivos_detalhado e conveniencia_detalhado: grupos agregados pelo nome, com receita, margem,
  participacao na categoria e variacao YoY. Inclui "empresas_com_grupo".

IMPORTANTE: NAO diga que "o payload consolidado nao detalha" — OS DADOS ESTAO LA, use-os.
Analise os combustiveis e as categorias exatamente como faria numa empresa unica; a diferenca
e apenas que os numeros sao somas da rede. Mencione a cobertura (empresas_com_produto /
empresas_com_grupo) para indicar se o produto/grupo esta presente em toda a rede ou so em algumas.

Alem dos campos da analise individual, inclua tambem:

  "ranking_empresas": [
    {"posicao": 1, "empresa": "...", "receita": 0, "margem_pct": 0, "participacao_pct": 0, "avaliacao": "destaque|mediano|atencao"}
  ],
  "dispersao": {
    "concentracao": "analise de Pareto (X% da receita em N empresas)",
    "outliers": ["empresas divergentes e porque"],
    "padrao_rede": "o que funciona na rede e pode ser replicado"
  }`;

// ─── Classifica forma de pagamento — fallback quando nao tem administradora ─
// Taxas usadas como fallback (quando ADMINISTRADORA nao esta associada); mas se
// fp.administradoraCodigo e preenchido, a taxa real vem de ADMINISTRADORA.percentualComissao.
function classificarFormaPagamento(nome) {
  if (!nome) return { classe: 'Outro', custo_pct_fallback: 0 };
  const n = String(nome).toLowerCase();
  if (/credit/.test(n)) return { classe: 'Credito', custo_pct_fallback: 2.5 };
  if (/debit/.test(n)) return { classe: 'Debito', custo_pct_fallback: 1.0 };
  if (/pix/.test(n)) return { classe: 'PIX', custo_pct_fallback: 0.3 };
  if (/dinheiro|especie|cash/.test(n)) return { classe: 'Dinheiro', custo_pct_fallback: 0 };
  if (/cheque/.test(n)) return { classe: 'Cheque', custo_pct_fallback: 0.2 };
  if (/fiado|prazo|credenciado|convenio|faturad|frota|ticket|voucher/.test(n)) {
    return { classe: 'Prazo/Fiado', custo_pct_fallback: 2.0 };
  }
  return { classe: nome || 'Outro', custo_pct_fallback: 0 };
}

// ─── Agregar formas de pagamento ──────────────────────────────
// Usa valorPagamento (campo correto do endpoint VENDA_FORMA_PAGAMENTO) e,
// quando fp.administradoraCodigo esta presente, cruza com o mapa de ADMINISTRADORA
// para obter a taxa real (percentualComissao) e o nome/tipo corretos.
// Filtra apenas vendas autorizadas.
function agregarFormasPagamento(formasPag, vendas, administradorasMap) {
  const vendasValidasSet = new Set(
    (vendas || [])
      .filter(v => (v.cancelada || 'N') !== 'S')
      .map(v => v.vendaCodigo || v.codigo)
  );
  // Agrupamento: primeiro por administradora (se tem); depois por forma (se nao)
  const agrupado = new Map();
  (formasPag || []).forEach(fp => {
    const vc = fp.vendaCodigo || fp.codigoVenda;
    if (!vendasValidasSet.has(vc)) return;
    // Valor: campo correto e valorPagamento (fallback para valor/valorPago se faltarem)
    const valor = Number(fp.valorPagamento ?? fp.valor ?? fp.valorPago ?? 0);
    if (!isFinite(valor) || valor === 0) return;

    const admCodigo = fp.administradoraCodigo;
    const admReg = admCodigo != null ? administradorasMap?.get(Number(admCodigo)) : null;

    let forma, custoPct, fonteTaxa;
    if (admReg) {
      // Tem administradora cadastrada: taxa real de percentualComissao
      forma = admReg.descricao || admReg.nome || `Administradora #${admCodigo}`;
      const tipoAdm = (admReg.tipo || '').toString();
      if (tipoAdm) forma = `${forma} (${tipoAdm})`;
      custoPct = Number(admReg.percentualComissao ?? 0);
      fonteTaxa = 'real (ADMINISTRADORA)';
    } else {
      // Sem administradora: heuristica por nome da forma
      const nomeRaw = fp.formaPagamentoNome || fp.nomeFormaPagamento
        || fp.descricao || fp.formaPagamento || `#${fp.formaPagamentoCodigo || '?'}`;
      const { classe, custo_pct_fallback } = classificarFormaPagamento(nomeRaw);
      forma = classe;
      custoPct = custo_pct_fallback;
      fonteTaxa = 'estimada';
    }

    const chave = `${forma}|${fonteTaxa}`;
    const cur = agrupado.get(chave) || {
      forma, custo_pct: custoPct, fonte_taxa: fonteTaxa,
      administradora_codigo: admCodigo ?? null,
      valor: 0, qtd: 0, vendas: new Set(),
    };
    cur.valor += valor;
    cur.qtd += 1;
    cur.vendas.add(vc);
    agrupado.set(chave, cur);
  });
  const total = Array.from(agrupado.values()).reduce((s, x) => s + x.valor, 0);
  const distribuicao = Array.from(agrupado.values())
    .map(x => ({
      forma: x.forma,
      custo_pct: x.custo_pct,
      fonte_taxa: x.fonte_taxa,
      administradora_codigo: x.administradora_codigo,
      valor: round(x.valor),
      qtd_transacoes: x.qtd,
      qtd_vendas_distintas: x.vendas.size,
      ticket_medio: x.vendas.size > 0 ? round(x.valor / x.vendas.size) : 0,
      participacao_pct: total > 0 ? round((x.valor / total) * 100, 2) : 0,
      custo_estimado: round(x.valor * (x.custo_pct / 100)),
    }))
    .sort((a, b) => b.valor - a.valor);
  const custoTotal = distribuicao.reduce((s, d) => s + d.custo_estimado, 0);
  return {
    distribuicao,
    total_receita_por_forma: round(total),
    custo_maquineta_total_estimado: round(custoTotal),
    custo_maquineta_pct_receita: total > 0 ? round((custoTotal / total) * 100, 2) : 0,
  };
}

// ─── Helper: identifica se produto e combustivel ──────────────
// Prefere PRODUTO.combustivel === true (coluna dedicada do Quality);
// fallback para tipoProduto === "C" como redundancia.
function ehCombustivel(produto) {
  if (!produto) return false;
  if (produto.combustivel === true || produto.combustivel === 'S' || produto.combustivel === 1) return true;
  if (produto.tipoProduto === 'C') return true;
  return false;
}

// ─── Agregacao compacta por empresa ────────────────────────────
// Recebe dados crus de 2 periodos (atual + YoY) + serie mensal para tendencia
export function agregarDadosEmpresa({ cliente, periodoLabel, vendaItens, vendas, formasPagamento, produtosMap, gruposMap, administradorasMap,
  vendaItensYoY, vendasYoY, formasPagamentoYoY, periodoLabelYoY,
  serieMensal,  // array de { periodoLabel, vendaItens, vendas } para tendencia 6m
} = {}) {
  const atual = agregarPeriodo(vendaItens, vendas, produtosMap, gruposMap);
  const yoy = vendaItensYoY ? agregarPeriodo(vendaItensYoY, vendasYoY, produtosMap, gruposMap) : null;

  // Tendencia 6 meses
  const tendencia6m = (serieMensal || []).map(s => {
    const a = agregarPeriodo(s.vendaItens, s.vendas, produtosMap, gruposMap);
    return {
      mes: s.periodoLabel,
      receita: a.receita,
      lucro_bruto: a.lucroBruto,
      margem_pct: a.margemPct,
      litros: a.litrosCombustivel,
      qtd_vendas: a.qtdVendas,
      ticket_medio: a.ticketMedio,
    };
  });

  // Grupos granulares (Bebidas, Cigarros, etc.)
  const gruposGranulares = agregarGrupos(atual.porProduto, atual.receita);
  // Com variacao YoY por grupo
  if (yoy) {
    const yoyPorGrupo = agregarGrupos(yoy.porProduto, yoy.receita);
    const mapYoYGrupo = new Map(yoyPorGrupo.map(g => [g.grupo_codigo, g]));
    gruposGranulares.forEach(g => {
      const prev = mapYoYGrupo.get(g.grupo_codigo);
      g.receita_yoy = prev?.receita || 0;
      g.variacao_receita_pct = variacaoPct(g.receita, g.receita_yoy);
      g.margem_pct_yoy = prev?.margem_pct || 0;
      g.variacao_margem_pp = round(g.margem_pct - (prev?.margem_pct || 0), 2);
    });
  }

  // Combustiveis por tipo
  const combustiveisPorTipo = agregarCombustiveisPorTipo(atual.porProduto, atual.receita);
  if (yoy) {
    const yoyTipos = agregarCombustiveisPorTipo(yoy.porProduto, yoy.receita);
    const mapYoYTipo = new Map(yoyTipos.map(t => [t.tipo, t]));
    combustiveisPorTipo.forEach(t => {
      const prev = mapYoYTipo.get(t.tipo);
      t.litros_yoy = prev?.litros || 0;
      t.variacao_litros_pct = variacaoPct(t.litros, t.litros_yoy);
      t.preco_medio_yoy = prev?.preco_medio || 0;
      t.variacao_preco_pct = variacaoPct(t.preco_medio, t.preco_medio_yoy);
    });
  }

  // Detalhamento por PRODUTO combustivel (nome individual)
  const combustiveisPorProduto = detalharCombustiveisPorProduto(atual.porProduto, atual.receita);
  if (yoy) {
    combustiveisPorProduto.forEach(p => {
      const prev = yoy.porProduto.get(
        Array.from(atual.porProduto.values()).find(x => x.nome === p.produto)?.codigo
      );
      p.litros_yoy = prev ? round(prev.quantidade, 2) : 0;
      p.receita_yoy = prev ? round(prev.receita) : 0;
      p.variacao_litros_pct = variacaoPct(p.litros, p.litros_yoy);
      p.variacao_receita_pct = variacaoPct(p.receita, p.receita_yoy);
    });
  }

  // Detalhamento por grupo de Automotivos e Conveniencia (para IA analisar cada categoria)
  const automotivosDetalhado = detalharCategoriaPorGrupo(
    atual.porProduto, atual.receita, 'automotivos', yoy?.porProduto
  );
  const conveniênciaDetalhado = detalharCategoriaPorGrupo(
    atual.porProduto, atual.receita, 'conveniencia', yoy?.porProduto
  );

  // Produtos em queda/alta/sumiram (vs YoY)
  const alertas = yoy
    ? detectarAlertasProduto(atual.porProduto, yoy.porProduto)
    : { em_queda: [], em_alta: [], sumiram: [] };

  // Top 15 produtos do atual (para prompt nao explodir)
  const topProdutos = Array.from(atual.porProduto.values())
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

  // Totais por categoria
  const totaisCategoria = ['combustivel', 'automotivos', 'conveniencia', 'outros'].map(cat => {
    const rec = atual.porCategoria[cat] || 0;
    const custo = atual.custoPorCategoria[cat] || 0;
    const margem = rec - custo;
    return {
      categoria: cat,
      receita: round(rec),
      custo: round(custo),
      margem: round(margem),
      margem_pct: rec > 0 ? round((margem / rec) * 100, 2) : 0,
      participacao_pct: atual.receita > 0 ? round((rec / atual.receita) * 100, 2) : 0,
    };
  });

  // Formas de pagamento (atual + YoY para variacao) — usa mapa de administradoras
  // para obter taxa real (percentualComissao) quando fp.administradoraCodigo esta presente
  const formasAtual = agregarFormasPagamento(formasPagamento, vendas, administradorasMap);
  const formasYoy = (formasPagamentoYoY && vendasYoY)
    ? agregarFormasPagamento(formasPagamentoYoY, vendasYoY, administradorasMap)
    : null;
  if (formasYoy) {
    // Calcula variacao YoY por forma
    const mapYoy = new Map(formasYoy.distribuicao.map(f => [f.forma, f]));
    formasAtual.distribuicao.forEach(f => {
      const prev = mapYoy.get(f.forma);
      f.valor_yoy = prev?.valor || 0;
      f.variacao_yoy_pct = variacaoPct(f.valor, f.valor_yoy);
    });
  }
  const maiorForma = formasAtual.distribuicao[0];
  const concentracaoAlerta = maiorForma && maiorForma.participacao_pct > 50
    ? `${maiorForma.forma} representa ${maiorForma.participacao_pct}% das vendas`
    : null;

  // Integridade dos dados
  const receitaOutros = atual.porCategoria.outros || 0;
  const pctOutros = atual.receita > 0 ? (receitaOutros / atual.receita) * 100 : 0;
  const pctCanceladas = (atual.receita + atual.canceladas) > 0
    ? (atual.canceladas / (atual.receita + atual.canceladas)) * 100 : 0;
  const alertasIntegridade = [];
  if (pctOutros > 5) alertasIntegridade.push(`${round(pctOutros, 1)}% da receita em "Outros" — cadastro de produtos/grupos pode estar incompleto (tipoProduto ou tipoGrupo nao classificados).`);
  if (pctCanceladas > 2) alertasIntegridade.push(`${round(pctCanceladas, 1)}% das vendas foram canceladas — investigar causas operacionais.`);

  const ativo = demoAtivo();
  return {
    empresa: {
      nome: ativo ? mascararEmpresa(cliente, true) : (cliente?.nome || 'Empresa'),
      cnpj: ativo ? null : (cliente?.cnpj || null),
    },
    periodo: periodoLabel,
    totais: {
      receita_bruta: round(atual.receita),
      descontos: round(atual.descontos),
      cancelamentos: round(atual.canceladas),
      cmv: round(atual.cmv),
      lucro_bruto: round(atual.lucroBruto),
      margem_pct: round(atual.margemPct, 2),
      impostos: round(atual.impostos),
      qtd_vendas: atual.qtdVendas,
      ticket_medio: round(atual.ticketMedio),
    },
    formas_pagamento: {
      distribuicao: formasAtual.distribuicao,
      total: formasAtual.total_receita_por_forma,
      custo_maquineta_estimado: formasAtual.custo_maquineta_total_estimado,
      custo_maquineta_pct_receita: formasAtual.custo_maquineta_pct_receita,
      maior_forma: maiorForma ? maiorForma.forma : null,
      maior_forma_pct: maiorForma ? maiorForma.participacao_pct : 0,
      concentracao_alerta: concentracaoAlerta,
    },
    integridade_dados: {
      pct_outros: round(pctOutros, 2),
      receita_outros: round(receitaOutros),
      pct_canceladas: round(pctCanceladas, 2),
      valor_canceladas: round(atual.canceladas),
      alertas: alertasIntegridade,
    },
    volume_combustivel: {
      litros_total: round(atual.litrosCombustivel, 2),
      preco_medio_litro: atual.litrosCombustivel > 0
        ? round(atual.porCategoria.combustivel / atual.litrosCombustivel, 3)
        : null,
    },
    mix_por_categoria: totaisCategoria,
    grupos_granulares: gruposGranulares.slice(0, 15),  // top 15 grupos por receita
    combustiveis_por_tipo: combustiveisPorTipo,
    combustiveis_por_produto: combustiveisPorProduto,
    automotivos_detalhado: automotivosDetalhado,
    conveniencia_detalhado: conveniênciaDetalhado,
    top_produtos: topProdutos,
    produtos_em_queda: alertas.em_queda,
    produtos_em_alta: alertas.em_alta,
    produtos_sumiram: alertas.sumiram,
    comparativo_yoy: yoy ? {
      periodo: periodoLabelYoY,
      receita: round(yoy.receita),
      lucro_bruto: round(yoy.lucroBruto),
      margem_pct: round(yoy.margemPct, 2),
      qtd_vendas: yoy.qtdVendas,
      variacao_receita_pct: variacaoPct(atual.receita, yoy.receita),
      variacao_lucro_pct: variacaoPct(atual.lucroBruto, yoy.lucroBruto),
      variacao_margem_pp: round(atual.margemPct - yoy.margemPct, 2),
    } : null,
    tendencia_6m: tendencia6m,
  };
}

// ─── Agregar um periodo ───────────────────────────────────────
function agregarPeriodo(vendaItens, vendas, produtosMap, gruposMap) {
  const vendasMap = new Map();
  (vendas || []).forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));

  const porCategoria = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
  const custoPorCategoria = { combustivel: 0, automotivos: 0, conveniencia: 0, outros: 0 };
  const porProduto = new Map();
  let receita = 0, cmv = 0, descontos = 0, impostos = 0, canceladas = 0;
  let litrosCombustivel = 0;

  (vendaItens || []).forEach(item => {
    const venda = vendasMap.get(item.vendaCodigo);
    const totalVenda = Number(item.totalVenda || 0);
    const totalCusto = Number(item.totalCusto || 0);
    const totalDesconto = Number(item.totalDesconto || 0);
    const qtd = Number(item.quantidade || 0);
    const imposto = Number(item.icmsValor || 0) + Number(item.valorPis || 0)
      + Number(item.valorCofins || 0) + Number(item.valorCbs || 0) + Number(item.valorIbs || 0);

    if (venda?.cancelada === 'S') { canceladas += totalVenda; return; }
    if (venda?.cancelada !== 'N') return;

    const cat = classificarItem(item, produtosMap, gruposMap);
    const bucket = porCategoria[cat] != null ? cat : 'outros';
    porCategoria[bucket] += totalVenda;
    custoPorCategoria[bucket] += totalCusto;
    receita += totalVenda;
    cmv += totalCusto;
    descontos += totalDesconto;
    impostos += imposto;
    if (bucket === 'combustivel') litrosCombustivel += qtd;

    const codigo = item.produtoCodigo;
    const produto = produtosMap.get(codigo);
    const grupo = produto ? gruposMap.get(produto.grupoCodigo) : null;
    if (!porProduto.has(codigo)) {
      porProduto.set(codigo, {
        codigo,
        nome: produto?.nome || produto?.descricao || `#${codigo}`,
        categoria: bucket,
        grupoCodigo: produto?.grupoCodigo || null,
        grupoNome: grupo?.nome || grupo?.descricao || 'Sem grupo',
        tipoGrupo: grupo?.tipoGrupo || null,
        quantidade: 0, receita: 0, custo: 0,
      });
    }
    const p = porProduto.get(codigo);
    p.quantidade += qtd;
    p.receita += totalVenda;
    p.custo += totalCusto;
  });

  const vendasValidas = (vendas || []).filter(v => (v.cancelada || 'N') !== 'S');
  const qtdVendas = vendasValidas.length;
  const lucroBruto = receita - cmv;
  const margemPct = receita > 0 ? (lucroBruto / receita) * 100 : 0;
  const ticketMedio = qtdVendas > 0 ? receita / qtdVendas : 0;

  return {
    porCategoria, custoPorCategoria, porProduto,
    receita, cmv, descontos, impostos, canceladas,
    litrosCombustivel, qtdVendas, lucroBruto, margemPct, ticketMedio,
  };
}

// ─── Agregar por grupo granular ────────────────────────────────
function agregarGrupos(porProduto, receitaTotal) {
  const mapa = new Map();
  porProduto.forEach(p => {
    if (!p.grupoCodigo) return;
    const k = `${p.categoria}::${p.grupoCodigo}`;
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

// ─── Combustiveis por tipo ─────────────────────────────────────
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
      preco_medio: t.litros > 0 ? round(t.receita / t.litros, 3) : 0,
      margem_pct: t.receita > 0 ? round(((t.receita - t.custo) / t.receita) * 100, 2) : 0,
      participacao_receita_pct: receitaTotal > 0 ? round((t.receita / receitaTotal) * 100, 2) : 0,
    }))
    .sort((a, b) => b.receita - a.receita);
}

// ─── Detalhamento POR PRODUTO combustivel (nome individual) ────
// Lista cada produto com categoria=combustivel (PRODUTO.combustivel=true OU tipoProduto=C)
// com litros, receita, preco medio e margem por produto. Permite IA analisar cada
// combustivel pelo nome (ex: "Gasolina Comum Aditivada" vs "Gasolina Premium").
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

// ─── Detalhamento de uma categoria POR GRUPO + top produtos ───
// Retorna: totais da categoria, grupos ordenados por receita com % dentro da categoria e top 5 produtos,
// top produtos globais da categoria. Usado para Automotivos e Conveniencia.
function detalharCategoriaPorGrupo(porProduto, receitaTotalGeral, categoriaAlvo, porProdutoYoY = null) {
  const itensCat = Array.from(porProduto.values()).filter(p => p.categoria === categoriaAlvo);
  const itensYoYCat = porProdutoYoY
    ? Array.from(porProdutoYoY.values()).filter(p => p.categoria === categoriaAlvo)
    : [];
  if (itensCat.length === 0) return null;

  const totReceita = itensCat.reduce((s, p) => s + p.receita, 0);
  const totCusto = itensCat.reduce((s, p) => s + p.custo, 0);
  const totReceitaYoY = itensYoYCat.reduce((s, p) => s + p.receita, 0);
  const totCustoYoY = itensYoYCat.reduce((s, p) => s + p.custo, 0);

  // Agrupa produtos atuais por grupoCodigo+grupoNome
  const grupos = new Map();
  itensCat.forEach(p => {
    const k = p.grupoCodigo || 'sem-grupo';
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

  // Agrupa YoY para cruzar
  const gruposYoY = new Map();
  itensYoYCat.forEach(p => {
    const k = p.grupoCodigo || 'sem-grupo';
    const cur = gruposYoY.get(k) || { receita: 0, custo: 0 };
    cur.receita += p.receita;
    cur.custo += p.custo;
    gruposYoY.set(k, cur);
  });

  // Mapeia YoY por codigo de produto (para cruzar nos top 5 por grupo)
  const mapYoYProd = new Map();
  itensYoYCat.forEach(p => mapYoYProd.set(p.codigo, p));

  const gruposArr = Array.from(grupos.values())
    .map(g => {
      const margem = g.receita - g.custo;
      const margemPct = g.receita > 0 ? (margem / g.receita) * 100 : 0;
      const yoy = gruposYoY.get(g.grupo_codigo || 'sem-grupo') || { receita: 0, custo: 0 };
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

// ─── Detectar produtos em queda/alta/sumiram ───────────────────
// Thresholds: queda receita ≤−20%, queda margem ≤−5pp, sumiu = zero atual + >R$100 YoY, alta ≥+20%
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
        produto: atual.nome,
        categoria: atual.categoria,
        grupo: atual.grupoNome,
        receita_atual: round(atual.receita),
        receita_yoy: round(prev.receita),
        variacao_pct: round(varReceita, 2),
        tipo: 'receita',
      });
    } else if (deltaMargem <= -5 && atual.receita >= 100) {
      em_queda.push({
        produto: atual.nome,
        categoria: atual.categoria,
        grupo: atual.grupoNome,
        receita_atual: round(atual.receita),
        margem_atual_pct: round(margemAtual, 2),
        margem_yoy_pct: round(margemPrev, 2),
        variacao_margem_pp: round(deltaMargem, 2),
        tipo: 'margem',
      });
    } else if (varReceita != null && varReceita >= 20 && atual.receita >= 100) {
      em_alta.push({
        produto: atual.nome,
        categoria: atual.categoria,
        grupo: atual.grupoNome,
        receita_atual: round(atual.receita),
        receita_yoy: round(prev.receita),
        crescimento_pct: round(varReceita, 2),
      });
    }
  });

  // Sumiram: existem no YoY mas nao no atual (ou zero no atual)
  porProdutoYoY.forEach(prev => {
    if (prev.receita < 100) return;  // evita ruido
    const atual = porProdutoAtual.get(prev.codigo);
    if (!atual || atual.receita === 0) {
      sumiram.push({
        produto: prev.nome,
        categoria: prev.categoria,
        grupo: prev.grupoNome,
        receita_yoy: round(prev.receita),
      });
    }
  });

  return {
    em_queda: em_queda.sort((a, b) => Math.abs(b.variacao_pct || b.variacao_margem_pp) - Math.abs(a.variacao_pct || a.variacao_margem_pp)).slice(0, 10),
    em_alta: em_alta.sort((a, b) => b.crescimento_pct - a.crescimento_pct).slice(0, 5),
    sumiram: sumiram.sort((a, b) => b.receita_yoy - a.receita_yoy).slice(0, 5),
  };
}

// ─── Agregador rede ────────────────────────────────────────────
export function agregarDadosRede({ nomeRede, periodoLabel, empresasAgregadas }) {
  const totalReceita = empresasAgregadas.reduce((s, e) => s + (e.totais?.receita_bruta || 0), 0);
  const totalCMV = empresasAgregadas.reduce((s, e) => s + (e.totais?.cmv || 0), 0);
  const totalLucro = totalReceita - totalCMV;
  const totalLitros = empresasAgregadas.reduce((s, e) => s + (e.volume_combustivel?.litros_total || 0), 0);

  const mixConsolidado = {};
  empresasAgregadas.forEach(emp => {
    (emp.mix_por_categoria || []).forEach(m => {
      if (!mixConsolidado[m.categoria]) mixConsolidado[m.categoria] = { receita: 0, margem: 0 };
      mixConsolidado[m.categoria].receita += m.receita;
      mixConsolidado[m.categoria].margem += m.margem;
    });
  });
  const mixArr = Object.entries(mixConsolidado).map(([categoria, v]) => ({
    categoria,
    receita: round(v.receita),
    margem: round(v.margem),
    margem_pct: v.receita > 0 ? round((v.margem / v.receita) * 100, 2) : 0,
    participacao_pct: totalReceita > 0 ? round((v.receita / totalReceita) * 100, 2) : 0,
  }));

  // Consolida formas de pagamento de todas as empresas (soma por forma)
  const formasAgregado = new Map();
  let custoMaquinetaTotal = 0;
  empresasAgregadas.forEach(emp => {
    (emp.formas_pagamento?.distribuicao || []).forEach(f => {
      const cur = formasAgregado.get(f.forma) || {
        forma: f.forma, custo_pct: f.custo_pct, valor: 0,
        qtd_transacoes: 0, custo_estimado: 0,
      };
      cur.valor += f.valor;
      cur.qtd_transacoes += f.qtd_transacoes;
      cur.custo_estimado += f.custo_estimado;
      formasAgregado.set(f.forma, cur);
    });
    custoMaquinetaTotal += emp.formas_pagamento?.custo_maquineta_estimado || 0;
  });
  const totalFormasPag = Array.from(formasAgregado.values()).reduce((s, x) => s + x.valor, 0);
  const formasConsolidadas = Array.from(formasAgregado.values())
    .map(x => ({
      ...x,
      valor: round(x.valor),
      custo_estimado: round(x.custo_estimado),
      participacao_pct: totalFormasPag > 0 ? round((x.valor / totalFormasPag) * 100, 2) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  // Consolida COMBUSTIVEIS POR TIPO (soma litros/receita/custo por tipo entre empresas)
  const tiposAgg = new Map();
  empresasAgregadas.forEach(emp => {
    (emp.combustiveis_por_tipo || []).forEach(t => {
      const custo = t.receita > 0 && t.margem_pct != null
        ? Number(t.receita) * (1 - (Number(t.margem_pct) / 100)) : 0;
      const cur = tiposAgg.get(t.tipo) || { tipo: t.tipo, litros: 0, receita: 0, custo: 0, litros_yoy: 0, receita_yoy: 0 };
      cur.litros += Number(t.litros || 0);
      cur.receita += Number(t.receita || 0);
      cur.custo += custo;
      cur.litros_yoy += Number(t.litros_yoy || 0);
      // receita_yoy reconstrida a partir da variacao_receita_pct quando disponivel
      if (t.variacao_receita_pct != null && t.variacao_receita_pct > -100) {
        cur.receita_yoy += Number(t.receita || 0) / (1 + Number(t.variacao_receita_pct) / 100);
      }
      tiposAgg.set(t.tipo, cur);
    });
  });
  const combustiveisPorTipoRede = Array.from(tiposAgg.values())
    .map(t => ({
      tipo: t.tipo,
      litros: round(t.litros, 2),
      receita: round(t.receita),
      preco_medio: t.litros > 0 ? round(t.receita / t.litros, 3) : 0,
      margem_pct: t.receita > 0 ? round(((t.receita - t.custo) / t.receita) * 100, 2) : 0,
      participacao_receita_pct: totalReceita > 0 ? round((t.receita / totalReceita) * 100, 2) : 0,
      litros_yoy: round(t.litros_yoy, 2),
      receita_yoy: round(t.receita_yoy),
      variacao_litros_pct: t.litros_yoy > 0 ? variacaoPct(t.litros, t.litros_yoy) : null,
      variacao_receita_pct: t.receita_yoy > 0 ? variacaoPct(t.receita, t.receita_yoy) : null,
    }))
    .sort((a, b) => b.receita - a.receita);

  // Consolida COMBUSTIVEIS POR PRODUTO (soma por nome do produto entre empresas)
  const produtosCombAgg = new Map();
  empresasAgregadas.forEach(emp => {
    (emp.combustiveis_por_produto || []).forEach(p => {
      const k = p.produto;
      const cur = produtosCombAgg.get(k) || {
        produto: p.produto, tipo: p.tipo, grupo: p.grupo,
        litros: 0, receita: 0, custo: 0, litros_yoy: 0, receita_yoy: 0,
        empresas_com_produto: 0,
      };
      cur.litros += Number(p.litros || 0);
      cur.receita += Number(p.receita || 0);
      cur.custo += Number(p.custo || 0);
      cur.litros_yoy += Number(p.litros_yoy || 0);
      cur.receita_yoy += Number(p.receita_yoy || 0);
      cur.empresas_com_produto += 1;
      produtosCombAgg.set(k, cur);
    });
  });
  const totalReceitaCombsRede = Array.from(produtosCombAgg.values()).reduce((s, p) => s + p.receita, 0);
  const totalLitrosCombsRede = Array.from(produtosCombAgg.values()).reduce((s, p) => s + p.litros, 0);
  const combustiveisPorProdutoRede = Array.from(produtosCombAgg.values())
    .map(p => ({
      produto: p.produto,
      tipo: p.tipo,
      grupo: p.grupo,
      empresas_com_produto: p.empresas_com_produto,
      litros: round(p.litros, 2),
      receita: round(p.receita),
      custo: round(p.custo),
      preco_medio_litro: p.litros > 0 ? round(p.receita / p.litros, 3) : 0,
      custo_medio_litro: p.litros > 0 ? round(p.custo / p.litros, 3) : 0,
      margem_rs: round(p.receita - p.custo),
      margem_rs_por_litro: p.litros > 0 ? round((p.receita - p.custo) / p.litros, 3) : 0,
      margem_pct: p.receita > 0 ? round(((p.receita - p.custo) / p.receita) * 100, 2) : 0,
      participacao_pct_receita_total: totalReceita > 0 ? round((p.receita / totalReceita) * 100, 2) : 0,
      participacao_pct_dentro_combustiveis: totalReceitaCombsRede > 0 ? round((p.receita / totalReceitaCombsRede) * 100, 2) : 0,
      participacao_pct_litros_combustiveis: totalLitrosCombsRede > 0 ? round((p.litros / totalLitrosCombsRede) * 100, 2) : 0,
      litros_yoy: round(p.litros_yoy, 2),
      receita_yoy: round(p.receita_yoy),
      variacao_litros_pct: p.litros_yoy > 0 ? variacaoPct(p.litros, p.litros_yoy) : null,
      variacao_receita_pct: p.receita_yoy > 0 ? variacaoPct(p.receita, p.receita_yoy) : null,
    }))
    .sort((a, b) => b.litros - a.litros);

  // Consolida AUTOMOTIVOS e CONVENIENCIA por grupo (agrega top grupos entre empresas)
  const consolidarCategoria = (chave) => {
    const gruposAgg = new Map();
    let totReceita = 0, totCusto = 0, totReceitaYoY = 0, totCustoYoY = 0;
    empresasAgregadas.forEach(emp => {
      const cat = emp[chave];
      if (!cat) return;
      totReceita += Number(cat.totais?.receita || 0);
      totCusto += Number(cat.totais?.custo || 0);
      totReceitaYoY += Number(cat.totais?.receita_yoy || 0);
      const margemYoyPct = Number(cat.totais?.margem_yoy_pct || 0);
      const recYoY = Number(cat.totais?.receita_yoy || 0);
      totCustoYoY += recYoY - (recYoY * margemYoyPct / 100);
      (cat.grupos || []).forEach(g => {
        const k = g.grupo;
        const cur = gruposAgg.get(k) || {
          grupo: g.grupo, receita: 0, custo: 0, qtd_produtos: 0, empresas_com_grupo: 0,
          receita_yoy_est: 0,
        };
        cur.receita += Number(g.receita || 0);
        cur.custo += Number(g.custo || 0);
        cur.qtd_produtos += Number(g.qtd_produtos || 0);
        cur.empresas_com_grupo += 1;
        if (g.variacao_receita_yoy_pct != null && g.variacao_receita_yoy_pct > -100) {
          cur.receita_yoy_est += g.receita / (1 + g.variacao_receita_yoy_pct / 100);
        }
        gruposAgg.set(k, cur);
      });
    });
    if (gruposAgg.size === 0 && totReceita === 0) return null;
    const gruposArr = Array.from(gruposAgg.values())
      .map(g => {
        const margem = g.receita - g.custo;
        return {
          grupo: g.grupo,
          empresas_com_grupo: g.empresas_com_grupo,
          receita: round(g.receita),
          custo: round(g.custo),
          margem: round(margem),
          margem_pct: g.receita > 0 ? round((margem / g.receita) * 100, 2) : 0,
          participacao_categoria_pct: totReceita > 0 ? round((g.receita / totReceita) * 100, 2) : 0,
          participacao_total_pct: totalReceita > 0 ? round((g.receita / totalReceita) * 100, 2) : 0,
          qtd_produtos: g.qtd_produtos,
          variacao_receita_yoy_pct: g.receita_yoy_est > 0 ? variacaoPct(g.receita, g.receita_yoy_est) : null,
        };
      })
      .sort((a, b) => b.receita - a.receita);
    return {
      categoria: chave.replace('_detalhado', ''),
      totais: {
        receita: round(totReceita),
        custo: round(totCusto),
        margem: round(totReceita - totCusto),
        margem_pct: totReceita > 0 ? round(((totReceita - totCusto) / totReceita) * 100, 2) : 0,
        participacao_receita_total_pct: totalReceita > 0 ? round((totReceita / totalReceita) * 100, 2) : 0,
        receita_yoy: round(totReceitaYoY),
        variacao_receita_yoy_pct: totReceitaYoY > 0 ? variacaoPct(totReceita, totReceitaYoY) : null,
      },
      qtd_grupos: gruposArr.length,
      grupos: gruposArr,
    };
  };
  const automotivosDetalhadoRede = consolidarCategoria('automotivos_detalhado');
  const conveniênciaDetalhadoRede = consolidarCategoria('conveniencia_detalhado');

  // Consolida integridade
  const somaReceitaOutros = empresasAgregadas.reduce((s, e) => s + (e.integridade_dados?.receita_outros || 0), 0);
  const somaCanceladas = empresasAgregadas.reduce((s, e) => s + (e.integridade_dados?.valor_canceladas || 0), 0);
  const alertasIntegRede = [];
  const pctOutrosRede = totalReceita > 0 ? (somaReceitaOutros / totalReceita) * 100 : 0;
  const pctCancRede = (totalReceita + somaCanceladas) > 0 ? (somaCanceladas / (totalReceita + somaCanceladas)) * 100 : 0;
  if (pctOutrosRede > 5) alertasIntegRede.push(`${round(pctOutrosRede, 1)}% da receita da rede em "Outros".`);
  if (pctCancRede > 2) alertasIntegRede.push(`${round(pctCancRede, 1)}% de cancelamentos na rede.`);

  const ativo = demoAtivo();
  const empresas = empresasAgregadas.map(emp => ({
    nome: ativo ? mascararEmpresa(emp.empresa, true) : emp.empresa?.nome,
    cnpj: ativo ? null : emp.empresa?.cnpj,
    receita: emp.totais?.receita_bruta || 0,
    lucro_bruto: emp.totais?.lucro_bruto || 0,
    margem_pct: emp.totais?.margem_pct || 0,
    qtd_vendas: emp.totais?.qtd_vendas || 0,
    ticket_medio: emp.totais?.ticket_medio || 0,
    participacao_pct: totalReceita > 0
      ? round((emp.totais?.receita_bruta || 0) / totalReceita * 100, 2) : 0,
    litros_combustivel: emp.volume_combustivel?.litros_total || 0,
    variacao_receita_pct: emp.comparativo_yoy?.variacao_receita_pct ?? null,
  })).sort((a, b) => b.receita - a.receita);

  return {
    rede: { nome: ativo ? mascararRede(nomeRede, nomeRede, true) : nomeRede, qtd_empresas: empresas.length },
    periodo: periodoLabel,
    consolidado: {
      receita_bruta: round(totalReceita),
      cmv: round(totalCMV),
      lucro_bruto: round(totalLucro),
      margem_pct: totalReceita > 0 ? round((totalLucro / totalReceita) * 100, 2) : 0,
      litros_combustivel_total: round(totalLitros, 2),
    },
    mix_consolidado: mixArr,
    combustiveis_por_tipo: combustiveisPorTipoRede,
    combustiveis_por_produto: combustiveisPorProdutoRede,
    automotivos_detalhado: automotivosDetalhadoRede,
    conveniencia_detalhado: conveniênciaDetalhadoRede,
    formas_pagamento: {
      distribuicao: formasConsolidadas,
      total: round(totalFormasPag),
      custo_maquineta_estimado: round(custoMaquinetaTotal),
      custo_maquineta_pct_receita: totalFormasPag > 0 ? round((custoMaquinetaTotal / totalFormasPag) * 100, 2) : 0,
      maior_forma: formasConsolidadas[0]?.forma || null,
      maior_forma_pct: formasConsolidadas[0]?.participacao_pct || 0,
      concentracao_alerta: formasConsolidadas[0]?.participacao_pct > 50
        ? `${formasConsolidadas[0].forma} representa ${formasConsolidadas[0].participacao_pct}% das vendas da rede`
        : null,
    },
    integridade_dados: {
      pct_outros: round(pctOutrosRede, 2),
      receita_outros: round(somaReceitaOutros),
      pct_canceladas: round(pctCancRede, 2),
      valor_canceladas: round(somaCanceladas),
      alertas: alertasIntegRede,
    },
    empresas,
  };
}

// ─── Fetch helper: busca VENDA + VENDA_ITEM + VENDA_FORMA_PAGAMENTO ────
async function fetchPeriodo(apiKey, empresaCodigos, { dataInicial, dataFinal }) {
  const allItens = [], allVendas = [], allFormasPag = [];
  for (const ec of empresaCodigos) {
    const filtros = { dataInicial, dataFinal, empresaCodigo: ec };
    const [itens, vds, fpg] = await Promise.all([
      qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendaFormaPagamento(apiKey, filtros).catch(() => []),
    ]);
    (itens || []).forEach(i => allItens.push(i));
    (vds || []).forEach(v => allVendas.push(v));
    (fpg || []).forEach(f => allFormasPag.push(f));
  }
  return { vendaItens: allItens, vendas: allVendas, formasPagamento: allFormasPag };
}

// ─── Orquestrador: monta payload completo para empresa ou rede ─
// params: { cliente | redeContexto, modoRede, chaveApi, mesRef, onProgress }
export async function prepararDadosVendas({ cliente, modoRede = false, chaveApi, mesRef, onProgress }) {
  const periodos = calcularPeriodos(mesRef);
  const empresaCodigos = modoRede ? (cliente?._empresaCodigos || []) : [cliente.empresa_codigo];

  onProgress?.('Carregando catalogos de produtos/grupos/administradoras...');
  const [prods, grps, admins] = await Promise.all([
    qualityApi.buscarProdutos(chaveApi).catch(() => []),
    qualityApi.buscarGrupos(chaveApi).catch(() => []),
    qualityApi.buscarAdministradoras(chaveApi).catch(() => []),
  ]);
  const pMap = new Map(); (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
  const gMap = new Map(); (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));
  const aMap = new Map();
  (admins || []).forEach(a => {
    const codigo = a.administradoraCodigo ?? a.codigo;
    if (codigo != null) aMap.set(Number(codigo), a);
  });

  // Fetch de periodo unico + YoY + serie mensal para tendencia
  const fetchLabel = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const r = await fetchPeriodo(chaveApi, empresaCodigos, p);
    return { ...r, periodoLabel: p.label, key: p.key };
  };

  // Fazemos 1 fetch para o atual, 1 para o YoY, e 6 fetches mensais para tendencia
  const [atualData, yoyData, ...serie] = await Promise.all([
    fetchLabel(periodos.atual, `${periodos.atual.label} (atual)`),
    fetchLabel(periodos.yoy, `${periodos.yoy.label} (YoY)`),
    ...periodos.tendencia6m.map(p => fetchLabel(p, p.label)),
  ]);

  if (modoRede) {
    // Para rede, agregamos por empresa. Como ja fetchamos tudo junto, precisamos separar.
    // Simplificacao: para o modo rede, pulamos a tendencia6m por empresa (seria muitos fetchs)
    // e agregamos apenas atual+YoY consolidado, com o ranking de empresas.
    const empresasAgg = [];
    for (const ec of empresaCodigos) {
      const filtrarPorEmpresa = (arr) => (arr || []).filter(x => Number(x.empresaCodigo) === Number(ec));
      const fAtualItens = filtrarPorEmpresa(atualData.vendaItens);
      const fAtualVendas = filtrarPorEmpresa(atualData.vendas);
      const fAtualFpg = filtrarPorEmpresa(atualData.formasPagamento);
      const fYoYItens = filtrarPorEmpresa(yoyData.vendaItens);
      const fYoYVendas = filtrarPorEmpresa(yoyData.vendas);
      const fYoYFpg = filtrarPorEmpresa(yoyData.formasPagamento);
      const empresa = (cliente?._empresas || []).find(e => Number(e.empresa_codigo) === Number(ec));
      empresasAgg.push(agregarDadosEmpresa({
        cliente: empresa || { nome: `Empresa #${ec}` },
        periodoLabel: periodos.atual.label,
        vendaItens: fAtualItens, vendas: fAtualVendas, formasPagamento: fAtualFpg,
        vendaItensYoY: fYoYItens, vendasYoY: fYoYVendas, formasPagamentoYoY: fYoYFpg,
        periodoLabelYoY: periodos.yoy.label,
        produtosMap: pMap, gruposMap: gMap, administradorasMap: aMap,
        serieMensal: [],
      }));
    }
    return agregarDadosRede({
      nomeRede: cliente?.nome || 'Rede',
      periodoLabel: periodos.atual.label,
      empresasAgregadas: empresasAgg,
    });
  }

  // Modo empresa: usa serie completa para tendencia
  const serieMensal = serie.map(s => ({
    periodoLabel: s.periodoLabel,
    vendaItens: s.vendaItens,
    vendas: s.vendas,
  }));

  return agregarDadosEmpresa({
    cliente,
    periodoLabel: periodos.atual.label,
    vendaItens: atualData.vendaItens, vendas: atualData.vendas, formasPagamento: atualData.formasPagamento,
    vendaItensYoY: yoyData.vendaItens, vendasYoY: yoyData.vendas, formasPagamentoYoY: yoyData.formasPagamento,
    periodoLabelYoY: periodos.yoy.label,
    produtosMap: pMap, gruposMap: gMap, administradorasMap: aMap,
    serieMensal,
  });
}

// ─── Chamada Claude ────────────────────────────────────────────
export async function gerarAnaliseVendasIA(dados, apiKey, { modoRede = false } = {}) {
  const systemBlocks = [{ type: 'text', text: SYSTEM_PROMPT }];
  if (modoRede) systemBlocks.push({ type: 'text', text: SYSTEM_PROMPT_REDE_EXTRA });
  const user = modoRede
    ? `Analise a performance comercial desta REDE de postos:\n\n${JSON.stringify(dados, null, 2)}`
    : `Analise a performance comercial deste posto:\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({ apiKey, system: systemBlocks, user });
}
