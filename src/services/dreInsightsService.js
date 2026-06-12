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

REGRA CRITICA — ESTRUTURA DA DRE:
O payload contem \`mascara_dre.estrutura\` com a lista EXATA de grupos da DRE
parametrizada do cliente (com nomes, tipos base/subtotal/resultado, hierarquia
parent_id). Os valores reais estao em \`periodo_atual.linhas_dre\` (cada linha
tem \`grupoId\`, \`grupoNome\`, \`tipo\`, \`parentId\`, \`valor\`, \`valor_yoy\`).

VOCE DEVE:
- Usar EXATAMENTE os \`grupoNome\` do payload quando citar linhas da DRE
  (ex: "DESPESAS COM FUNCIONARIOS", "ENCARGOS SOCIAIS", "RECEITAS FINANCEIRAS").
- VALIDACAO RIGIDA: toda string em \`custos_despesas.maiores_itens[].nome\`
  e \`linhas_criticas[].linha\` PRECISA ser identica (case-insensitive
  comparado a \`linhas_dre[].grupoNome\`). Se nao bate, a resposta esta errada.
- NUNCA inventar categorias como "custo dos combustiveis", "custos da
  conveniencia", "despesas com energia", "custos dos produtos automotivos",
  etc. Se nao tem no \`linhas_dre\`, NAO USE — independente de quanto faca
  sentido. Use SOMENTE o que esta no payload, NADA MAIS.
- Respeitar a HIERARQUIA: grupos com \`parentId\` sao filhos do pai. Prefira
  os filhos especificos (ex: "DESPESAS COM FUNCIONARIOS", "ENCARGOS SOCIAIS")
  em vez de so o pai ("DESPESAS GERAIS").
- Se quiser falar sobre combustivel/conveniencia/etc, use os nomes da
  estrutura — por exemplo "CUSTO DE REVENDA DE PRODUTOS" se este for o
  nome do grupo. Nao traduza, nao reformule, copie literal.

CALCULO DE % RECEITA (OBRIGATORIO calcular, nao copiar):
- BASE: use SEMPRE \`base_receita_para_pct\` do payload como denominador.
  Esse numero vem PRONTO e ja resolve o caso do grupo pai sem mapeamento.
- FORMULA: pct_receita = round(abs(valor_da_linha) / base_receita_para_pct * 100, 1)
- Exemplo concreto: se \`base_receita_para_pct\` = 8366003.33 e a linha
  "DESPESAS COM FUNCIONARIOS" tem valor -400091.66:
    pct_receita = abs(-400091.66) / 8366003.33 * 100 = 4.8
- SE \`base_receita_para_pct\` for null OU 0, retorne pct_receita = 0 e
  comente "Sem base de receita configurada".
- NUNCA retorne 0.0 sem ter feito a divisao. Se voce ver 0.0 em todas as
  linhas, esta errado — voce nao calculou.

RESULTADO POR EMPRESA (apenas se \`por_empresa\` tiver itens):
- Use o array \`por_empresa\` do payload pra montar \`resultado_por_empresa\`.
- Inclua UMA entrada por empresa, com os KPIs vindos de \`por_empresa[].kpis\`.
- Compare as empresas entre si: identifique a mais lucrativa, a com menor
  margem, a que precisa atencao. O \`comentario\` deve dizer ISSO.
- Se \`por_empresa\` estiver vazio (modo single empresa), retorne
  \`resultado_por_empresa: []\`.

CALCULO DE YoY POR LINHA:
- Cada item de \`linhas_dre\` tem \`valor\` (atual) e \`valor_yoy\` (ano
  anterior). Use estes pra calcular variacao em qualquer linha:
- \`variacao_pct = (valor - valor_yoy) / abs(valor_yoy) * 100\`
- Se \`valor_yoy\` for 0 e \`valor\` nao for, marque \`variacao_pct\` como
  null (variacao indefinida — nao escreva +0.0% nesse caso) e explique no
  comentario que e uma linha NOVA (sem historico no mesmo mes do ano anterior).

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
    {"linha": "grupoNome literal do payload (ex: DESPESAS COM FUNCIONARIOS)", "valor_atual": 0, "valor_yoy": 0, "variacao_pct": 0, "impacto_no_resultado": "alto|medio|baixo", "comentario": "..."}
  ],
  "custos_despesas": {
    "maiores_itens": [{"nome": "grupoNome literal do payload — SOMENTE itens que existem em linhas_dre", "valor": 0, "pct_receita": 0, "comentario": "..."}],
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
  "perguntas_gestor": ["5-7 perguntas que o gestor deve responder para avancar"],
  "resultado_por_empresa": [
    {
      "nome": "nome exato vindo de por_empresa[].nome",
      "receita_bruta": 0,
      "lucro_bruto": 0,
      "lucro_liquido": 0,
      "margem_bruta_pct": 0,
      "margem_liquida_pct": 0,
      "destaque": "saudavel|alerta|critico",
      "comentario": "1-2 frases sobre a posicao dessa empresa vs as demais (mais lucrativa, em risco, oportunidade, etc)"
    }
  ]
}

REGRAS:
- Use SEMPRE os numeros do payload. Nao invente valores.
- Use SEMPRE os \`grupoNome\` do payload pra nomear linhas/itens. Nao crie nomes.
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

  // GRID destino pras taxas de CARTAO_REMESSA: procura no mapeamento uma
  // descrição com "TAXA" + "CART"/"CARD" (paridade com RelatorioDRE).
  // Prefere a descrição com menos palavras (genérica).
  const gridTaxaCartao = (() => {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const candidatos = (mapeamentos || []).filter(m => {
      const d = norm(m.plano_conta_descricao || '');
      return d.includes('taxa') && (d.includes('cart') || d.includes('card'));
    });
    if (candidatos.length === 0) return null;
    candidatos.sort((a, b) => {
      const wa = norm(a.plano_conta_descricao || '').trim().split(/\s+/).length;
      const wb = norm(b.plano_conta_descricao || '').trim().split(/\s+/).length;
      return wa - wb;
    });
    return String(candidatos[0].plano_conta_codigo);
  })();

  // 1. Soma titulos (TITULO_PAGAR + TITULO_RECEBER) + MOVIMENTO_CONTA mapeado
  //    + CARTAO_REMESSA (taxas) por grupo
  const totalPorGrupo = new Map();
  Object.values(dadosPorMes || {}).forEach(periodo => {
    // 1a) Títulos clássicos (PAGAR -, RECEBER +)
    const titulos = [
      ...((periodo.titulosReceber || []).map(t => ({ ...t, _sinal: 1 }))),
      ...((periodo.titulosPagar || []).map(t => ({ ...t, _sinal: -1 }))),
    ];
    titulos.forEach(t => {
      const codigo = String(t.planoContaGerencialCodigo || '');
      if (!codigo) return;
      const grupoId = planoParaGrupo.get(codigo);
      if (!grupoId) return;
      // DRE em regime de COMPETÊNCIA — usa SEMPRE o valor total do título.
      const valor = Number(t.valor || 0) * t._sinal;
      totalPorGrupo.set(grupoId, (totalPorGrupo.get(grupoId) || 0) + valor);
    });

    // 1b) MOVIMENTO_CONTA: captura receitas/despesas fora dos títulos
    //     (recuperação de custo, repasses, etc). Filtros:
    //     - GRID precisa estar mapeado
    //     - tipoDocumentoOrigem !== 'TITULO_*' (pagto de título já contado)
    //     - Sinal pelo tipo: Crédito=+, Débito=-
    (periodo.movimentos || []).forEach(m => {
      const cod = String(m.planoContaGerencialCodigo || '');
      if (!cod || cod === '0') return;
      const grupoId = planoParaGrupo.get(cod);
      if (!grupoId) return;
      const origem = String(m.tipoDocumentoOrigem || '').toUpperCase();
      if (origem.startsWith('TITULO_')) return;
      const sinal = String(m.tipo || '').toLowerCase().startsWith('cr') ? 1 : -1;
      const valor = Math.abs(Number(m.valor || 0)) * sinal;
      totalPorGrupo.set(grupoId, (totalPorGrupo.get(grupoId) || 0) + valor);
    });

    // 1c) CARTAO_REMESSA: taxasDespesas + acrescimos viram despesa
    //     no GRID com descrição "TAXA + CART" (se mapeado).
    if (gridTaxaCartao) {
      const grupoTaxa = planoParaGrupo.get(gridTaxaCartao);
      if (grupoTaxa) {
        (periodo.remessasCartao || []).forEach(r => {
          const taxa = Math.abs(Number(r.taxasDespesas || 0));
          const acr = Math.abs(Number(r.acrescimos || 0));
          const total = taxa + acr;
          if (total > 0) {
            totalPorGrupo.set(grupoTaxa, (totalPorGrupo.get(grupoTaxa) || 0) - total);
          }
        });
      }
    }
  });

  // 2. Soma vendas (VENDA_ITEM) por grupo via mascara de vendas
  if (mapeamentoVendas && produtosMap && gruposCatMap) {
    const vendasPorGrupo = agregarVendasPorGrupoDre(dadosPorMes, mapeamentoVendas, produtosMap, gruposCatMap);
    vendasPorGrupo.forEach((v, grupoId) => {
      totalPorGrupo.set(grupoId, (totalPorGrupo.get(grupoId) || 0) + v);
    });
  }

  // 3. Antes do acumulado: pra cada grupo PAI sem valor direto, soma os
  //    descendentes (recursivo). Assim "RECEITA OPERACIONAL BRUTA" (pai
  //    sem mapeamento) recebe a soma de "REVENDA DE PRODUTOS" + qualquer
  //    sub-filho, em vez de aparecer com 0.
  const gruposOrdenados = (grupos || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const filhosPorPai = new Map();
  gruposOrdenados.forEach(g => {
    if (g.parent_id) {
      if (!filhosPorPai.has(g.parent_id)) filhosPorPai.set(g.parent_id, []);
      filhosPorPai.get(g.parent_id).push(g.id);
    }
  });
  // Travessia POST-ORDER: visita filhos primeiro, depois o pai.
  // Assim grupos com múltiplos níveis (pai→filho→neto) propagam o valor
  // até o topo. Se um nó tem valor próprio, preserva; senão soma descendentes.
  function popularDescendentes(grupoId, visitados = new Set()) {
    if (visitados.has(grupoId)) return totalPorGrupo.get(grupoId) || 0; // proteção contra ciclo
    visitados.add(grupoId);
    const filhos = filhosPorPai.get(grupoId) || [];
    if (filhos.length === 0) return totalPorGrupo.get(grupoId) || 0;
    // Visita os filhos primeiro
    let somaFilhos = 0;
    filhos.forEach(fid => { somaFilhos += popularDescendentes(fid, visitados); });
    // Se este pai não tem valor próprio, herda a soma dos filhos
    const valorProprio = totalPorGrupo.get(grupoId) || 0;
    if (valorProprio === 0 && somaFilhos !== 0) {
      totalPorGrupo.set(grupoId, somaFilhos);
      return somaFilhos;
    }
    return valorProprio;
  }
  gruposOrdenados.forEach(g => {
    if (g.tipo === 'subtotal' || g.tipo === 'resultado') return;
    if (!filhosPorPai.has(g.id)) return; // só pais
    popularDescendentes(g.id);
  });

  // 4. Calcula subtotais/resultados — acumula só os grupos "base" SEM
  //    parent_id (raízes), evita contagem dupla (pai foi enriquecido com
  //    soma dos filhos, mas o filho continua somando no acumulado).
  let acumulado = 0;
  const linhas = gruposOrdenados.map(g => {
    const isCalc = g.tipo === 'subtotal' || g.tipo === 'resultado';
    let valor;
    if (isCalc) {
      valor = acumulado;
    } else {
      valor = totalPorGrupo.get(g.id) || 0;
      // Só raízes (sem parent_id) entram no acumulado pra evitar duplo:
      // pai (= soma dos filhos) + filhos individualmente.
      if (!g.parent_id) acumulado += valor;
    }
    return {
      grupoId: g.id,
      grupoNome: g.nome,
      tipo: g.tipo,
      sinal: g.sinal || 1,
      parentId: g.parent_id || null,
      ordem: g.ordem || 0,
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

// ─── Fetch helper: carrega titulos + movimentos + remessas + vendas ──
// Paridade com RelatorioDRE — pega receitas/despesas que vivem fora dos
// títulos clássicos (MOVIMENTO_CONTA pra receitas financeiras, CARTAO_REMESSA
// pra taxas de cartão) e títulos a receber convertidos (que o default
// `convertido=false` da Quality exclui).
async function carregarDadosPeriodo(apiKey, empresaCodigos, { dataInicial, dataFinal }) {
  const allPagar = [], allReceber = [], allMovimentos = [], allRemessas = [];
  const allVendaItens = [], allVendas = [];
  for (const ec of empresaCodigos) {
    const filtros = { dataInicial, dataFinal, empresaCodigo: ec };
    const [pagar, receber, movimentos, remessas, vendaItens, vendas] = await Promise.all([
      qualityApi.buscarTitulosPagar(apiKey, filtros).catch(() => []),
      qualityApi.buscarTitulosReceber(apiKey, { ...filtros, convertido: null }).catch(() => []),
      qualityApi.buscarMovimentoConta(apiKey, filtros).catch(() => []),
      qualityApi.buscarCartaoRemessa(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendaItens(apiKey, filtros).catch(() => []),
      qualityApi.buscarVendas(apiKey, filtros).catch(() => []),
    ]);
    (pagar || []).forEach(t => allPagar.push(t));
    (receber || []).forEach(t => allReceber.push(t));
    (movimentos || []).forEach(m => allMovimentos.push(m));
    (remessas || []).forEach(r => allRemessas.push(r));
    (vendaItens || []).forEach(v => allVendaItens.push(v));
    (vendas || []).forEach(v => allVendas.push(v));
  }
  return {
    titulosPagar: allPagar, titulosReceber: allReceber,
    movimentos: allMovimentos, remessasCartao: allRemessas,
    vendaItens: allVendaItens, vendas: allVendas,
  };
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
  onProgress?.('Carregando máscara DRE, mapeamento de vendas e catalogos...');
  const [todasMascaras, grupos, mapeamentosRede, mapeamentoVendas, produtos, gruposQuality] = await Promise.all([
    mascaraDreService.listarMascaras().catch(() => []),
    mascaraDreService.listarGrupos(mascaraId),
    mapService.listarMapeamentos(chaveApiId),
    vendasMapService.listarMapeamentoVendas(mascaraId).catch(() => []),
    qualityApi.buscarProdutos(chaveApi).catch(() => []),
    qualityApi.buscarGrupos(chaveApi).catch(() => []),
  ]);
  const mascaraInfo = (todasMascaras || []).find(m => m.id === mascaraId) || null;
  if (!grupos?.length) throw new Error('Máscara DRE não tem grupos configurados');
  const gruposIds = new Set(grupos.map(g => g.id));
  const mapeamentos = (mapeamentosRede || []).filter(m => gruposIds.has(m.grupo_dre_id));
  const mapVendasFiltrado = (mapeamentoVendas || []).filter(m => gruposIds.has(m.grupo_dre_id));
  if (mapeamentos.length === 0 && mapVendasFiltrado.length === 0) {
    throw new Error('Nenhum plano de conta nem mapeamento de vendas configurado para esta máscara DRE. Configure em Parâmetros.');
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

  // Estrutura hierárquica da máscara (pra IA respeitar agrupamentos pai→filho)
  const estruturaDre = gruposOrdenados => gruposOrdenados.map(g => ({
    id: g.id,
    nome: g.nome,
    tipo: g.tipo,            // 'base' | 'subtotal' | 'resultado'
    parent_id: g.parent_id || null,
    ordem: g.ordem || 0,
  }));
  const gruposOrdenadosArr = (grupos || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  // Enriquece linhas com valor YoY no MESMO grupo (atual vs ano anterior)
  // — assim a IA tem todos os pontos pra calcular variações em qualquer
  // linha sem filtrar nada.
  const mapYoYTodas = new Map(aggYoY.linhas.map(l => [l.grupoId, l.valor]));
  const linhasComYoY = aggAtual.linhas.map(l => ({
    ...l,
    valor_yoy: mapYoYTodas.get(l.grupoId) || 0,
  }));

  // Resultado POR EMPRESA (apenas em modo rede com múltiplas empresas).
  // Filtra os dados do período atual por empresaCodigo e roda o mesmo
  // agregador. Assim a IA recebe a DRE de cada empresa individual e pode
  // comparar performance entre elas.
  function filtrarPorEmpresa(dadosPeriodo, ec) {
    const out = {};
    Object.entries(dadosPeriodo).forEach(([k, v]) => {
      out[k] = {
        titulosPagar:   (v.titulosPagar   || []).filter(x => Number(x.empresaCodigo) === ec),
        titulosReceber: (v.titulosReceber || []).filter(x => Number(x.empresaCodigo) === ec),
        movimentos:     (v.movimentos     || []).filter(x => Number(x.empresaCodigo) === ec),
        remessasCartao: (v.remessasCartao || []).filter(x => Number(x.empresaCodigo) === ec),
        vendaItens:     (v.vendaItens     || []).filter(x => Number(x.empresaCodigo) === ec),
        vendas:         (v.vendas         || []).filter(x => Number(x.empresaCodigo) === ec),
      };
    });
    return out;
  }
  const empresas = modoRede ? (cliente?._empresas || []) : [];
  const porEmpresa = empresas.map(emp => {
    const ec = Number(emp.empresa_codigo);
    const dadosAtualEmp = filtrarPorEmpresa(dadosAtual, ec);
    const dadosYoYEmp = filtrarPorEmpresa(dadosYoY, ec);
    const aggEmp = agregarDrePorGrupo(dadosAtualEmp, grupos, mapeamentos, opcoesAgg);
    const aggEmpYoY = agregarDrePorGrupo(dadosYoYEmp, grupos, mapeamentos, opcoesAgg);
    return {
      empresa_codigo: ec,
      nome: demoAtivo() ? mascararEmpresa(emp, true) : (emp.fantasia || emp.nome || `Empresa #${ec}`),
      kpis: aggEmp.kpis,
      kpis_yoy: aggEmpYoY.kpis,
      // Top linhas: receita + lucro bruto + lucro líquido + 3 maiores despesas (sem subtotais/resultados)
      linhas_resumo: aggEmp.linhas
        .filter(l => l.tipo !== 'subtotal' && l.tipo !== 'resultado' && !l.parentId)
        .map(l => ({ grupoNome: l.grupoNome, valor: l.valor })),
    };
  });

  return {
    empresa: {
      nome: demoAtivo()
        ? (modoRede ? mascararRede(cliente?.nome, cliente?.id, true) : mascararEmpresa(cliente, true))
        : (cliente?.nome || (modoRede ? 'Rede' : 'Empresa')),
      cnpj: demoAtivo() ? null : (cliente?.cnpj || null),
      qtd_empresas: modoRede ? empresaCodigos.length : 1,
    },
    mascara_dre: {
      nome: mascaraInfo?.nome || 'Padrão',
      // Hierarquia completa: grupos base + subtotais + resultados na ordem
      // exata. A IA DEVE usar SOMENTE estes nomes ao listar linhas/itens.
      estrutura: estruturaDre(gruposOrdenadosArr),
    },
    // Receita usada como base do % Receita — calculada a partir da soma de
    // todos os grupos cujo tipo='base' SEM parent_id e SEM dedução/custo
    // (ou seja, valores brutos positivos). Caso o KPI receita_bruta seja 0
    // por causa do nome do grupo, este valor sempre estará correto.
    base_receita_para_pct: round(
      Math.max(
        aggAtual.kpis.receita_bruta || 0,
        aggAtual.linhas
          .filter(l => l.tipo === 'base' && !l.parentId && l.valor > 0)
          .reduce((s, l) => s + l.valor, 0)
      )
    ),
    periodo_atual: {
      label: periodos.atual.label,
      kpis: aggAtual.kpis,
      // Cada linha já vem com valor_yoy pra IA calcular variações
      linhas_dre: linhasComYoY,
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
    // Apenas em modo rede com múltiplas empresas. Vazio em modo single.
    por_empresa: porEmpresa,
  };
}

// ─── Chamada Claude ────────────────────────────────────────────
export async function gerarAnaliseDREIA(dados, apiKey) {
  const user = `Análise a DRE desta empresa (ou rede de postos):\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({
    apiKey,
    system: [{ type: 'text', text: SYSTEM_PROMPT }],
    user,
  });
}
