// Análise "controller" (Fase 4): investiga as causas da variação do caixa cruzando
// fluxo, DRE, transferências entre empresas, capital de giro e vendas do posto.
// 1. coleta (reaproveita os agregadores de Fluxo/DRE/Vendas e o motor do fluxo);
// 2. pacote de evidências determinístico (utils/analiseFinanceira/pacoteController);
// 3. IA interpreta citando os FATOS do pacote; 4. validação (ids e valores).
import * as fluxoIA from './fluxoInsightsService';
import * as fluxoAutoIA from './fluxoInsightsAutosystemService';
import * as contasIntercompanyService from './contasIntercompanyService';
import * as bpoContasReceberService from './bpoContasReceberService';
import * as bpoContasPagarService from './bpoContasPagarService';
import { chamarClaudeAPI, rangeMes } from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararEmpresa, mascararRede } from './anonimizarService';
import { montarFluxo } from '../utils/fluxoCaixa/motor';
import { analisarIntercompany, removerMovimentos } from '../utils/fluxoCaixa/intercompany';
import { detectarAnomalias } from '../utils/fluxoCaixa/anomalias';
import { montarPacoteController, validarRespostaController } from '../utils/analiseFinanceira/pacoteController';
import { isoDataBR } from '../utils/dataBR';

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ─── Coleta + pacote ──────────────────────────────────────────────
// ctx: { contexto (página de IA), isAutosystem, modoRede, chaveApiId, mascaraFluxoId, mesRef,
//        dadosDre (payload do agregador de DRE), dadosVendas (payload de Vendas, opcional), onProgress }
export async function montarPacote(ctx) {
  const { contexto, isAutosystem, modoRede, chaveApiId, mascaraFluxoId, mesRef, dadosDre = null, dadosVendas = null, onProgress } = ctx;
  if (!mascaraFluxoId) throw new Error('Selecione uma máscara de Fluxo de Caixa.');

  // 1) Fluxo: mês atual, 6 meses e mesmo mês do ano anterior (dados brutos)
  onProgress?.('Buscando o fluxo de caixa (mês atual, 6 meses e ano anterior)...');
  const fluxoPayload = isAutosystem
    ? await fluxoAutoIA.agregarDadosFluxoAutosystem({ rede: contexto.rede, empresaCodigos: contexto.empresaCodigos, mascaraFluxoId, mesRef, onProgress })
    : await fluxoIA.agregarDadosFluxo({ cliente: contexto.cliente, modoRede, chaveApi: contexto.chaveApi,
      chaveApiId: modoRede ? chaveApiId : contexto.cliente.chave_api_id, mascaraFluxoId, mesRef, onProgress });
  const bruto = fluxoPayload._bruto;
  if (!bruto) throw new Error('Não foi possível obter os dados do fluxo.');
  const { periodos } = bruto;
  const anterior = mesRef.mes === 1 ? rangeMes(mesRef.ano - 1, 12) : rangeMes(mesRef.ano, mesRef.mes - 1);
  const chaves = { atual: periodos.atual.key, anterior: anterior.key, anoAnterior: periodos.yoy.key };
  const meses6 = periodos.tendencia6m.map(p => p.key);
  const rotulos = Object.fromEntries([periodos.atual, periodos.yoy, ...periodos.tendencia6m, anterior].map(p => [p.key, p.label]));
  const todasChaves = [...new Set([chaves.atual, chaves.anterior, chaves.anoAnterior, ...meses6])];
  const meses = todasChaves.map(key => ({ key }));

  // 2) Transferências entre empresas (rede) + eliminação no consolidado
  const empresas = (contexto.empresas || []).map(e => ({ ...e, nome: e.nome || e.razao_social || e.fantasia }));
  let ic = null;
  let dadosPorMes = bruto.dadosPorMes;
  if (modoRede && empresas.length > 1) {
    onProgress?.('Casando transferências entre empresas...');
    const rede = isAutosystem ? { tipo: 'autosystem', id: contexto.rede?.id } : { tipo: 'webposto', id: chaveApiId };
    const contasIC = await contasIntercompanyService.listar(rede).catch(() => []);
    const movimentos = Object.values(dadosPorMes).flatMap(d => d.movimentos || []);
    const analise = analisarIntercompany({ movimentos, tipoPorConta: bruto.tipoPorConta, empresas,
      contasIntercompany: new Set(contasIC.map(c => String(c.codigo).trim())), visaoRede: true });
    const semEliminar = montarFluxo({ ...bruto, meses });
    dadosPorMes = removerMovimentos(dadosPorMes, analise.idsEliminaveis);
    const comEliminar = montarFluxo({ ...bruto, dadosPorMes, meses });
    const doMes = (p) => p.saida.data.slice(0, 7) === chaves.atual;
    ic = { ...analise, modo: 'rede', eliminado: analise.idsEliminaveis.size > 0,
      efeitoNaVariacao: r2((comEliminar.comCalculos.find(n => n.tipo === 'resultado')?.valoresPorMes?.[chaves.atual] ?? comEliminar.totalGeral)
        - (semEliminar.comCalculos.find(n => n.tipo === 'resultado')?.valoresPorMes?.[chaves.atual] ?? semEliminar.totalGeral)),
      // na rede, o que importa é o total casado e o efeito da eliminação (pares do mês atual)
      recebidoDoGrupo: null, enviadoAoGrupo: null, paresDoMes: analise.pares.filter(doMes).length };
  } else if (empresas.length > 0) {
    // Empresa sozinha: só os indícios (a outra ponta não está carregada)
    const movimentos = Object.values(dadosPorMes).flatMap(d => d.movimentos || []);
    const analise = analisarIntercompany({ movimentos, tipoPorConta: bruto.tipoPorConta, empresas, visaoRede: false });
    const doMesAtual = analise.soltas.filter(s => s.data.slice(0, 7) === chaves.atual);
    ic = { ...analise, modo: 'empresa', eliminado: false, efeitoNaVariacao: null,
      recebidoDoGrupo: r2(doMesAtual.filter(s => s.sinal > 0).reduce((s, x) => s + x.valor, 0)),
      enviadoAoGrupo: r2(doMesAtual.filter(s => s.sinal < 0).reduce((s, x) => s + x.valor, 0)) };
  }

  // 3) Motor do fluxo em todos os meses + pontos de atenção (últimos 3 meses)
  onProgress?.('Calculando o fluxo e os pontos de atenção...');
  const fluxo = montarFluxo({ ...bruto, dadosPorMes, meses });
  const ult3 = meses6.slice(-3).map(key => ({ key }));
  const fluxo3 = montarFluxo({ ...bruto, dadosPorMes, meses: ult3 });
  const movimentoBruto = Object.values(fluxo3.indice.lancamentosPorConta).reduce((s, l) => s + l.reduce((t, x) => t + x.valor, 0), 0);
  const anomalias = detectarAnomalias({ indice: fluxo3.indice, arvore: fluxo3.arvore, meses: ult3, semClassificacao: fluxo3.semClassificacao,
    intercompany: ic, movimentoBruto, nomeEmpresa: (c) => empresas.find(e => String(e.empresa_codigo) === String(c))?.nome || `Empresa ${c}` });

  // 4) DRE por mês (do payload do agregador de DRE: tendência de 6 meses + YoY)
  let dre = null;
  if (dadosDre) {
    const porMes = {};
    (dadosDre.tendencia_6m || []).forEach(t => {
      porMes[t.key] = {
        receitaBruta: t.receita_bruta ?? t.receita_liquida ?? 0,
        lucroBruto: t.lucro_bruto ?? t.subtotais?.[0]?.valor ?? null,
        resultado: t.lucro_liquido ?? 0,
      };
    });
    const kYoY = dadosDre.comparativo_yoy?.kpis;
    if (kYoY) porMes[chaves.anoAnterior] = { receitaBruta: kYoY.receita_bruta ?? kYoY.receita_liquida ?? 0, lucroBruto: kYoY.lucro_bruto ?? null, resultado: kYoY.lucro_liquido ?? 0 };
    dre = { porMes, linhasMaiorVariacao: dadosDre.linhas_com_maior_variacao || [], mascara: dadosDre.mascara_dre?.nome || null };
  }

  // 5) Contas a receber / a pagar em aberto HOJE (best-effort; não é saldo do fim do mês)
  let giro = null;
  try {
    onProgress?.('Buscando contas a receber e a pagar em aberto...');
    const tipo = isAutosystem ? 'autosystem' : 'webposto';
    const redeId = isAutosystem ? contexto.rede?.id : null;
    const emps = modoRede ? (contexto.empresas || []) : [contexto.cliente];
    const hoje = isoDataBR();
    const [rec, pag] = await Promise.all([
      bpoContasReceberService.buscarEmAberto({ tipo, empresas: emps, redeId }).catch(() => null),
      bpoContasPagarService.buscarTitulosErp({ tipo, empresas: emps, redeId }).catch(() => null),
    ]);
    const soma = (l, f = () => true) => r2((l || []).filter(f).reduce((s, t) => s + Math.abs(Number(t.valor || 0)), 0));
    const vencido = (t) => String(t.vencimentoEfetivo || t.vencimento || '') < hoje;
    if (rec?.titulos || pag?.titulos) {
      giro = {
        dataSaldo: hoje,
        contasReceber: rec?.titulos ? soma(rec.titulos) : null, contasReceberVencido: rec?.titulos ? soma(rec.titulos, vencido) : null,
        contasPagar: pag?.titulos ? soma(pag.titulos) : null, contasPagarVencido: pag?.titulos ? soma(pag.titulos, vencido) : null,
      };
    }
  } catch { giro = null; }

  // 6) Posto: combustíveis por produto (do payload de Vendas, se gerado)
  const posto = dadosVendas?.combustiveis_por_produto?.length ? {
    combustiveis: dadosVendas.combustiveis_por_produto,
    conveniencia: (dadosVendas.mix_por_categoria || []).find(c => c.categoria === 'conveniencia' && c.receita > 0) || null,
  } : null;

  const hoje = new Date();
  const mesEmAndamento = hoje.getFullYear() === mesRef.ano && hoje.getMonth() + 1 === mesRef.mes;
  const diasAtual = mesEmAndamento ? hoje.getDate() : new Date(mesRef.ano, mesRef.mes, 0).getDate();
  const nome = demoAtivo()
    ? (modoRede ? mascararRede(contexto.cliente?.nome, contexto.rede?.id || chaveApiId, true) : mascararEmpresa(contexto.cliente, true))
    : (contexto.cliente?.nome || contexto.rede?.nome || 'Empresa');
  return montarPacoteController({
    meta: { empresa: nome, modo: modoRede ? 'rede' : 'empresa', qtdEmpresas: modoRede ? empresas.length : 1, sistema: isAutosystem ? 'Autosystem' : 'Webposto',
      segmento: 'posto de combustível e conveniência', mesEmAndamento, diasAtual, diasAnterior: new Date(anterior.ano, anterior.mes, 0).getDate() },
    fluxo: { comCalculos: fluxo.comCalculos, chaves, meses6, rotulos },
    intercompany: ic, anomalias, dre, giro, posto,
  });
}

