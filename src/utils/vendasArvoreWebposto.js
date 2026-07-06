// Agregador de vendas Webposto → estrutura "arvore" compatível com os
// componentes ricos da página de Vendas (KpiLucro, TabelaPostoCategoria,
// TreeRealizadoDia, etc).
//
// Diferença pro Autosystem: o autosystem tem mapeamento de grupos por
// rede (admin classifica grupos). O Webposto usa auto-classificação a
// partir de `produto.tipoProduto`/`produto.combustivel` e `grupo.tipoGrupo`
// (via `classificarItem` em mapeamentoVendasService.js).
//
// Estrutura final:
//   arvore: [
//     {
//       empresa_codigo, nome,
//       stats: { qtd: {atual,ma,aa}, fat: {atual,ma,aa}, lucro: {atual,ma,aa} },
//       categorias: [
//         {
//           categoria: {key, label, icone, cor},
//           stats: { ... },
//           grupos: [
//             {
//               codigo, nome,
//               stats: { ... },
//               produtos: [
//                 { codigo, nome,
//                   qtd:   {atual,ma,aa},
//                   fat:   {atual,ma,aa},
//                   lucro: {atual,ma,aa},
//                   acresc: number, desc: number,
//                 }
//               ]
//             }
//           ]
//         }
//       ]
//     }
//   ]

import { Fuel, Package, Store, MoreHorizontal } from 'lucide-react';
import { classificarItem } from '../services/mapeamentoVendasService';

// Mesmo padrão de CATEGORIAS do autosystem — chaves canônicas.
export const CATEGORIAS = [
  { key: 'combustivel',   label: 'Combustíveis',  icone: Fuel,             cor: 'amber'   },
  { key: 'automotivos',   label: 'Automotivos',   icone: Package,          cor: 'blue'    },
  { key: 'conveniencia',  label: 'Conveniência',  icone: Store,            cor: 'emerald' },
  { key: 'sem_categoria', label: 'Sem categoria', icone: MoreHorizontal,   cor: 'gray'    },
];

const MAP_CAT = new Map(CATEGORIAS.map(c => [c.key, c]));

function novoStats() {
  return {
    qtd:   { atual: 0, ma: 0, aa: 0 },
    fat:   { atual: 0, ma: 0, aa: 0 },
    lucro: { atual: 0, ma: 0, aa: 0 },
  };
}

function acumStats(s, a, m, an) {
  s.qtd.atual += a.qtd;     s.qtd.ma += m.qtd;     s.qtd.aa += an.qtd;
  s.fat.atual += a.valor;   s.fat.ma += m.valor;   s.fat.aa += an.valor;
  s.lucro.atual += (a.valor - a.custo);
  s.lucro.ma    += (m.valor - m.custo);
  s.lucro.aa    += (an.valor - an.custo);
}

// Chave composta empresa+venda — vendaCodigo NÃO é único entre empresas,
// então em ambientes multi-empresa precisamos diferenciar.
function chaveVenda(empresaCodigo, vendaCodigo) {
  return `${empresaCodigo}:${vendaCodigo}`;
}

// Indexa vendaItens por (empresaCodigo, produtoCodigo) somando totais por
// venda válida (cancelada='N'). vendaItens vêm com `vendaCodigo`; pegamos
// a venda em `vendasMap` pra checar cancelamento.
function indexarItens(itens, vendasMap, empresaCodigo) {
  const idx = new Map(); // produtoCodigo → { qtd, valor, custo, acresc, desc, vendas: Set }
  (itens || []).forEach(item => {
    const venda = vendasMap?.get(chaveVenda(empresaCodigo, item.vendaCodigo));
    if (!venda || venda.cancelada !== 'N') return;
    const k = item.produtoCodigo;
    let cur = idx.get(k);
    if (!cur) {
      cur = { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0, vendas: new Set() };
      idx.set(k, cur);
    }
    cur.qtd    += Number(item.quantidade)     || 0;
    cur.valor  += Number(item.totalVenda)     || 0;
    cur.custo  += Number(item.totalCusto)     || 0;
    cur.acresc += Number(item.totalAcrescimo) || 0;
    cur.desc   += Number(item.totalDesconto)  || 0;
    cur.vendas.add(item.vendaCodigo);
  });
  return idx;
}

// Constrói a árvore Empresa→Categoria→Grupo→Produto a partir dos 3
// períodos (atual, mes anterior, ano anterior). Cada item tem
// `empresaCodigo` opcional — se não veio, usa o `empresaPadrao` (caso
// único-empresa).
//
// Params:
//   periodos: { atual: {itens, vendas}, mesAnterior: {...}, anoAnterior: {...} }
//   produtosMap: Map<produtoCodigo, produto>
//   gruposMap:   Map<grupoCodigo, grupo>
//   mapaEmpresas: Map<empresaCodigo, nome>  (opcional)
//   empresaPadrao: { codigo, nome }
export function construirArvoreWebposto({
  periodos, produtosMap, gruposMap, mapaEmpresas = new Map(), empresaPadrao,
}) {
  // 1) Indexa vendas por chave composta (empresa:vendaCodigo) — vendaCodigo
  // sozinho colide entre empresas (cada empresa tem seu próprio range).
  const buildVendasMap = (vendas) => {
    const m = new Map();
    (vendas || []).forEach(v => {
      const ec = v.empresaCodigo ?? empresaPadrao?.codigo ?? 0;
      m.set(chaveVenda(ec, v.vendaCodigo ?? v.codigo), v);
    });
    return m;
  };
  const vMapAtual = buildVendasMap(periodos.atual?.vendas);
  const vMapMA    = buildVendasMap(periodos.mesAnterior?.vendas);
  const vMapAA    = buildVendasMap(periodos.anoAnterior?.vendas);

  // 2) Pra cada período, indexa itens por (empresa, produto).
  // O `item.empresaCodigo` precisa estar anotado (feito no fetch híbrido
  // do front, em ambos modos: leitura do cache + da API Quality).
  const indexarPorEmpresa = (itens, vendasMap) => {
    const porEmp = new Map();
    (itens || []).forEach(item => {
      const ec = item.empresaCodigo ?? empresaPadrao?.codigo ?? 0;
      const venda = vendasMap.get(chaveVenda(ec, item.vendaCodigo));
      if (!venda || venda.cancelada !== 'N') return;
      let arr = porEmp.get(ec);
      if (!arr) { arr = []; porEmp.set(ec, arr); }
      arr.push(item);
    });
    // Indexa cada empresa
    const out = new Map(); // ec → Map<produtoCodigo, totais>
    porEmp.forEach((arr, ec) => {
      out.set(ec, indexarItens(arr, vendasMap, ec));
    });
    return out;
  };

  const idxAtual = indexarPorEmpresa(periodos.atual?.itens, vMapAtual);
  const idxMA    = indexarPorEmpresa(periodos.mesAnterior?.itens, vMapMA);
  const idxAA    = indexarPorEmpresa(periodos.anoAnterior?.itens, vMapAA);

  // 3) Conjunto de empresas + produtos
  const empresas = new Set([
    ...idxAtual.keys(), ...idxMA.keys(), ...idxAA.keys(),
  ]);
  if (empresas.size === 0 && empresaPadrao) empresas.add(empresaPadrao.codigo);

  const arvore = [];

  empresas.forEach(ec => {
    const empNode = {
      empresa_codigo: ec,
      nome: mapaEmpresas.get(ec) || empresaPadrao?.nome || `Empresa ${ec}`,
      stats: novoStats(),
      categorias: new Map(), // catKey → { categoria, stats, grupos: Map<grupoCodigo, {codigo,nome,stats,produtos:[]}> }
    };

    const mAtual = idxAtual.get(ec) || new Map();
    const mMA    = idxMA.get(ec)    || new Map();
    const mAA    = idxAA.get(ec)    || new Map();
    const todosProdutos = new Set([...mAtual.keys(), ...mMA.keys(), ...mAA.keys()]);

    todosProdutos.forEach(pCodigo => {
      const a  = mAtual.get(pCodigo) || { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 };
      const m  = mMA.get(pCodigo)    || { qtd: 0, valor: 0, custo: 0 };
      const an = mAA.get(pCodigo)    || { qtd: 0, valor: 0, custo: 0 };
      // Mesmo se atual=0 mas tem ma/aa, ainda vale mostrar (comparação)
      if (a.valor === 0 && m.valor === 0 && an.valor === 0 && a.qtd === 0) return;

      const produto = produtosMap?.get(pCodigo);
      const grupo   = produto ? gruposMap?.get(produto.grupoCodigo) : null;

      const catKey = classificarItem(
        { produtoCodigo: pCodigo },
        produtosMap || new Map(),
        gruposMap   || new Map(),
      );
      const catKeyResolvida = MAP_CAT.has(catKey) ? catKey : (catKey === 'outros' ? 'automotivos' : 'sem_categoria');
      const catObj = MAP_CAT.get(catKeyResolvida);

      if (!empNode.categorias.has(catKeyResolvida)) {
        empNode.categorias.set(catKeyResolvida, {
          categoria: catObj,
          stats: novoStats(),
          grupos: new Map(),
        });
      }
      const catNode = empNode.categorias.get(catKeyResolvida);

      acumStats(empNode.stats, a, m, an);
      acumStats(catNode.stats, a, m, an);

      const gCodigo = produto?.grupoCodigo ?? -1;
      const gNome   = grupo?.nome || grupo?.descricao || produto?.nome || 'Sem grupo';
      const gKey    = String(gCodigo);
      if (!catNode.grupos.has(gKey)) {
        catNode.grupos.set(gKey, {
          codigo: gCodigo,
          nome:   gNome,
          stats:  novoStats(),
          produtos: [],
        });
      }
      const gNode = catNode.grupos.get(gKey);
      acumStats(gNode.stats, a, m, an);

      gNode.produtos.push({
        codigo: pCodigo,
        nome:   produto?.nome || produto?.descricao || `#${pCodigo}`,
        qtd:    { atual: a.qtd,   ma: m.qtd,   aa: an.qtd },
        fat:    { atual: a.valor, ma: m.valor, aa: an.valor },
        lucro: {
          atual: a.valor  - a.custo,
          ma:    m.valor  - m.custo,
          aa:    an.valor - an.custo,
        },
        acresc: a.acresc || 0,
        desc:   a.desc   || 0,
      });
    });

    // Converte Maps em arrays ordenados
    const cats = [];
    CATEGORIAS.forEach(c => {
      const cn = empNode.categorias.get(c.key);
      if (!cn) return;
      const grupos = Array.from(cn.grupos.values())
        .sort((a, b) => b.stats.fat.atual - a.stats.fat.atual);
      grupos.forEach(g => g.produtos.sort((a, b) => b.fat.atual - a.fat.atual));
      cats.push({ ...cn, grupos });
    });
    arvore.push({ ...empNode, categorias: cats });
  });

  return arvore.sort((a, b) => b.stats.fat.atual - a.stats.fat.atual);
}

