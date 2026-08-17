// DRE Insights com IA — variante AUTOSYSTEM.
// Espelha `agregarDadosDRE` (webposto) mas troca a FONTE de dados: em vez de
// títulos/vendas do Quality, monta a DRE a partir do banco remoto Autosystem:
//   • lançamentos do movto (contas mapeadas em mapeamento_manual_contas) →
//     convertidos em titulosReceber/titulosPagar (igual ao RelatorioDRE);
//   • vendas agregadas por categoria de grupo de produto → mapeadas em
//     grupos DRE via mapeamento_vendas_autosystem (venda = +receita, custo = −CMV).
// O payload retornado tem a MESMA forma que `agregarDadosDRE`, então
// `gerarAnaliseDREIA(dados, apiKey)` (do dreInsightsService) consome sem mudança.

import * as mascaraDreService from './mascaraDreService';
import * as manualService from './mapeamentoManualService';
import * as vendasAutosystemMapService from './mapeamentoVendasAutosystemService';
import * as autosystemService from './autosystemService';
import { agregarDrePorGrupo } from './dreInsightsService';
import { calcularPeriodos, round, variacaoPct } from './iaSharedHelpers';
import { getAtivo as demoAtivo, mascararRede } from './anonimizarService';

// ─── Converte um lançamento Autosystem em "título" (paridade RelatorioDRE) ──
// O agregador só lê `planoContaGerencialCodigo`, `valor` e `empresaCodigo`
// (este último pra recorte por empresa) — mantemos o mínimo.
function lancToTitulo(l, codigo) {
  return {
    planoContaGerencialCodigo: codigo,
    empresaCodigo: l.empresa,
    valor: Number(l.valor || 0),
  };
}

// ─── Fetch de UM período (vendas agregadas + lançamentos das contas mapeadas) ──
// Retorna { titulosReceber, titulosPagar, vendasPorCategoria } onde
// vendasPorCategoria = { [categoria]: { [empresaCodigo]: { venda, custo } } }.
// A granularidade por empresa é preservada só pra aba "Por Empresa".
async function carregarDadosPeriodoAutosystem(
  redeId, empresaCodigos, contasCodigosMapeados, categoriasGruposProduto,
  { dataInicial, dataFinal },
) {
  let vendas = [], lancs = [];
  try {
    [vendas, lancs] = await Promise.all([
      autosystemService.buscarVendasAutosystem(
        redeId, empresaCodigos,
        { data_de: dataInicial, data_ate: dataFinal, agregado: true },
      ).catch(() => []),
      contasCodigosMapeados.length > 0
        ? autosystemService.buscarLancamentosAutosystem(
            redeId, empresaCodigos,
            { data_de: dataInicial, data_ate: dataFinal, contas_codigos: contasCodigosMapeados },
          ).catch(() => [])
        : Promise.resolve([]),
    ]);
  } catch {
    vendas = []; lancs = [];
  }

  // Vendas → { categoria: { empresaCodigo: { venda, custo } } }. Itens cujo
  // grupo de produto não está categorizado em as_rede_grupo_produto são ignorados.
  const vendasPorCategoria = {};
  (vendas || []).forEach(v => {
    const gp = Number(v.grupo_produto_codigo ?? 0);
    const categoria = categoriasGruposProduto.get(gp);
    if (!categoria) return;
    const ec = String(v.empresa ?? '');
    if (!vendasPorCategoria[categoria]) vendasPorCategoria[categoria] = {};
    if (!vendasPorCategoria[categoria][ec]) vendasPorCategoria[categoria][ec] = { venda: 0, custo: 0 };
    vendasPorCategoria[categoria][ec].venda += Number(v.valor || 0);
    vendasPorCategoria[categoria][ec].custo += Number(v.valor_custo || 0);
  });

  // Lançamentos → titulosReceber (crédito, +) / titulosPagar (débito, −).
  const titulosReceber = [], titulosPagar = [];
  (lancs || []).forEach(l => {
    const cred = String(l.credito_codigo ?? '');
    const deb = String(l.debito_codigo ?? '');
    if ((l.lado === 'credito' || l.lado === 'ambos') && cred) titulosReceber.push(lancToTitulo(l, cred));
    if ((l.lado === 'debito' || l.lado === 'ambos') && deb) titulosPagar.push(lancToTitulo(l, deb));
  });

  return { titulosReceber, titulosPagar, vendasPorCategoria };
}