// ─── Prompt ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o controller financeiro (CFO) de um grupo de postos de combustível e lojas de conveniência. Analisa o caixa de UM período para o dono do negócio, que não é da área financeira.

Você recebe um PACOTE DE EVIDÊNCIAS com todos os números já calculados (fluxo de caixa por atividade, maiores variações por conta, transferências entre empresas, pontos de atenção, DRE, cruzamento DRE × caixa já diagnosticado por regra, capital de giro e combustíveis). Cada número citável está em "fatos" com um id (F1, F2…).

REGRAS INEGOCIÁVEIS
1. NÃO calcule totais novos nem invente números. Todo valor em R$ que você escrever tem que estar em "fatos" (mesmo valor). Cite os ids em "evidencias" de cada item.
2. Separe sempre: "comprovado" (os números mostram), "provavel" (há evidência de apoio), "hipotese" (falta dado — diga qual e como confirmar), "insuficiente".
3. Investigue POR QUE mudou, em camadas: qual grupo/conta mudou → quais lançamentos/pessoas explicam → a DRE/vendas confirmam? → é pontual ou recorrente (6 meses)? → causa mais provável → consequência → o que fazer.
4. Lucro (DRE, competência) NÃO é caixa. Pagamento menor não é economia se o custo não caiu (pode ser estoque consumido ou pagamento adiado). Recebimento maior pode ser antecipação ou venda antiga.
5. Transferências entre empresas: na visão da rede, as casadas já foram eliminadas (veja transferenciasEntreEmpresas). Na empresa sozinha, aponte se a melhora do caixa veio de dinheiro de outras empresas do grupo.
6. Mês em andamento ("mesEmAndamento": true): compare com cuidado — o mês tem menos dias (diasAtual × diasAnterior).
7. Não acuse fraude nem erro: aponte o indício, o valor e o que conferir. Não reclassifique nada.
8. Recomendações sempre ligadas a um problema dos dados (nada genérico como "reduzir custos"). Cenários de recuperação: deixe as premissas explícitas e use como base um fato do pacote; é projeção, não resultado.
9. Linguagem simples, frases curtas, português do Brasil. Diga "sobrou/faltou dinheiro", não "fluxo positivo".
10. Se faltar dado (veja "dadosAusentes"), diga o que falta em vez de concluir.