// Totais gerais agregados (sem hierarquia) — usados nos KPIs do topo.
export function totalizarArvore(arvore) {
  const out = {
    totalQtd:   0,
    totalValor: 0,
    totalLucro: 0,
    porCat: {},  // catKey → { qtd, valor, custo, lucro, itens }
  };
  CATEGORIAS.forEach(c => {
    out.porCat[c.key] = { qtd: 0, valor: 0, custo: 0, lucro: 0, itens: 0 };
  });
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      const k = cat.categoria.key;
      const e = out.porCat[k];
      if (!e) return;
      e.qtd   += cat.stats.qtd.atual;
      e.valor += cat.stats.fat.atual;
      e.lucro += cat.stats.lucro.atual;
      e.custo += (cat.stats.fat.atual - cat.stats.lucro.atual);
      (cat.grupos || []).forEach(g => { e.itens += g.produtos.length; });
    });
    out.totalQtd   += emp.stats.qtd.atual;
    out.totalValor += emp.stats.fat.atual;
    out.totalLucro += emp.stats.lucro.atual;
  });
  return out;
}

// Versão totalizada do "mes anterior" (ma) — mesmas chaves, lendo do .ma
export function totalizarArvoreMA(arvore) {
  const out = { totalValor: 0, totalLucro: 0, porCat: {} };
  CATEGORIAS.forEach(c => { out.porCat[c.key] = { qtd: 0, valor: 0, custo: 0, lucro: 0 }; });
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      const e = out.porCat[cat.categoria.key];
      if (!e) return;
      e.qtd   += cat.stats.qtd.ma;
      e.valor += cat.stats.fat.ma;
      e.lucro += cat.stats.lucro.ma;
      e.custo += (cat.stats.fat.ma - cat.stats.lucro.ma);
    });
    out.totalValor += emp.stats.fat.ma;
    out.totalLucro += emp.stats.lucro.ma;
  });
  return out;
}

// ─── Construção da árvore a partir do RPC server-side ──────────
//
// Em vez de receber arrays granulares de vendas/itens (centenas de
// milhares), recebemos linhas já agregadas por (empresa, produto) com
// totais dos 3 períodos. O tamanho do payload cai 10-50x e a montagem
// da árvore vira O(n) onde n ≈ produtos distintos (~1k-5k).
//
// rows: vinda do RPC `cci_webposto_resumo_3periodos`. Shape:
//   [{ empresa_codigo, produto_codigo,
//      qtd_atual, fat_atual, custo_atual, acresc_atual, desc_atual,
//      qtd_ma, fat_ma, custo_ma,
//      qtd_aa, fat_aa, custo_aa }]
export function construirArvoreWebpostoAgregado({
  rows, produtosMap, gruposMap, mapaEmpresas = new Map(), empresasInfo = [],
}) {
  // Indexa info de empresas pra preencher nome mesmo quando rows = vazio
  const empMap = new Map(); // empresa_codigo → empNode em construção
  const ensureEmp = (ec) => {
    let emp = empMap.get(ec);
    if (!emp) {
      emp = {
        empresa_codigo: ec,
        nome: mapaEmpresas.get(ec) || `Empresa ${ec}`,
        stats: novoStats(),
        categorias: new Map(),
      };
      empMap.set(ec, emp);
    }
    return emp;
  };

  (rows || []).forEach(r => {
    const ec = Number(r.empresa_codigo);
    const pCodigo = Number(r.produto_codigo);
    const a = {
      qtd:    Number(r.qtd_atual)    || 0,
      valor:  Number(r.fat_atual)    || 0,
      custo:  Number(r.custo_atual)  || 0,
      acresc: Number(r.acresc_atual) || 0,
      desc:   Number(r.desc_atual)   || 0,
    };
    const m  = {
      qtd:   Number(r.qtd_ma)   || 0,
      valor: Number(r.fat_ma)   || 0,
      custo: Number(r.custo_ma) || 0,
    };
    const an = {
      qtd:   Number(r.qtd_aa)   || 0,
      valor: Number(r.fat_aa)   || 0,
      custo: Number(r.custo_aa) || 0,
    };

    const emp = ensureEmp(ec);

    const produto = produtosMap?.get(pCodigo);
    const grupo   = produto ? gruposMap?.get(produto.grupoCodigo) : null;
    const catKey = _classificarItem(
      { produtoCodigo: pCodigo },
      produtosMap || new Map(),
      gruposMap   || new Map(),
    );
    const catKeyResolvida = MAP_CAT.has(catKey) ? catKey : (catKey === 'outros' ? 'automotivos' : 'sem_categoria');
    const catObj = MAP_CAT.get(catKeyResolvida);

    if (!emp.categorias.has(catKeyResolvida)) {
      emp.categorias.set(catKeyResolvida, {
        categoria: catObj,
        stats: novoStats(),
        grupos: new Map(),
      });
    }
    const catNode = emp.categorias.get(catKeyResolvida);

    acumStats(emp.stats,    a, m, an);
    acumStats(catNode.stats, a, m, an);

    const gCodigo = produto?.grupoCodigo ?? -1;
    const gNome   = grupo?.nome || grupo?.descricao || produto?.nome || 'Sem grupo';
    const gKey    = String(gCodigo);
    if (!catNode.grupos.has(gKey)) {
      catNode.grupos.set(gKey, { codigo: gCodigo, nome: gNome, stats: novoStats(), produtos: [] });
    }
    const gNode = catNode.grupos.get(gKey);
    acumStats(gNode.stats, a, m, an);

    gNode.produtos.push({
      codigo: pCodigo,
      nome:   produto?.nome || produto?.descricao || `#${pCodigo}`,
      qtd:    { atual: a.qtd,   ma: m.qtd,   aa: an.qtd },
      fat:    { atual: a.valor, ma: m.valor, aa: an.valor },
      lucro:  {
        atual: a.valor  - a.custo,
        ma:    m.valor  - m.custo,
        aa:    an.valor - an.custo,
      },
      acresc: a.acresc || 0,
      desc:   a.desc   || 0,
    });
  });

  // Garante presença de todas as empresas selecionadas (mesmo sem dados)
  (empresasInfo || []).forEach(emp => {
    if (!empMap.has(emp.codigo)) {
      empMap.set(emp.codigo, {
        empresa_codigo: emp.codigo,
        nome: emp.nome,
        stats: novoStats(),
        categorias: new Map(),
      });
    }
  });

  // Converte pra arrays ordenados (mesmo formato do agregador antigo)
  const arvore = [];
  empMap.forEach(emp => {
    const cats = [];
    CATEGORIAS.forEach(c => {
      const cn = emp.categorias.get(c.key);
      if (!cn) return;
      const grupos = Array.from(cn.grupos.values())
        .sort((a, b) => b.stats.fat.atual - a.stats.fat.atual);
      grupos.forEach(g => g.produtos.sort((a, b) => b.fat.atual - a.fat.atual));
      cats.push({ ...cn, grupos });
    });
    arvore.push({ ...emp, categorias: cats });
  });
  return arvore.sort((a, b) => b.stats.fat.atual - a.stats.fat.atual);
}

