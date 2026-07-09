import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronRight, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar,
  DollarSign, Building2, CreditCard, FileText, Receipt, Wallet, LayoutGrid, MoreHorizontal,
  PieChart as PieChartIcon, BarChart3, SlidersHorizontal, X,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import { useClienteSession } from '../../../hooks/useAuth';
import SkeletonComercial from '../../../components/vendas/SkeletonComercial';
import * as autosystemService from '../../../services/autosystemService';
import { formatCurrency } from '../../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil, vencimentoEfetivoIso } from '../../../utils/diasUteis';

// ─── Helpers de data ────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function inicioMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function fimMesAtual() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${pad(ultimo.getMonth() + 1)}-${pad(ultimo.getDate())}`;
}
function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function diaSemana(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  const dt = new Date(+y, +m - 1, +d);
  return DIAS_SEMANA[dt.getDay()] || '';
}
function dataIso(vencto) {
  if (!vencto) return '';
  return typeof vencto === 'string' ? vencto.slice(0, 10) : '';
}
function diffDias(dataIsoStr) {
  if (!dataIsoStr) return null;
  const [y, m, d] = String(dataIsoStr).slice(0, 10).split('-');
  if (!y || !m || !d) return null;
  const alvo = new Date(+y, +m - 1, +d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}
const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ─── Categorias renderizadas (abas/KPIs) ────────────────────────
// "Outros" é derivada: tudo 1.3.* que não casa com prefixo cadastrado.
const CATEGORIAS = [
  { key: 'CARTOES',     label: 'Cartões',           labelCurto: 'Cartões', icone: CreditCard,     cor: 'cyan'    },
  { key: 'NOTAS_PRAZO', label: 'Notas a prazo',     labelCurto: 'Notas',   icone: Receipt,        cor: 'violet'  },
  { key: 'FATURAS',     label: 'Faturas a receber', labelCurto: 'Faturas', icone: Wallet,         cor: 'indigo'  },
  { key: 'CHEQUES',     label: 'Cheques',           labelCurto: 'Cheques', icone: FileText,       cor: 'teal'    },
  { key: 'OUTROS',      label: 'Outros',            labelCurto: 'Outros',  icone: MoreHorizontal, cor: 'gray'    },
];

// Cores hex para gráficos (Recharts não aceita classes Tailwind).
const CATEGORIA_COR_HEX = {
  CARTOES:     '#0ea5e9',  // sky-500
  NOTAS_PRAZO: '#8b5cf6',  // violet-500
  FATURAS:     '#6366f1',  // indigo-500
  CHEQUES:     '#14b8a6',  // teal-500
  OUTROS:      '#94a3b8',  // slate-400
};

// Fallback usado quando a rede ainda não cadastrou nenhum prefixo no admin.
// Mantém o comportamento histórico até a rede ser configurada.
const PREFIXOS_FALLBACK = new Map([
  ['1.3.01',   'cartoes'],
  ['1.3.02',   'cheques'],
  ['1.3.03.1', 'notas_prazo'],
  ['1.3.03.2', 'faturas'],
]);

// Classifica a conta por PREFIXO. Casa quando o código é igual ao prefixo
// ou começa com `${prefixo}.` (cobre as analíticas). Quando vários prefixos
// casam, vence o mais longo (mais específico).
function classificarConta(codigoDebito, mapaPrefixos) {
  if (codigoDebito == null) return 'OUTROS';
  const c = String(codigoDebito);
  const mapa = (mapaPrefixos && mapaPrefixos.size > 0) ? mapaPrefixos : PREFIXOS_FALLBACK;

  let bestPrefix = '';
  let bestCat = null;
  for (const [prefix, cat] of mapa) {
    if (c === prefix || c.startsWith(prefix + '.')) {
      if (prefix.length > bestPrefix.length) {
        bestPrefix = prefix;
        bestCat = cat;
      }
    }
  }
  if (bestCat) return String(bestCat).toUpperCase();
  return 'OUTROS';
}

// Classes Tailwind precisam estar declaradas no source para o JIT incluir.
const TAB_CLASSES = {
  emerald: {
    borda: 'border-emerald-600 text-emerald-700',
    badgeAtivo: 'bg-emerald-100 text-emerald-700',
  },
  cyan:    { borda: 'border-blue-600 text-blue-700',       badgeAtivo: 'bg-blue-100 text-blue-700'       },
  violet:  { borda: 'border-blue-600 text-blue-700',   badgeAtivo: 'bg-blue-100 text-blue-700'   },
  indigo:  { borda: 'border-blue-600 text-blue-700',   badgeAtivo: 'bg-blue-100 text-blue-700'   },
  teal:    { borda: 'border-teal-600 text-teal-700',       badgeAtivo: 'bg-teal-100 text-teal-700'       },
  gray:    { borda: 'border-gray-600 text-gray-700',       badgeAtivo: 'bg-gray-200 text-gray-700'       },
};

// ─── Cache em memória ───────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheContasReceber = { data: null, key: null, timestamp: 0 };
function chaveCache(empresaIds, venctoDe, venctoAte, ignorarPeriodo) {
  return `${[...empresaIds].sort().join(',')}|${ignorarPeriodo ? 'ALL' : `${venctoDe}|${venctoAte}`}`;
}
function cacheValido(key) {
  return _cacheContasReceber.data
    && _cacheContasReceber.key === key
    && (Date.now() - _cacheContasReceber.timestamp) < CACHE_TTL_MS;
}

// ─── Componente ─────────────────────────────────────────────────
export default function ClienteContasReceber() {
  const session = useClienteSession();
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  // Mapa prefixo→categoria configurado pelo admin para esta rede.
  // null = não configurado → ClienteContasReceber usa fallback hardcoded.
  const [mapaPrefixos, setMapaPrefixos] = useState(null);
  useEffect(() => {
    if (!asRede?.id) return;
    let cancel = false;
    autosystemService.mapearPrefixosCategoria(asRede.id)
      .then(m => { if (!cancel) setMapaPrefixos(m); })
      .catch(() => { /* mantém null → fallback */ });
    return () => { cancel = true; };
  }, [asRede?.id]);

  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set(empresasDisponiveis.map(c => c.id))
  );
  useEffect(() => {
    setEmpresasSelIds(prev => {
      if (prev.size === 0 && empresasDisponiveis.length > 0) {
        return new Set(empresasDisponiveis.map(c => c.id));
      }
      return prev;
    });
  }, [empresasDisponiveis]);

  const empresasSel = useMemo(
    () => empresasDisponiveis.filter(c => empresasSelIds.has(c.id)),
    [empresasDisponiveis, empresasSelIds]
  );
  const podeFiltrarEmpresa = empresasDisponiveis.length > 1;
  const multiEmpresa = empresasSel.length > 1;

  const [venctoDe, setVenctoDe] = useState(inicioMesAtual());
  const [venctoAte, setVenctoAte] = useState(fimMesAtual());
  const [ignorarPeriodo, setIgnorarPeriodo] = useState(true);

  const cacheKeyInicial = chaveCache(empresasSelIds, venctoDe, venctoAte, ignorarPeriodo);
  const cacheInicial = cacheValido(cacheKeyInicial) ? _cacheContasReceber.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [titulos, setTitulos] = useState(cacheInicial || []);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  // Mostra apenas títulos vencidos há N dias ou mais. 0 = sem filtro.
  // Quando ativo, força o status pra "vencidos" (visualmente coerente).
  const [diasVencidosMin, setDiasVencidosMin] = useState(0);

  // Visão Geral mostra tudo; ao escolher uma categoria foca em vencidos.
  // Comportamento explícito a cada troca de categoria — usuário pode mudar
  // o status manualmente depois.
  useEffect(() => {
    setFiltroStatus(filtroCategoria === 'TODAS' ? 'todos' : 'vencidos');
  }, [filtroCategoria]);
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [expandedClientes, setExpandedClientes] = useState(new Set());
  const [expandedContas, setExpandedContas] = useState(new Set());
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const [modalDia, setModalDia] = useState(null);
  const [drawerFiltros, setDrawerFiltros] = useState(false);

  // Categorias que ganham o nível "Cliente" extra na hierarquia.
  // Nessas abas, escondemos as colunas Cliente/Conta da tabela porque já
  // aparecem como nós da árvore.
  const CATS_COM_CLIENTE = new Set(['NOTAS_PRAZO', 'FATURAS', 'CHEQUES']);
  const mostraHierarquiaCliente = CATS_COM_CLIENTE.has(filtroCategoria);

  const redeId = asRede?.id;

  const carregar = useCallback(async ({ force = false } = {}) => {
    if (!redeId) return;
    if (empresasSel.length === 0) {
      setError('Selecione ao menos uma empresa.');
      setTitulos([]);
      setLoading(false);
      return;
    }
    const key = chaveCache(empresasSelIds, venctoDe, venctoAte, ignorarPeriodo);
    if (!force && cacheValido(key)) {
      setTitulos(_cacheContasReceber.data);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        empresasSel.map(emp =>
          autosystemService.buscarContasReceber(redeId, emp.empresa_codigo, {
            vencto_de: ignorarPeriodo ? null : (venctoDe || null),
            vencto_ate: ignorarPeriodo ? null : (venctoAte || null),
          }).then(contas => contas.map(c => ({
            ...c,
            _empresaId: emp.id,
            _empresaNome: emp.nome,
            _empresaCnpj: emp.cnpj,
          }))),
        ),
      );
      const erros = [];
      const todos = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') todos.push(...r.value);
        else erros.push(`${empresasSel[i].nome}: ${r.reason?.message || 'falha'}`);
      });
      setTitulos(todos);
      if (erros.length > 0 && todos.length === 0) setError(erros.join(' | '));
      else setError(erros.length > 0 ? `Alguns erros: ${erros.join(' | ')}` : null);
      _cacheContasReceber.data = todos;
      _cacheContasReceber.key = key;
      _cacheContasReceber.timestamp = Date.now();
    } catch (err) {
      setError(err.message);
      setTitulos([]);
    } finally {
      setLoading(false);
    }
  }, [redeId, empresasSel, empresasSelIds, venctoDe, venctoAte, ignorarPeriodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const enriched = useMemo(() => {
    return (titulos || []).map(t => {
      const venc = dataIso(t.vencto);
      const efet = vencimentoEfetivoIso(venc) || venc;
      const dias = diffDias(efet);
      const valor = toNumber(t.valor);
      // Em partidas dobradas, o direito a receber é o lançamento que
      // DEBITA uma conta 1.3.x → categorizamos e exibimos por `debito_*`.
      return {
        raw: t,
        valor,
        vencimento: venc,
        vencimentoEfetivo: efet,
        diasAteVenc: dias,
        vencido: dias !== null && dias < 0,
        proximo: dias !== null && dias >= 0 && dias <= 7,
        documento: t.documento || '',
        historico: t.obs || '',
        contaCodigo: t.debito_codigo || '',
        contaNome: t.debito_nome || '',
        clienteNome: t.pessoa_nome || 'Cliente',
        categoria: classificarConta(t.debito_codigo, mapaPrefixos),
        empresaId: t._empresaId,
        empresaNome: t._empresaNome,
        empresaCnpj: t._empresaCnpj,
      };
    });
  }, [titulos, mapaPrefixos]);

  // "Hoje" considera próximo dia útil
  const datasHoje = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diaAlvo = proximoDiaUtil(hoje);
    const datas = new Set();
    datas.add(isoDateUtil(diaAlvo));
    const cur = new Date(diaAlvo);
    cur.setDate(cur.getDate() - 1);
    while (!ehDiaUtil(cur)) {
      datas.add(isoDateUtil(cur));
      cur.setDate(cur.getDate() - 1);
    }
    return datas;
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const minDias = Number(diasVencidosMin) || 0;
    return enriched.filter(t => {
      if (filtroCategoria !== 'TODAS' && t.categoria !== filtroCategoria) return false;
      if (filtroStatus === 'hoje' && !(t.vencimento && datasHoje.has(t.vencimento))) return false;
      if (filtroStatus === 'vencidos' && !t.vencido) return false;
      if (filtroStatus === 'proximos' && (t.vencido || !t.proximo)) return false;
      if (filtroStatus === 'futuros' && (t.vencido || t.proximo)) return false;
      // Filtro "vencido há ≥ N dias" — só faz sentido pra títulos vencidos.
      // diasAteVenc é negativo quando vencido, daí abs() pra ter dias atrás.
      if (minDias > 0) {
        if (!t.vencido) return false;
        if (Math.abs(t.diasAteVenc) < minDias) return false;
      }
      if (!q) return true;
      return (
        t.clienteNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        t.contaNome.toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, busca, filtroStatus, filtroCategoria, datasHoje, diasVencidosMin]);

  // Cards de resumo — sempre panorama completo (não filtra por aba/status/busca)
  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    const porCat = {};
    const qtdPorCat = {};
    CATEGORIAS.forEach(c => { porCat[c.key] = 0; qtdPorCat[c.key] = 0; });
    enriched.forEach(t => {
      porCat[t.categoria] = (porCat[t.categoria] || 0) + t.valor;
      qtdPorCat[t.categoria] = (qtdPorCat[t.categoria] || 0) + 1;
    });
    return {
      total: tot, qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
      porCat, qtdPorCat,
    };
  }, [enriched]);

  // Participação por categoria — usado no gráfico de pizza da Visão Geral.
  const participacaoCategorias = useMemo(() => {
    return CATEGORIAS
      .map(c => ({
        key: c.key,
        label: c.label,
        valor: totais.porCat[c.key] || 0,
        qtd: totais.qtdPorCat[c.key] || 0,
        cor: CATEGORIA_COR_HEX[c.key] || '#94a3b8',
      }))
      .filter(c => c.valor > 0);
  }, [totais]);

  // Próximos 14 dias — soma por dia (inclui fins de semana com valor 0).
  const proximos14dias = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const dow = d.getDay();
      dias.push({
        iso,
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        diaSemana: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow],
        ehFimSemana: dow === 0 || dow === 6,
        valor: 0,
        qtd: 0,
      });
    }
    const mapaDias = new Map(dias.map(d => [d.iso, d]));
    enriched.forEach(t => {
      const efet = t.vencimentoEfetivo;
      if (!efet) return;
      const g = mapaDias.get(efet);
      if (g) { g.valor += t.valor; g.qtd++; }
    });
    return dias;
  }, [enriched]);

  // Top 5 clientes — agrega por clienteNome dentro de uma categoria.
  // `filtroExtra` permite restringir (ex: só vencidos).
  const topClientesPorCategoria = (catKey, filtroExtra) => {
    const mapa = new Map();
    enriched.forEach(t => {
      if (t.categoria !== catKey) return;
      if (filtroExtra && !filtroExtra(t)) return;
      const nome = t.clienteNome || '—';
      let g = mapa.get(nome);
      if (!g) { g = { nome, valor: 0, qtd: 0 }; mapa.set(nome, g); }
      g.valor += t.valor; g.qtd++;
    });
    return Array.from(mapa.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  };
  // Faturas e notas a prazo: só vencidas (t.vencido é diasAteVenc < 0,
  // já exclui hoje) — foco em cobrança/faturamento atrasado.
  const topClientesFaturas    = useMemo(() => topClientesPorCategoria('FATURAS',     (t) => t.vencido), [enriched]);
  const topClientesNotasPrazo = useMemo(() => topClientesPorCategoria('NOTAS_PRAZO', (t) => t.vencido), [enriched]);

  // Cartões vencidos agrupados por conta (adquirente/bandeira) — onde está
  // concentrado o atraso (ex: STONE-VISA, STONE-MASTER, PIX etc).
  const cartoesVencidosPorConta = useMemo(() => {
    const mapa = new Map();
    enriched.forEach(t => {
      if (!t.vencido || t.categoria !== 'CARTOES') return;
      const codigo = t.contaCodigo || '—';
      const nome = t.contaNome || '—';
      const key = `${codigo}|${nome}`;
      let g = mapa.get(key);
      if (!g) { g = { codigo, nome, valor: 0, qtd: 0 }; mapa.set(key, g); }
      g.valor += t.valor; g.qtd++;
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [enriched]);

  // Agrupa por data
  const agruparPorData = (lista) => {
    const mapa = new Map();
    lista.forEach(t => {
      const key = t.vencimento || 'sem-data';
      if (!mapa.has(key)) mapa.set(key, { data: t.vencimento, itens: [], total: 0 });
      const g = mapa.get(key);
      g.itens.push(t);
      g.total += t.valor;
    });
    const arr = Array.from(mapa.values());
    arr.sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return a.data.localeCompare(b.data);
    });
    arr.forEach(g => {
      const dias = diffDias(vencimentoEfetivoIso(g.data) || g.data);
      g.diasAteVenc = dias;
      g.vencido = dias !== null && dias < 0;
      g.proximo = dias !== null && dias >= 0 && dias <= 7;
      g.itens.sort((a, b) => b.valor - a.valor);
    });
    return arr;
  };

  // Agrupa por cliente (pessoa). Cada cliente carrega seus grupos por data.
  const agruparPorCliente = (lista) => {
    const porCli = new Map();
    lista.forEach(t => {
      const chave = t.clienteNome || 'Cliente';
      if (!porCli.has(chave)) {
        porCli.set(chave, {
          clienteNome: chave,
          itens: [], total: 0, qtd: 0, qtdVencidos: 0,
        });
      }
      const c = porCli.get(chave);
      c.itens.push(t);
      c.total += t.valor;
      c.qtd += 1;
      if (t.vencido) c.qtdVencidos += 1;
    });
    return Array.from(porCli.values())
      .map(c => ({ ...c, grupos: agruparPorData(c.itens) }))
      .sort((a, b) => b.total - a.total);
  };

  // Agrupa por conta (credito_codigo). Conforme o modo:
  //   - comCliente=true → conta.clientes (array)
  //   - comCliente=false → conta.grupos (array de datas)
  const agruparPorConta = (lista, comCliente) => {
    const porConta = new Map();
    lista.forEach(t => {
      const codigo = t.contaCodigo || 'sem-conta';
      if (!porConta.has(codigo)) {
        porConta.set(codigo, {
          contaCodigo: t.contaCodigo || '',
          contaNome: t.contaNome || 'Sem conta',
          itens: [], total: 0, qtd: 0, qtdVencidos: 0,
        });
      }
      const c = porConta.get(codigo);
      c.itens.push(t);
      c.total += t.valor;
      c.qtd += 1;
      if (t.vencido) c.qtdVencidos += 1;
    });
    return Array.from(porConta.values())
      .map(c => comCliente
        ? { ...c, clientes: agruparPorCliente(c.itens), grupos: null }
        : { ...c, clientes: null,                       grupos: agruparPorData(c.itens) })
      .sort((a, b) => (a.contaCodigo || '').localeCompare(b.contaCodigo || ''));
  };

  // Agrupa por categoria. `comCliente` é repassado para o nível conta.
  const agruparPorCategoria = (lista, comCliente) => {
    const porCat = new Map(CATEGORIAS.map(c => [c.key, {
      key: c.key,
      label: c.label,
      icone: c.icone,
      cor: c.cor,
      itens: [], total: 0, qtd: 0, qtdVencidos: 0,
    }]));
    lista.forEach(t => {
      const cat = porCat.get(t.categoria);
      if (!cat) return;
      cat.itens.push(t);
      cat.total += t.valor;
      cat.qtd += 1;
      if (t.vencido) cat.qtdVencidos += 1;
    });
    return Array.from(porCat.values())
      .filter(c => c.qtd > 0)
      .map(cat => ({ ...cat, contas: agruparPorConta(cat.itens, comCliente) }));
  };

  // Single-empresa: Categoria → Conta → [Cliente →] Data → Títulos
  const categoriasSingle = useMemo(
    () => agruparPorCategoria(filtrados, mostraHierarquiaCliente),
    [filtrados, mostraHierarquiaCliente],
  );

  // Multi-empresa: Empresa → Categoria → Data → Títulos
  const empresasComCategorias = useMemo(() => {
    if (!multiEmpresa) return [];
    const porEmp = new Map();
    filtrados.forEach(t => {
      const empId = t.empresaId ?? 'sem-empresa';
      if (!porEmp.has(empId)) {
        porEmp.set(empId, {
          empresaId: empId,
          empresaNome: t.empresaNome || 'Sem empresa',
          empresaCnpj: t.empresaCnpj || '',
          itens: [], total: 0, qtdVencidos: 0,
        });
      }
      const e = porEmp.get(empId);
      e.itens.push(t);
      e.total += t.valor;
      if (t.vencido) e.qtdVencidos += 1;
    });
    return Array.from(porEmp.values())
      .map(e => ({
        ...e,
        categorias: agruparPorCategoria(e.itens, mostraHierarquiaCliente),
        qtd: e.itens.length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados, multiEmpresa, mostraHierarquiaCliente]);

  // Quantas datas totais existem (usado nos contadores do footer)
  const totalDatas = useMemo(() => {
    const contarConta = (conta) => conta.clientes
      ? conta.clientes.reduce((s, cli) => s + cli.grupos.length, 0)
      : conta.grupos.length;
    const contarCats = (categorias) => categorias.reduce(
      (s, cat) => s + cat.contas.reduce((s2, conta) => s2 + contarConta(conta), 0),
      0,
    );
    if (multiEmpresa) {
      return empresasComCategorias.reduce((s, e) => s + contarCats(e.categorias), 0);
    }
    return contarCats(categoriasSingle);
  }, [multiEmpresa, empresasComCategorias, categoriasSingle]);

  useEffect(() => {
    setEmpresasExpandidas(new Set());
    setExpandedCats(new Set());
    setExpandedContas(new Set());
    setExpandedClientes(new Set());
    setExpandedDates(new Set());
  }, [filtroStatus, filtroCategoria, multiEmpresa, empresasComCategorias.length, categoriasSingle.length]);

  const toggleDate = (key) => setExpandedDates(prev => toggleSet(prev, key));
  const toggleCliente = (key) => setExpandedClientes(prev => toggleSet(prev, key));
  const toggleConta = (key) => setExpandedContas(prev => toggleSet(prev, key));
  const toggleCat = (key) => setExpandedCats(prev => toggleSet(prev, key));
  const toggleEmpresa = (id) => setEmpresasExpandidas(prev => toggleSet(prev, id));

  const expandirTodos = () => {
    const emps = new Set();
    const cats = new Set();
    const contas = new Set();
    const clientes = new Set();
    const datas = new Set();
    const consumirCategorias = (categorias, empPrefix) => {
      categorias.forEach(cat => {
        const catKey = empPrefix ? `${empPrefix}|${cat.key}` : cat.key;
        cats.add(catKey);
        cat.contas.forEach(conta => {
          const contaKey = `${catKey}|${conta.contaCodigo || 'sem-conta'}`;
          contas.add(contaKey);
          if (conta.clientes) {
            conta.clientes.forEach(cli => {
              const cliKey = `${contaKey}|${cli.clienteNome}`;
              clientes.add(cliKey);
              cli.grupos.forEach(g => datas.add(`${cliKey}|${g.data || 'sem-data'}`));
            });
          } else {
            conta.grupos.forEach(g => datas.add(`${contaKey}|${g.data || 'sem-data'}`));
          }
        });
      });
    };
    if (multiEmpresa) {
      empresasComCategorias.forEach(emp => {
        emps.add(emp.empresaId);
        consumirCategorias(emp.categorias, emp.empresaId);
      });
    } else {
      consumirCategorias(categoriasSingle, null);
    }
    setEmpresasExpandidas(emps);
    setExpandedCats(cats);
    setExpandedContas(contas);
    setExpandedClientes(clientes);
    setExpandedDates(datas);
  };
  const colapsarTodos = () => {
    setExpandedDates(new Set());
    setExpandedClientes(new Set());
    setExpandedContas(new Set());
    setExpandedCats(new Set());
    setEmpresasExpandidas(new Set());
  };

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Sua rede ainda não tem <strong>empresas Autosystem</strong> com <code className="font-mono bg-amber-100 px-1 rounded">empresa_codigo</code> vinculado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Barra sticky de filtros — colada no topo do conteúdo, logo abaixo do ClienteHeader (h-16) */}
      <div className="sticky top-16 z-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 mb-6 sm:mb-8 border-b border-gray-200/50 bg-white/50 supports-[backdrop-filter]:bg-white/40 backdrop-blur-lg">
        <div className="px-4 sm:px-6 lg:px-8 py-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 truncate">Contas a Receber</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Desktop (md+): filtros inline */}
          <div className="hidden md:flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 whitespace-nowrap transition-colors ${ignorarPeriodo ? 'text-gray-300' : 'text-gray-500'}`}>
              <Calendar className="h-3 w-3" /> Vencimento entre
            </span>
            <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
              disabled={ignorarPeriodo}
              className="h-9 rounded-lg border border-gray-200 bg-white/70 px-2 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-50/70 disabled:text-gray-300 disabled:cursor-not-allowed" />
            <span className={`text-[10px] ${ignorarPeriodo ? 'text-gray-300' : 'text-gray-400'}`}>e</span>
            <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
              disabled={ignorarPeriodo}
              className="h-9 rounded-lg border border-gray-200 bg-white/70 px-2 text-xs focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-50/70 disabled:text-gray-300 disabled:cursor-not-allowed" />
            <label
              title="Ignora o filtro de vencimento e busca todos os títulos em aberto"
              className={`inline-flex items-center gap-1.5 h-9 rounded-lg border px-2.5 text-xs font-medium cursor-pointer select-none transition-colors ${
                ignorarPeriodo
                  ? 'border-emerald-300 bg-emerald-50/80 text-emerald-700'
                  : 'border-gray-200 bg-white/70 text-gray-600 hover:bg-white'
              }`}>
              <input type="checkbox" checked={ignorarPeriodo}
                onChange={e => setIgnorarPeriodo(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400" />
              Todo o período
            </label>
          </div>
          {podeFiltrarEmpresa && (
            <div className="hidden md:block">
              <EmpresaMultiSelect
                clientesRede={empresasDisponiveis}
                selecionadas={empresasSelIds}
                onToggle={(id) => setEmpresasSelIds(prev => toggleSet(prev, id))}
                onToggleTodas={() => setEmpresasSelIds(prev =>
                  prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
                )}
              />
            </div>
          )}

          {/* Mobile (<md): botão Filtros que abre drawer */}
          <button onClick={() => setDrawerFiltros(true)}
            className="md:hidden inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-3 h-10 text-sm font-medium text-gray-700 hover:bg-white transition-colors min-w-[44px]">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
            {(() => {
              const n = (ignorarPeriodo ? 1 : 0)
                + (empresasSel.length !== empresasDisponiveis.length ? 1 : 0);
              return n > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1">{n}</span>
              ) : null;
            })()}
          </button>

          <button onClick={() => carregar({ force: true })}
            disabled={loading || empresasSel.length === 0}
            title="Força recarga ignorando o cache"
            aria-label="Atualizar"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-3 md:px-4 h-10 md:h-auto md:py-2 text-sm font-medium text-gray-700 hover:bg-white transition-colors disabled:opacity-50 min-w-[44px]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          </div>
        </div>
      </div>

      {/* Drawer de filtros (mobile) */}
      <FiltrosDrawer open={drawerFiltros} onClose={() => setDrawerFiltros(false)}
        venctoDe={venctoDe} setVenctoDe={setVenctoDe}
        venctoAte={venctoAte} setVenctoAte={setVenctoAte}
        ignorarPeriodo={ignorarPeriodo} setIgnorarPeriodo={setIgnorarPeriodo}
        empresas={empresasDisponiveis} empresasSelIds={empresasSelIds}
        onToggleEmpresa={(id) => setEmpresasSelIds(prev => toggleSet(prev, id))}
        onToggleTodasEmpresas={() => setEmpresasSelIds(prev =>
          prev.size === empresasDisponiveis.length ? new Set() : new Set(empresasDisponiveis.map(c => c.id))
        )}
        podeFiltrarEmpresa={podeFiltrarEmpresa} />


      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4">
        <ResumoCard icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Total em aberto" valor={formatCurrency(totais.total)}
          sub={`${totais.qtd} ${totais.qtd === 1 ? 'lancamento' : 'lancamentos'}`} highlight />
        <ResumoCard icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-600"
          label="Vencidos" valor={formatCurrency(totais.vencidos)}
          sub={`${totais.qtdVencidos} ${totais.qtdVencidos === 1 ? 'lancamento' : 'lancamentos'}`} />
        <ResumoCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Próximos 7 dias" valor={formatCurrency(totais.proximos)}
          sub={`${totais.qtdProximos} ${totais.qtdProximos === 1 ? 'lancamento' : 'lancamentos'}`} />
        <ResumoCard icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="A vencer" valor={formatCurrency(totais.futuros)}
          sub={`${totais.qtdFuturos} ${totais.qtdFuturos === 1 ? 'lancamento' : 'lancamentos'}`} />
      </div>

      {/* Abas por categoria */}
      {(() => {
        const tabs = [
          { k: 'TODAS', label: 'Visão Geral', labelCurto: 'Geral', icon: LayoutGrid, qtd: totais.qtd, valor: totais.total, cor: 'emerald' },
          ...CATEGORIAS.map(c => ({
            k: c.key, label: c.label, labelCurto: c.labelCurto, icon: c.icone,
            qtd: totais.qtdPorCat[c.key] || 0,
            valor: totais.porCat[c.key] || 0,
            cor: c.cor,
          })),
        ];
        return (
          <div className="bg-white rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
            {/* Mobile: grid 2x3 sem scroll */}
            <div className="sm:hidden grid grid-cols-2 gap-1 p-1.5">
              {tabs.map(a => {
                const Icon = a.icon;
                const ativo = filtroCategoria === a.k;
                const pal = TAB_CLASSES[a.cor] || TAB_CLASSES.gray;
                return (
                  <button key={a.k} onClick={() => setFiltroCategoria(a.k)}
                    className={`flex flex-col items-start gap-1 px-2.5 py-2 rounded-lg text-left transition-all min-h-[60px] ${
                      ativo
                        ? `${pal.badgeAtivo} ring-1 ring-current/20`
                        : 'bg-gray-50/60 text-gray-600 active:bg-gray-100'
                    }`}>
                    <span className="flex items-center gap-1.5 w-full min-w-0">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-[11.5px] font-medium truncate flex-1">{a.labelCurto}</span>
                      <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        ativo ? 'bg-white/70' : 'bg-white text-gray-600'
                      }`}>
                        {a.qtd}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[12px] font-semibold w-full truncate">
                      {formatCurrency(a.valor)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Desktop (sm+): linha horizontal com scroll se passar */}
            <div className="hidden sm:flex items-stretch px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
              {tabs.map(a => {
                const Icon = a.icon;
                const ativo = filtroCategoria === a.k;
                const pal = TAB_CLASSES[a.cor] || TAB_CLASSES.gray;
                return (
                  <button key={a.k} onClick={() => setFiltroCategoria(a.k)}
                    className={`flex flex-col items-start gap-0.5 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 min-w-[140px] ${
                      ativo ? pal.borda : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                    }`}>
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{a.label}</span>
                      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        ativo ? pal.badgeAtivo : 'bg-gray-100 text-gray-500'
                      }`}>
                        {a.qtd}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[12px] font-semibold text-gray-800">
                      {formatCurrency(a.valor)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Gráficos da Visão Geral — só aparecem em TODAS */}
      {filtroCategoria === 'TODAS' && enriched.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <GraficoParticipacaoCategorias dados={participacaoCategorias} total={totais.total} onClickCategoria={(key) => setFiltroCategoria(key)} />
            <GraficoProximos14Dias dados={proximos14dias}
              onClickDia={(iso, label, diaSemana) => {
                const titulos = enriched
                  .filter(t => t.vencimentoEfetivo === iso)
                  .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
                if (titulos.length === 0) return;
                setModalDia({ iso, label, diaSemana, titulos });
              }} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <CardTopClientes
              titulo="Top 5 — Faturas vencidas"
              clientes={topClientesFaturas}
              cor={CATEGORIA_COR_HEX.FATURAS}
              icone={Wallet}
              corBgIcone="bg-indigo-50"
              corTextIcone="text-indigo-600"
              onClickCliente={(nome) => {
                setFiltroCategoria('FATURAS'); setBusca(nome);
              }} />
            <CardTopClientes
              titulo="Top 5 — Notas a prazo vencidas"
              clientes={topClientesNotasPrazo}
              cor={CATEGORIA_COR_HEX.NOTAS_PRAZO}
              icone={Receipt}
              corBgIcone="bg-violet-50"
              corTextIcone="text-violet-600"
              onClickCliente={(nome) => {
                setFiltroCategoria('NOTAS_PRAZO'); setBusca(nome);
              }} />
          </div>
          {cartoesVencidosPorConta.length > 0 && (
            <TabelaCartoesVencidosPorConta contas={cartoesVencidosPorConta}
              onClickConta={(conta) => {
                setFiltroCategoria('CARTOES'); setBusca(conta.codigo);
              }} />
          )}
        </>
      )}

      {/* Filtros: busca + status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente, documento ou histórico..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0.5">
          {[
            { k: 'todos', label: 'Todos' },
            { k: 'hoje', label: 'Hoje' },
            { k: 'vencidos', label: 'Vencidos' },
            { k: 'proximos', label: 'Próximos 7d' },
            { k: 'futuros', label: 'A vencer' },
          ].map(tab => (
            <button key={tab.k} onClick={() => setFiltroStatus(tab.k)}
              className={`rounded-md px-2.5 sm:px-3 py-1.5 text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                filtroStatus === tab.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        {/* Filtro "vencidos há ≥ N dias" — ativo quando > 0; clique no × pra limpar */}
        <label className={`h-10 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium flex-shrink-0 ${
          Number(diasVencidosMin) > 0
            ? 'border-rose-300 bg-rose-50 text-rose-700'
            : 'border-gray-200 bg-white text-gray-700'
        }`} title="Mostra somente títulos vencidos há pelo menos X dias">
          <span className="whitespace-nowrap">Vencidos há ≥</span>
          <input type="number" min={0} step={1} value={diasVencidosMin}
            onChange={e => setDiasVencidosMin(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="w-14 h-7 px-1 text-right font-mono tabular-nums rounded border border-gray-200 bg-white text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-200" />
          <span className="text-gray-400">dias</span>
          {Number(diasVencidosMin) > 0 && (
            <button onClick={() => setDiasVencidosMin(0)} title="Limpar filtro"
              className="text-rose-600 hover:text-rose-800 ml-0.5">
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      {/* Tree */}
      {loading ? (
        <SkeletonComercial cards={4} linhas={8} comAbas={false} />
      ) : error && enriched.length === 0 ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os títulos</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : categoriasSingle.length === 0 && !multiEmpresa || (multiEmpresa && empresasComCategorias.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum título pendente' : 'Nenhum título encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Sem lançamentos no período selecionado' : 'Tente ajustar a busca, a categoria ou o status'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-white/10 flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-gray-800">Lançamentos por vencimento</h3>
            </div>
            <span className="text-[11px] text-gray-400 truncate">
              {multiEmpresa
                ? `· ${empresasComCategorias.length} ${empresasComCategorias.length === 1 ? 'empresa' : 'empresas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`
                : `· ${categoriasSingle.length} ${categoriasSingle.length === 1 ? 'categoria' : 'categorias'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors whitespace-nowrap">Expandir</button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors whitespace-nowrap">Colapsar</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{multiEmpresa ? 'Empresa / Data / Documento' : 'Vencimento / Documento'}</th>
                  <th className="px-3 py-2.5">Status</th>
                  {!mostraHierarquiaCliente && <th className="px-3 py-2.5">Cliente</th>}
                  {!mostraHierarquiaCliente && <th className="px-3 py-2.5">Conta (Débito)</th>}
                  <th className="px-3 py-2.5">Histórico</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {(() => {
                  const ctx = {
                    colSpan: mostraHierarquiaCliente ? 3 : 5,
                    mostraHierarquiaCliente,
                    expandedCats, toggleCat,
                    expandedContas, toggleConta,
                    expandedClientes, toggleCliente,
                    expandedDates, toggleDate,
                  };
                  return multiEmpresa
                    ? empresasComCategorias.map(emp => {
                        const empAberta = empresasExpandidas.has(emp.empresaId);
                        return (
                          <React.Fragment key={`emp-${emp.empresaId}`}>
                            <tr onClick={() => toggleEmpresa(emp.empresaId)}
                              className={`cursor-pointer transition-colors ${empAberta ? 'bg-emerald-50/40' : 'hover:bg-gray-50/60'}`}>
                              <td className="px-4 py-2.5" colSpan={ctx.colSpan}>
                                <div className="flex items-center gap-2">
                                  <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                  </motion.div>
                                  <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="h-3.5 w-3.5" />
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-gray-900 truncate">{emp.empresaNome}</p>
                                    <p className="text-[10.5px] text-gray-500">
                                      <span className="font-mono">{emp.empresaCnpj || '—'}</span>
                                      {' · '}{emp.categorias.length} {emp.categorias.length === 1 ? 'forma de recebimento' : 'formas de recebimento'}
                                      {emp.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {emp.qtdVencidos} vencido{emp.qtdVencidos === 1 ? '' : 's'}</span>}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">{emp.qtd}</td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[13px] font-bold text-gray-900">
                                {formatCurrency(emp.total)}
                              </td>
                            </tr>
                            {empAberta && emp.categorias.map(cat =>
                              renderCategoriaTree(cat, emp.empresaId, true, ctx)
                            )}
                          </React.Fragment>
                        );
                      })
                    : categoriasSingle.map(cat =>
                        renderCategoriaTree(cat, null, false, ctx)
                      );
                })()}
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/10">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={mostraHierarquiaCliente ? 3 : 5}>
                    Total · {filtrados.length} {filtrados.length === 1 ? 'titulo' : 'titulos'} em {totalDatas} {totalDatas === 1 ? 'data' : 'datas'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-700">{filtrados.length}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">
                    {formatCurrency(filtrados.reduce((s, t) => s + t.valor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {modalDia && (
        <ModalRecebimentosDia detalhe={modalDia} onClose={() => setModalDia(null)} />
      )}
    </div>
  );
}

// ─── Modal: detalhe dos recebimentos do dia ───────────────────
function ModalRecebimentosDia({ detalhe, onClose }) {
  const [catsAbertas, setCatsAbertas] = useState(() => new Set());
  const [contasAbertas, setContasAbertas] = useState(() => new Set());
  const toggleCat   = (k) => setCatsAbertas(prev   => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleConta = (k) => setContasAbertas(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const { titulos, label, diaSemana } = detalhe;
  const total = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);

  // Agrupa: categoria → conta (codigo+nome) → títulos
  const grupos = useMemo(() => {
    const porCat = new Map(CATEGORIAS.map(c => [c.key, { cat: c, valor: 0, qtd: 0, contas: new Map() }]));
    titulos.forEach(t => {
      const g = porCat.get(t.categoria) || porCat.get('OUTROS');
      g.valor += t.valor; g.qtd++;
      const codChave = `${t.contaCodigo || '—'}|${t.contaNome || ''}`;
      let c = g.contas.get(codChave);
      if (!c) { c = { codigo: t.contaCodigo || '—', nome: t.contaNome || '—', valor: 0, qtd: 0, titulos: [] }; g.contas.set(codChave, c); }
      c.valor += t.valor; c.qtd++; c.titulos.push(t);
    });
    return Array.from(porCat.values())
      .map(g => ({ ...g, contas: Array.from(g.contas.values()).sort((a, b) => b.valor - a.valor) }))
      .filter(g => g.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [titulos]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900">Recebimentos · {diaSemana}, {label}</h2>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-mono tabular-nums">
              {titulos.length} {titulos.length === 1 ? 'título' : 'títulos'} · {formatCurrency(total)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Fechar">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Cards de categoria */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {CATEGORIAS.map(c => {
            const g = grupos.find(x => x.cat.key === c.key);
            const val = g?.valor || 0;
            const qtd = g?.qtd || 0;
            const Icon = c.icone;
            const cor = CATEGORIA_COR_HEX[c.key] || '#94a3b8';
            const ativo = val > 0;
            return (
              <div key={c.key}
                className={`rounded-xl border p-2.5 ${ativo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60 opacity-60'}`}
                style={ativo ? { borderLeftColor: cor, borderLeftWidth: 3 } : undefined}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
                  <p className="text-[11px] font-medium text-gray-700 truncate">{c.label}</p>
                </div>
                <p className="text-[13px] font-bold text-gray-900 font-mono tabular-nums leading-tight">{formatCurrency(val)}</p>
                <p className="text-[10px] text-gray-400">{qtd} {qtd === 1 ? 'tit.' : 'tits.'}</p>
              </div>
            );
          })}
        </div>

        {/* Tree — altura fixa, scroll apenas dentro da tabela */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 min-h-0">
          {grupos.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">Sem títulos.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col h-[50vh] sm:h-[55vh]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs min-w-[480px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="px-3 py-2 bg-gray-100">Detalhamento</th>
                      <th className="px-3 py-2 text-right w-16 bg-gray-100">Qtd</th>
                      <th className="px-3 py-2 text-right w-28 bg-gray-100">Valor</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-gray-100">
                  {grupos.map(g => {
                    const catKey = g.cat.key;
                    const aberta = catsAbertas.has(catKey);
                    const Icon = g.cat.icone;
                    const cor = CATEGORIA_COR_HEX[catKey];
                    return (
                      <React.Fragment key={catKey}>
                        <tr onClick={() => toggleCat(catKey)}
                          className="cursor-pointer hover:bg-gray-50/60">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              </motion.div>
                              <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ backgroundColor: cor + '22', color: cor }}>
                                <Icon className="h-3 w-3" />
                              </div>
                              <div>
                                <p className="text-[12.5px] font-semibold text-gray-800">{g.cat.label}</p>
                                <p className="text-[10px] text-gray-400">{g.contas.length} {g.contas.length === 1 ? 'conta' : 'contas'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">{g.qtd}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">{formatCurrency(g.valor)}</td>
                        </tr>
                        {aberta && g.contas.map(conta => {
                          const contaKey = `${catKey}|${conta.codigo}|${conta.nome}`;
                          const cAberta = contasAbertas.has(contaKey);
                          return (
                            <React.Fragment key={contaKey}>
                              <tr onClick={() => toggleConta(contaKey)}
                                className="cursor-pointer hover:bg-gray-50/40 bg-gray-50/30">
                                <td className="px-3 py-1.5" style={{ paddingLeft: 48 }}>
                                  <div className="flex items-center gap-2">
                                    <motion.div animate={{ rotate: cAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                      <ChevronRight className="h-3 w-3 text-gray-400" />
                                    </motion.div>
                                    <div className="min-w-0">
                                      <p className="text-[11.5px] text-gray-800 truncate max-w-[380px]">{conta.nome}</p>
                                      <p className="text-[10px] text-gray-400 font-mono">{conta.codigo}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11px] text-gray-700">{conta.qtd}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[11.5px] font-medium text-gray-800">{formatCurrency(conta.valor)}</td>
                              </tr>
                              {cAberta && conta.titulos.map((t, i) => (
                                <tr key={`${contaKey}-${i}`} className="hover:bg-gray-50/30">
                                  <td className="px-3 py-1" style={{ paddingLeft: 80 }}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <p className="text-[11px] text-gray-700 truncate max-w-[260px]">{t.clienteNome}</p>
                                      {t.documento && <span className="text-[10px] text-gray-400 font-mono">· {t.documento}</span>}
                                    </div>
                                    {t.empresaNome && (
                                      <p className="text-[10px] text-gray-400 truncate max-w-[260px]" style={{ marginLeft: 0 }}>{t.empresaNome}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-1"></td>
                                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[11px] text-gray-700">{formatCurrency(t.valor)}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                </table>
              </div>
              {/* Footer fora do scroll — sempre visível */}
              <table className="w-full text-xs bg-gray-50/80 border-t-2 border-gray-200 flex-shrink-0">
                <tbody>
                  <tr className="font-semibold">
                    <td className="px-3 py-2 text-[11.5px] text-gray-700">Total</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px] text-gray-700 w-16">{titulos.length}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900 w-28">{formatCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Gráficos da Visão Geral ──────────────────────────────────
function GraficoParticipacaoCategorias({ dados, total, onClickCategoria }) {
  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0);
  if (!dados.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600">
            <PieChartIcon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">Participação por categoria</h3>
        </div>
        <div className="px-6 py-10 text-center text-sm text-gray-500">Sem dados</div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 flex-shrink-0">
          <PieChartIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Participação por categoria</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'título' : 'títulos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      <div className="p-3 grid grid-cols-[1fr_auto] items-center gap-2" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="label"
              cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}
              onClick={(d) => onClickCategoria?.(d.key)}
              style={{ cursor: 'pointer' }}>
              {dados.map((d, i) => <Cell key={i} fill={d.cor} stroke="white" strokeWidth={2} />)}
            </Pie>
            <Tooltip content={<TooltipPie total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-1 pr-3 max-w-[180px]">
          {dados.map(d => {
            const pct = total > 0 ? ((d.valor / total) * 100) : 0;
            return (
              <button key={d.key} onClick={() => onClickCategoria?.(d.key)}
                className="flex items-center gap-2 text-left hover:bg-gray-50 rounded px-1.5 py-0.5 transition-colors">
                <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.cor }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-700 truncate">{d.label}</p>
                  <p className="text-[10px] text-gray-400 font-mono tabular-nums">
                    {pct.toFixed(1)}% · {formatCurrency(d.valor)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TooltipPie({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? ((d.valor / total) * 100) : 0;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{d.label}</p>
      <p className="text-gray-600 mt-0.5">{formatCurrency(d.valor)} · {d.qtd} {d.qtd === 1 ? 'título' : 'títulos'}</p>
      <p className="text-gray-400 text-[10.5px]">{pct.toFixed(1)}% do total</p>
    </div>
  );
}

function GraficoProximos14Dias({ dados, onClickDia }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0);
  const handleBarClick = (data) => {
    if (!onClickDia || !data?.qtd) return;
    onClickDia(data.iso, data.label, data.diaSemana);
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">A receber nos próximos 14 dias</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'título' : 'títulos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      {totalQtd === 0 ? (
        <div className="px-6 py-10 text-center">
          <Calendar className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum recebimento nos próximos 14 dias</p>
        </div>
      ) : (
        <div className="p-3" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 10.5, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => formatCompactBR(v)} />
              <Tooltip content={<TooltipDia />} cursor={{ fill: 'rgba(16, 185, 129, 0.06)' }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                {dados.map((d, i) => (
                  <Cell key={i} fill={d.ehFimSemana ? '#cbd5e1' : '#10b981'}
                    cursor={d.qtd > 0 ? 'pointer' : 'default'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {totalQtd > 0 && (
        <p className="px-5 pb-3 text-[10.5px] text-gray-400 italic">Clique em uma barra para detalhar o dia</p>
      )}
    </div>
  );
}

function TooltipDia({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{d.diaSemana}, {d.label}</p>
      <p className="text-gray-600 mt-0.5">{formatCurrency(d.valor)}</p>
      <p className="text-gray-400 text-[10.5px]">{d.qtd} {d.qtd === 1 ? 'título' : 'títulos'}</p>
    </div>
  );
}

// ─── Drawer de filtros (mobile) ─────────────────────────────────
function FiltrosDrawer({
  open, onClose,
  venctoDe, setVenctoDe, venctoAte, setVenctoAte,
  ignorarPeriodo, setIgnorarPeriodo,
  empresas, empresasSelIds, onToggleEmpresa, onToggleTodasEmpresas,
  podeFiltrarEmpresa,
}) {
  const todasSelecionadas = empresasSelIds.size === empresas.length;
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-white rounded-t-2xl shadow-2xl flex flex-col">
            <div className="flex-shrink-0 px-4 pt-3 pb-2">
              <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-3" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Filtros</h3>
                <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-gray-100" aria-label="Fechar">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
              {/* Período */}
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Vencimento</h4>
                <label className={`flex items-center gap-2 h-12 rounded-xl border px-3 mb-2 cursor-pointer ${
                  ignorarPeriodo ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}>
                  <input type="checkbox" checked={ignorarPeriodo}
                    onChange={e => setIgnorarPeriodo(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400" />
                  <span className={`text-sm font-medium ${ignorarPeriodo ? 'text-emerald-700' : 'text-gray-700'}`}>
                    Todo o período
                  </span>
                </label>
                <div className={`grid grid-cols-2 gap-2 ${ignorarPeriodo ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="block">
                    <span className="text-[11px] text-gray-500 mb-1 block">De</span>
                    <input type="date" value={venctoDe} onChange={e => setVenctoDe(e.target.value)}
                      disabled={ignorarPeriodo}
                      className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-gray-500 mb-1 block">Até</span>
                    <input type="date" value={venctoAte} onChange={e => setVenctoAte(e.target.value)}
                      disabled={ignorarPeriodo}
                      className="w-full h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                  </label>
                </div>
              </section>

              {/* Empresas */}
              {podeFiltrarEmpresa && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Empresas <span className="text-gray-400">({empresasSelIds.size}/{empresas.length})</span>
                    </h4>
                    <button onClick={onToggleTodasEmpresas}
                      className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700">
                      {todasSelecionadas ? 'Limpar' : 'Todas'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {empresas.map(emp => {
                      const sel = empresasSelIds.has(emp.id);
                      return (
                        <label key={emp.id}
                          className={`flex items-center gap-3 min-h-[48px] rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                            sel ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white'
                          }`}>
                          <input type="checkbox" checked={sel}
                            onChange={() => onToggleEmpresa(emp.id)}
                            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{emp.nome}</p>
                            {emp.cnpj && <p className="text-[11px] text-gray-500 font-mono truncate">{emp.cnpj}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
              <button onClick={onClose}
                className="w-full h-12 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors">
                Aplicar filtros
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TabelaCartoesVencidosPorConta({ contas, onClickConta }) {
  const total = contas.reduce((s, c) => s + c.valor, 0);
  const totalQtd = contas.reduce((s, c) => s + c.qtd, 0);
  const maior = contas[0]?.valor || 1;
  const corCartoes = CATEGORIA_COR_HEX.CARTOES;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 flex-shrink-0">
          <CreditCard className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Cartões vencidos por conta</h3>
          <p className="text-[10.5px] text-gray-400">
            {contas.length} {contas.length === 1 ? 'conta' : 'contas'} · {totalQtd} {totalQtd === 1 ? 'recebível' : 'recebíveis'} · {formatCurrency(total)}
          </p>
        </div>
      </div>

      {/* Mobile: cards verticais */}
      <ul className="md:hidden divide-y divide-gray-100">
        {contas.map((c) => {
          const pct = total > 0 ? (c.valor / total) * 100 : 0;
          const pctRel = maior > 0 ? (c.valor / maior) * 100 : 0;
          return (
            <li key={`${c.codigo}|${c.nome}`}>
              <button onClick={() => onClickConta?.(c)}
                className="w-full text-left px-4 py-3 hover:bg-sky-50/30 active:bg-sky-50/50 transition-colors min-h-[68px]">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 truncate" title={c.nome}>{c.nome}</p>
                    <p className="text-[10.5px] text-gray-400 font-mono">{c.codigo} · {c.qtd} {c.qtd === 1 ? 'recebível' : 'recebíveis'}</p>
                  </div>
                  <p className="text-[14px] font-bold text-gray-900 font-mono tabular-nums flex-shrink-0">{formatCurrency(c.valor)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pctRel}%`, backgroundColor: corCartoes }} />
                  </div>
                  <span className="text-[10.5px] text-gray-500 font-mono tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              </button>
            </li>
          );
        })}
        <li className="px-4 py-3 bg-gray-50/80 border-t-2 border-gray-200 flex items-center justify-between font-semibold">
          <span className="text-[12px] text-gray-700">Total ({totalQtd} {totalQtd === 1 ? 'recebível' : 'recebíveis'})</span>
          <span className="text-[14px] text-gray-900 font-mono tabular-nums">{formatCurrency(total)}</span>
        </li>
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <th className="px-4 py-2 bg-gray-100">Conta</th>
              <th className="px-3 py-2 bg-gray-100">Participação</th>
              <th className="px-3 py-2 text-right w-20 bg-gray-100">Recebíveis</th>
              <th className="px-3 py-2 text-right w-32 bg-gray-100">Valor vencido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contas.map((c) => {
              const pct = total > 0 ? (c.valor / total) * 100 : 0;
              const pctRel = maior > 0 ? (c.valor / maior) * 100 : 0;
              return (
                <tr key={`${c.codigo}|${c.nome}`}
                  onClick={() => onClickConta?.(c)}
                  className="hover:bg-sky-50/30 cursor-pointer transition-colors">
                  <td className="px-4 py-2">
                    <p className="text-[12.5px] font-medium text-gray-900 truncate max-w-[420px]" title={c.nome}>{c.nome}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{c.codigo}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pctRel}%`, backgroundColor: corCartoes }} />
                      </div>
                      <span className="text-[10.5px] text-gray-500 font-mono tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-700">{c.qtd}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">{formatCurrency(c.valor)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
            <tr className="font-semibold">
              <td className="px-4 py-2 text-[11.5px] text-gray-700">Total</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px] text-gray-700">{totalQtd}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CardTopClientes({ titulo, clientes, cor, icone: Icone, corBgIcone, corTextIcone, onClickCliente }) {
  const total = clientes.reduce((s, c) => s + c.valor, 0);
  const totalQtd = clientes.reduce((s, c) => s + c.qtd, 0);
  const maior = clientes[0]?.valor || 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg ${corBgIcone} flex items-center justify-center ${corTextIcone} flex-shrink-0`}>
          <Icone className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'título' : 'títulos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      {clientes.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum título nesta categoria</p>
        </div>
      ) : (
        <div className="px-3 py-2 divide-y divide-gray-50">
          {clientes.map((c, i) => {
            const pct = maior > 0 ? (c.valor / maior) * 100 : 0;
            return (
              <button key={c.nome} onClick={() => onClickCliente?.(c.nome)}
                className="w-full text-left py-2 px-2 hover:bg-gray-50/60 rounded-lg transition-colors group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 flex-shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-[12.5px] font-medium text-gray-800 truncate flex-1" title={c.nome}>{c.nome}</p>
                  <p className="text-[12px] font-mono tabular-nums font-semibold text-gray-900 flex-shrink-0">{formatCurrency(c.valor)}</p>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono tabular-nums flex-shrink-0">
                    {c.qtd} {c.qtd === 1 ? 'tit.' : 'tits.'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatCompactBR(v) {
  if (v == null) return '';
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

// ─── Helpers ────────────────────────────────────────────────────
function toggleSet(prev, key) {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

// Render do nó de categoria (forma de recebimento).
// `ctx` carrega colSpan + maps de expandido/toggle + flag mostraHierarquiaCliente.
function renderCategoriaTree(cat, prefix, empresaIndent, ctx) {
  const key = prefix ? `${prefix}|${cat.key}` : cat.key;
  const aberta = ctx.expandedCats.has(key);
  const Icone = cat.icone;
  const corBg = {
    cyan:    'bg-blue-50    text-blue-600',
    violet:  'bg-blue-50  text-blue-600',
    indigo:  'bg-blue-50  text-blue-600',
    teal:    'bg-teal-50    text-teal-600',
    gray:    'bg-gray-100   text-gray-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }[cat.cor] || 'bg-gray-100 text-gray-600';
  const indentPL = empresaIndent ? 48 : 16;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleCat(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/80' : 'hover:bg-gray-50/60'}`}>
        <td className="py-2.5" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${corBg}`}>
              <Icone className="h-3 w-3" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-gray-800">{cat.label}</p>
              <p className="text-[10.5px] text-gray-400">
                {cat.contas.length} {cat.contas.length === 1 ? 'conta' : 'contas'}
                {cat.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {cat.qtdVencidos} vencido{cat.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">{cat.qtd}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900">
          {formatCurrency(cat.total)}
        </td>
      </tr>
      {aberta && cat.contas.map(conta =>
        renderContaTree(conta, key, empresaIndent, ctx)
      )}
    </React.Fragment>
  );
}

// Render do nó de conta (credito_codigo + credito_nome).
function renderContaTree(conta, prefix, empresaIndent, ctx) {
  const contaKey = conta.contaCodigo || 'sem-conta';
  const key = `${prefix}|${contaKey}`;
  const aberta = ctx.expandedContas.has(key);
  const indentPL = empresaIndent ? 80 : 48;
  // Subtítulo muda conforme o modo: clientes (abas com cliente) ou datas
  const subLabel = conta.clientes
    ? `${conta.clientes.length} ${conta.clientes.length === 1 ? 'cliente' : 'clientes'}`
    : `${conta.grupos.length} ${conta.grupos.length === 1 ? 'data' : 'datas'}`;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleConta(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/50' : 'hover:bg-gray-50/40'}`}>
        <td className="py-2" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div>
              <p className="text-[12px] text-gray-800 truncate max-w-[420px]">{conta.contaNome || '—'}</p>
              <p className="text-[10.5px] text-gray-400 font-mono">
                {conta.contaCodigo || '—'}
                {' · '}{subLabel}
                {conta.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {conta.qtdVencidos} vencido{conta.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{conta.qtd}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
          {formatCurrency(conta.total)}
        </td>
      </tr>
      {aberta && (conta.clientes
        ? conta.clientes.map(cli => renderClienteTree(cli, key, empresaIndent, ctx))
        : conta.grupos.map(g => renderGrupoTree(g, key, empresaIndent, ctx)))}
    </React.Fragment>
  );
}

// Render do nó de cliente (somente nas abas Notas a prazo / Faturas / Cheques).
function renderClienteTree(cli, prefix, empresaIndent, ctx) {
  const key = `${prefix}|${cli.clienteNome}`;
  const aberta = ctx.expandedClientes.has(key);
  const indentPL = empresaIndent ? 112 : 80;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleCliente(key)}
        className={`cursor-pointer transition-colors ${aberta ? 'bg-gray-50/40' : 'hover:bg-gray-50/30'}`}>
        <td className="py-2" style={{ paddingLeft: indentPL, paddingRight: 12 }} colSpan={ctx.colSpan}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <div>
              <p className="text-[12px] text-gray-800 truncate max-w-[420px]">{cli.clienteNome}</p>
              <p className="text-[10.5px] text-gray-400">
                {cli.grupos.length} {cli.grupos.length === 1 ? 'data' : 'datas'}
                {cli.qtdVencidos > 0 && <span className="ml-1 text-red-600">· {cli.qtdVencidos} vencido{cli.qtdVencidos === 1 ? '' : 's'}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] text-gray-700">{cli.qtd}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
          {formatCurrency(cli.total)}
        </td>
      </tr>
      {aberta && cli.grupos.map(g => renderGrupoTree(g, key, empresaIndent, ctx))}
    </React.Fragment>
  );
}

function renderGrupoTree(g, prefix, empresaIndent, ctx) {
  const dataKey = g.data || 'sem-data';
  const key = prefix ? `${prefix}|${dataKey}` : dataKey;
  const aberto = ctx.expandedDates.has(key);
  const efet = vencimentoEfetivoIso(g.data) || g.data;
  const rolou = g.data && efet && g.data !== efet;
  const statusCfg = g.vencido
    ? { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200',
        label: g.diasAteVenc !== null ? `Vencido há ${Math.abs(g.diasAteVenc)}d` : 'Vencido',
        bar: 'bg-red-500' }
    : g.proximo
    ? { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',
        label: g.diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${g.diasAteVenc}d`,
        bar: 'bg-amber-500' }
    : { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200',
        label: g.diasAteVenc !== null ? `Em ${g.diasAteVenc}d` : '—',
        bar: 'bg-emerald-500' };
  // empresaIndent adiciona um nível extra (multi-empresa);
  // mostraHierarquiaCliente adiciona o nível de cliente entre conta e data.
  const extraCliente = ctx.mostraHierarquiaCliente ? 32 : 0;
  const indentDataPL = (empresaIndent ? 112 : 80) + extraCliente;
  const indentItemPL = (empresaIndent ? 152 : 120) + extraCliente;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => ctx.toggleDate(key)}
        className={`cursor-pointer transition-colors ${aberto ? 'bg-emerald-50/30' : 'hover:bg-gray-50/60'}`}>
        <td className="py-2.5" style={{ paddingLeft: indentDataPL, paddingRight: 12 }}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: aberto ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </motion.div>
            <span className={`inline-block w-1 h-5 rounded-full ${statusCfg.bar} flex-shrink-0`} />
            <div>
              <p className="text-[12.5px] font-semibold text-gray-900 font-mono tabular-nums">
                {g.data ? formatDataBR(g.data) : 'Sem data'}
              </p>
              <p className="text-[10.5px] text-gray-400">
                {g.data ? diaSemana(g.data) : '—'}
                {rolou && <span className="ml-1 text-amber-600">→ recebe em {formatDataBR(efet)}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.bg} ${statusCfg.text} ring-1 ${statusCfg.ring}`}>
            {statusCfg.label}
          </span>
        </td>
        {!ctx.mostraHierarquiaCliente && <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>}
        {!ctx.mostraHierarquiaCliente && <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>}
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
          {g.itens.length}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold ${g.vencido ? 'text-red-700' : 'text-gray-900'}`}>
          {formatCurrency(g.total)}
        </td>
      </tr>
      {aberto && g.itens.map((t, i) => (
        <tr key={`${key}-${t.documento}-${i}`} className="bg-gray-50/30 hover:bg-gray-50/60">
          <td className="py-1.5" style={{ paddingLeft: indentItemPL, paddingRight: 12 }}>
            <span className="font-mono tabular-nums text-[11.5px] text-gray-700">
              {t.documento || `#${i + 1}`}
            </span>
          </td>
          <td className="px-3 py-1.5" />
          {!ctx.mostraHierarquiaCliente && (
            <td className="px-3 py-1.5 truncate max-w-[240px]">
              <p className="text-[11.5px] text-gray-800 truncate">{t.clienteNome}</p>
            </td>
          )}
          {!ctx.mostraHierarquiaCliente && (
            <td className="px-3 py-1.5">
              <p className="text-[11px] text-gray-700 truncate max-w-[200px]">{t.contaNome || '—'}</p>
              {t.contaCodigo && <p className="text-[10px] text-gray-400 font-mono">{t.contaCodigo}</p>}
            </td>
          )}
          <td className="px-3 py-1.5 text-[11px] text-gray-500 truncate max-w-[260px]">{t.historico || '—'}</td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[12px] font-semibold text-gray-900">
            {formatCurrency(t.valor)}
          </td>
        </tr>
      ))}
    </React.Fragment>
  );
}

function ResumoCard({ icon: Icon, iconBg, iconColor, label, valor, sub, highlight }) {
  return (
    <div className={`bg-white rounded-xl border p-3 sm:p-5 ${highlight ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-gray-100'}`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`rounded-lg ${iconBg} p-2 sm:p-2.5 flex-shrink-0`}>
          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs text-gray-500 mb-0.5 truncate">{label}</p>
          <p className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight truncate">{valor}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function EmpresaMultiSelect({ clientesRede, selecionadas, onToggle, onToggleTodas }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (clientesRede.length === 0) return null;

  const todasMarcadas = selecionadas.size === clientesRede.length;
  const label = selecionadas.size === 0
    ? 'Nenhuma'
    : todasMarcadas
    ? `Todas (${clientesRede.length})`
    : selecionadas.size === 1
    ? clientesRede.find(c => selecionadas.has(c.id))?.nome || '1 selecionada'
    : `${selecionadas.size} empresas`;

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Empresas
        </span>
        <button type="button" onClick={() => setAberto(o => !o)}
          className={`h-9 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-xs transition-colors min-w-[180px] max-w-[260px] ${
            aberto ? 'border-emerald-400 ring-2 ring-emerald-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
          }`}>
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </label>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <button type="button" onClick={onToggleTodas}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todasMarcadas}
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-[12.5px] font-medium text-gray-700">
                {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {clientesRede.map(emp => {
                const marcada = selecionadas.has(emp.id);
                return (
                  <label key={emp.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(emp.id)}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 truncate">{emp.nome}</p>
                      {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