RESPONDA SÓ COM ESTE JSON (sem markdown):
{
  "resumo_executivo": {
    "situacao": "saudavel" | "alerta" | "critico",
    "variacao_caixa": "1 frase: quanto sobrou/faltou e vs mês anterior",
    "fator_positivo": {"texto": "...", "evidencias": ["F.."]},
    "fator_negativo": {"texto": "...", "evidencias": ["F.."]},
    "principal_risco": {"texto": "...", "evidencias": ["F.."]},
    "conclusao": "2-3 frases para o dono entender a situação em 1 minuto"
  },
  "geracao_caixa": {
    "operacional": {"texto": "...", "evidencias": []},
    "investimento": {"texto": "...", "evidencias": []},
    "financiamento": {"texto": "...", "evidencias": []},
    "dependencia_externa": {"texto": "depende de empréstimo, sócios ou outras empresas do grupo?", "grau": "comprovado|provavel|hipotese|insuficiente", "evidencias": []}
  },
  "investigacao_variacoes": [
    {"conta": "nome da conta/grupo do pacote", "explicacao": "por que mudou (camadas 2 a 5)", "recorrencia": "pontual|recorrente|indefinido", "consequencia": "...", "grau": "comprovado|provavel|hipotese|insuficiente", "evidencias": ["F.."]}
  ],
  "cruzamento_dre": [{"titulo": "...", "texto": "o que a DRE revela sobre o caixa; lucro × caixa", "grau": "...", "evidencias": []}],
  "anomalias": [{"titulo": "...", "texto": "indício e por que importa", "conferir": "o que checar", "evidencias": []}],
  "capital_giro": {"avaliacao": "...", "evidencias": [], "dados_ausentes": ["..."]},
  "diagnostico": {
    "comprovadas": [{"texto": "...", "evidencias": []}],
    "provaveis": [{"texto": "...", "evidencias": []}],
    "hipoteses": [{"texto": "...", "como_confirmar": "..."}]
  },
  "plano_acao": {
    "situacao_critica": true | false,
    "diagnostico_situacao": "só se crítica: problema e origem",
    "imediatas_0_7_dias": [{"acao": "...", "por_que": "...", "evidencias": []}],
    "curto_prazo_8_30_dias": [{"acao": "...", "por_que": "...", "evidencias": []}],
    "estruturais_31_90_dias": [{"acao": "...", "por_que": "...", "evidencias": []}],
    "cenarios": [{"nome": "conservador|moderado|acelerado", "premissas": "...", "efeito_no_caixa": "texto com a base citada", "evidencias": []}],
    "indicadores_acompanhamento": [{"indicador": "...", "referencia": "valor de hoje (fato) e o que buscar"}]
  },
  "conclusao": {
    "melhorou_ou_piorou": "...", "o_que_provocou": "...", "risco_principal": "...", "investigar_agora": "...", "maior_impacto_positivo": "..."
  }
}
Máximo: 6 itens em investigacao_variacoes, 5 em anomalias, 3 ações por prazo. Cenários só se situacao_critica = true.`;

export async function gerarAnaliseController(pacote) {
  const user = `Pacote de evidências (${pacote.meta.empresa} · ${pacote.meta.periodos.atual}):\n${JSON.stringify(pacote)}`;
  let r;
  try {
    r = await chamarClaudeAPI({ system: SYSTEM_PROMPT, user });
  } catch (e) {
    // JSON inválido: tenta uma vez de novo pedindo só o JSON
    if (e.code !== 'INVALID_JSON') throw e;
    r = await chamarClaudeAPI({ system: SYSTEM_PROMPT, user: `${user}\n\nATENÇÃO: responda SOMENTE o objeto JSON, completo e válido.` });
  }
  const { insights, problemas } = validarRespostaController(r.insights, pacote);
  return { insights: { ...insights, _validacao: { problemas, verificadoEm: new Date().toISOString() } }, usage: r.usage };
}