// ─── Vendas/CMV por grupo DRE (a partir de vendasPorCategoria + mapeamento) ──
// Espelha `indexarVendasAutosystemPorGrupoDRE` do RelatorioDRE: para cada
// mapeamento (categoria, tipo) soma venda(+) ou custo(−) no grupo_dre_id.
// `empresaFilter` (opcional): quando setado, considera só aquela empresa.
function calcularVendasPorGrupoExtra(vendasPorCategoria, mapVendas, empresaFilter = null) {
  const out = new Map();
  (mapVendas || []).forEach(m => {
    const gid = m.grupo_dre_id;
    if (!gid) return;
    const sinal = m.tipo === 'custo' ? -1 : 1;
    const porEmp = vendasPorCategoria?.[m.categoria] || {};
    let val = 0;
    Object.entries(porEmp).forEach(([ec, x]) => {
      if (empresaFilter != null && Number(ec) !== empresaFilter) return;
      val += m.tipo === 'custo' ? Number(x?.custo || 0) : Number(x?.venda || 0);
    });
    out.set(gid, (out.get(gid) || 0) + val * sinal);
  });
  return out;
}

// ─── Agregador principal para DRE (Autosystem) ─────────────────
// params: { rede, empresaCodigos, mascaraId, mesRef, onProgress, empresas? }
//   - rede: linha as_rede ({ id, nome, ... })
//   - empresaCodigos: number[] (grids das empresas da rede)
//   - empresas (opcional): [{ empresa_codigo, nome/fantasia }] só p/ nomear a
//     aba "Por Empresa"; se ausente, cai em "Empresa #<codigo>".
// Retorna payload IDÊNTICO em forma ao de `agregarDadosDRE`.
export async function agregarDadosDREAutosystem({ rede, empresaCodigos, mascaraId, mesRef, onProgress, empresas = [] }) {
  if (!rede?.id) throw new Error('Rede Autosystem inválida (sem id).');
  const redeId = rede.id;
  const codigos = (empresaCodigos || []).map(Number).filter(c => Number.isFinite(c));
  if (codigos.length === 0) throw new Error('Nenhuma empresa Autosystem informada.');

  const periodos = calcularPeriodos(mesRef);

  // Máscara + grupos + mapeamentos (contas manuais por rede) + mapeamento de
  // vendas/custo por categoria + categorização dos grupos de produto.
  onProgress?.('Carregando máscara DRE, mapeamentos e categorias...');
  const [todasMascaras, grupos, contasRede, mapVendasRede, gruposProd] = await Promise.all([
    mascaraDreService.listarMascaras().catch(() => []),
    mascaraDreService.listarGrupos(mascaraId),
    manualService.listarContasPorRede(redeId, mascaraId).catch(() => []),
    vendasAutosystemMapService.listarMapeamentos(redeId, mascaraId).catch(() => []),
    autosystemService.listarGruposProdutoRede(redeId).catch(() => []),
  ]);
  const mascaraInfo = (todasMascaras || []).find(m => m.id === mascaraId) || null;
  if (!grupos?.length) throw new Error('Máscara DRE não tem grupos configurados');

  const gruposIds = new Set(grupos.map(g => g.id));
  // Adapta as contas manuais ao formato que `agregarDrePorGrupo` espera.
  const mapeamentos = (contasRede || [])
    .map(c => ({
      grupo_dre_id: c.grupo_dre_id,
      plano_conta_codigo: c.conta_codigo || c.id,
      plano_conta_descricao: c.conta_descricao,
      plano_conta_natureza: c.conta_natureza,
    }))
    .filter(m => gruposIds.has(m.grupo_dre_id));
  const mapVendas = (mapVendasRede || []).filter(m => m.grupo_dre_id && gruposIds.has(m.grupo_dre_id));
  if (mapeamentos.length === 0 && mapVendas.length === 0) {
    throw new Error('Nenhuma conta nem mapeamento de vendas configurado para esta máscara DRE (Autosystem). Configure em Parâmetros.');
  }

  // Categorização grupo_produto → categoria (grid tem prioridade; codigo é fallback).
  const categoriasGruposProduto = new Map();
  (gruposProd || []).forEach(g => {
    if (!g.categoria) return;
    if (g.grid != null) categoriasGruposProduto.set(Number(g.grid), g.categoria);
    if (g.codigo != null && !categoriasGruposProduto.has(Number(g.codigo))) {
      categoriasGruposProduto.set(Number(g.codigo), g.categoria);
    }
  });

  // Códigos das contas mapeadas (únicos, não vazios).
  const contasCodigosMapeados = Array.from(new Set(
    mapeamentos.map(m => String(m.plano_conta_codigo || '').trim()).filter(c => c.length > 0),
  ));

  // ─ Fetch de cada período (atual, yoy, 6 meses da tendência) ─
  const fetchPeriodo = async (p, label) => {
    onProgress?.(`Buscando ${label}...`);
    const dados = await carregarDadosPeriodoAutosystem(
      redeId, codigos, contasCodigosMapeados, categoriasGruposProduto, p,
    );
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

  // ─ Wrapper: roda o agregador agnóstico injetando vendasPorGrupoExtra ─
  // dadosPorPeriodo = { key: { titulosReceber, titulosPagar, vendasPorCategoria } }
  // empresaFilter (opcional): recorta títulos + vendas por empresa.
  function aggAS(dadosPorPeriodo, empresaFilter = null) {
    const dm = {};
    const vendasExtra = new Map();
    Object.entries(dadosPorPeriodo || {}).forEach(([k, v]) => {
      dm[k] = {
        titulosReceber: empresaFilter == null
          ? (v.titulosReceber || [])
          : (v.titulosReceber || []).filter(x => Number(x.empresaCodigo) === empresaFilter),
        titulosPagar: empresaFilter == null
          ? (v.titulosPagar || [])
          : (v.titulosPagar || []).filter(x => Number(x.empresaCodigo) === empresaFilter),
      };
      const parcial = calcularVendasPorGrupoExtra(v.vendasPorCategoria, mapVendas, empresaFilter);
      parcial.forEach((val, gid) => vendasExtra.set(gid, (vendasExtra.get(gid) || 0) + val));
    });
    return agregarDrePorGrupo(dm, grupos, mapeamentos, { vendasPorGrupoExtra: vendasExtra });
  }

  const aggAtual = aggAS(dadosAtual);
  const aggYoY = aggAS(dadosYoY);
  const aggQuarterAtual = aggAS(quarterAtualPorMes);
  const aggQuarterAnt = aggAS(quarterAntPorMes);

  const serieTendencia = periodos.tendencia6m.map(p => {
    const agg = aggAS({ [p.key]: tendencia6mPorMes[p.key] });
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

  // Linhas com maior variação YoY (top 8 por |variação|)
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

  // Estrutura hierárquica da máscara (a IA usa SOMENTE estes nomes).
  const gruposOrdenadosArr = (grupos || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const estruturaDre = gruposOrdenadosArr.map(g => ({
    id: g.id,
    nome: g.nome,
    tipo: g.tipo,
    parent_id: g.parent_id || null,
    ordem: g.ordem || 0,
  }));

  // Cada linha do período atual enriquecida com o valor no MESMO grupo YoY.
  const mapYoYTodas = new Map(aggYoY.linhas.map(l => [l.grupoId, l.valor]));
  const linhasComYoY = aggAtual.linhas.map(l => ({
    ...l,
    valor_yoy: mapYoYTodas.get(l.grupoId) || 0,
  }));

  // Resultado POR EMPRESA (só com múltiplas empresas). Recorta o período atual
  // (e o YoY) por empresaCodigo e roda o mesmo agregador.
  const nomePorCodigo = new Map(
    (empresas || []).map(e => [Number(e.empresa_codigo), e.fantasia || e.nome || null]),
  );
  const porEmpresa = codigos.length > 1
    ? codigos.map(ec => {
        const aggEmp = aggAS(dadosAtual, ec);
        const aggEmpYoY = aggAS(dadosYoY, ec);
        return {
          empresa_codigo: ec,
          nome: nomePorCodigo.get(ec) || `Empresa #${ec}`,
          kpis: aggEmp.kpis,
          kpis_yoy: aggEmpYoY.kpis,
          linhas_resumo: aggEmp.linhas
            .filter(l => l.tipo !== 'subtotal' && l.tipo !== 'resultado' && !l.parentId)
            .map(l => ({ grupoNome: l.grupoNome, valor: l.valor })),
        };
      })
    : [];

  return {
    empresa: {
      nome: demoAtivo() ? mascararRede(rede?.nome, rede?.id, true) : (rede?.nome || 'Rede'),
      cnpj: null,
      qtd_empresas: codigos.length,
    },
    mascara_dre: {
      nome: mascaraInfo?.nome || 'Padrão',
      estrutura: estruturaDre,
    },
    base_receita_para_pct: round(
      Math.max(
        aggAtual.kpis.receita_bruta || 0,
        aggAtual.linhas
          .filter(l => l.tipo === 'base' && !l.parentId && l.valor > 0)
          .reduce((s, l) => s + l.valor, 0),
      ),
    ),
    periodo_atual: {
      label: periodos.atual.label,
      kpis: aggAtual.kpis,
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
    por_empresa: porEmpresa,
  };
}
