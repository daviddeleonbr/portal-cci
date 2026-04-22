// Fluxo de Caixa Insights com IA — agregacao por grupo de mascara + YoY + trimestre + tendencia 6m
// Baseado em MOVIMENTO_CONTA (regime de caixa), filtrado para contas bancaria/caixa.

import * as qualityApi from './qualityApiService';
import * as mascaraFluxoService from './mascaraFluxoCaixaService';
import * as contasBancariasService from './clienteContasBancariasService';
import { chamarClaudeAPI, calcularPeriodos, round, variacaoPct } from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararEmpresa, mascararRede } from './anonimizarService';

const SYSTEM_PROMPT = `Voce e um consultor de tesouraria especializado em postos de combustiveis.

CONTEXTO:
- Caixa do posto: recebimentos em sua maioria imediatos (cartao D+1/D+2, pix, dinheiro); pagamentos a distribuidora em 7-30 dias
- Variacao de caixa saudavel: positiva ou levemente negativa em meses de investimento/pagamento de impostos
- Sinais de alerta: saidas crescentes vs YoY sem receita correspondente; concentracao de saidas em poucos grupos
- Sazonalidade: ferias, 13o salario, impostos trimestrais afetam caixa

COMPARACOES NO PAYLOAD:
- YoY (mesmo mes do ano anterior) — elimina sazonalidade
- Trimestre vs trimestre — ultimos 3m vs 3m anteriores
- Tendencia 6 meses — serie mensal de entradas, saidas e variacao de caixa

SUA RESPOSTA DEVE SER UM JSON VALIDO com EXATAMENTE esta estrutura:
{
  "resumo_executivo": {
    "situacao_caixa": "saudavel" | "alerta" | "critico",
    "saude_liquidez": "descricao em 2-3 frases com numeros",
    "alertas_agudos": ["..."]
  },
  "variacao_caixa": {
    "interpretacao": "analise da variacao total no periodo com numeros",
    "causas_principais": ["..."]
  },
  "padrao_grupos": {
    "entradas_principais": [{"grupo": "...", "valor": 0, "participacao_pct": 0}],
    "saidas_crescentes": [{"grupo": "...", "variacao_yoy_pct": 0, "comentario": "..."}],
    "outliers": ["..."]
  },
  "comparativo_yoy": {
    "o_que_mudou": "sintese dos deltas mais relevantes vs ano anterior",
    "por_que": ["..."]
  },
  "tendencia": {
    "saldo_trajetoria": "sube|desce|oscila",
    "resumo_6m": "descrever trajetoria em 2-3 frases com numeros",
    "risco_liquidez_proximos_meses": "baixo|medio|alto"
  },
  "concentracoes": [
    {"conta_gerencial": "...", "pct_do_total": 0, "risco": "...", "sugestao": "..."}
  ],
  "oportunidades": {
    "aumentar_entradas": ["..."],
    "reduzir_saidas": ["..."],
    "otimizar_prazo": ["..."]
  },
  "recomendacoes": [
    {"prioridade": "alta|media|baixa", "acao": "acao concreta", "efeito_em_caixa": "estimativa em R$ ou %"}
  ],
  "perguntas_gestor": ["5-7 perguntas de tesouraria"]
}

REGRAS:
- Use os numeros do payload. Nao invente.
- Cite R$ e % com precisao.
- Variacao de margem/percentual = pp. Variacao de receita/saldo = %.
- Responda APENAS o JSON, sem texto adicional, sem markdown, sem code fences.`;

// ─── Filtra contas bancaria/caixa como na pagina de Fluxo ─────
function construirTipoPorConta(contasClassificadas) {
  const mapa = new Map();
  (contasClassificadas || []).forEach(c => {
    if (c.ativo === false) return;
    mapa.set(Number(c.conta_codigo), c.tipo);
  });
  return mapa;
}

function contaEntra(mapa, contaCodigo) {
  const tipo = mapa.get(Number(contaCodigo));
  return tipo === 'bancaria' || tipo === 'caixa';
}

