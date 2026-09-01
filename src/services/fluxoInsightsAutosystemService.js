// Fluxo de Caixa Insights com IA — variante AUTOSYSTEM.
// Espelha `agregarDadosFluxo` (webposto) mas troca a FONTE: em vez de
// MOVIMENTO_CONTA do Quality, usa os lançamentos do movto remoto onde uma
// conta caixa/banco aparece (buscarFluxoCaixaAutosystem). Cada lançamento é
// convertido no MESMO shape de "movimento" que o core espera
// (`{ contaCodigo, tipo:'Crédito'|'Débito', valor, planoContaGerencialCodigo,
//    planoContaGerencialNome }`), como faz o RelatorioFluxoCaixa.
// O payload retornado tem a MESMA forma que `agregarDadosFluxo`, então
// `gerarAnaliseFluxoIA(dados, apiKey)` (do fluxoInsightsService) consome sem mudança.

import * as mascaraFluxoService from './mascaraFluxoCaixaService';
import * as autosystemService from './autosystemService';
import { agregarFluxoPorGrupo } from './fluxoInsightsService';
import { calcularPeriodos, round, variacaoPct } from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararRede } from './anonimizarService';

// tipoPorConta a partir das contas caixa/banco da rede (todas tratadas 'caixa').
function construirTipoPorConta(contasCaixaBanco) {
  const mapa = new Map();
  (contasCaixaBanco || []).forEach(c => {
    mapa.set(Number(c.codigo), 'caixa');
  });
  return mapa;
}

// Converte os lançamentos do fluxo Autosystem no shape de movimento do core.
// Paridade com o branch Autosystem de RelatorioFluxoCaixa:
//   • conta caixa/banco (lado_caixa) → contaCodigo (o core filtra por ela);
//   • contraparte → planoContaGerencialCodigo (casa com o mapeamento de fluxo);
//     se a contraparte é conta-ponte 2.1.1.x, prefere a `resolvida`;
//   • sinal > 0 = Crédito (entrada), sinal < 0 = Débito (saída);
//   • transferência entre contas próprias (contraparte também caixa) → sem
//     plano (cai em sem_plano; ainda conta na variação, como no webposto).
function lancsParaMovimentos(lancs) {
  return (lancs || []).map(l => {
    const sinal = Number(l.sinal) || 0;
    const tipo = sinal > 0 ? 'Crédito' : 'Débito';
    const cpBruto = String(l.contraparte_codigo ?? '');
    const cpResolv = l.contraparte_resolvida_codigo != null ? String(l.contraparte_resolvida_codigo) : null;
    const ehTransferencia = !!l.contraparte_eh_caixa;
    const planoEfetivo = ehTransferencia ? null : (cpResolv || cpBruto);
    return {
      contaCodigo: l.lado_caixa === 'debito' ? String(l.debito_codigo ?? '') : String(l.credito_codigo ?? ''),
      planoContaGerencialCodigo: planoEfetivo,
      planoContaGerencialNome: l.contraparte_nome || (planoEfetivo ? `Conta ${planoEfetivo}` : 'Transferência'),
      tipo,
      valor: Math.abs(Number(l.valor || 0)),
    };
  });
}

// ─── Fetch de UM período (lançamentos de fluxo → movimentos) ──
async function carregarMovimentosPeriodo(redeId, empresaCodigos, contasCaixaBanco, { dataInicial, dataFinal }) {
  let lancs = [];
  try {
    const out = await autosystemService.buscarFluxoCaixaAutosystem(
      redeId, empresaCodigos,
      { data_de: dataInicial, data_ate: dataFinal, contas_caixa_banco: contasCaixaBanco },
    );
    lancs = out?.lancamentos || [];
  } catch {
    lancs = [];
  }
  return { movimentos: lancsParaMovimentos(lancs) };
}

// ─── Agregador principal para Fluxo (Autosystem) ────────────────
// params: { rede, empresaCodigos, mascaraFluxoId, mesRef, onProgress }
// Retorna payload IDÊNTICO em forma ao de `agregarDadosFluxo`.
export async function agregarDadosFluxoAutosystem({ rede, empresaCodigos, mascaraFluxoId, mesRef, onProgress }) {
  if (!rede?.id) throw new Error('Rede Autosystem inválida (sem id).');
  const redeId = rede.id;
  const codigos = (empresaCodigos || []).map(Number).filter(c => Number.isFinite(c));
  if (codigos.length === 0) throw new Error('Nenhuma empresa Autosystem informada.');

  const periodos = calcularPeriodos(mesRef);

  onProgress?.('Carregando máscara de fluxo, mapeamentos e contas caixa/banco...');
  const [grupos, contasManuais, contasCaixaBancoRaw] = await Promise.all([
    mascaraFluxoService.listarGrupos(mascaraFluxoId),
    mascaraFluxoService.listarContasManualPorRede(redeId, mascaraFluxoId).catch(() => []),
    autosystemService.listarContasCaixaBancoRede(redeId).catch(() => []),
  ]);
  if (!grupos?.length) throw new Error('Máscara de fluxo de caixa não tem grupos configurados');

  // Mapeamentos: contas manuais (conta_codigo) → grupo_fluxo_id. Adapta ao
  // formato que o core espera (plano_conta_codigo).
  const gruposIds = new Set(grupos.map(g => g.id));
  const mapeamentos = (contasManuais || [])
    .map(m => ({
      grupo_fluxo_id: m.grupo_fluxo_id,
      plano_conta_codigo: m.conta_codigo,
      plano_conta_descricao: m.conta_descricao,
      // Direção (partida dobrada): 'D'=só quando debitada (saída), 'C'=só quando
      // creditada (entrada), null=ambos. Roteia a mesma conta a grupos diferentes.
      lado: m.lado === 'D' || m.lado === 'C' ? m.lado : null,
    }))
    .filter(m => gruposIds.has(m.grupo_fluxo_id));
  if (mapeamentos.length === 0) {
    throw new Error('Nenhuma conta mapeada aos grupos desta máscara de fluxo (Autosystem). Configure em Parâmetros > Mapeamento Fluxo.');
  }

  const contasCaixaBanco = (contasCaixaBancoRaw || []).map(c => String(c.codigo));
  if (contasCaixaBanco.length === 0) {
    throw new Error('Nenhuma conta caixa/banco marcada para esta rede. Configure em Parâmetros > Autosystem > Fluxo.');
  }
  const tipoPorConta = construirTipoPorConta(contasCaixaBancoRaw);

  const fetchPeriodo = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const m = await carregarMovimentosPeriodo(redeId, codigos, contasCaixaBanco, p);
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

  // Grupos com saídas crescentes vs YoY (top 5)
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

  // Concentração: grupo da máscara que sozinho responde por >30% das saídas
  const concentracaoRisco = aggAtual.por_grupo
    .filter(g => g.saidas > 0 && aggAtual.saidas_total > 0 && (g.saidas / aggAtual.saidas_total) > 0.3)
    .map(g => ({
      conta: g.grupo,
      pct_das_saidas: round((g.saidas / aggAtual.saidas_total) * 100, 2),
      valor: g.saidas,
    }));

  return {
    empresa: {
      nome: demoAtivo() ? mascararRede(rede?.nome, rede?.id, true) : (rede?.nome || 'Rede'),
      cnpj: null,
      qtd_empresas: codigos.length,
    },
    periodo_atual: {
      label: periodos.atual.label,
      entradas_total: aggAtual.entradas_total,
      saidas_total: aggAtual.saidas_total,
      variacao_caixa: aggAtual.variacao_caixa,
      por_grupo: aggAtual.por_grupo,
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