// RPC compacta pros KPIs do Dashboard (vs MA e AA). Recebe lista de
// produto_codigos de combustível pra calcular litros corretamente.
// Retorna apenas { fat, custo, litros, qtdVendas } — payload mínimo
// otimizado pra carga rápida das pillows de variação.
export async function buscarKpisPeriodoWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte, produtosCombustivel = null,
}) {
  if (!chaveApiId || !empresasCodigos?.length) return null;
  const { data, error } = await supabase.rpc('cci_webposto_kpis_periodo', {
    p_chave_api_id:         chaveApiId,
    p_empresas_codigos:     empresasCodigos.map(Number),
    p_data_de:              dataDe,
    p_data_ate:             dataAte,
    p_produtos_combustivel: produtosCombustivel && produtosCombustivel.length > 0
      ? produtosCombustivel.map(Number) : null,
  });
  if (error) throw error;
  const r = (data && data[0]) || {};
  return {
    fat:    Number(r.valor_total)            || 0,
    custo:  Number(r.custo_total)            || 0,
    litros: Number(r.quantidade_combustivel) || 0,
    qtdVendas: Number(r.qtd_vendas)          || 0,
  };
}

// RPC dedicada à aba Combustíveis (Vendas). Recebe só (chave_api,
// empresas, data_de, data_ate); a RPC calcula AA + dias_periodo +
// dias_mes internamente. Retorna 1 row por (empresa, produto) com
// totais atual + AA. O front filtra produtos por categoria combustível
// (usando produtosMap/gruposMap já em cache).
//
// Forma de uso:
//   const dados = await buscarCombustiveisOverviewWebposto({...});
//   // dados.rows = array de produtos com totais atual+AA
//   // dados.diasPeriodo / diasMes → calcular projeção: v * diasMes/diasPeriodo
export async function buscarCombustiveisOverviewWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte,
}) {
  if (!chaveApiId || !empresasCodigos?.length || !dataDe || !dataAte) {
    return { rows: [], diasPeriodo: 1, diasMes: 30 };
  }
  const { data, error } = await supabase.rpc('cci_webposto_combustiveis_overview', {
    p_chave_api_id:     chaveApiId,
    p_empresas_codigos: empresasCodigos.map(Number),
    p_data_de:          dataDe,
    p_data_ate:         dataAte,
  });
  if (error) throw error;
  const rows = (data || []).map(r => ({
    empresa_codigo: Number(r.empresa_codigo),
    produto_codigo: Number(r.produto_codigo),
    litros_atual: Number(r.litros_atual) || 0,
    fat_atual:    Number(r.fat_atual)    || 0,
    custo_atual:  Number(r.custo_atual)  || 0,
    lucro_atual:  Number(r.lucro_atual)  || 0,
    acresc_atual: Number(r.acresc_atual) || 0,
    desc_atual:   Number(r.desc_atual)   || 0,
    litros_aa:    Number(r.litros_aa)    || 0,
    fat_aa:       Number(r.fat_aa)       || 0,
    custo_aa:     Number(r.custo_aa)     || 0,
    lucro_aa:     Number(r.lucro_aa)     || 0,
  }));
  const diasPeriodo = Number(data?.[0]?.dias_periodo) || 1;
  const diasMes     = Number(data?.[0]?.dias_mes)     || 30;
  return { rows, diasPeriodo, diasMes };
}

// RPC unificada da página Vendas (comercial). Substitui as 3 RPCs
// anteriores (resumo_3periodos + dia_produto + combustiveis_overview)
// por UMA chamada que devolve um JSONB com tudo que a tela precisa.
//
// Retorno: { resumo, diaProduto, diasPeriodo, diasMes, periodoAtual, periodoMA, periodoAA }
//   - resumo:      array agregado por (empresa, produto) com totais atual+MA+AA
//   - diaProduto:  array agregado por (data, empresa, produto) só do período atual
//   - diasPeriodo: dias no recorte (pra calcular projeção)
//   - diasMes:     dias do mês corrente (pra calcular projeção)
export async function buscarVendasComercialWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte,
}) {
  if (!chaveApiId || !empresasCodigos?.length || !dataDe || !dataAte) {
    return { resumo: [], diasPeriodo: 1, diasMes: 30, periodoMA: null, periodoAA: null };
  }
  // 1 chamada combinada (definer, rápida). Menos conexões concorrentes que as
  // 3 paralelas de antes — reduz a pressão no pool/streams HTTP/2 do Supabase.
  const { data, error } = await supabase.rpc('cci_webposto_vendas_comercial', {
    p_chave_api_id:     chaveApiId,
    p_empresas_codigos: empresasCodigos.map(Number),
    p_data_de:          dataDe,
    p_data_ate:         dataAte,
  });
  if (error) throw error;
  const obj = data || {};
  return {
    resumo:       Array.isArray(obj.resumo) ? obj.resumo : [],
    diasPeriodo:  Number(obj.dias_periodo) || 1,
    diasMes:      Number(obj.dias_mes)     || 30,
    periodoAtual: obj.periodo_atual || null,
    periodoMA:    obj.periodo_ma    || null,
    periodoAA:    obj.periodo_aa    || null,
  };
}