// ─── Agrega movimentos por grupo da mascara de fluxo ──────────
// dadosPorMes: { mesKey: { movimentos } }
// grupos: lista de grupos da mascara fluxo
// mapeamentos: [{plano_conta_codigo, grupo_fluxo_id}]
// tipoPorConta: Map<contaCodigo, 'bancaria'|'caixa'|...>
export function agregarFluxoPorGrupo(dadosPorMes, grupos, mapeamentos, tipoPorConta) {
  const planoParaGrupo = new Map();
  (mapeamentos || []).forEach(m => planoParaGrupo.set(String(m.plano_conta_codigo), m.grupo_fluxo_id));

  // Totais: grupo -> { entradas, saidas } e contaGerencial -> { entradas, saidas, nome }
  const totalPorGrupo = new Map();
  const totalPorConta = new Map(); // plano -> {nome, entradas, saidas}
  let entradasTotal = 0;
  let saidasTotal = 0;
  const semPlano = { entradas: 0, saidas: 0 }; // movimentos sem plano = outros

  Object.values(dadosPorMes || {}).forEach(periodo => {
    (periodo.movimentos || []).forEach(m => {
      if (!contaEntra(tipoPorConta, m.contaCodigo)) return;
      const isCredito = m.tipo === 'Crédito' || m.tipo === 'Credito' || m.tipo === 'C';
      const valor = Math.abs(Number(m.valor || 0));
      if (isCredito) entradasTotal += valor; else saidasTotal += valor;

      const codigoPlano = String(m.planoContaGerencialCodigo || '');
      const grupoId = codigoPlano ? planoParaGrupo.get(codigoPlano) : null;
      if (!grupoId) {
        if (isCredito) semPlano.entradas += valor; else semPlano.saidas += valor;
        return;
      }
      const cur = totalPorGrupo.get(grupoId) || { entradas: 0, saidas: 0 };
      if (isCredito) cur.entradas += valor; else cur.saidas += valor;
      totalPorGrupo.set(grupoId, cur);

      if (codigoPlano) {
        const nome = m.planoContaGerencialNome || `Plano ${codigoPlano}`;
        const curConta = totalPorConta.get(codigoPlano) || { nome, entradas: 0, saidas: 0 };
        if (isCredito) curConta.entradas += valor; else curConta.saidas += valor;
        totalPorConta.set(codigoPlano, curConta);
      }
    });
  });

  // Monta linhas por grupo (respeitando ordem da mascara)
  const porGrupo = (grupos || [])
    .filter(g => g.tipo !== 'subtotal' && g.tipo !== 'resultado')
    .slice()
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map(g => {
      const t = totalPorGrupo.get(g.id) || { entradas: 0, saidas: 0 };
      return {
        grupoId: g.id,
        grupo: g.nome,
        tipo: g.tipo,
        entradas: round(t.entradas),
        saidas: round(t.saidas),
        variacao: round(t.entradas - t.saidas),
        participacao_pct_saidas: saidasTotal > 0 ? round((t.saidas / saidasTotal) * 100, 2) : 0,
        participacao_pct_entradas: entradasTotal > 0 ? round((t.entradas / entradasTotal) * 100, 2) : 0,
      };
    });

  // Top contas gerenciais (por |liquido|)
  const topContas = Array.from(totalPorConta.entries())
    .map(([codigo, v]) => ({
      codigo,
      nome: v.nome,
      entradas: round(v.entradas),
      saidas: round(v.saidas),
      liquido: round(v.entradas - v.saidas),
    }))
    .sort((a, b) => Math.abs(b.liquido) - Math.abs(a.liquido))
    .slice(0, 10);

  return {
    entradas_total: round(entradasTotal),
    saidas_total: round(saidasTotal),
    variacao_caixa: round(entradasTotal - saidasTotal),
    sem_plano: { entradas: round(semPlano.entradas), saidas: round(semPlano.saidas) },
    por_grupo: porGrupo,
    top_contas_gerenciais: topContas,
  };
}

// ─── Fetch helper ──────────────────────────────────────────────
async function carregarMovimentos(apiKey, empresaCodigos, { dataInicial, dataFinal }) {
  const all = [];
  for (const ec of empresaCodigos) {
    const filtros = { dataInicial, dataFinal, empresaCodigo: ec };
    const movs = await qualityApi.buscarMovimentoConta(apiKey, filtros).catch(() => []);
    (movs || []).forEach(m => all.push(m));
  }
  return { movimentos: all };
}

