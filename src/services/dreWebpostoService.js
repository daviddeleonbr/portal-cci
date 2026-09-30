// Montagem da DRE Webposto — fonte única usada pela tela (RelatorioDRE) e pela
// Análise com IA (dreInsightsService), pra que as duas mostrem a MESMA DRE.
//
// Fonte: apuração oficial do Quality (/INTEGRACAO/DRE, já classificada na conta
// gerencial analítica) + vendas (VENDA_ITEM/VENDA, via mapeamento de vendas).
// Estrutura: máscara DRE do cliente (grupos_dre) + mapeamento de contas.

import { agregarVendasItens, TIPOS_VENDA } from './mapeamentoVendasService';

// Plano de contas gerencial → mapas de apoio:
//  - pcMap:     GRID → DESCRIÇÃO (fallback de "não mapeadas")
//  - pcHierMap: GRID → HIERARQUIA ("1.02.06")
//  - hgMap:     HIERARQUIA → GRID (ponte apuração → mapeamento), com e sem zeros à esquerda
export function montarMapasPlanoGerencial(planos) {
  const pcMap = new Map();
  const pcHierMap = new Map();
  const hgMap = new Map();
  (planos || []).forEach(p => {
    const cod = p.planoContaCodigo ?? p.planoContaGerencialCodigo ?? p.codigo;
    const desc = p.descricao || p.nome || '';
    const hier = p.hierarquia || '';
    if (cod != null) {
      if (desc) pcMap.set(String(cod), desc.trim());
      if (hier) {
        const h = String(hier).trim();
        pcHierMap.set(String(cod), h);
        hgMap.set(h, String(cod));
        hgMap.set(h.replace(/\b0+(\d)/g, '$1'), String(cod));
      }
    }
  });
  return { pcMap, pcHierMap, hgMap };
}

// Apuração do mês → lançamentos com _sinal. A apuração traz a conta pela
// HIERARQUIA ("2.03.18.002"); a máscara mapeia pelo GRID interno. Traduz
// hierarquia→grid pro match funcionar; se não achar, mantém a hierarquia
// (cai em "não mapeadas" com a descrição certa). Despesa vem positiva e é
// invertida (_sinal -1); receita _sinal +1.
export function lancamentosApuracaoWebposto(dados, hierarquiaGridMap) {
  const hierParaGrid = (h) => {
    const k = String(h || '').trim();
    return hierarquiaGridMap.get(k) ?? hierarquiaGridMap.get(k.replace(/\b0+(\d)/g, '$1')) ?? k;
  };
  const mapAp = (arr, sinal, tipo) => (arr || []).map((a, i) => ({
    planoContaGerencialCodigo:    hierParaGrid(a.conta_codigo),
    planoContaGerencialDescricao: a.conta_descricao,
    valor:         Math.abs(Number(a.valor || 0)),
    _sinal:        sinal,
    _tipo:         tipo,
    dataMovimento: a.data,
    descricao:     a.documento,
    numeroTitulo:  '',
    codigo:        `${tipo}-${a.conta_codigo}-${i}`,
    empresaCodigo: a.empresaCodigo,
  }));
  return [
    ...mapAp(dados?.apuracaoReceitas, 1, 'apuracao-receita'),
    ...mapAp(dados?.apuracaoDespesas, -1, 'apuracao-despesa'),
  ];
}

