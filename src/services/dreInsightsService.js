// DRE Insights com IA — agregacao por mascara + YoY + trimestre + tendencia 6m
// Baseado em TITULO_PAGAR + TITULO_RECEBER (regime de competencia), como a DRE gerencial.

import * as qualityApi from './qualityApiService';
import * as mascaraDreService from './mascaraDreService';
import * as mapService from './mapeamentoService';
import * as vendasMapService from './mapeamentoVendasService';
import { TIPOS_VENDA } from './mapeamentoVendasService';
import { chamarClaudeAPI, calcularPeriodos, round, variacaoPct } from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararEmpresa, mascararRede } from './anonimizarService';

// ─── System prompt (cacheado) ─────────────────────────────────
const SYSTEM_PROMPT = `Voce e um consultor senior de finanças gerenciais especializado em postos de combustiveis.

CONTEXTO DO SETOR:
- Margem bruta tipica em postos: 4-12% (combustivel puxa para baixo, conveniencia puxa para cima)
- Margem liquida saudavel: 2-5%. Abaixo de 1% = critico, acima de 5% = excelente
- CMV costuma representar 85-95% da receita bruta (combustivel tem custo altissimo)
- Despesas operacionais: pessoal (30-50% das DO), aluguel, energia, taxas de cartao
- Impostos e deducoes sobre vendas: ICMS, PIS/COFINS, CBS/IBS (relevantes)
- Ciclo financeiro: recebimentos rapidos (cartao/pix), pagamentos contados (distribuidora)

COMPARACOES QUE VOCE TEM:
- YoY (mesmo mes do ano anterior) — elimina sazonalidade
- Trimestre vs trimestre — 3 meses atuais vs 3 anteriores, suaviza ruido
- Tendencia 6 meses — serie mensal para ver direcao

SUA RESPOSTA DEVE SER UM JSON VALIDO com EXATAMENTE esta estrutura:
{
  "resumo_executivo": {
    "situacao": "saudavel" | "alerta" | "critico",
    "sintese": "3-4 frases com a situacao financeira do posto usando numeros reais",
    "destaques_positivos": ["..."],
    "destaques_negativos": ["..."]
  },
  "margens": {
    "interpretacao_yoy": "analise da margem bruta/liquida vs ano anterior com numeros e pp",
    "interpretacao_trimestre": "analise dos ultimos 3m vs 3m anteriores",
    "causas": ["..."]
  },
  "linhas_criticas": [
    {"linha": "nome do grupo/linha da DRE", "valor_atual": 0, "valor_yoy": 0, "variacao_pct": 0, "impacto_no_resultado": "alto|medio|baixo", "comentario": "..."}
  ],
  "custos_despesas": {
    "maiores_itens": [{"nome": "...", "valor": 0, "pct_receita": 0, "comentario": "..."}],
    "avaliacao": "controlado|alto|preocupante",
    "excessos": ["..."]
  },
  "tendencia": {
    "direcao": "melhora|piora|estavel|volatil",
    "resumo_6m": "descreva a trajetoria da receita e do lucro nos 6 meses",
    "pontos_inflexao": ["..."]
  },
  "riscos": [{"risco": "...", "severidade": "alta|media|baixa", "mitigacao": "..."}],
  "oportunidades": {
    "aumentar_receita": ["..."],
    "reduzir_custos": ["..."],
    "otimizar_margens": ["..."]
  },
  "recomendacoes": [
    {"prioridade": "alta|media|baixa", "acao": "acao concreta e mensuravel", "impacto_esperado": "em R$ ou pp"}
  ],
  "perguntas_gestor": ["5-7 perguntas que o gestor deve responder para avancar"]
}

REGRAS:
- Use SEMPRE os numeros do payload. Nao invente valores.
- Cite valores em R$ e percentuais com precisao.
- YoY eliminado de sazonalidade; trimestre para suavizar ruido; tendencia 6m para direcao.
- Para comparacoes de margem, use pontos percentuais (pp), nao variacao relativa.
- Tom consultivo. Foco em acao, nao em descricao.
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

// ─── Agregacao de VENDAS por grupo_dre (usa mascara de vendas) ─
// Espelha a logica de indexarVendasPorGrupo do RelatorioDRE: aplica
// mapeamento_vendas_dre (tipo → grupo_dre) e o sinal configurado em TIPOS_VENDA.
function agregarVendasPorGrupoDre(dadosPorMes, mapeamentoVendas, produtosMap, gruposCatMap) {
  const totalPorGrupo = new Map();
  if (!mapeamentoVendas?.length) return totalPorGrupo;
  const cfgPorTipo = new Map();
  mapeamentoVendas.forEach(m => {
    if (m.grupo_dre_id) cfgPorTipo.set(m.tipo, m);
  });
  if (cfgPorTipo.size === 0) return totalPorGrupo;

  Object.values(dadosPorMes || {}).forEach(periodo => {
    const itens = periodo.vendaItens || [];
    const vendasArr = periodo.vendas || [];
    if (itens.length === 0) return;
    const vendasMap = new Map();
    vendasArr.forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));
    const totaisMes = vendasMapService.agregarVendasItens(itens, vendasMap, produtosMap, gruposCatMap);
    Object.entries(totaisMes).forEach(([tipo, valor]) => {
      const cfg = cfgPorTipo.get(tipo);
      if (!cfg) return;
      const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
      if (!tipoCfg) return;
      const valorComSinal = (Number(valor) || 0) * tipoCfg.sinal;
      totalPorGrupo.set(cfg.grupo_dre_id, (totalPorGrupo.get(cfg.grupo_dre_id) || 0) + valorComSinal);
    });
  });
  return totalPorGrupo;
}

// ─── Agregacao por grupo da mascara ────────────────────────────
// dadosPorMes: { mesKey: { titulosPagar, titulosReceber, vendaItens, vendas } }
// grupos: lista de grupos da mascara DRE
// mapeamentos: [{plano_conta_codigo, grupo_dre_id}]
// opcoes: { mapeamentoVendas, produtosMap, gruposCatMap } - se presentes, soma vendas por grupo
// Retorna { linhas, kpis } com a DRE ja montada
export function agregarDrePorGrupo(dadosPorMes, grupos, mapeamentos, opcoes = {}) {
  const { mapeamentoVendas, produtosMap, gruposCatMap } = opcoes;

  // Index: codigo plano -> grupo_dre_id
  const planoParaGrupo = new Map();
  (mapeamentos || []).forEach(m => planoParaGrupo.set(String(m.plano_conta_codigo), m.grupo_dre_id));

  // 1. Soma titulos (TITULO_PAGAR + TITULO_RECEBER) por grupo
  const totalPorGrupo = new Map();
  Object.values(dadosPorMes || {}).forEach(periodo => {
    const titulos = [
      ...((periodo.titulosReceber || []).map(t => ({ ...t, _sinal: 1 }))),
      ...((periodo.titulosPagar || []).map(t => ({ ...t, _sinal: -1 }))),
    ];
    titulos.forEach(t => {
      const codigo = String(t.planoContaGerencialCodigo || '');
      if (!codigo) return;
      const grupoId = planoParaGrupo.get(codigo);
      if (!grupoId) return;
      const valor = Number(t.valorPago || t.valor || 0) * t._sinal;
      totalPorGrupo.set(grupoId, (totalPorGrupo.get(grupoId) || 0) + valor);
    });
  });

  // 2. Soma vendas (VENDA_ITEM) por grupo via mascara de vendas
  if (mapeamentoVendas && produtosMap && gruposCatMap) {
    const vendasPorGrupo = agregarVendasPorGrupoDre(dadosPorMes, mapeamentoVendas, produtosMap, gruposCatMap);
    vendasPorGrupo.forEach((v, grupoId) => {
      totalPorGrupo.set(grupoId, (totalPorGrupo.get(grupoId) || 0) + v);
    });
  }

  // 3. Calcula subtotais/resultados — como na RelatorioDRE, sao acumulados
  //    em ordem: cada subtotal/resultado soma todos os grupos "base" anteriores.
  const gruposOrdenados = (grupos || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  let acumulado = 0;
  const linhas = gruposOrdenados.map(g => {
    const isCalc = g.tipo === 'subtotal' || g.tipo === 'resultado';
    let valor;
    if (isCalc) {
      valor = acumulado;
    } else {
      valor = totalPorGrupo.get(g.id) || 0;
      acumulado += valor;
    }
    return {
      grupoId: g.id,
      grupoNome: g.nome,
      tipo: g.tipo,
      sinal: g.sinal || 1,
      valor: round(valor),
    };
  });

  // Heuristica para extrair KPIs baseada no nome do grupo
  // (mascaras tipicas tem grupos "Receita Bruta", "CMV", "Lucro Bruto", "Despesas Operacionais", "Resultado")
  const findByRegex = (regex) => linhas.find(l => regex.test((l.grupoNome || '').toLowerCase()));
  const receita = findByRegex(/receita\s+(operacional\s+)?bruta|receitas?$/i);
  const deducoes = findByRegex(/deduc[aã]o|deduc[oõ]es/i);
  const receitaLiquida = findByRegex(/receita\s+(operacional\s+)?liquida/i);
  const cmv = findByRegex(/custo|cmv/i);
  const lucroBruto = findByRegex(/lucro\s+bruto|resultado\s+(operacional\s+)?bruto/i);
  const despesas = findByRegex(/despesa/i);
  const lucroLiquido = findByRegex(/resultado\s+(operacional\s+)?liquido|lucro\s+liquido|resultado\s+gerencial/i);

  const vReceita = Math.abs(receita?.valor || 0);
  const vDeducoes = Math.abs(deducoes?.valor || 0);
  const vRecLiq = receitaLiquida?.valor != null ? Math.abs(receitaLiquida.valor) : vReceita - vDeducoes;
  const vCmv = Math.abs(cmv?.valor || 0);
  const vLb = lucroBruto?.valor != null ? lucroBruto.valor : vRecLiq - vCmv;
  const vDesp = Math.abs(despesas?.valor || 0);
  const vLl = lucroLiquido?.valor != null ? lucroLiquido.valor : vLb - vDesp;

  return {
    linhas,
    kpis: {
      receita_bruta: round(vReceita),
      deducoes: round(vDeducoes),
      receita_liquida: round(vRecLiq),
      cmv: round(vCmv),
      lucro_bruto: round(vLb),
      despesas_operacionais: round(vDesp),
      lucro_liquido: round(vLl),
      margem_bruta_pct: vReceita > 0 ? round((vLb / vReceita) * 100, 2) : 0,
      margem_liquida_pct: vReceita > 0 ? round((vLl / vReceita) * 100, 2) : 0,
      cmv_pct_receita: vReceita > 0 ? round((vCmv / vReceita) * 100, 2) : 0,
      despesas_pct_receita: vReceita > 0 ? round((vDesp / vReceita) * 100, 2) : 0,
    },
  };
}

// ─── Fetch helper: carrega titulos + vendas para um periodo ────
async function carregarDadosPeriodo(apiKey, empresaCodigos, { dataInicial, dataFinal }) {
  const allPagar = [], allReceber = [], allVendaItens = [], allVendas = [];
  for (const ec of empresaCodigos) {
    const filtros = { dataInicial, dataFinal, empresaCodigo: ec };
    const [pagar, receber, vendaItens, vendas] = await Promise.all([
      qualityApi.buscarTitulosPagar(apiKey, filtros).catch(() => []),
      qualityApi.buscarTitulosReceber(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
    ]);
    (pagar || []).forEach(t => allPagar.push(t));
    (receber || []).forEach(t => allReceber.push(t));
    (vendaItens || []).forEach(v => allVendaItens.push(v));
    (vendas || []).forEach(v => allVendas.push(v));
  }
  return { titulosPagar: allPagar, titulosReceber: allReceber, vendaItens: allVendaItens, vendas: allVendas };
}

// ─── Agregador principal para DRE ──────────────────────────────
// params: { cliente | redeContexto, mesRef, chaveApi, mascaraId, onProgress }
// Retorna payload pronto para a IA
export async function agregarDadosDRE({ cliente, modoRede = false, chaveApi, chaveApiId, mascaraId, mesRef, onProgress }) {
  const periodos = calcularPeriodos(mesRef);

  // Empresa codigos (suporta modo rede)
  const empresaCodigos = modoRede
    ? (cliente?._empresaCodigos || [])
    : [cliente.empresa_codigo];

  // Mascara + grupos + mapeamentos (rede, filtrados pela mascara) + mapeamento de vendas + catalogos
  onProgress?.('Carregando mascara DRE, mapeamento de vendas e catalogos...');
  const [grupos, mapeamentosRede, mapeamentoVendas, produtos, gruposQuality] = await Promise.all([
    mascaraDreService.listarGrupos(mascaraId),
    mapService.listarMapeamentos(chaveApiId),
    vendasMapService.listarMapeamentoVendas(mascaraId).catch(() => []),
    qualityApi.buscarProdutos(chaveApi).catch(() => []),
    qualityApi.buscarGrupos(chaveApi).catch(() => []),
  ]);
  if (!grupos?.length) throw new Error('Mascara DRE nao tem grupos configurados');
  const gruposIds = new Set(grupos.map(g => g.id));
  const mapeamentos = (mapeamentosRede || []).filter(m => gruposIds.has(m.grupo_dre_id));
  const mapVendasFiltrado = (mapeamentoVendas || []).filter(m => gruposIds.has(m.grupo_dre_id));
  if (mapeamentos.length === 0 && mapVendasFiltrado.length === 0) {
    throw new Error('Nenhum plano de conta nem mapeamento de vendas configurado para esta mascara DRE. Configure em Parametros.');
  }
  const produtosMap = new Map();
  (produtos || []).forEach(p => produtosMap.set(p.produtoCodigo || p.codigo, p));
  const gruposCatMap = new Map();
  (gruposQuality || []).forEach(g => gruposCatMap.set(g.grupoCodigo || g.codigo, g));
  const opcoesAgg = { mapeamentoVendas: mapVendasFiltrado, produtosMap, gruposCatMap };

  // Fetch de periodo traz titulos + vendas
  const fetchPeriodo = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const dados = await carregarDadosPeriodo(chaveApi, empresaCodigos, p);
    return { [p.key]: dados };
  };

  const [dadosAtual, dadosYoY, ...dadosMensais] = await Promise.all([
    fetchPeriodo(periodos.atual, `${periodos.atual.label} (atual)`),
    fetchPeriodo(periodos.yoy, `${periodos.yoy.label} (YoY)`),
    ...periodos.tendencia6m.map(p => fetchPeriodo(p, p.label)),
  ]);

  const tendencia6mPorMes = {};
  dadosMensais.forEach(d => { Object.assign(tendencia6mPorMes, d); });

  const keysTend = periodos.tendencia6m.map(p => p.key);
  const quarterAtualPorMes = {};
  const quarterAntPorMes = {};
  keysTend.slice(-3).forEach(k => { quarterAtualPorMes[k] = tendencia6mPorMes[k]; });
  keysTend.slice(0, 3).forEach(k => { quarterAntPorMes[k] = tendencia6mPorMes[k]; });

  // Agregacoes (todas passam as opcoes com vendas)
  const aggAtual = agregarDrePorGrupo(dadosAtual, grupos, mapeamentos, opcoesAgg);
  const aggYoY = agregarDrePorGrupo(dadosYoY, grupos, mapeamentos, opcoesAgg);
  const aggQuarterAtual = agregarDrePorGrupo(quarterAtualPorMes, grupos, mapeamentos, opcoesAgg);
  const aggQuarterAnt = agregarDrePorGrupo(quarterAntPorMes, grupos, mapeamentos, opcoesAgg);

  const serieTendencia = periodos.tendencia6m.map(p => {
    const agg = agregarDrePorGrupo({ [p.key]: tendencia6mPorMes[p.key] }, grupos, mapeamentos, opcoesAgg);
    return {
      mes: p.label,
      key: p.key,
      receita_liquida: agg.kpis.receita_liquida,
      lucro_bruto: agg.kpis.lucro_bruto,
      margem_bruta_pct: agg.kpis.margem_bruta_pct,
      lucro_liquido: agg.kpis.lucro_liquido,
      margem_liquida_pct: agg.kpis.margem_liquida_pct,
    };
  });

  // Linhas com maior variacao YoY (top 5 por |variacao|)
  const mapYoY = new Map(aggYoY.linhas.map(l => [l.grupoId, l.valor]));
  const linhasComVariacao = aggAtual.linhas
    .filter(l => l.tipo !== 'subtotal' && l.tipo !== 'resultado')
    .map(l => {
      const valorYoY = mapYoY.get(l.grupoId) || 0;
      return {
        linha: l.grupoNome,
        valor_atual: l.valor,
        valor_yoy: valorYoY,
        variacao_pct: variacaoPct(l.valor, valorYoY),
        variacao_abs: round(l.valor - valorYoY),
      };
    })
    .filter(l => l.variacao_pct != null && Math.abs(l.variacao_pct) > 10)
    .sort((a, b) => Math.abs(b.variacao_pct) - Math.abs(a.variacao_pct))
    .slice(0, 8);

  return {
    empresa: {
      nome: demoAtivo()
        ? (modoRede ? mascararRede(cliente?.nome, cliente?.id, true) : mascararEmpresa(cliente, true))
        : (cliente?.nome || (modoRede ? 'Rede' : 'Empresa')),
      cnpj: demoAtivo() ? null : (cliente?.cnpj || null),
      qtd_empresas: modoRede ? empresaCodigos.length : 1,
    },
    periodo_atual: {
      label: periodos.atual.label,
      kpis: aggAtual.kpis,
      linhas_dre: aggAtual.linhas,
    },
    comparativo_yoy: {
      label: periodos.yoy.label,
      kpis: aggYoY.kpis,
      variacao_receita_pct: variacaoPct(aggAtual.kpis.receita_bruta, aggYoY.kpis.receita_bruta),
      variacao_lucro_bruto_pct: variacaoPct(aggAtual.kpis.lucro_bruto, aggYoY.kpis.lucro_bruto),
      variacao_margem_bruta_pp: round(aggAtual.kpis.margem_bruta_pct - aggYoY.kpis.margem_bruta_pct, 2),
      variacao_margem_liquida_pp: round(aggAtual.kpis.margem_liquida_pct - aggYoY.kpis.margem_liquida_pct, 2),
    },
    comparativo_trimestre: {
      atual_label: periodos.quarterAtual.label,
      anterior_label: periodos.quarterAnterior.label,
      atual_kpis: aggQuarterAtual.kpis,
      anterior_kpis: aggQuarterAnt.kpis,
      variacao_receita_pct: variacaoPct(aggQuarterAtual.kpis.receita_bruta, aggQuarterAnt.kpis.receita_bruta),
      variacao_lucro_bruto_pct: variacaoPct(aggQuarterAtual.kpis.lucro_bruto, aggQuarterAnt.kpis.lucro_bruto),
      variacao_margem_bruta_pp: round(aggQuarterAtual.kpis.margem_bruta_pct - aggQuarterAnt.kpis.margem_bruta_pct, 2),
    },
    tendencia_6m: serieTendencia,
    linhas_com_maior_variacao: linhasComVariacao,
  };
}

// ─── Chamada Claude ────────────────────────────────────────────
export async function gerarAnaliseDREIA(dados, apiKey) {
  const user = `Analise a DRE desta empresa (ou rede de postos):\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({
    apiKey,
    system: [{ type: 'text', text: SYSTEM_PROMPT }],
    user,
  });
}