// ─── Agregador principal para Fluxo ────────────────────────────
export async function agregarDadosFluxo({ cliente, modoRede = false, chaveApi, mascaraFluxoId, chaveApiId, mesRef, onProgress }) {
  const periodos = calcularPeriodos(mesRef);
  const empresaCodigos = modoRede ? (cliente?._empresaCodigos || []) : [cliente.empresa_codigo];

  onProgress?.('Carregando mascara de fluxo...');
  const [grupos, mapeamentosRede, contasClassif] = await Promise.all([
    mascaraFluxoService.listarGrupos(mascaraFluxoId),
    mascaraFluxoService.listarMapeamentosEmpresa(chaveApiId),
    contasBancariasService.listarPorRede(chaveApiId).catch(() => []),
  ]);
  if (!grupos?.length) throw new Error('Mascara de fluxo de caixa nao tem grupos configurados');
  // Filtra mapeamentos para manter apenas os de grupos desta mascara
  const gruposIds = new Set(grupos.map(g => g.id));
  const mapeamentos = (mapeamentosRede || []).filter(m => gruposIds.has(m.grupo_fluxo_id));
  if (mapeamentos.length === 0) {
    throw new Error('Nenhum plano de conta esta mapeado aos grupos desta mascara de fluxo. Configure em Parametros > Mapeamento Fluxo.');
  }
  const tipoPorConta = construirTipoPorConta(contasClassif);

  const fetchPeriodo = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const m = await carregarMovimentos(chaveApi, empresaCodigos, p);
    return { [p.key]: m };
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

  const aggAtual = agregarFluxoPorGrupo(dadosAtual, grupos, mapeamentos, tipoPorConta);
  const aggYoY = agregarFluxoPorGrupo(dadosYoY, grupos, mapeamentos, tipoPorConta);
  const aggQuarterAtual = agregarFluxoPorGrupo(quarterAtualPorMes, grupos, mapeamentos, tipoPorConta);
  const aggQuarterAnt = agregarFluxoPorGrupo(quarterAntPorMes, grupos, mapeamentos, tipoPorConta);

  const serieTendencia = periodos.tendencia6m.map(p => {
    const agg = agregarFluxoPorGrupo({ [p.key]: tendencia6mPorMes[p.key] }, grupos, mapeamentos, tipoPorConta);
    return {
      mes: p.label,
      entradas: agg.entradas_total,
      saidas: agg.saidas_total,
      variacao_caixa: agg.variacao_caixa,
    };
  });

  // Grupos com saidas crescentes vs YoY (top 5)
  const mapYoYGrupo = new Map(aggYoY.por_grupo.map(g => [g.grupoId, g]));
  const gruposSaidasCrescentes = aggAtual.por_grupo
    .map(g => {
      const yoy = mapYoYGrupo.get(g.grupoId) || { saidas: 0 };
      return {
        grupo: g.grupo,
        saidas_atual: g.saidas,
        saidas_yoy: yoy.saidas,
        variacao_pct: variacaoPct(g.saidas, yoy.saidas),
      };
    })
    .filter(g => g.saidas_atual > 0 && g.variacao_pct != null && g.variacao_pct > 20)
    .sort((a, b) => b.variacao_pct - a.variacao_pct)
    .slice(0, 5);

  // Concentracao: conta que sozinha responde por >30% das saidas
  const concentracaoRisco = aggAtual.top_contas_gerenciais
    .filter(c => c.saidas > 0 && aggAtual.saidas_total > 0 && (c.saidas / aggAtual.saidas_total) > 0.3)
    .map(c => ({
      conta: c.nome,
      pct_das_saidas: round((c.saidas / aggAtual.saidas_total) * 100, 2),
      valor: c.saidas,
    }));

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
      entradas_total: aggAtual.entradas_total,
      saidas_total: aggAtual.saidas_total,
      variacao_caixa: aggAtual.variacao_caixa,
      por_grupo: aggAtual.por_grupo,
      top_contas_gerenciais: aggAtual.top_contas_gerenciais,
      sem_plano: aggAtual.sem_plano,
    },
    comparativo_yoy: {
      label: periodos.yoy.label,
      entradas_total: aggYoY.entradas_total,
      saidas_total: aggYoY.saidas_total,
      variacao_caixa: aggYoY.variacao_caixa,
      variacao_entradas_pct: variacaoPct(aggAtual.entradas_total, aggYoY.entradas_total),
      variacao_saidas_pct: variacaoPct(aggAtual.saidas_total, aggYoY.saidas_total),
      variacao_caixa_abs: round(aggAtual.variacao_caixa - aggYoY.variacao_caixa),
    },
    comparativo_trimestre: {
      atual_label: periodos.quarterAtual.label,
      anterior_label: periodos.quarterAnterior.label,
      atual: {
        entradas: aggQuarterAtual.entradas_total,
        saidas: aggQuarterAtual.saidas_total,
        variacao_caixa: aggQuarterAtual.variacao_caixa,
      },
      anterior: {
        entradas: aggQuarterAnt.entradas_total,
        saidas: aggQuarterAnt.saidas_total,
        variacao_caixa: aggQuarterAnt.variacao_caixa,
      },
      variacao_caixa_pct: variacaoPct(aggQuarterAtual.variacao_caixa, aggQuarterAnt.variacao_caixa),
    },
    tendencia_6m: serieTendencia,
    alertas: {
      grupos_saidas_crescentes: gruposSaidasCrescentes,
      concentracao_risco: concentracaoRisco,
    },
  };
}

export async function gerarAnaliseFluxoIA(dados, apiKey) {
  const user = `Analise o Fluxo de Caixa deste posto (ou rede):\n\n${JSON.stringify(dados, null, 2)}`;
  return chamarClaudeAPI({
    apiKey,
    system: [{ type: 'text', text: SYSTEM_PROMPT }],
    user,
  });
}
