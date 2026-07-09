// Análise de Estoques — Autosystem.
//
// Módulo completo que cruza snapshot de estoque atual com vendas do
// período pra calcular:
//   - Status (ruptura/crítico/baixo/ok/excesso/parado/inativo)
//   - Cobertura em dias (estoque / venda diária média)
//   - Giro de estoque (DIO inverso)
//   - Curva ABC por faturamento
//   - Quadrante Giro × Margem
//   - Capital imobilizado e valor em risco
//
// Todos os parâmetros (janela, lead time, meta de cobertura, dias-morto,
// limites ABC) são configuráveis via modal.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Boxes, Loader2, AlertCircle, Search, RefreshCw, ChevronRight,
  Package, Layers, TrendingDown, TrendingUp, AlertTriangle,
  Settings, ChevronDown, ChevronUp, Zap, Target, ArrowDownRight,
  ArrowUpRight, Activity, DollarSign, Clock, BarChart3, X,
  Wrench, Store, Fuel, HelpCircle, Info,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ComposedChart, Line, Legend,
} from 'recharts';
import PageHeader from '../../../components/ui/PageHeader';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import Modal from '../../../components/ui/Modal';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresaAtiva } from '../../../contexts/EmpresaAtivaContext';
import EmpresaSeletorCompartilhado from '../../../components/vendas/EmpresaMultiSelect';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';

// ─── Helpers ────────────────────────────────────────────────
function fmtQtd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
function fmtDataBR(iso) {
  if (!iso) return '—';
  const d = String(iso).slice(0, 10);
  const [y, m, dd] = d.split('-');
  return y && m && dd ? `${dd}/${m}/${y}` : '—';
}