// ─── DRE do período (uma coluna = soma dos meses de `dadosPorMes`) ───
// Mesma regra da árvore da tela:
//  - conta mapeada soma no grupo (código com trim; conta mapeada em 2 grupos
//    soma nos dois); vendas pelo mapeamento de vendas (sinal de TIPOS_VENDA);
//  - grupo = próprio + filhos (parent_id, por ordem);
//  - subtotal/resultado RAIZ = acumulado das raízes anteriores;
//  - base do % = |primeira raiz não calculada|; resultado = ÚLTIMO 'resultado'.
// `filtroEmpresa` (opcional): só lançamentos/vendas dessa empresaCodigo.
export function montarDrePeriodoWebposto(dadosPorMes, { grupos, mapeamentos, mapeamentoVendas, produtosMap, gruposCatMap, hierarquiaGridMap, filtroEmpresa = null }) {
  const bateEmpresa = (x) => filtroEmpresa == null || Number(x.empresaCodigo) === Number(filtroEmpresa);

  // 1. Totais por código (apuração) e descrições das contas vistas
  const totaisPorCodigo = new Map();
  const descricoes = new Map();
  Object.values(dadosPorMes || {}).forEach(dados => {
    lancamentosApuracaoWebposto(dados, hierarquiaGridMap).forEach(t => {
      if (!bateEmpresa(t)) return;
      const codigo = String(t.planoContaGerencialCodigo || '').trim();
      if (!codigo) return;
      if (!descricoes.has(codigo) && t.planoContaGerencialDescricao) descricoes.set(codigo, String(t.planoContaGerencialDescricao).trim());
      totaisPorCodigo.set(codigo, (totaisPorCodigo.get(codigo) || 0) + Number(t.valor || 0) * t._sinal);
    });
  });

  // 2. Vendas por grupo (mapeamento de vendas da máscara)
  const vendasPorGrupo = new Map();
  const cfgPorTipo = new Map();
  (mapeamentoVendas || []).forEach(m => { if (m.grupo_dre_id) cfgPorTipo.set(m.tipo, m); });
  if (cfgPorTipo.size > 0) {
    Object.values(dadosPorMes || {}).forEach(dados => {
      const itens = (dados.vendaItens || []).filter(bateEmpresa);
      const vendasMap = new Map();
      (dados.vendas || []).filter(bateEmpresa).forEach(v => vendasMap.set(v.vendaCodigo || v.codigo, v));
      const totaisMes = agregarVendasItens(itens, vendasMap, produtosMap, gruposCatMap);
      Object.entries(totaisMes).forEach(([tipo, valor]) => {
        const cfg = cfgPorTipo.get(tipo);
        const tipoCfg = TIPOS_VENDA.find(t => t.id === tipo);
        if (!cfg || !tipoCfg) return;
        vendasPorGrupo.set(cfg.grupo_dre_id, (vendasPorGrupo.get(cfg.grupo_dre_id) || 0) + (Number(valor) || 0) * tipoCfg.sinal);
      });
    });
  }

  // 3. Árvore: próprio (contas + vendas) + filhos
  const valorProprio = new Map();
  (mapeamentos || []).forEach(m => {
    const v = totaisPorCodigo.get(String(m.plano_conta_codigo).trim()) || 0;
    valorProprio.set(m.grupo_dre_id, (valorProprio.get(m.grupo_dre_id) || 0) + v);
  });
  vendasPorGrupo.forEach((v, gid) => valorProprio.set(gid, (valorProprio.get(gid) || 0) + v));

  const porOrdem = (a, b) => (a.ordem || 0) - (b.ordem || 0);
  const valorNo = new Map();
  function calcNo(g) {
    const filhos = (grupos || []).filter(x => x.parent_id === g.id).sort(porOrdem);
    const v = (valorProprio.get(g.id) || 0) + filhos.reduce((s, f) => s + calcNo(f), 0);
    valorNo.set(g.id, v);
    return v;
  }
  const raizes = (grupos || []).filter(g => !g.parent_id).sort(porOrdem);
  raizes.forEach(calcNo);

  // 4. Subtotais/resultados raiz = acumulado das raízes anteriores
  let acum = 0;
  raizes.forEach(g => {
    if (g.tipo === 'subtotal' || g.tipo === 'resultado') valorNo.set(g.id, acum);
    else acum += valorNo.get(g.id) || 0;
  });

  // 5. Linhas na ordem de exibição (pai → filhos, pré-ordem)
  const linhas = [];
  function emitir(g, nivel) {
    linhas.push({
      grupoId: g.id,
      grupoNome: g.nome,
      tipo: g.tipo,
      parentId: g.parent_id || null,
      nivel,
      ordem: g.ordem || 0,
      valor: valorNo.get(g.id) || 0,
    });
    (grupos || []).filter(x => x.parent_id === g.id).sort(porOrdem).forEach(f => emitir(f, nivel + 1));
  }
  raizes.forEach(g => emitir(g, 0));

  const ehCalc = (g) => g.tipo === 'subtotal' || g.tipo === 'resultado';
  const primeiraBase = raizes.find(g => !ehCalc(g)) || null;
  const resultados = raizes.filter(g => g.tipo === 'resultado');
  const ultimoResultado = resultados[resultados.length - 1] || null;

  // Contas com valor que não estão mapeadas (ficam FORA da DRE, como na tela)
  const codigosMapeados = new Set((mapeamentos || []).map(m => String(m.plano_conta_codigo || '').trim()));
  const naoMapeadas = [...totaisPorCodigo.entries()]
    .filter(([cod, v]) => !codigosMapeados.has(cod) && Math.abs(v) > 0.005)
    .map(([cod, v]) => ({ codigo: cod, descricao: descricoes.get(cod) || '(sem descrição)', valor: v }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

  return {
    linhas,
    raizes: raizes.map(g => ({ grupoId: g.id, grupoNome: g.nome, tipo: g.tipo, valor: valorNo.get(g.id) || 0 })),
    base: primeiraBase ? { grupoId: primeiraBase.id, grupoNome: primeiraBase.nome, valor: Math.abs(valorNo.get(primeiraBase.id) || 0) } : null,
    resultado: ultimoResultado
      ? { grupoId: ultimoResultado.id, grupoNome: ultimoResultado.nome, valor: valorNo.get(ultimoResultado.id) || 0 }
      : { grupoId: null, grupoNome: 'Resultado', valor: raizes.filter(g => !ehCalc(g)).reduce((s, g) => s + (valorNo.get(g.id) || 0), 0) },
    naoMapeadas,
  };
}