// Busca o dia x produto SO de uma categoria (sob demanda, ao abrir as sub-abas
// diarias). Envia o mapa produto->categoria (mesmo padrao do sparkline) e o
// banco filtra por p_categoria. Retorna rows no mesmo shape do antigo
// `dia_produto`, entao os builders `construirArvoreDia*Agregado` funcionam sem
// mudanca — so recebem o subconjunto ja escopado.
export async function buscarDiaProdutoCategoriaWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte, produtoCodigos, categorias, categoria,
}) {
  if (!chaveApiId || !empresasCodigos?.length || !dataDe || !dataAte || !produtoCodigos?.length || !categoria) {
    return [];
  }
  const { data, error } = await supabase.rpc('cci_webposto_dia_produto_categoria', {
    p_chave_api_id:     chaveApiId,
    p_empresas_codigos: empresasCodigos.map(Number),
    p_data_de:          dataDe,
    p_data_ate:         dataAte,
    p_produto_codigos:  produtoCodigos,
    p_categorias:       categorias,
    p_categoria:        categoria,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Fallback: agrega vendas + items vindos da Quality API em rows no MESMO
// shape que a RPC `cci_webposto_vendas_comercial` devolveria (campos
// `empresa_codigo, produto_codigo, qtd_atual, fat_atual, custo_atual,
// acresc_atual, desc_atual`). Usado pelo dashboard quando o cache local
// está vazio (rede recém-cadastrada ou sem backfill).
function agregarVendasParaResumo({ vendas, itens, empresaCodigo }) {
  const vendasMap = new Map();
  (vendas || []).forEach(v => {
    vendasMap.set(`${empresaCodigo}:${v.vendaCodigo ?? v.codigo}`, v);
  });
  const porProd = new Map(); // produto_codigo → totais
  (itens || []).forEach(it => {
    const venda = vendasMap.get(`${empresaCodigo}:${it.vendaCodigo}`);
    if (!venda || venda.cancelada !== 'N') return;
    const k = Number(it.produtoCodigo);
    let cur = porProd.get(k);
    if (!cur) {
      cur = { empresa_codigo: empresaCodigo, produto_codigo: k,
              qtd_atual: 0, fat_atual: 0, custo_atual: 0, acresc_atual: 0, desc_atual: 0 };
      porProd.set(k, cur);
    }
    cur.qtd_atual    += Number(it.quantidade)     || 0;
    cur.fat_atual    += Number(it.totalVenda)     || 0;
    cur.custo_atual  += Number(it.totalCusto)     || 0;
    cur.acresc_atual += Number(it.totalAcrescimo) || 0;
    cur.desc_atual   += Number(it.totalDesconto)  || 0;
  });
  return Array.from(porProd.values());
}

// Wrapper híbrido pra Visão Geral / Dashboard.
//
// ESTRATÉGIA (corrige discrepância de litros vendidos):
//   1. Cache local (RPC) cobre dias mais antigos — atualizado 1x/dia pelo cron noturno
//   2. Quality API complementa últimos N dias (DIAS_FRESCOS=2) — pega vendas
//      do dia atual + ontem que ainda não foram sincronizadas
//   3. Soma os 2 conjuntos (por empresa+produto) → resumo completo
//
// Antes: só lia cache → dados sempre 1-2 dias atrasados → litros menores que
// o sistema de gestão.
//
// `apiKey` é OBRIGATÓRIO pra ter dados frescos. Sem ele, devolve só cache
// (modo legado, pode ficar desatualizado).
const DIAS_FRESCOS_DASHBOARD = 2;

function dataMenos(iso, dias) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hojeIsoCmp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function buscarVendasComercialHibridoWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte,
  apiKey = null, empresasInfo = null,
}) {
  const hoje = hojeIsoCmp();
  const corteFresh = dataMenos(hoje, DIAS_FRESCOS_DASHBOARD); // a partir desta data, dados vêm da Quality
  const empresasMap = empresasInfo ? new Map(empresasInfo.map(e => [Number(e.codigo), e.nome])) : new Map();

  // Janela do cache: tudo ANTES do corte fresco
  const cacheTemDados = dataDe < corteFresh;
  const dataAteCache = cacheTemDados
    ? (dataAte < corteFresh ? dataAte : dataMenos(corteFresh, 1))
    : null;

  // Janela da Quality: dia do corte em diante (se dataAte alcança)
  const precisaQuality = dataAte >= corteFresh && !!apiKey;
  const dataDeQuality  = dataDe >= corteFresh ? dataDe : corteFresh;

  // ─── 1) Cache local ──────────────────────────────────────
  const base = cacheTemDados
    ? await buscarVendasComercialWebposto({ chaveApiId, empresasCodigos, dataDe, dataAte: dataAteCache })
    : { resumo: [], diaProduto: [], diasPeriodo: 1, diasMes: 30 };

  // ─── 2) Quality API (dias frescos) ───────────────────────
  let resumoFresco = [];
  if (precisaQuality) {
    const qualityApi = await import('../services/qualityApiService');
    const arrs = await Promise.all((empresasCodigos || []).map(async (codigo) => {
      const ec = Number(codigo);
      try {
        const [vendas, itens] = await Promise.all([
          qualityApi.buscarVendas(apiKey, {
            dataInicial: dataDeQuality, dataFinal: dataAte, empresaCodigo: ec,
          }).catch(() => []),
          qualityApi.buscarVendaItens(apiKey, {
            dataInicial: dataDeQuality, dataFinal: dataAte, empresaCodigo: ec,
          }).catch(() => []),
        ]);
        return agregarVendasParaResumo({ vendas, itens, empresaCodigo: ec });
      } catch {
        return [];
      }
    }));
    resumoFresco = arrs.flat();
  }

  // ─── 3) Merge: soma por (empresa, produto) ───────────────
  const merged = new Map();
  const k = (r) => `${r.empresa_codigo}|${r.produto_codigo}`;
  (base.resumo || []).forEach(r => merged.set(k(r), { ...r }));
  resumoFresco.forEach(r => {
    const key = k(r);
    const cur = merged.get(key);
    if (cur) {
      cur.qtd_atual    = (cur.qtd_atual    || 0) + (r.qtd_atual    || 0);
      cur.fat_atual    = (cur.fat_atual    || 0) + (r.fat_atual    || 0);
      cur.custo_atual  = (cur.custo_atual  || 0) + (r.custo_atual  || 0);
      cur.acresc_atual = (cur.acresc_atual || 0) + (r.acresc_atual || 0);
      cur.desc_atual   = (cur.desc_atual   || 0) + (r.desc_atual   || 0);
    } else {
      merged.set(key, r);
    }
  });

  // Recalcula diasPeriodo se a Quality cobriu além do cache
  const ini = new Date(dataDe + 'T00:00:00').getTime();
  const fim = new Date(dataAte + 'T00:00:00').getTime();
  const diasPeriodo = Math.round((fim - ini) / 86400000) + 1;
  const ultimoDiaMes = new Date(parseInt(dataDe.slice(0, 4)), parseInt(dataDe.slice(5, 7)), 0).getDate();

  const fonte = cacheTemDados && precisaQuality ? 'hibrido'
              : precisaQuality                  ? 'quality-only'
              :                                   'cache-only';

  return {
    resumo: Array.from(merged.values()),
    diaProduto: base.diaProduto || [],
    diasPeriodo,
    diasMes: base.diasMes || ultimoDiaMes,
    periodoAtual: base.periodoAtual || null,
    periodoMA:    base.periodoMA    || null,
    periodoAA:    base.periodoAA    || null,
    _fonte: fonte,
    _empresasInfo: empresasMap,
  };
}

// Versão híbrida do KPIs (MA/AA). Tenta RPC; se vier zerado E há apiKey,
// busca da Quality e calcula totais simples (fat/custo/litros).
export async function buscarKpisPeriodoHibridoWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte, produtosCombustivel = null,
  apiKey = null,
}) {
  const base = await buscarKpisPeriodoWebposto({
    chaveApiId, empresasCodigos, dataDe, dataAte, produtosCombustivel,
  }).catch(() => null);
  const vazio = !base || (base.fat === 0 && base.custo === 0 && base.litros === 0 && base.qtdVendas === 0);
  if (!vazio || !apiKey) return base;
  // Fallback Quality (1 chamada por empresa)
  const setCombust = new Set((produtosCombustivel || []).map(Number));
  const qualityApi = await import('../services/qualityApiService');
  const totais = { fat: 0, custo: 0, litros: 0, qtdVendas: 0 };
  await Promise.all((empresasCodigos || []).map(async (codigo) => {
    const ec = Number(codigo);
    try {
      const [vendas, itens] = await Promise.all([
        qualityApi.buscarVendas(apiKey,     { dataInicial: dataDe, dataFinal: dataAte, empresaCodigo: ec }).catch(() => []),
        qualityApi.buscarVendaItens(apiKey, { dataInicial: dataDe, dataFinal: dataAte, empresaCodigo: ec }).catch(() => []),
      ]);
      const vendasMap = new Map();
      (vendas || []).forEach(v => vendasMap.set(`${ec}:${v.vendaCodigo ?? v.codigo}`, v));
      const vendasContadas = new Set();
      (itens || []).forEach(it => {
        const v = vendasMap.get(`${ec}:${it.vendaCodigo}`);
        if (!v || v.cancelada !== 'N') return;
        totais.fat   += Number(it.totalVenda) || 0;
        totais.custo += Number(it.totalCusto) || 0;
        if (setCombust.size === 0 || setCombust.has(Number(it.produtoCodigo))) {
          totais.litros += Number(it.quantidade) || 0;
        }
        vendasContadas.add(`${ec}:${it.vendaCodigo}`);
      });
      totais.qtdVendas += vendasContadas.size;
    } catch { /* empresa isolada falhou — segue as outras */ }
  }));
  return totais;
}