// ─── Status visual ──────────────────────────────────────────
const STATUS_INFO = {
  ruptura:  { label: 'Ruptura',       cor: '#e11d48', bg: 'bg-rose-100 dark:bg-rose-500/15',     text: 'text-rose-800 dark:text-rose-300',     descricao: 'Estoque ≤ 0' },
  critico:  { label: 'Crítico',       cor: '#f97316', bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-800 dark:text-orange-300', descricao: 'Cobertura < lead time' },
  baixo:    { label: 'Baixo',         cor: '#f59e0b', bg: 'bg-amber-100 dark:bg-amber-500/15',   text: 'text-amber-800 dark:text-amber-300',   descricao: 'Cobertura < meta' },
  ok:       { label: 'OK',            cor: '#10b981', bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-300', descricao: 'Cobertura entre meta e 2× meta' },
  excesso:  { label: 'Excesso',       cor: '#0ea5e9', bg: 'bg-sky-100 dark:bg-sky-500/15',       text: 'text-sky-800 dark:text-sky-300',       descricao: 'Cobertura > 2× meta' },
  parado:   { label: 'Parado',        cor: '#a855f7', bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-800 dark:text-purple-300', descricao: 'Estoque > 0 e sem venda há > dias-morto' },
  inativo:  { label: 'Inativo',       cor: '#94a3b8', bg: 'bg-gray-100 dark:bg-white/[0.06]',    text: 'text-gray-700 dark:text-gray-300',     descricao: 'Sem estoque e sem venda no período' },
};

// ─── Categorias (alinhado com Comercial · Vendas) ──────────
const CATEGORIA_INFO = {
  automotivos:    { label: 'Automotivos',   icon: Wrench,     borderActive: 'border-blue-600',    textActive: 'text-blue-700 dark:text-blue-400' },
  conveniencia:   { label: 'Conveniência',  icon: Store,      borderActive: 'border-emerald-600', textActive: 'text-emerald-700 dark:text-emerald-400' },
  combustivel:    { label: 'Combustíveis',  icon: Fuel,       borderActive: 'border-amber-600',   textActive: 'text-amber-700 dark:text-amber-400' },
  sem_categoria:  { label: 'Sem categoria', icon: HelpCircle, borderActive: 'border-gray-500',    textActive: 'text-gray-700 dark:text-gray-300' },
};

// ─── Parâmetros default ─────────────────────────────────────
const PARAMS_DEFAULT = {
  janelaDias:       90,    // janela de vendas pra calcular giro
  leadTimeDias:     7,     // tempo entre pedido e chegada (default conservador)
  coberturaMetaDias: 30,   // estoque-alvo em dias
  diasParaMorto:    90,    // sem venda há mais que isso → "parado"
  abcA:             0.80,  // 80% do faturamento = classe A
  abcB:             0.95,  // 80–95% = classe B; >95% = classe C
};

// ─── Classificação de status ────────────────────────────────
function classificarStatus(item, vendaDiariaMedia, params) {
  const { estoque_atual, ultima_venda, venda_qtd } = item;
  if (estoque_atual <= 0) {
    if (venda_qtd === 0) return 'inativo';
    return 'ruptura';
  }
  // Tem estoque mas zero venda no período → produto parado
  if (venda_qtd === 0) return 'parado';

  // Dias desde última venda
  const diasSemVenda = ultima_venda ? diasEntre(ultima_venda, new Date()) : 999;
  if (diasSemVenda > params.diasParaMorto) return 'parado';

  // Tem venda — classifica por cobertura
  const cobertura = vendaDiariaMedia > 0 ? estoque_atual / vendaDiariaMedia : 999;
  if (cobertura < params.leadTimeDias)      return 'critico';
  if (cobertura < params.coberturaMetaDias) return 'baixo';
  if (cobertura > params.coberturaMetaDias * 2) return 'excesso';
  return 'ok';
}

function diasEntre(iso, agora) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  const h = new Date(agora); h.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((h - d) / 86400000));
}

// ─── Componente ─────────────────────────────────────────────
export default function ClienteEstoques() {
  const session = useClienteSession();
  const asRede = session?.asRede;

  // Empresa ativa compartilhada com outras páginas Autosystem.
  const { empresaId, setEmpresaId, empresasDisponiveis } = useEmpresaAtiva();
  const empresaSelId = empresaId;
  const empresasSelIds = useMemo(
    () => new Set(empresaId ? [empresaId] : []),
    [empresaId],
  );

  // ─── Estados ────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState([]);
  const [meta, setMeta] = useState({ janelaDias: 90, dataDe: null, dataCorte: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [params, setParams] = useState(() => PARAMS_DEFAULT);
  const [modalParams, setModalParams] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroAbc, setFiltroAbc] = useState('todos');
  const [ordenacao, setOrdenacao] = useState({ campo: 'valor_imobilizado', dir: 'desc' });
  const [gruposClassificados, setGruposClassificados] = useState([]);
  const [categoriaAba, setCategoriaAba] = useState('automotivos');
  // Plano de compras
  const [modalCompras, setModalCompras] = useState(false);
  const [qtdAjustada, setQtdAjustada] = useState(() => new Map()); // chave produto → qtd manual
  const [comprasFiltroPrioridade, setComprasFiltroPrioridade] = useState('todos');
  const [comprasBusca, setComprasBusca] = useState('');
  const [comprasMinSugestao, setComprasMinSugestao] = useState(0);
  const [comprasMinVendaDia, setComprasMinVendaDia] = useState(0);

  // Mapa { nomeGrupoLower → categoria } — pra classificar cada produto.
  // Mesma fonte usada pelo Comercial · Vendas.
  const mapaCategoriasPorNome = useMemo(() => {
    const m = new Map();
    gruposClassificados.forEach(g => {
      if (g.nome && g.categoria) m.set(String(g.nome).toLowerCase().trim(), g.categoria);
    });
    return m;
  }, [gruposClassificados]);

  useEffect(() => {
    if (!asRede?.id) return;
    autosystemService.listarGruposProdutoRede(asRede.id)
      .then(setGruposClassificados)
      .catch(() => setGruposClassificados([]));
  }, [asRede?.id]);

  const empresaCodigo = useMemo(() => {
    if (!empresaSelId) return null;
    return empresasDisponiveis.find(e => e.id === empresaSelId)?.empresa_codigo || null;
  }, [empresaSelId, empresasDisponiveis]);

  // ─── Carregamento ───────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!asRede?.id) return;
    setLoading(true); setError(null);
    try {
      const r = await autosystemService.buscarEstoqueAnalise(asRede.id, {
        empresaCodigo,
        janelaDias: params.janelaDias,
      });
      setItens(r.itens);
      setMeta({ janelaDias: r.janelaDias, dataDe: r.dataDe, dataCorte: r.dataCorte });
    } catch (err) {
      setError(err.message || 'Falha ao carregar');
    } finally { setLoading(false); }
  }, [asRede?.id, empresaCodigo, params.janelaDias]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Consolidação por produto (soma entre empresas) ─────
  const consolidados = useMemo(() => {
    const mapa = new Map();
    itens.forEach(it => {
      const k = `${it.produto}|${it.grupo || ''}|${it.subgrupo || ''}`;
      let g = mapa.get(k);
      if (!g) {
        g = {
          produto: it.produto,
          produto_nome: it.produto_nome || '—',
          grupo: it.grupo || 'Sem grupo',
          subgrupo: it.subgrupo || 'Sem subgrupo',
          empresas: new Set(),
          estoque_atual: 0,
          venda_qtd: 0,
          venda_valor: 0,
          venda_custo: 0,
          ultima_venda: null,
          custo_unit: null,
          preco_unit: null,
        };
        mapa.set(k, g);
      }
      g.empresas.add(it.empresa);
      g.estoque_atual += Number(it.estoque_atual || 0);
      g.venda_qtd     += Number(it.venda_qtd     || 0);
      g.venda_valor   += Number(it.venda_valor   || 0);
      g.venda_custo   += Number(it.venda_custo   || 0);
      if (it.ultima_venda && (!g.ultima_venda || String(it.ultima_venda) > String(g.ultima_venda))) {
        g.ultima_venda = it.ultima_venda;
      }
      if (g.custo_unit == null && it.custo_unit != null) g.custo_unit = Number(it.custo_unit);
      if (g.preco_unit == null && it.preco_unit != null) g.preco_unit = Number(it.preco_unit);
    });
    // Custo unit consolidado: melhor estimativa = venda_custo/venda_qtd se houver, senão o que veio.
    return Array.from(mapa.values()).map(g => {
      if (g.venda_qtd > 0) g.custo_unit = g.venda_custo / g.venda_qtd;
      if (g.venda_qtd > 0) g.preco_unit = g.venda_valor / g.venda_qtd;
      return g;
    });
  }, [itens]);

  // ─── Derivados por produto ──────────────────────────────
  const analisados = useMemo(() => {
    const janela = meta.janelaDias || params.janelaDias;
    const agora = new Date();
    const enriquecidos = consolidados.map(p => {
      const vendaDiaria = janela > 0 ? p.venda_qtd / janela : 0;
      const cobertura = vendaDiaria > 0 ? p.estoque_atual / vendaDiaria : (p.estoque_atual > 0 ? 999 : 0);
      const giro = p.estoque_atual > 0 ? (vendaDiaria * 365) / p.estoque_atual : 0; // anualizado
      const valorImobilizado = p.estoque_atual > 0 && p.custo_unit != null ? p.estoque_atual * p.custo_unit : 0;
      const margem = (p.preco_unit && p.custo_unit && p.preco_unit > 0)
        ? (p.preco_unit - p.custo_unit) / p.preco_unit : null;
      const pontoReposicao = vendaDiaria * params.leadTimeDias;
      const sugestaoCompra = Math.max(0, vendaDiaria * params.coberturaMetaDias - p.estoque_atual);
      const diasSemVenda = p.ultima_venda ? diasEntre(p.ultima_venda, agora) : null;
      const status = classificarStatus(p, vendaDiaria, params);
      const valorEmRisco = (status === 'parado' || status === 'inativo' || status === 'excesso') ? valorImobilizado : 0;
      const vendaPerdidaEst = status === 'ruptura' && diasSemVenda != null && p.preco_unit
        ? vendaDiaria * Math.min(diasSemVenda, 30) * p.preco_unit
        : 0;
      // Categoria do produto via mapa de grupos classificados pelo admin.
      // Quando o nome do grupo não está mapeado, cai em "sem_categoria".
      const categoria = mapaCategoriasPorNome.get(String(p.grupo || '').toLowerCase().trim())
        || 'sem_categoria';
      return {
        ...p,
        categoria,
        vendaDiaria, cobertura, giro, valorImobilizado, margem,
        pontoReposicao, sugestaoCompra, diasSemVenda, status, valorEmRisco,
        vendaPerdidaEst,
      };
    });

    return enriquecidos;
  }, [consolidados, params, meta.janelaDias, mapaCategoriasPorNome]);

  // Quais categorias existem (com count) — alimenta as tabs.
  const categoriasDisponiveis = useMemo(() => {
    const map = new Map();
    analisados.forEach(p => {
      map.set(p.categoria, (map.get(p.categoria) || 0) + 1);
    });
    const ordem = ['automotivos', 'conveniencia', 'combustivel', 'sem_categoria'];
    return ordem
      .map(key => ({ key, qtd: map.get(key) || 0 }))
      .filter(c => c.qtd > 0);
  }, [analisados]);

  // Ao detectar que a aba atual ficou vazia (mudou de empresa, etc), pula
  // pra primeira categoria com produtos.
  useEffect(() => {
    if (categoriasDisponiveis.length === 0) return;
    if (!categoriasDisponiveis.find(c => c.key === categoriaAba)) {
      setCategoriaAba(categoriasDisponiveis[0].key);
    }
  }, [categoriasDisponiveis, categoriaAba]);

  // ─── Analisados da CATEGORIA ativa, com ABC e quadrante calculados
  // dentro do escopo da categoria (limites relativos à própria categoria).
  const analisadosCategoria = useMemo(() => {
    const subset = analisados.filter(p => p.categoria === categoriaAba);

    // ABC (por venda_valor desc, acumulado %)
    const total = subset.reduce((s, p) => s + Math.max(0, p.venda_valor), 0);
    const ordenadosFat = [...subset].sort((a, b) => b.venda_valor - a.venda_valor);
    let acumulado = 0;
    ordenadosFat.forEach(p => {
      if (total > 0 && p.venda_valor > 0) {
        acumulado += p.venda_valor;
        const pct = acumulado / total;
        p.abc    = pct <= params.abcA ? 'A' : pct <= params.abcB ? 'B' : 'C';
        p.abcPct = pct;
      } else {
        p.abc = 'C'; p.abcPct = 1;
      }
    });

    // Quadrante Giro × Margem (mediana dentro da categoria)
    const giros   = subset.filter(p => p.giro > 0).map(p => p.giro).sort((a, b) => a - b);
    const margens = subset.filter(p => p.margem != null).map(p => p.margem).sort((a, b) => a - b);
    const medGiro   = giros.length   ? giros[Math.floor(giros.length / 2)]     : 0;
    const medMargem = margens.length ? margens[Math.floor(margens.length / 2)] : 0;
    subset.forEach(p => {
      const altoGiro   = p.giro >= medGiro && p.giro > 0;
      const altaMargem = (p.margem != null) && p.margem >= medMargem;
      p.quadrante = altoGiro && altaMargem ? 'estrela'
                  : altoGiro              ? 'tracao'
                  : altaMargem            ? 'mina'
                                          : 'lixo';
    });

    return subset;
  }, [analisados, categoriaAba, params.abcA, params.abcB]);

  // ─── Filtros + busca + ordenação ────────────────────────
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let lista = analisadosCategoria.filter(p => {
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
      if (filtroAbc !== 'todos' && p.abc !== filtroAbc) return false;
      if (!q) return true;
      return (
        String(p.produto_nome).toLowerCase().includes(q) ||
        String(p.produto).toLowerCase().includes(q) ||
        String(p.grupo).toLowerCase().includes(q) ||
        String(p.subgrupo).toLowerCase().includes(q)
      );
    });
    const { campo, dir } = ordenacao;
    const sign = dir === 'desc' ? -1 : 1;
    lista.sort((a, b) => {
      const va = a[campo] ?? -1;
      const vb = b[campo] ?? -1;
      if (typeof va === 'string') return sign * String(va).localeCompare(String(vb));
      return sign * (Number(va) - Number(vb));
    });
    return lista;
  }, [analisadosCategoria, busca, filtroStatus, filtroAbc, ordenacao]);

  // ─── KPIs executivos (sobre a CATEGORIA ativa) ──────────
  const kpis = useMemo(() => {
    const a = analisadosCategoria;
    const valorInventario = a.reduce((s, p) => s + p.valorImobilizado, 0);
    const capitalParado   = a.filter(p => p.status === 'parado').reduce((s, p) => s + p.valorImobilizado, 0);
    const capitalExcesso  = a.filter(p => p.status === 'excesso').reduce((s, p) => s + p.valorImobilizado, 0);
    const valorEmRisco    = a.reduce((s, p) => s + p.valorEmRisco, 0);
    const ruptura         = a.filter(p => p.status === 'ruptura').length;
    const critico         = a.filter(p => p.status === 'critico').length;
    const parado          = a.filter(p => p.status === 'parado').length;
    const excesso         = a.filter(p => p.status === 'excesso').length;
    const inativo         = a.filter(p => p.status === 'inativo').length;
    const totProdutos     = a.length;
    const totVendaValor   = a.reduce((s, p) => s + Math.max(0, p.venda_valor), 0);
    const totVendaCusto   = a.reduce((s, p) => s + Math.max(0, p.venda_custo), 0);
    const giroAtivos      = a.filter(p => p.giro > 0);
    const giroMedio       = giroAtivos.length ? giroAtivos.reduce((s, p) => s + p.giro, 0) / giroAtivos.length : 0;
    const cobAtivos       = a.filter(p => p.cobertura > 0 && p.cobertura < 999);
    const coberturaMedia  = cobAtivos.length ? cobAtivos.reduce((s, p) => s + p.cobertura, 0) / cobAtivos.length : 0;
    const vendaPerdidaEst = a.reduce((s, p) => s + p.vendaPerdidaEst, 0);
    return {
      valorInventario, capitalParado, capitalExcesso, valorEmRisco,
      ruptura, critico, parado, excesso, inativo, totProdutos,
      totVendaValor, totVendaCusto, giroMedio, coberturaMedia, vendaPerdidaEst,
    };
  }, [analisadosCategoria]);

  // ─── Alertas Top 5 priorizados (categoria ativa) ────────
  const alertas = useMemo(() => ({
    rupturaCriticos: analisadosCategoria.filter(p => p.status === 'ruptura' || p.status === 'critico')
      .sort((a, b) => b.vendaPerdidaEst - a.vendaPerdidaEst || b.venda_valor - a.venda_valor)
      .slice(0, 5),
    excessos: analisadosCategoria.filter(p => p.status === 'excesso')
      .sort((a, b) => b.valorImobilizado - a.valorImobilizado).slice(0, 5),
    parados: analisadosCategoria.filter(p => p.status === 'parado')
      .sort((a, b) => b.valorImobilizado - a.valorImobilizado).slice(0, 5),
  }), [analisadosCategoria]);

  // ─── Distribuições visuais (categoria ativa) ───────────
  const distribuicaoAbc = useMemo(() => {
    return ['A', 'B', 'C'].map(c => ({
      classe: c,
      produtos: analisadosCategoria.filter(p => p.abc === c).length,
      faturamento: analisadosCategoria.filter(p => p.abc === c).reduce((s, p) => s + Math.max(0, p.venda_valor), 0),
      imobilizado: analisadosCategoria.filter(p => p.abc === c).reduce((s, p) => s + p.valorImobilizado, 0),
    }));
  }, [analisadosCategoria]);

  const distribuicaoCategoria = useMemo(() => {
    const mapa = new Map();
    analisadosCategoria.forEach(p => {
      let g = mapa.get(p.grupo);
      if (!g) { g = { grupo: p.grupo, imobilizado: 0, fat: 0, qtd: 0 }; mapa.set(p.grupo, g); }
      g.imobilizado += p.valorImobilizado;
      g.fat         += Math.max(0, p.venda_valor);
      g.qtd++;
    });
    return Array.from(mapa.values()).sort((a, b) => b.imobilizado - a.imobilizado).slice(0, 10);
  }, [analisadosCategoria]);

  const matrizQuadrantes = useMemo(() => {
    const cont = { estrela: 0, tracao: 0, mina: 0, lixo: 0 };
    const valor = { estrela: 0, tracao: 0, mina: 0, lixo: 0 };
    analisadosCategoria.forEach(p => {
      cont[p.quadrante]++;
      valor[p.quadrante] += p.valorImobilizado;
    });
    return { cont, valor };
  }, [analisadosCategoria]);

  const toggleOrd = (campo) => setOrdenacao(o =>
    o.campo === campo
      ? { campo, dir: o.dir === 'desc' ? 'asc' : 'desc' }
      : { campo, dir: 'desc' }
  );

  // ─── Plano de compras ─────────────────────────────────
  // Produtos que precisam ser comprados (sugestão > 0 ou em ruptura).
  // Ordem por prioridade: ruptura > crítico > baixo > excesso/parado/ok.
  const PRIORIDADE_STATUS = { ruptura: 0, critico: 1, baixo: 2, ok: 3, excesso: 4, parado: 5, inativo: 6 };
  const chaveProduto = (p) => `${p.produto}|${p.grupo}|${p.subgrupo}`;

  const produtosCompra = useMemo(() => {
    // Pega produtos da categoria ativa com sugestão > 0 OU em ruptura/crítico.
    // Arredonda sugestão pra 1 decimal pra ficar legível.
    return analisadosCategoria
      .filter(p => p.sugestaoCompra > 0 || p.status === 'ruptura' || p.status === 'critico')
      .map(p => {
        const sugBase = Math.max(0, p.sugestaoCompra);
        return { ...p, sugestaoCompraArred: Math.ceil(sugBase * 10) / 10 };
      })
      .sort((a, b) => {
        const pa = PRIORIDADE_STATUS[a.status] ?? 9;
        const pb = PRIORIDADE_STATUS[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.vendaPerdidaEst || 0) - (a.vendaPerdidaEst || 0) || b.venda_valor - a.venda_valor;
      });
  }, [analisadosCategoria]);

  // Quantidade efetiva considera ajuste manual (Map) com fallback no sugerido.
  const qtdEfetiva = useCallback((p) => {
    const k = chaveProduto(p);
    if (qtdAjustada.has(k)) return Number(qtdAjustada.get(k)) || 0;
    return p.sugestaoCompraArred;
  }, [qtdAjustada]);

  const produtosCompraFiltrados = useMemo(() => {
    const q = comprasBusca.trim().toLowerCase();
    const min = Number(comprasMinSugestao) || 0;
    const minVd = Number(comprasMinVendaDia) || 0;
    return produtosCompra.filter(p => {
      if (comprasFiltroPrioridade === 'urgentes' && p.status !== 'ruptura' && p.status !== 'critico') return false;
      if (comprasFiltroPrioridade === 'baixo' && p.status !== 'baixo') return false;
      if (min > 0 && p.sugestaoCompraArred <= min) return false;
      if (minVd > 0 && p.vendaDiaria <= minVd) return false;
      if (!q) return true;
      return (
        String(p.produto_nome).toLowerCase().includes(q) ||
        String(p.grupo).toLowerCase().includes(q) ||
        String(p.subgrupo).toLowerCase().includes(q)
      );
    });
  }, [produtosCompra, comprasFiltroPrioridade, comprasBusca, comprasMinSugestao, comprasMinVendaDia]);

  // Totais do plano (sempre sobre TODA a lista, não apenas o filtro visual).
  const totalCompras = useMemo(() => {
    let qtdItens = 0;
    let valorTotal = 0;
    let qtdLinhas = 0;
    produtosCompra.forEach(p => {
      const q = qtdEfetiva(p);
      if (q > 0) {
        qtdLinhas++;
        qtdItens += q;
        if (p.custo_unit != null) valorTotal += q * p.custo_unit;
      }
    });
    return { qtdLinhas, qtdItens, valorTotal };
  }, [produtosCompra, qtdEfetiva]);

  const ajustarQtd = (p, valor) => {
    const k = chaveProduto(p);
    setQtdAjustada(prev => {
      const next = new Map(prev);
      next.set(k, Math.max(0, Number(valor) || 0));
      return next;
    });
  };
  const restaurarSugestao = (p) => {
    const k = chaveProduto(p);
    setQtdAjustada(prev => {
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  };
  const limparAjustes = () => setQtdAjustada(new Map());

  // ─── Export CSV do plano de compras ─────────────────────
  const exportarComprasCsv = () => {
    const sep = ';';
    const linhas = ['Prioridade;Grupo;Subgrupo;Codigo;Produto;Estoque atual;Venda diaria;Cobertura (dias);Sugestao;Qtd a comprar;Custo unit;Valor total'];
    produtosCompra.forEach(p => {
      const q = qtdEfetiva(p);
      if (q <= 0) return;
      const valor = (p.custo_unit != null) ? q * p.custo_unit : 0;
      linhas.push([
        STATUS_INFO[p.status]?.label || p.status,
        p.grupo, p.subgrupo, p.produto,
        `"${String(p.produto_nome).replace(/"/g, '""')}"`,
        String(p.estoque_atual).replace('.', ','),
        String(p.vendaDiaria.toFixed(3)).replace('.', ','),
        p.cobertura >= 999 ? 'infinito' : String(p.cobertura.toFixed(1)).replace('.', ','),
        String(p.sugestaoCompraArred).replace('.', ','),
        String(q).replace('.', ','),
        p.custo_unit != null ? p.custo_unit.toFixed(2).replace('.', ',') : '',
        valor.toFixed(2).replace('.', ','),
      ].join(sep));
    });
    const csv = linhas.join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const hoje = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `plano-compras-${categoriaAba}-${hoje}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Empty state se rede sem empresas ──────────────────
  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Análise de Estoques" description="Inventário, giro, cobertura e curva ABC" />
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-6 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 rounded">empresa_codigo</code> vinculado.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Análise de Estoques"
        description={`${CATEGORIA_INFO[categoriaAba]?.label || ''} · janela ${meta.janelaDias || params.janelaDias} dias · ${fmtDataBR(meta.dataDe)} → ${fmtDataBR(meta.dataCorte)}`} sticky>
        {empresasDisponiveis.length > 1 && (
          <EmpresaSeletorCompartilhado
            single
            clientesRede={empresasDisponiveis}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresaId(id)}
          />
        )}
        <button onClick={() => setModalCompras(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-sm relative">
          <Package className="h-4 w-4" />
          <span className="hidden sm:inline">Plano de compras</span>
          {produtosCompra.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white text-blue-700 text-[10px] font-bold">
              {produtosCompra.length}
            </span>
          )}
        </button>
        <button onClick={() => setModalParams(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Parâmetros</span>
        </button>
        <button onClick={carregar} disabled={loading}
          aria-label="Atualizar"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50 min-w-[44px] justify-center">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </PageHeader>

      {/* ────────── TABS DE CATEGORIA ────────── */}
      {categoriasDisponiveis.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 mb-4 overflow-hidden">
          <div className="flex items-center gap-1 px-2 overflow-x-auto">
            {categoriasDisponiveis.map(c => {
              const info = CATEGORIA_INFO[c.key];
              const ativo = categoriaAba === c.key;
              const Icon = info.icon;
              return (
                <button key={c.key} onClick={() => setCategoriaAba(c.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    ativo
                      ? `${info.borderActive} ${info.textActive}`
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50/60 dark:hover:bg-white/[0.04]'
                  }`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{info.label}</span>
                  <span className="text-[10.5px] text-gray-400 dark:text-gray-500">· {fmtInt(c.qtd)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {categoriaAba === 'sem_categoria' && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 mb-4 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p>Estes produtos pertencem a grupos sem categoria classificada. Peça ao admin CCI para vincular esses grupos a Combustíveis, Automotivos ou Conveniência em <strong>Cadastros · Grupos de Produto da Rede</strong>.</p>
        </div>
      )}

      {/* ────────── PAINEL EXECUTIVO ────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard icon={DollarSign} label="Valor do inventário"   valor={formatCurrency(kpis.valorInventario)} cor="blue"
          sub={`${fmtInt(kpis.totProdutos)} produtos`}
          tooltip="Capital total em estoque: soma do estoque atual × custo unitário de cada produto. O custo é calculado pelas vendas recentes ou pelo último custo médio registrado." />
        <KpiCard icon={AlertTriangle} label="Valor em risco"      valor={formatCurrency(kpis.valorEmRisco)} cor="rose"
          sub={`parado + excesso + inativo`}
          tooltip="Soma do capital imobilizado em produtos com problemas de giro: parados (sem venda há > dias-morto), em excesso (cobertura > 2× meta) e inativos (sem venda no período e sem estoque). Foco de redução imediata." />
        <KpiCard icon={Clock} label="Cobertura média"             valor={`${fmtQtd(kpis.coberturaMedia)} dias`} cor="amber"
          sub={`giro médio ${fmtQtd(kpis.giroMedio)}× / ano`}
          tooltip="Quantos dias o estoque atual cobre na velocidade média de venda — calculada como estoque atual ÷ venda diária média. Giro = quantas vezes o estoque 'rotaciona' em 365 dias." />
        <KpiCard icon={Zap} label="Ruptura + crítico"             valor={`${fmtInt(kpis.ruptura + kpis.critico)}`} cor="orange"
          sub={`${fmtInt(kpis.ruptura)} ruptura · ${fmtInt(kpis.critico)} crítico`}
          tooltip="Ruptura = estoque ≤ 0 (não pode vender, perde receita). Crítico = cobertura abaixo do lead time, vai romper antes do próximo pedido chegar. Reposição urgente." />
      </div>

      {/* ────────── ALERTAS ACIONÁVEIS ────────── */}
      {(alertas.rupturaCriticos.length > 0 || alertas.excessos.length > 0 || alertas.parados.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <CardAlertas
            titulo="Em ruptura ou crítico"
            descricao={`Reposição urgente. Estimativa de venda perdida (top 5): ${formatCurrency(alertas.rupturaCriticos.reduce((s, p) => s + p.vendaPerdidaEst, 0))}`}
            itens={alertas.rupturaCriticos}
            cor="rose"
            icon={Zap}
            formatValor={(p) => `${fmtQtd(p.estoque_atual)} un · ${fmtQtd(p.cobertura)}d`}
            tipo="urgente"
          />
          <CardAlertas
            titulo="Excesso de estoque"
            descricao={`Reduza compras ou faça promoção. Capital imobilizado (top 5): ${formatCurrency(alertas.excessos.reduce((s, p) => s + p.valorImobilizado, 0))}`}
            itens={alertas.excessos}
            cor="sky"
            icon={TrendingUp}
            formatValor={(p) => formatCurrency(p.valorImobilizado)}
            tipo="excesso"
          />
          <CardAlertas
            titulo="Produtos parados"
            descricao={`Sem venda há > ${params.diasParaMorto} dias. Capital travado (top 5): ${formatCurrency(alertas.parados.reduce((s, p) => s + p.valorImobilizado, 0))}`}
            itens={alertas.parados}
            cor="purple"
            icon={ArrowDownRight}
            formatValor={(p) => `${p.diasSemVenda || '∞'}d · ${formatCurrency(p.valorImobilizado)}`}
            tipo="parado"
          />
        </div>
      )}

      {/* ────────── GRÁFICOS: ABC + QUADRANTE + CATEGORIA ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {/* Curva ABC */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Curva ABC</h3>
            <span className="ml-auto text-[10px] text-gray-400">A ≤ {fmtPct(params.abcA)} · B ≤ {fmtPct(params.abcB)}</span>
          </div>
          <div className="space-y-2">
            {distribuicaoAbc.map((d, i) => {
              const corBg = d.classe === 'A' ? 'bg-emerald-500' : d.classe === 'B' ? 'bg-amber-500' : 'bg-slate-400';
              const totalFat = distribuicaoAbc.reduce((s, x) => s + x.faturamento, 0);
              const pctFat = totalFat > 0 ? d.faturamento / totalFat : 0;
              const totalProd = distribuicaoAbc.reduce((s, x) => s + x.produtos, 0);
              const pctProd = totalProd > 0 ? d.produtos / totalProd : 0;
              return (
                <div key={d.classe} className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded-md ${corBg} text-white inline-flex items-center justify-center text-xs font-bold leading-none flex-shrink-0 shadow-sm`}>{d.classe}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium">{d.produtos} produtos · {fmtPct(pctProd)}</span>
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 font-mono tabular-nums">{formatCurrency(d.faturamento)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <div className={`h-full ${corBg}`} style={{ width: `${pctFat * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Imobilizado: {formatCurrency(d.imobilizado)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Matriz Giro × Margem */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Matriz Giro × Margem</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <CardQuadrante titulo="⭐ Estrelas" subtitulo="Alto giro · alta margem" cor="emerald"
              qtd={matrizQuadrantes.cont.estrela} valor={matrizQuadrantes.valor.estrela} />
            <CardQuadrante titulo="💎 Mina de ouro" subtitulo="Baixo giro · alta margem" cor="amber"
              qtd={matrizQuadrantes.cont.mina} valor={matrizQuadrantes.valor.mina} />
            <CardQuadrante titulo="⚙️ Tração" subtitulo="Alto giro · baixa margem" cor="blue"
              qtd={matrizQuadrantes.cont.tracao} valor={matrizQuadrantes.valor.tracao} />
            <CardQuadrante titulo="⚠️ Reduzir" subtitulo="Baixo giro · baixa margem" cor="rose"
              qtd={matrizQuadrantes.cont.lixo} valor={matrizQuadrantes.valor.lixo} />
          </div>
        </div>

        {/* Distribuição por categoria */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Imobilizado por grupo (top 10)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={distribuicaoCategoria} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <YAxis type="category" dataKey="grupo" tick={{ fontSize: 10, fill: '#94a3b8' }} width={90} />
              <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="imobilizado" radius={[0, 4, 4, 0]} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ────────── FILTROS ────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por produto, código, grupo..."
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-2 text-xs">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
        <select value={filtroAbc} onChange={e => setFiltroAbc(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-2 text-xs">
          <option value="todos">Toda curva ABC</option>
          <option value="A">Classe A</option>
          <option value="B">Classe B</option>
          <option value="C">Classe C</option>
        </select>
      </div>

      {/* ────────── ERROR / LOADING ────────── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 mb-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" /><p>{error}</p>
        </div>
      )}

      {/* ────────── TABELA ANALÍTICA ────────── */}
      {loading ? (
        <SkeletonComercial cards={4} linhas={8} comAbas={false} />
      ) : filtrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/10 p-12 text-center">
          <Boxes className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {analisadosCategoria.length === 0 ? `Nenhum produto em ${CATEGORIA_INFO[categoriaAba]?.label || 'esta categoria'}.` : 'Nada corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span><strong className="text-gray-700 dark:text-gray-200">{fmtInt(filtrados.length)}</strong> produto(s)</span>
            <span>·</span>
            <span>Imobilizado: <strong className="text-gray-700 dark:text-gray-200 font-mono tabular-nums">{formatCurrency(filtrados.reduce((s, p) => s + p.valorImobilizado, 0))}</strong></span>
          </div>
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-white/10 sticky top-0 z-10">
                <tr className="text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  <th className="px-3 py-2.5 sticky left-0 bg-gray-100 dark:bg-slate-800 z-10">Status</th>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5 text-center w-12">ABC</th>
                  <ColunaOrd label="Estoque" campo="estoque_atual" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Custo unit." campo="custo_unit" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Imobilizado" campo="valorImobilizado" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Venda/dia" campo="vendaDiaria" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Cobertura" campo="cobertura" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Giro" campo="giro" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Margem" campo="margem" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Dias parado" campo="diasSemVenda" ord={ordenacao} onClick={toggleOrd} align="right" />
                  <ColunaOrd label="Sugestão compra" campo="sugestaoCompra" ord={ordenacao} onClick={toggleOrd} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {filtrados.slice(0, 500).map(p => {
                  const st = STATUS_INFO[p.status];
                  return (
                    <tr key={`${p.produto}|${p.grupo}|${p.subgrupo}`} className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.05]">
                      <td className="px-3 py-2 sticky left-0 bg-white dark:bg-slate-900">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[280px]" title={p.produto_nome}>{p.produto_nome}</p>
                        <p className="text-[9.5px] text-gray-400 dark:text-gray-500 truncate max-w-[280px]">{p.grupo} · {p.subgrupo} · cód {p.produto}</p>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <BadgeAbc classe={p.abc} tamanho="md" />
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                        p.estoque_atual < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : p.estoque_atual === 0 ? 'text-amber-600 dark:text-amber-400'
                                                 : 'text-gray-800 dark:text-gray-200'
                      }`}>{fmtQtd(p.estoque_atual)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {p.custo_unit != null ? formatCurrency(p.custo_unit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(p.valorImobilizado)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmtQtd(p.vendaDiaria)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                        p.cobertura >= 999 ? 'text-gray-400'
                        : p.cobertura < params.leadTimeDias ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : p.cobertura < params.coberturaMetaDias ? 'text-amber-600 dark:text-amber-400'
                        : p.cobertura > params.coberturaMetaDias * 2 ? 'text-sky-600 dark:text-sky-400'
                                                                     : 'text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {p.cobertura >= 999 ? '∞' : `${fmtQtd(p.cobertura)}d`}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">{p.giro > 0 ? `${fmtQtd(p.giro)}×` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">{p.margem != null ? fmtPct(p.margem) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                        p.diasSemVenda != null && p.diasSemVenda > params.diasParaMorto ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                      }`}>{p.diasSemVenda != null ? `${p.diasSemVenda}d` : '—'}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                        p.sugestaoCompra > 0 ? 'text-blue-700 dark:text-blue-400 font-semibold' : 'text-gray-400'
                      }`}>{p.sugestaoCompra > 0 ? `${fmtQtd(p.sugestaoCompra)} un` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtrados.length > 500 && (
              <div className="px-4 py-2 text-center text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-500/10 border-t border-amber-200 dark:border-amber-500/20">
                Mostrando primeiros 500 de {fmtInt(filtrados.length)} resultados. Refine os filtros para ver os demais.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────── MODAL DE PARÂMETROS ────────── */}
      <ModalParams open={modalParams}
        params={params}
        onSave={(p) => { setParams(p); setModalParams(false); }}
        onCancel={() => setModalParams(false)} />

      {/* ────────── MODAL DE PLANO DE COMPRAS ────────── */}
      <Modal open={modalCompras} onClose={() => setModalCompras(false)} size="xxl"
        title={`Plano de compras · ${CATEGORIA_INFO[categoriaAba]?.label || ''}`}>
        <PlanoComprasContent
          produtos={produtosCompraFiltrados}
          totalGeral={produtosCompra.length}
          totalCompras={totalCompras}
          qtdEfetiva={qtdEfetiva}
          ajustarQtd={ajustarQtd}
          restaurarSugestao={restaurarSugestao}
          limparAjustes={limparAjustes}
          ajustes={qtdAjustada}
          filtroPrioridade={comprasFiltroPrioridade}
          setFiltroPrioridade={setComprasFiltroPrioridade}
          busca={comprasBusca}
          setBusca={setComprasBusca}
          minSugestao={comprasMinSugestao}
          setMinSugestao={setComprasMinSugestao}
          minVendaDia={comprasMinVendaDia}
          setMinVendaDia={setComprasMinVendaDia}
          onExport={exportarComprasCsv}
          params={params}
        />
      </Modal>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────

// Badge ABC reutilizável — usa flex pra centralizar o glyph perfeitamente
// na horizontal e vertical. Tamanhos: 'sm' (linhas de alerta) e 'md' (tabela).
function BadgeAbc({ classe, tamanho = 'md', title }) {
  const corBg = classe === 'A' ? 'bg-emerald-500'
              : classe === 'B' ? 'bg-amber-500'
                               : 'bg-slate-400';
  const dim = tamanho === 'sm'
    ? 'h-[18px] w-[18px] text-[10px]'
    : 'h-6 w-6 text-[11px]';
  return (
    <span title={title || `Classe ${classe}`}
      className={`inline-flex items-center justify-center ${dim} rounded-md font-bold text-white leading-none shadow-sm flex-shrink-0 ${corBg}`}>
      {classe}
    </span>
  );
}

function KpiCard({ icon: Icon, label, valor, sub, cor, tooltip }) {
  const cores = {
    blue:    'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose:    'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    orange:  'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/60 dark:border-white/10 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider truncate">{label}</p>
          {tooltip && (
            <span tabIndex={0} title={tooltip}
              className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-help flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900/40">
              <Info className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${cores[cor]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate" title={valor}>{valor}</p>
      {sub && <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function CardAlertas({ titulo, descricao, itens, cor, icon: Icon, formatValor, tipo }) {
  const cores = {
    rose:   { bg: 'bg-rose-50 dark:bg-rose-500/10',     border: 'border-rose-200 dark:border-rose-500/20',     iconBg: 'bg-rose-100 dark:bg-rose-500/20',     iconText: 'text-rose-700 dark:text-rose-300' },
    sky:    { bg: 'bg-sky-50 dark:bg-sky-500/10',       border: 'border-sky-200 dark:border-sky-500/20',       iconBg: 'bg-sky-100 dark:bg-sky-500/20',       iconText: 'text-sky-700 dark:text-sky-300' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-500/10', border: 'border-purple-200 dark:border-purple-500/20', iconBg: 'bg-purple-100 dark:bg-purple-500/20', iconText: 'text-purple-700 dark:text-purple-300' },
  }[cor];
  return (
    <div className={`rounded-xl border ${cores.bg} ${cores.border} p-3 shadow-sm`}>
      <div className="flex items-start gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg ${cores.iconBg} ${cores.iconText} flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
          <p className="text-[10.5px] text-gray-600 dark:text-gray-400 leading-snug">{descricao}</p>
        </div>
      </div>
      {itens.length === 0 ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">Nenhum produto neste alerta. 👍</p>
      ) : (
        <ul className="space-y-1">
          {itens.map(p => (
            <li key={p.produto} className="flex items-center gap-2 text-[11px]">
              <BadgeAbc classe={p.abc} tamanho="sm" />
              <p className="text-gray-800 dark:text-gray-200 truncate flex-1" title={p.produto_nome}>{p.produto_nome}</p>
              <span className="font-mono tabular-nums text-gray-600 dark:text-gray-400 text-[10.5px] flex-shrink-0">{formatValor(p)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardQuadrante({ titulo, subtitulo, cor, qtd, valor }) {
  const cores = {
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
    amber:   'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
    blue:    'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
    rose:    'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20',
  };
  return (
    <div className={`rounded-lg border p-2 ${cores[cor]}`}>
      <p className="text-[11.5px] font-semibold text-gray-800 dark:text-gray-200">{titulo}</p>
      <p className="text-[9.5px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitulo}</p>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtInt(qtd)}</span>
        <span className="text-[10px] font-mono tabular-nums text-gray-600 dark:text-gray-400">{formatCurrency(valor)}</span>
      </div>
    </div>
  );
}

function ColunaOrd({ label, campo, ord, onClick, align = 'left' }) {
  const ativo = ord.campo === campo;
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.04]`}
      onClick={() => onClick(campo)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {ativo && (ord.dir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function ModalParams({ open, params, onSave, onCancel }) {
  const [draft, setDraft] = useState(params);
  useEffect(() => { if (open) setDraft(params); }, [open, params]);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return (
    <Modal open={open} onClose={onCancel} title="Parâmetros da análise"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setDraft(PARAMS_DEFAULT)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Restaurar padrões</button>
          <div className="flex-1" />
          <button onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]">Cancelar</button>
          <button onClick={() => onSave(draft)}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700">Aplicar</button>
        </div>
      )}>
    <div className="space-y-3">
      <p className="text-xs text-gray-600 dark:text-gray-300">
        Ajuste os parâmetros que regem todos os cálculos. Os valores são aplicados imediatamente ao confirmar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Janela de análise (dias)" descricao="Período de vendas usado pra calcular giro e cobertura.">
          <input type="number" value={draft.janelaDias} min={7} max={365}
            onChange={e => set('janelaDias', Math.max(7, Math.min(365, Number(e.target.value) || 0)))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
        <Campo label="Lead time (dias)" descricao="Tempo entre pedido e recebimento. Cobertura < lead time = crítico.">
          <input type="number" value={draft.leadTimeDias} min={1}
            onChange={e => set('leadTimeDias', Math.max(1, Number(e.target.value) || 0))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
        <Campo label="Cobertura-alvo (dias)" descricao="Estoque ideal medido em dias de venda. Cobertura > 2× alvo = excesso.">
          <input type="number" value={draft.coberturaMetaDias} min={1}
            onChange={e => set('coberturaMetaDias', Math.max(1, Number(e.target.value) || 0))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
        <Campo label="Dias para 'parado' (dias)" descricao="Sem venda há mais que isso = produto parado.">
          <input type="number" value={draft.diasParaMorto} min={1}
            onChange={e => set('diasParaMorto', Math.max(1, Number(e.target.value) || 0))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
        <Campo label="Curva ABC — limite A (%)" descricao="Produtos até esse % do faturamento = classe A.">
          <input type="number" value={Math.round(draft.abcA * 100)} min={50} max={95}
            onChange={e => set('abcA', Math.max(0.5, Math.min(0.95, (Number(e.target.value) || 0) / 100)))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
        <Campo label="Curva ABC — limite B (%)" descricao="Entre limite A e B = classe B. Acima = classe C.">
          <input type="number" value={Math.round(draft.abcB * 100)} min={80} max={99}
            onChange={e => set('abcB', Math.max(0.8, Math.min(0.99, (Number(e.target.value) || 0) / 100)))}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
        </Campo>
      </div>
    </div>
    </Modal>
  );
}

function PlanoComprasContent({
  produtos, totalGeral, totalCompras, qtdEfetiva, ajustarQtd, restaurarSugestao,
  limparAjustes, ajustes, filtroPrioridade, setFiltroPrioridade,
  busca, setBusca, minSugestao, setMinSugestao,
  minVendaDia, setMinVendaDia, onExport, params,
}) {
  const [comoFuncionaAberto, setComoFuncionaAberto] = useState(false);

  return (
    // Estrutura própria do modal: header de KPIs (fixo), tabela (scroll
    // dentro dela) e footer (fixo). O -m-6 cancela o padding do Modal
    // pra encostar nas bordas; a altura é casada com o max-h do Modal
    // descontando o cabeçalho dele (~73px) pra a tabela ter espaço útil.
    <div className="flex flex-col -m-6" style={{ maxHeight: 'calc(85vh - 73px)' }}>

      {/* ── Topo fixo: KPIs + dicas + filtros ───────────────── */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-white/10 bg-white dark:bg-slate-900 flex-shrink-0">

        {/* Banner "Como funciona" colapsável */}
        <button onClick={() => setComoFuncionaAberto(o => !o)}
          className="w-full mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-left hover:bg-blue-100/60 dark:hover:bg-blue-500/15 transition-colors">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-900 dark:text-blue-200 flex-1">
            Como o plano de compras funciona? {comoFuncionaAberto ? 'Recolher' : 'Saiba mais'}
          </span>
          <motion.div animate={{ rotate: comoFuncionaAberto ? 90 : 0 }}>
            <ChevronRight className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
          </motion.div>
        </button>
        {comoFuncionaAberto && (
          <div className="mb-3 px-3 py-3 rounded-lg bg-blue-50/60 dark:bg-blue-500/[0.06] border border-blue-200 dark:border-blue-500/20 text-[11.5px] text-blue-900 dark:text-blue-200 leading-relaxed space-y-1.5">
            <p><strong>Quem entra na lista:</strong> produtos em <strong>ruptura</strong> (estoque ≤ 0), em <strong>crítico</strong> (cobertura abaixo do lead time) ou com sugestão de compra positiva pela cobertura-alvo.</p>
            <p><strong>Cálculo da sugestão:</strong> <code className="font-mono bg-blue-100 dark:bg-blue-500/20 px-1 rounded">venda diária × cobertura-alvo ({params.coberturaMetaDias} dias) − estoque atual</code>, arredondado para cima.</p>
            <p><strong>Editar quantidades:</strong> clique em qualquer campo "Comprar". Os totais recalculam em tempo real. Campos ajustados ficam em <span className="font-semibold text-amber-700 dark:text-amber-300">amber</span>; o ícone ↻ restaura a sugestão.</p>
            <p><strong>Exportar:</strong> baixa um CSV com as quantidades atuais (incluindo seus ajustes) pra enviar ao comprador ou abrir no Excel.</p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <CardKpiCompra cor="blue"
            label="Produtos a comprar"
            valor={fmtInt(totalCompras.qtdLinhas)}
            sub={`de ${fmtInt(totalGeral)} candidatos`}
            tooltip="Linhas com quantidade > 0. Ajustar pra zero remove o produto do total." />
          <CardKpiCompra cor="emerald"
            label="Quantidade total"
            valor={`${fmtQtd(totalCompras.qtdItens)} un`}
            sub="soma das unidades a comprar"
            tooltip="Soma das quantidades efetivas (incluindo seus ajustes manuais)." />
          <CardKpiCompra cor="amber"
            label="Valor estimado"
            valor={formatCurrency(totalCompras.valorTotal)}
            sub="qtd × custo unitário"
            tooltip="Custo unitário é a média do custo médio das vendas recentes ou o último custo conhecido. Pode haver variações no momento da compra real." />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto ou grupo..."
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-10 pr-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40" />
          </div>
          <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 px-2 text-xs">
            <option value="todos">Todas as prioridades</option>
            <option value="urgentes">Apenas urgentes (ruptura + crítico)</option>
            <option value="baixo">Apenas cobertura baixa</option>
          </select>
          <FiltroMinNumerico
            label="Sugestão >"
            unidade="un"
            valor={minSugestao}
            onChange={setMinSugestao}
            tooltip="Mostra somente produtos cuja sugestão de compra original é maior que o valor informado"
          />
          <FiltroMinNumerico
            label="Venda/dia >"
            unidade="un"
            valor={minVendaDia}
            onChange={setMinVendaDia}
            step="0.01"
            tooltip="Mostra somente produtos cuja venda diária média é maior que o valor informado. Útil pra filtrar produtos de giro muito baixo."
          />
          {ajustes.size > 0 && (
            <button onClick={limparAjustes}
              title={`${ajustes.size} ajuste(s) manual(is) — clique para reverter tudo às sugestões`}
              className="h-9 inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <RefreshCw className="h-3 w-3" /> Restaurar sugestões ({ajustes.size})
            </button>
          )}
        </div>
      </div>

      {/* ── Corpo: tabela com scroll PRÓPRIO ─────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-white/[0.01]">
        {produtos.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Nada a comprar aqui 🎉</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
              {totalGeral === 0
                ? 'Nenhum produto está com cobertura abaixo da meta nem em ruptura. Ajuste os parâmetros (lead time, cobertura-alvo) pra recalcular.'
                : 'Tente trocar o filtro de prioridade ou a busca.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs min-w-[940px]">
            <thead className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-white/10 sticky top-0 z-10">
              <tr className="text-left text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                <th className="px-3 py-2.5">Prioridade</th>
                <th className="px-3 py-2.5">Produto</th>
                <ThComDica titulo="Estoque" align="right" dica="Quantidade atual no sistema (soma das empresas)." />
                <ThComDica titulo="Venda/dia" align="right" dica={`Vendas dos últimos ${params.janelaDias} dias ÷ ${params.janelaDias}.`} />
                <ThComDica titulo="Cobertura" align="right" dica="Quantos dias o estoque cobre na velocidade atual." />
                <ThComDica titulo="Sugestão" align="right" dica={`Quantidade para atingir cobertura-alvo de ${params.coberturaMetaDias} dias.`} />
                <ThComDica titulo="Comprar" align="right" dica="Editável — recalcula o total. Use ↻ para voltar à sugestão." />
                <ThComDica titulo="Custo unit." align="right" dica="Custo unitário estimado a partir das vendas recentes." />
                <ThComDica titulo="Valor" align="right" dica="Comprar × Custo unit." />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10 bg-white dark:bg-slate-900">
              {produtos.map(p => {
                const st = STATUS_INFO[p.status];
                const q = qtdEfetiva(p);
                const ajustado = ajustes.has(`${p.produto}|${p.grupo}|${p.subgrupo}`);
                const valor = (p.custo_unit != null && q > 0) ? q * p.custo_unit : 0;
                return (
                  <tr key={`${p.produto}|${p.grupo}|${p.subgrupo}`} className="hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.05]">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[260px]" title={p.produto_nome}>{p.produto_nome}</p>
                      <p className="text-[9.5px] text-gray-400 dark:text-gray-500 truncate max-w-[260px]">{p.grupo} · {p.subgrupo}</p>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                      p.estoque_atual < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : p.estoque_atual === 0 ? 'text-amber-600 dark:text-amber-400'
                                              : 'text-gray-700 dark:text-gray-300'
                    }`}>{fmtQtd(p.estoque_atual)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmtQtd(p.vendaDiaria)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${
                      p.cobertura >= 999 ? 'text-gray-400'
                      : p.cobertura < params.leadTimeDias ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-gray-700 dark:text-gray-300'
                    }`}>{p.cobertura >= 999 ? '∞' : `${fmtQtd(p.cobertura)}d`}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500 dark:text-gray-400">{fmtQtd(p.sugestaoCompraArred)} un</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" min={0} step="0.1" value={q}
                          onChange={e => ajustarQtd(p, e.target.value)}
                          title={ajustado ? `Sugestão original: ${fmtQtd(p.sugestaoCompraArred)} un` : 'Editar quantidade'}
                          className={`w-20 h-7 px-2 text-right font-mono tabular-nums text-[12px] rounded border focus:outline-none focus:ring-1 ${
                            ajustado
                              ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 focus:ring-amber-200'
                              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:ring-blue-200'
                          }`} />
                        {ajustado ? (
                          <button onClick={() => restaurarSugestao(p)} title={`Restaurar sugestão (${fmtQtd(p.sugestaoCompraArred)} un)`}
                            className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300">
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="w-3" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">
                      {p.custo_unit != null ? formatCurrency(p.custo_unit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(valor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer fixo ───────────────────────────────────────── */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 flex items-center gap-3 flex-wrap flex-shrink-0">
        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Quantidades editáveis · <span className="text-amber-700 dark:text-amber-300 font-medium">amber</span> = ajustado manualmente
        </p>
        <div className="flex-1" />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Total estimado:
          <strong className="text-base font-bold text-gray-900 dark:text-gray-100 font-mono tabular-nums ml-1">{formatCurrency(totalCompras.valorTotal)}</strong>
        </p>
        <button onClick={onExport} disabled={totalCompras.qtdLinhas === 0}
          title={totalCompras.qtdLinhas === 0 ? 'Defina quantidades > 0 antes de exportar' : 'Baixa CSV com as quantidades atuais'}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <ArrowDownRight className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>
    </div>
  );
}

// Input numérico "maior que" pra os filtros do plano de compras.
// Fica destacado em azul quando ativo (valor > 0); botão × pra limpar.
function FiltroMinNumerico({ label, unidade, valor, onChange, tooltip, step = '0.1' }) {
  const ativo = Number(valor) > 0;
  return (
    <label className={`h-9 inline-flex items-center gap-1.5 rounded-lg border px-2 text-xs font-medium ${
      ativo
        ? 'border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
        : 'border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200'
    }`} title={tooltip}>
      <span className="whitespace-nowrap">{label}</span>
      <input type="number" min={0} step={step} value={valor}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-16 h-6 px-1 text-right font-mono tabular-nums rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
      <span className="text-gray-400 dark:text-gray-500">{unidade}</span>
      {ativo && (
        <button onClick={() => onChange(0)} title="Limpar filtro"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 ml-0.5">
          <X className="h-3 w-3" />
        </button>
      )}
    </label>
  );
}

function CardKpiCompra({ cor, label, valor, sub, tooltip }) {
  const cores = {
    blue:    'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
    amber:   'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
  };
  const corLabel = {
    blue:    'text-blue-700 dark:text-blue-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber:   'text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`border rounded-lg p-3 ${cores[cor]}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <p className={`text-[10px] uppercase tracking-wider font-semibold ${corLabel[cor]}`}>{label}</p>
        {tooltip && (
          <span tabIndex={0} title={tooltip}
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-help">
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{valor}</p>
      <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function ThComDica({ titulo, align, dica }) {
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className="inline-flex items-center gap-1">
        {titulo}
        {dica && (
          <span tabIndex={0} title={dica}
            className="inline-flex items-center justify-center h-3 w-3 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-help">
            <Info className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
    </th>
  );
}

function Campo({ label, descricao, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      {children}
      <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 block">{descricao}</span>
    </label>
  );
}
