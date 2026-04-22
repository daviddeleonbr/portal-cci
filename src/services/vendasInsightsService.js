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
const SYSTEM_PROMPT = `Voce e um consultor senior especializado em postos de combustiveis e loja de conveniencia, com expertise em:

SETOR DE POSTOS DE COMBUSTIVEL:
- Margens tipicas: combustivel 1-4%, automotivos 8-20%, conveniencia 25-40%
- Mix ideal: combustivel 70-80% da receita; conveniencia >=15% (margens altas = transforma resultado)
- Tipos de combustivel: gasolina comum/aditivada, etanol, diesel S10/S500, GNV
- Grupos de conveniencia: bebidas, lanches, cigarros, salgados, higiene
- Sensibilidade a preco: guerra local, elasticidade alta em combustiveis
- Taxas de cartao: 2-3% da receita
- KPI operacional: litros/bico/dia, ticket medio, conversao loja

VOCE TEM NO PAYLOAD:
- Periodo atual (mes selecionado)
- Comparativo YoY (mesmo mes do ano anterior) — elimina sazonalidade
- Comparativo trimestre vs trimestre
- Tendencia 6 meses — serie mensal
- Grupos granulares dentro de cada categoria (ex: Bebidas dentro de conveniencia)
- Combustiveis separados por tipo (Gasolina / Diesel / Etanol ...)
- Produtos em queda/alta/sumiram (cruzamento com YoY)

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
    "analise_por_tipo": "quantidade e preco por tipo e comportamento",
    "tipos_em_queda": [{"tipo": "...", "variacao_litros_pct": 0, "causa_provavel": "..."}],
    "mix_ideal": "comentario sobre mix atual"
  },
  "volumes_precos": {
    "analise": "volumes, precos, comparacao com faixa de mercado",
    "observacoes": ["..."]
  },
  "alertas_produtos": {
    "produtos_em_queda": [{"produto": "...", "queda_pct": 0, "tipo": "receita|margem|sumiu", "acao": "..."}],
    "produtos_em_alta_para_replicar": [{"produto": "...", "crescimento_pct": 0, "porque_funcionou": "..."}]
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
Voce esta analisando uma rede com MULTIPLAS empresas. Alem dos campos acima, inclua:

  "ranking_empresas": [
    {"posicao": 1, "empresa": "...", "receita": 0, "margem_pct": 0, "participacao_pct": 0, "avaliacao": "destaque|mediano|atencao"}
  ],
  "dispersao": {
    "concentracao": "analise de Pareto (X% da receita em N empresas)",
    "outliers": ["empresas divergentes e porque"],
    "padrao_rede": "o que funciona na rede e pode ser replicado"
  }`;

// ─── Agregacao compacta por empresa ────────────────────────────
// Recebe dados crus de 2 periodos (atual + YoY) + serie mensal para tendencia
export function agregarDadosEmpresa({ cliente, periodoLabel, vendaItens, vendas, produtosMap, gruposMap,
  vendaItensYoY, vendasYoY, periodoLabelYoY,
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
    volume_combustivel: {
      litros_total: round(atual.litrosCombustivel, 2),
      preco_medio_litro: atual.litrosCombustivel > 0
        ? round(atual.porCategoria.combustivel / atual.litrosCombustivel, 3)
        : null,
    },
    mix_por_categoria: totaisCategoria,
    grupos_granulares: gruposGranulares.slice(0, 15),  // top 15 grupos por receita
    combustiveis_por_tipo: combustiveisPorTipo,
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
    empresas,
  };
}

// ─── Fetch helper: busca VENDA + VENDA_ITEM para um periodo ────
async function fetchPeriodo(apiKey, empresaCodigos, { dataInicial, dataFinal }) {
  const allItens = [], allVendas = [];
  for (const ec of empresaCodigos) {
    const filtros = { dataInicial, dataFinal, empresaCodigo: ec };
    const [itens, vds] = await Promise.all([
      qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
    ]);
    (itens || []).forEach(i => allItens.push(i));
    (vds || []).forEach(v => allVendas.push(v));
  }
  return { vendaItens: allItens, vendas: allVendas };
}

// ─── Orquestrador: monta payload completo para empresa ou rede ─
// params: { cliente | redeContexto, modoRede, chaveApi, mesRef, onProgress }
export async function prepararDadosVendas({ cliente, modoRede = false, chaveApi, mesRef, onProgress }) {
  const periodos = calcularPeriodos(mesRef);
  const empresaCodigos = modoRede ? (cliente?._empresaCodigos || []) : [cliente.empresa_codigo];

  onProgress?.('Carregando catalogos de produtos/grupos...');
  const [prods, grps] = await Promise.all([
    qualityApi.buscarProdutos(chaveApi).catch(() => []),
    qualityApi.buscarGrupos(chaveApi).catch(() => []),
  ]);
  const pMap = new Map(); (prods || []).forEach(p => pMap.set(p.produtoCodigo || p.codigo, p));
  const gMap = new Map(); (grps || []).forEach(g => gMap.set(g.grupoCodigo || g.codigo, g));

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
      const fYoYItens = filtrarPorEmpresa(yoyData.vendaItens);
      const fYoYVendas = filtrarPorEmpresa(yoyData.vendas);
      const empresa = (cliente?._empresas || []).find(e => Number(e.empresa_codigo) === Number(ec));
      empresasAgg.push(agregarDadosEmpresa({
        cliente: empresa || { nome: `Empresa #${ec}` },
        periodoLabel: periodos.atual.label,
        vendaItens: fAtualItens, vendas: fAtualVendas,
        vendaItensYoY: fYoYItens, vendasYoY: fYoYVendas,
        periodoLabelYoY: periodos.yoy.label,
        produtosMap: pMap, gruposMap: gMap,
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
    vendaItens: atualData.vendaItens, vendas: atualData.vendas,
    vendaItensYoY: yoyData.vendaItens, vendasYoY: yoyData.vendas,
    periodoLabelYoY: periodos.yoy.label,
    produtosMap: pMap, gruposMap: gMap,
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