// Constrói tree dia → produto (combustíveis) a partir do RPC dia_produto.
// `categoriaKey` filtra produtos por classificação.
export function construirArvoreDiaProdutoAgregado({ diaProduto, produtosMap, gruposMap, categoriaKey }) {
  const porDia = new Map();
  (diaProduto || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = classificarCategoria({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    if (cat !== categoriaKey) return;
    const dia = String(r.data).slice(0, 10);
    if (!dia) return;
    let day = porDia.get(dia);
    if (!day) { day = { dia, produtos: new Map(), stats: { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 } }; porDia.set(dia, day); }
    const p = produtosMap?.get(pCodigo);
    let prod = day.produtos.get(pCodigo);
    if (!prod) {
      prod = { codigo: pCodigo, nome: p?.nome || `#${pCodigo}`, qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 };
      day.produtos.set(pCodigo, prod);
    }
    const qtd = Number(r.quantidade) || 0;
    const val = Number(r.total_venda) || 0;
    const cust= Number(r.total_custo) || 0;
    const acr = Number(r.total_acrescimo) || 0;
    const dsc = Number(r.total_desconto) || 0;
    prod.qtd += qtd; prod.valor += val; prod.custo += cust; prod.acresc += acr; prod.desc += dsc;
    day.stats.qtd += qtd; day.stats.valor += val; day.stats.custo += cust; day.stats.acresc += acr; day.stats.desc += dsc;
  });
  return Array.from(porDia.values())
    .map(d => ({ ...d, produtos: Array.from(d.produtos.values()).sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

// Constrói tree dia → grupo → produto (Auto/Conv) a partir do RPC.
export function construirArvoreDiaGrupoAgregado({ diaProduto, produtosMap, gruposMap, categoriaKey }) {
  const porDia = new Map();
  (diaProduto || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = classificarCategoria({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    if (cat !== categoriaKey) return;
    const dia = String(r.data).slice(0, 10);
    if (!dia) return;
    let day = porDia.get(dia);
    if (!day) { day = { dia, grupos: new Map(), stats: { qtd: 0, valor: 0, custo: 0 } }; porDia.set(dia, day); }

    const prod = produtosMap?.get(pCodigo);
    const grupo = prod ? gruposMap?.get(prod.grupoCodigo) : null;
    const gCodigo = prod?.grupoCodigo ?? -1;
    const gNome = grupo?.nome || grupo?.descricao || prod?.nome || 'Sem grupo';
    const gKey = String(gCodigo);

    let g = day.grupos.get(gKey);
    if (!g) { g = { codigo: gCodigo, nome: gNome, produtos: new Map(), stats: { qtd: 0, valor: 0, custo: 0 } }; day.grupos.set(gKey, g); }

    let p = g.produtos.get(pCodigo);
    if (!p) { p = { codigo: pCodigo, nome: prod?.nome || `#${pCodigo}`, qtd: 0, valor: 0, custo: 0 }; g.produtos.set(pCodigo, p); }

    const qtd = Number(r.quantidade) || 0;
    const val = Number(r.total_venda) || 0;
    const cust= Number(r.total_custo) || 0;
    p.qtd += qtd; p.valor += val; p.custo += cust;
    g.stats.qtd += qtd; g.stats.valor += val; g.stats.custo += cust;
    day.stats.qtd += qtd; day.stats.valor += val; day.stats.custo += cust;
  });
  return Array.from(porDia.values())
    .map(d => ({
      ...d,
      grupos: Array.from(d.grupos.values())
        .map(g => ({ ...g, produtos: Array.from(g.produtos.values()).sort((a, b) => b.valor - a.valor) }))
        .sort((a, b) => b.stats.valor - a.stats.valor),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

// Versão do "ano anterior" (aa)
export function totalizarArvoreAA(arvore) {
  const out = { totalValor: 0, totalLucro: 0, porCat: {} };
  CATEGORIAS.forEach(c => { out.porCat[c.key] = { qtd: 0, valor: 0, custo: 0, lucro: 0 }; });
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      const e = out.porCat[cat.categoria.key];
      if (!e) return;
      e.qtd   += cat.stats.qtd.aa;
      e.valor += cat.stats.fat.aa;
      e.lucro += cat.stats.lucro.aa;
      e.custo += (cat.stats.fat.aa - cat.stats.lucro.aa);
    });
    out.totalValor += emp.stats.fat.aa;
    out.totalLucro += emp.stats.lucro.aa;
  });
  return out;
}

// ─── Construtores das estruturas das trees ──────────────────────
//
// Combustíveis (TreeRealizadoDia): agrupa apenas por dia → produto.
// Estrutura: [{ dia, stats: {qtd, valor, custo, acresc, desc}, produtos: [...] }]
export function construirArvoreDiaProdutoCombustivel({ itens, vendas, produtosMap, gruposMap }) {
  const vendasMap = new Map();
  (vendas || []).forEach(v => {
    const ec = v.empresaCodigo ?? 0;
    vendasMap.set(chaveVenda(ec, v.vendaCodigo ?? v.codigo), v);
  });

  // index por (dia, produto)
  const porDia = new Map();
  (itens || []).forEach(item => {
    const ec = item.empresaCodigo ?? 0;
    const venda = vendasMap.get(chaveVenda(ec, item.vendaCodigo));
    if (!venda || venda.cancelada !== 'N') return;
    const cat = classificarCategoria(item, produtosMap, gruposMap);
    if (cat !== 'combustivel') return;
    const dia = String(venda.dataHora || venda.dataVenda || venda.data || '').slice(0, 10);
    if (!dia) return;
    let day = porDia.get(dia);
    if (!day) { day = { dia, produtos: new Map(), stats: { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 } }; porDia.set(dia, day); }
    const pCodigo = item.produtoCodigo;
    let prod = day.produtos.get(pCodigo);
    if (!prod) {
      const p = produtosMap?.get(pCodigo);
      prod = { codigo: pCodigo, nome: p?.nome || `#${pCodigo}`, qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 };
      day.produtos.set(pCodigo, prod);
    }
    const qtd  = Number(item.quantidade)     || 0;
    const val  = Number(item.totalVenda)     || 0;
    const cust = Number(item.totalCusto)     || 0;
    const acr  = Number(item.totalAcrescimo) || 0;
    const dsc  = Number(item.totalDesconto)  || 0;
    prod.qtd += qtd; prod.valor += val; prod.custo += cust; prod.acresc += acr; prod.desc += dsc;
    day.stats.qtd += qtd; day.stats.valor += val; day.stats.custo += cust; day.stats.acresc += acr; day.stats.desc += dsc;
  });

  return Array.from(porDia.values())
    .map(d => ({ ...d, produtos: Array.from(d.produtos.values()).sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => a.dia.localeCompare(b.dia)); // ASC: dia mais antigo no topo
}

// Auto / Conv (TreeRealizadoAutoDia): dia → grupo → produto.
// Estrutura: [{ dia, stats, grupos: [{ codigo, nome, stats, produtos: [...] }] }]
export function construirArvoreDiaGrupoProduto({ itens, vendas, produtosMap, gruposMap, categoriaKey }) {
  const vendasMap = new Map();
  (vendas || []).forEach(v => {
    const ec = v.empresaCodigo ?? 0;
    vendasMap.set(chaveVenda(ec, v.vendaCodigo ?? v.codigo), v);
  });

  const porDia = new Map();
  (itens || []).forEach(item => {
    const ec = item.empresaCodigo ?? 0;
    const venda = vendasMap.get(chaveVenda(ec, item.vendaCodigo));
    if (!venda || venda.cancelada !== 'N') return;
    const cat = classificarCategoria(item, produtosMap, gruposMap);
    if (cat !== categoriaKey) return;
    const dia = String(venda.dataHora || venda.dataVenda || venda.data || '').slice(0, 10);
    if (!dia) return;
    let day = porDia.get(dia);
    if (!day) { day = { dia, grupos: new Map(), stats: { qtd: 0, valor: 0, custo: 0 } }; porDia.set(dia, day); }

    const prod = produtosMap?.get(item.produtoCodigo);
    const grupo = prod ? gruposMap?.get(prod.grupoCodigo) : null;
    const gCodigo = prod?.grupoCodigo ?? -1;
    const gNome   = grupo?.nome || grupo?.descricao || prod?.nome || 'Sem grupo';
    const gKey = String(gCodigo);

    let g = day.grupos.get(gKey);
    if (!g) { g = { codigo: gCodigo, nome: gNome, produtos: new Map(), stats: { qtd: 0, valor: 0, custo: 0 } }; day.grupos.set(gKey, g); }

    let p = g.produtos.get(item.produtoCodigo);
    if (!p) { p = { codigo: item.produtoCodigo, nome: prod?.nome || `#${item.produtoCodigo}`, qtd: 0, valor: 0, custo: 0 }; g.produtos.set(item.produtoCodigo, p); }

    const qtd  = Number(item.quantidade) || 0;
    const val  = Number(item.totalVenda) || 0;
    const cust = Number(item.totalCusto) || 0;
    p.qtd += qtd; p.valor += val; p.custo += cust;
    g.stats.qtd += qtd; g.stats.valor += val; g.stats.custo += cust;
    day.stats.qtd += qtd; day.stats.valor += val; day.stats.custo += cust;
  });

  return Array.from(porDia.values())
    .map(d => ({
      ...d,
      grupos: Array.from(d.grupos.values())
        .map(g => ({ ...g, produtos: Array.from(g.produtos.values()).sort((a, b) => b.valor - a.valor) }))
        .sort((a, b) => b.stats.valor - a.stats.valor),
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

// ─── Agregadores das sub-abas avançadas ────────────────────────

// Inverte a árvore Dia → Produto → ... pra Produto → Dia (combustíveis).
// Recebe `arvoreDia` no shape produzido por construirArvoreDiaProdutoAgregado:
//   [{ dia, stats, produtos: [{ codigo, nome, qtd, valor, custo, acresc, desc }] }]
// Retorna:
//   [{ codigo, nome, stats: {qtd,valor,custo,acresc,desc}, dias: [{ dia, qtd, valor, custo, acresc, desc, varSemana }] }]
//
// `varSemana` (Δ Sem.) compara o dia X com o mesmo dia da semana 7 dias antes
// se o dia anterior estiver presente na árvore.
export function inverterArvoreParaProdutoDia(arvoreDia) {
  const porProduto = new Map();
  (arvoreDia || []).forEach(d => {
    (d.produtos || []).forEach(p => {
      let cur = porProduto.get(p.codigo);
      if (!cur) {
        cur = {
          codigo: p.codigo, nome: p.nome,
          stats: { qtd: 0, valor: 0, custo: 0, acresc: 0, desc: 0 },
          dias: [],
        };
        porProduto.set(p.codigo, cur);
      }
      cur.stats.qtd    += p.qtd    || 0;
      cur.stats.valor  += p.valor  || 0;
      cur.stats.custo  += p.custo  || 0;
      cur.stats.acresc += p.acresc || 0;
      cur.stats.desc   += p.desc   || 0;
      cur.dias.push({
        dia: d.dia,
        qtd: p.qtd || 0, valor: p.valor || 0, custo: p.custo || 0,
        acresc: p.acresc || 0, desc: p.desc || 0,
      });
    });
  });
  // Ordena dias crescente + calcula varSemana (vs dia-7 do mesmo produto)
  porProduto.forEach(p => {
    p.dias.sort((a, b) => a.dia.localeCompare(b.dia));
    const mapaDia = new Map(p.dias.map(d => [d.dia, d]));
    p.dias.forEach(d => {
      const [y, m, dd] = d.dia.split('-').map(Number);
      const dtPrev = new Date(y, m - 1, dd); dtPrev.setDate(dtPrev.getDate() - 7);
      const isoPrev = `${dtPrev.getFullYear()}-${String(dtPrev.getMonth() + 1).padStart(2, '0')}-${String(dtPrev.getDate()).padStart(2, '0')}`;
      const prev = mapaDia.get(isoPrev);
      d.varSemana = (prev && prev.qtd > 0) ? (d.qtd - prev.qtd) / prev.qtd : null;
    });
  });
  return Array.from(porProduto.values()).sort((a, b) => b.stats.qtd - a.stats.qtd);
}

// Inverte a árvore Dia → Grupo → Produto pra Grupo → Dia → Produto.
// Recebe `arvoreDiaGrupo` (construirArvoreDiaGrupoAgregado).
export function inverterArvoreParaGrupoDia(arvoreDiaGrupo) {
  const porGrupo = new Map();
  (arvoreDiaGrupo || []).forEach(d => {
    (d.grupos || []).forEach(g => {
      let cur = porGrupo.get(String(g.codigo));
      if (!cur) {
        cur = {
          codigo: g.codigo, nome: g.nome,
          stats: { qtd: 0, valor: 0, custo: 0 },
          dias: [],
        };
        porGrupo.set(String(g.codigo), cur);
      }
      cur.stats.qtd   += g.stats?.qtd   || 0;
      cur.stats.valor += g.stats?.valor || 0;
      cur.stats.custo += g.stats?.custo || 0;
      cur.dias.push({
        dia: d.dia,
        stats: { qtd: g.stats?.qtd || 0, valor: g.stats?.valor || 0, custo: g.stats?.custo || 0 },
        produtos: g.produtos || [],
      });
    });
  });
  porGrupo.forEach(g => g.dias.sort((a, b) => a.dia.localeCompare(b.dia)));
  return Array.from(porGrupo.values()).sort((a, b) => b.stats.valor - a.stats.valor);
}

// Heatmap semanal: produto × dia-da-semana (0=Dom, 1=Seg, ..., 6=Sáb).
// Recebe `arvoreDia` (combustível). Shape compatível com o componente
// HeatmapSemanal portado do autosystem:
//   { dados: [{ codigo, nome, porDia: [v0..v6], total }],
//     contagemDias: { porDia: [n0..n6], total } }
export function agregarHeatmapSemanal(arvoreDia) {
  const porProduto = new Map();
  const porDiaContagem = [0, 0, 0, 0, 0, 0, 0];
  const diasVistos = new Set();
  (arvoreDia || []).forEach(d => {
    const [y, m, dd] = d.dia.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    if (!diasVistos.has(d.dia)) {
      porDiaContagem[dow]++;
      diasVistos.add(d.dia);
    }
    (d.produtos || []).forEach(p => {
      let cur = porProduto.get(p.codigo);
      if (!cur) {
        cur = { codigo: p.codigo, nome: p.nome, porDia: [0, 0, 0, 0, 0, 0, 0], total: 0 };
        porProduto.set(p.codigo, cur);
      }
      cur.porDia[dow] += p.qtd || 0;
      cur.total       += p.qtd || 0;
    });
  });
  const dados = Array.from(porProduto.values())
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    dados,
    contagemDias: {
      porDia: porDiaContagem,
      total:  porDiaContagem.reduce((s, v) => s + v, 0),
    },
  };
}

// Pareto: ordena produtos por faturamento, calcula pct e pct acumulado.
// Recebe a `arvore` Empresa → Categoria → Grupo → Produto.
export function calcularPareto(arvore, categoriaKey, gruposFiltro) {
  const porProduto = new Map();
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== categoriaKey) return;
      (cat.grupos || []).forEach(grupo => {
        if (gruposFiltro && gruposFiltro.size > 0 && !gruposFiltro.has(String(grupo.codigo))) return;
        (grupo.produtos || []).forEach(p => {
          let cur = porProduto.get(p.codigo);
          if (!cur) {
            cur = {
              codigo: p.codigo, nome: p.nome,
              grupoCod: grupo.codigo, grupoNome: grupo.nome,
              qtd: 0, valor: 0, custo: 0,
            };
            porProduto.set(p.codigo, cur);
          }
          cur.qtd   += p.qtd?.atual   || 0;
          cur.valor += p.fat?.atual   || 0;
          cur.custo += (p.fat?.atual  || 0) - (p.lucro?.atual || 0);
        });
      });
    });
  });
  const list = Array.from(porProduto.values()).filter(p => p.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = list.reduce((s, p) => s + p.valor, 0);
  let acum = 0;
  list.forEach(p => {
    p.pct = total > 0 ? (p.valor / total) * 100 : 0;
    acum += p.pct;
    p.pctAcum = acum;
  });
  return { list, total };
}

// Análise de margem: por produto, calcula lucro e margem%. Usado pelo
// heatmap "Análise de margem" das abas Auto/Conv.
export function agregarAnaliseMargem(arvore, categoriaKey) {
  const porProduto = new Map();
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== categoriaKey) return;
      (cat.grupos || []).forEach(grupo => {
        (grupo.produtos || []).forEach(p => {
          let cur = porProduto.get(p.codigo);
          if (!cur) {
            cur = {
              produto_codigo: p.codigo, produto_nome: p.nome,
              grupo_codigo: grupo.codigo, grupo_nome: grupo.nome,
              qtd: 0, valor: 0, custo: 0,
            };
            porProduto.set(p.codigo, cur);
          }
          cur.qtd   += p.qtd?.atual   || 0;
          cur.valor += p.fat?.atual   || 0;
          cur.custo += (p.fat?.atual || 0) - (p.lucro?.atual || 0);
        });
      });
    });
  });
  return Array.from(porProduto.values())
    .filter(p => p.valor > 0)
    .map(p => ({
      ...p,
      lucro: p.valor - p.custo,
      margem: p.valor > 0 ? ((p.valor - p.custo) / p.valor) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// Constrói série 12m por COMBUSTÍVEL específico (ou agregado "todos").
// Usado pela sub-aba "Últimos 12 meses" combustíveis.
//
// Recebe data da RPC `cci_webposto_evolucao_mensal_produto`. Filtra por
// produtos da categoria combustível e agrupa por mês.
export function construirSerieEvolucaoCombustivel({
  rowsEvolucao, produtosMap, gruposMap, produtoSelecionado = null,
}) {
  // 12 meses retroativos alinhados
  const hoje = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const MESES_PT_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const slots = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    slots.push({
      ano_mes: `${m.getFullYear()}-${pad(m.getMonth() + 1)}`,
      rotulo:  `${MESES_PT_CURTO[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
    });
  }
  const porMes = new Map();
  // Conjunto de produtos de combustível pra filtrar
  const produtosCombustivel = new Set();
  (produtosMap || new Map()).forEach((p, codigo) => {
    const cat = _classificarItem({ produtoCodigo: Number(codigo) }, produtosMap, gruposMap);
    if (cat === 'combustivel') produtosCombustivel.add(Number(codigo));
  });
  (rowsEvolucao || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    if (!produtosCombustivel.has(pCodigo)) return;
    // Filtra por NOME (um combustível pode ter vários produto_codigo — por
    // empresa e/ou re-cadastro ao longo dos meses). Somar por código deixava
    // meses "sem dados" quando o código do produto mudava.
    if (produtoSelecionado) {
      const p = produtosMap?.get(pCodigo);
      const nome = p?.nome || p?.descricao || `#${pCodigo}`;
      if (nome !== produtoSelecionado) return;
    }
    const ym = String(r.ano_mes);
    let cur = porMes.get(ym);
    if (!cur) { cur = { ano_mes: ym, fat: 0, custo: 0, qtd: 0 }; porMes.set(ym, cur); }
    cur.fat   += Number(r.valor)       || 0;
    cur.custo += Number(r.valor_custo) || 0;
    cur.qtd   += Number(r.quantidade)  || 0;
  });
  // Constrói serie alinhada
  return slots.map((s, idx) => {
    const d = porMes.get(s.ano_mes) || { fat: 0, custo: 0, qtd: 0 };
    const lucro = d.fat - d.custo;
    const margemPct = d.fat > 0 ? (lucro / d.fat) * 100 : 0;
    const lucroL = d.qtd > 0 ? lucro / d.qtd : 0;
    // Variação MA (vs mês anterior)
    const prev = idx > 0 ? porMes.get(slots[idx - 1].ano_mes) : null;
    const litrosVarMA = prev && prev.qtd > 0 ? ((d.qtd - prev.qtd) / prev.qtd) * 100 : null;
    const lucroLVarMA = prev && (prev.fat > 0 && prev.qtd > 0)
      ? (((lucro / d.qtd) - ((prev.fat - prev.custo) / prev.qtd)) / Math.abs((prev.fat - prev.custo) / prev.qtd)) * 100
      : null;
    return {
      ano_mes: s.ano_mes, rotulo: s.rotulo,
      litros: d.qtd, faturamento: d.fat, lucro, lucroL, margemPct,
      litrosVarMA, lucroLVarMA,
    };
  });
}

// Constrói série 12m pra Auto/Conv (linha do tempo). Filtra produtos
// pela categoriaKey e por gruposSel/produtosSel (multi-select do front).
// Retorna [{ ano_mes, rotulo, faturamento, custo, lucro, margemPct, fatVarMA }]
export function construirSerieLinhaTempo({
  rowsEvolucao, produtosMap, gruposMap, categoriaKey,
  gruposFiltro = null,     // Set<grupo_codigo> ou null = todos
  produtosFiltro = null,   // Set<produto_codigo> ou null = todos
}) {
  const hoje = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const slots = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    slots.push({
      ano_mes: `${m.getFullYear()}-${pad(m.getMonth() + 1)}`,
      rotulo:  `${MESES[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`,
    });
  }
  const porMes = new Map();
  (rowsEvolucao || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = _classificarItem({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    const ck = cat === 'outros' ? 'automotivos' : cat;
    if (ck !== categoriaKey) return;
    const prod = produtosMap?.get(pCodigo);
    const gCod = prod?.grupoCodigo;
    if (gruposFiltro && gruposFiltro.size > 0 && !gruposFiltro.has(gCod)) return;
    if (produtosFiltro && produtosFiltro.size > 0 && !produtosFiltro.has(pCodigo)) return;
    let cur = porMes.get(String(r.ano_mes));
    if (!cur) { cur = { ano_mes: r.ano_mes, faturamento: 0, custo: 0 }; porMes.set(String(r.ano_mes), cur); }
    cur.faturamento += Number(r.valor)       || 0;
    cur.custo       += Number(r.valor_custo) || 0;
  });
  return slots.map((s, idx) => {
    const d = porMes.get(s.ano_mes) || { faturamento: 0, custo: 0 };
    const lucro = d.faturamento - d.custo;
    const margemPct = d.faturamento > 0 ? (lucro / d.faturamento) * 100 : 0;
    const prev = idx > 0 ? porMes.get(slots[idx - 1].ano_mes) : null;
    const fatVarMA = prev && prev.faturamento > 0
      ? ((d.faturamento - prev.faturamento) / prev.faturamento) * 100 : null;
    return { ano_mes: s.ano_mes, rotulo: s.rotulo, faturamento: d.faturamento, custo: d.custo, lucro, margemPct, fatVarMA };
  });
}

// Lista grupos disponíveis pra os multi-selects da linha do tempo
// (filtra apenas grupos da categoriaKey).
export function listarGruposDaCategoria({ rowsEvolucao, produtosMap, gruposMap, categoriaKey }) {
  const set = new Map();
  (rowsEvolucao || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = _classificarItem({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    const ck = cat === 'outros' ? 'automotivos' : cat;
    if (ck !== categoriaKey) return;
    const prod = produtosMap?.get(pCodigo);
    if (!prod?.grupoCodigo) return;
    const grupo = gruposMap?.get(prod.grupoCodigo);
    set.set(prod.grupoCodigo, { codigo: prod.grupoCodigo, nome: grupo?.nome || grupo?.descricao || `#${prod.grupoCodigo}` });
  });
  return Array.from(set.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Lista produtos da categoria (opcionalmente filtrados por grupos)
export function listarProdutosDaCategoria({ rowsEvolucao, produtosMap, gruposMap, categoriaKey, gruposFiltro = null }) {
  const set = new Map();
  (rowsEvolucao || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = _classificarItem({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    const ck = cat === 'outros' ? 'automotivos' : cat;
    if (ck !== categoriaKey) return;
    const prod = produtosMap?.get(pCodigo);
    if (gruposFiltro && gruposFiltro.size > 0 && !gruposFiltro.has(prod?.grupoCodigo)) return;
    set.set(pCodigo, { codigo: pCodigo, nome: prod?.nome || prod?.descricao || `#${pCodigo}` });
  });
  return Array.from(set.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Busca pares de carrinho (RPC cci_webposto_pares_carrinho). Enriquece
// com nome do produto e nome do grupo via produtosMap/gruposMap.
export async function buscarParesCarrinhoWebposto({
  chaveApiId, empresasCodigos, dataDe, dataAte,
  produtosFiltro = null, minTransacoes = 2,
  produtosMap, gruposMap,
}) {
  const vazio = { pares: [], totalTransacoes: 0 };
  if (!chaveApiId || !empresasCodigos?.length || !dataDe || !dataAte) return vazio;
  const { data, error } = await supabase.rpc('cci_webposto_pares_carrinho', {
    p_chave_api_id:     chaveApiId,
    p_empresas_codigos: empresasCodigos.map(Number),
    p_data_de:          dataDe,
    p_data_ate:         dataAte,
    p_produtos_filtro:  produtosFiltro && produtosFiltro.length > 0 ? produtosFiltro.map(Number) : null,
    p_min_transacoes:   Number(minTransacoes) || 2,
  });
  if (error) throw error;
  const rows = data || [];
  const totalTransacoes = rows.length > 0 ? Number(rows[0].total_transacoes) || 0 : 0;
  const pares = rows.map(r => {
    const a = Number(r.produto_a);
    const b = Number(r.produto_b);
    const pa = produtosMap?.get(a);
    const pb = produtosMap?.get(b);
    return {
      produto_a: a, produto_b: b,
      produto_a_nome: pa?.nome || pa?.descricao || `#${a}`,
      produto_b_nome: pb?.nome || pb?.descricao || `#${b}`,
      grupo_a_codigo: pa?.grupoCodigo,
      grupo_b_codigo: pb?.grupoCodigo,
      transacoes_juntas: Number(r.transacoes_juntas) || 0,
      valor_juntas:      Number(r.valor_juntas) || 0,
    };
  });
  return { pares, totalTransacoes };
}

// Lista de produtos combustível distintos (pra select da aba 12 meses)
export function listarProdutosCombustivelDaSerie({ rowsEvolucao, produtosMap, gruposMap }) {
  // Agrupa por NOME (um combustível pode ter vários produto_codigo — por
  // empresa e/ou re-cadastro). O seletor usa o nome como valor, e a série soma
  // todos os códigos daquele nome.
  const nomes = new Set();
  (rowsEvolucao || []).forEach(r => {
    const pCodigo = Number(r.produto_codigo);
    const cat = _classificarItem({ produtoCodigo: pCodigo }, produtosMap, gruposMap);
    if (cat === 'combustivel' && (Number(r.valor) > 0 || Number(r.quantidade) > 0)) {
      const p = produtosMap?.get(pCodigo);
      nomes.add(p?.nome || p?.descricao || `#${pCodigo}`);
    }
  });
  return Array.from(nomes).sort((a, b) => a.localeCompare(b))
    .map(nome => ({ codigo: nome, nome }));
}

// Helper local — versão simplificada de classificarItem que aceita item direto.
import { classificarItem as _classificarItem } from '../services/mapeamentoVendasService';
function classificarCategoria(item, produtosMap, gruposMap) {
  const k = _classificarItem(item, produtosMap || new Map(), gruposMap || new Map());
  // 'outros' cai em automotivos (consistente com o autosystem)
  return k === 'outros' ? 'automotivos' : k;
}

// Monta {produtoCodigos[], categorias[]} a partir do catalogo, usando a MESMA
// classificacao (classificarCategoria: outros->automotivos) que as trees
// diarias e o sparkline usam — garante que o filtro server-side (RPCs que
// recebem o mapa) bata exatamente com a classificacao do cliente.
// `categoriaFiltro` (opcional): quando informado, devolve só os produtos
// daquela categoria — usado pelo diário pra enviar um mapa pequeno (ex.: só
// combustíveis) em vez de todos os produtos da rede.
export function montarMapaProdutoCategoria(produtosMap, gruposMap, categoriaFiltro = null) {
  const produtoCodigos = [];
  const categorias = [];
  if (!produtosMap) return { produtoCodigos, categorias };
  for (const codigo of produtosMap.keys()) {
    const cat = classificarCategoria({ produtoCodigo: Number(codigo) }, produtosMap, gruposMap);
    if (categoriaFiltro && cat !== categoriaFiltro) continue;
    produtoCodigos.push(Number(codigo));
    categorias.push(cat);
  }
  return { produtoCodigos, categorias };
}

// ─── Evolução mensal (12m) e Mix aditivada — consultam Supabase ────
import { supabase } from '../lib/supabase';

// Lê dados agregados por mês dos últimos N meses pra rede selecionada.
// Retorna [{ ano_mes, valor, valor_custo, quantidade, qtd_vendas }] pra
// alimentar o ComposedChart do dashboard.
//
// Usa a RPC `cci_webposto_evolucao_mensal` (migration 071) que agrega
// no servidor — evita estourar o limite de 1000 rows do PostgREST quando
// há muito volume de itens (4 empresas × 12 meses pode passar de 100k).
// Pra meses sem dados no cache, o mês fica ausente (front preenche zero).
export async function buscarEvolucaoMensalWebposto({ chaveApiId, empresasCodigos, mesesAtras = 12 }) {
  if (!chaveApiId || !empresasCodigos?.length) return [];

  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesAtras - 1), 1);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const { data, error } = await supabase.rpc('cci_webposto_evolucao_mensal', {
    p_chave_api_id:     chaveApiId,
    p_empresas_codigos: empresasCodigos.map(Number),
    p_data_de:          ymd(ini),
    p_data_ate:         ymd(fim),
  });
  if (error) throw error;
  return (data || []).map(r => ({
    ano_mes:     r.ano_mes,
    valor:       Number(r.valor)       || 0,
    valor_custo: Number(r.valor_custo) || 0,
    quantidade:  Number(r.quantidade)  || 0,
    qtd_vendas:  Number(r.qtd_vendas)  || 0,
  }));
}

// Calcula litros aditivada / litros comum somando vendaItens de combustível
// classificados via `mapaMix` (produtoCodigo → 'aditivada' | 'comum').
// Recebe a árvore já construída pra reusar o que está em memória.
export function calcularMixAditivadaWebposto({ arvore, mapaMix }) {
  let litrosAditivada = 0, litrosComum = 0;
  (arvore || []).forEach(emp => {
    (emp.categorias || []).forEach(cat => {
      if (cat.categoria.key !== 'combustivel') return;
      (cat.grupos || []).forEach(grupo => {
        (grupo.produtos || []).forEach(p => {
          const tipo = mapaMix?.get(Number(p.codigo));
          const qtd  = Number(p.qtd?.atual) || 0;
          if (tipo === 'aditivada') litrosAditivada += qtd;
          else if (tipo === 'comum') litrosComum    += qtd;
        });
      });
    });
  });
  const total = litrosAditivada + litrosComum;
  const mix = total > 0 ? (litrosAditivada / total) * 100 : null;
  return { litrosAditivada, litrosComum, mix };
}
