import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronDown, ChevronRight,
  Clock, AlertTriangle, CheckCircle2, Calendar, Users,
  DollarSign, FileText, CreditCard, ScrollText, Landmark,
  FileCheck, Building2, LayoutGrid, PieChart as PieChartIcon, BarChart3,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import BarraProgressoFetch from '../../../components/ui/BarraProgressoFetch';
import { useClienteSession } from '../../../hooks/useAuth';
import { useEmpresasSelecionadas } from '../../../hooks/useEmpresasSelecionadas';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';
import * as mapService from '../../../services/mapeamentoService';
import * as qualityApi from '../../../services/qualityApiService';
import { formatCurrency } from '../../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil } from '../../../utils/diasUteis';

// ─── Helpers ─────────────────────────────────────────────────
function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

function diffDias(dataIso) {
  if (!dataIso) return null;
  const [y, m, d] = String(dataIso).slice(0, 10).split('-');
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

const pad = (n) => String(n).padStart(2, '0');

// Top clientes com maior valor vencido de uma fonte (agregado por cliente).
function topClientesFonteVencidos(lista, fonte, limite = 5) {
  const mapa = new Map();
  lista.forEach(t => {
    if (t.fonte !== fonte || !t.vencido) return;
    const nome = t.clienteNome || '—';
    let g = mapa.get(nome);
    if (!g) { g = { nome, valor: 0, qtd: 0 }; mapa.set(nome, g); }
    g.valor += t.valor; g.qtd++;
  });
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor).slice(0, limite);
}

function extrairValor(t) {
  return toNumber(
    t.valorSaldo ?? t.saldo ?? t.valorAberto ?? t.valorPendente ??
    t.valor ?? t.valorTitulo ?? t.valorOriginal ?? t.valorLiquido
  );
}

function extrairVencimento(t) {
  // Cartao: dataCredito/dataPrevisao (repasse da adquirente).
  // Cheque "Bom para" (data de depósito/vencimento): a API Quality pode
  // nomear de várias formas — cobrimos as mais prováveis. Se ainda vier
  // vazio, o log "[CHEQUE campos]" (dev) revela o nome exato do campo.
  const raw = t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento ||
    t.dataVencto || t.vencto ||
    t.dataCredito || t.dataPrevisao || t.dataPrevisaoCredito ||
    t.dataBomPara || t.bomPara || t.dataBomPra || t.dataBom || t.dtBomPara || t.bom_para ||
    t.dataDeposito || t.dataDepositar || t.dataParaDeposito ||
    t.dataCompensacao || t.dataCompensar ||
    t.dataPreDatado || t.dataPre || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function extrairEmissao(t) {
  return t.dataEmissao || t.emissao || t.dataCadastro || t.data_emissao || null;
}

function extrairDocumento(t, fonte) {
  if (fonte === 'cartao') {
    // NSU = Numero Sequencial Unico da transacao do cartao
    return t.nsu || t.numeroNsu || t.nsuCartao || t.numeroAutorizacao ||
      t.autorizacao || t.cartaoCodigo || t.codigo || '';
  }
  if (fonte === 'cheque') {
    return t.numeroCheque || t.nrCheque || t.numeroDocumento || t.documento ||
      t.chequeCodigo || t.codigo || '';
  }
  return t.numeroDocumento || t.documento || t.numeroTitulo || t.nrDocumento || t.nrTitulo ||
    t.titulo || t.tituloReceberCodigo || t.duplicataCodigo ||
    t.codigoTitulo || t.codigo || '';
}

function extrairAdministradoraCod(t) {
  return t.administradoraCodigo ?? t.codigoAdministradora ?? null;
}

function extrairBanco(t) {
  return t.banco || t.nomeBanco || t.agencia || '';
}

function extrairClienteCod(t) {
  return t.clienteCodigo ?? t.codigoCliente ?? t.pessoaCodigo ?? t.codigoPessoa ?? null;
}

function extrairClienteNome(t) {
  return t.clienteNome || t.cliente || t.nomeCliente || t.razao || t.razaoSocial || t.fantasia || '';
}

function extrairHistorico(t) {
  return t.historico || t.observacao || t.observacoes || t.descricao || '';
}

function extrairParcela(t) {
  const p = t.parcela ?? t.numeroParcela ?? t.parcelaAtual ?? null;
  const tot = t.totalParcelas ?? t.quantidadeParcelas ?? null;
  if (p && tot) return `${p}/${tot}`;
  if (p) return String(p);
  return '';
}

const FONTE_CFG = {
  titulo: {
    label: 'Título',
    icon: ScrollText,
    chipBg: 'bg-blue-50',
    chipColor: 'text-blue-700',
    chipRing: 'ring-blue-200',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  duplicata: {
    label: 'Duplicata',
    icon: Landmark,
    chipBg: 'bg-blue-50',
    chipColor: 'text-blue-700',
    chipRing: 'ring-blue-200',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  cartao: {
    label: 'Cartão',
    icon: CreditCard,
    chipBg: 'bg-blue-50',
    chipColor: 'text-blue-700',
    chipRing: 'ring-blue-200',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  cheque: {
    label: 'Cheque',
    icon: FileCheck,
    chipBg: 'bg-teal-50',
    chipColor: 'text-teal-700',
    chipRing: 'ring-teal-200',
    iconBg: 'bg-teal-50 text-teal-600',
  },
};

// Cor do "dot" por fonte, usado na tree-table.
const DOT_FONTE = {
  titulo: 'bg-indigo-400', duplicata: 'bg-violet-400',
  cartao: 'bg-cyan-400', cheque: 'bg-teal-400',
};

// Cores (hex) por fonte para os gráficos.
const CORES_FONTE = { titulo: '#8b5cf6', duplicata: '#6366f1', cartao: '#0ea5e9', cheque: '#14b8a6' };

// Ordem das fontes na rosca/legenda (espelha o autosystem: Cartões, Notas
// (=Títulos), Faturas (=Duplicatas), Cheques).
const ORDEM_FONTES = ['cartao', 'titulo', 'duplicata', 'cheque'];

// Formata valores compactos para eixos (1,2M / 340k).
const fmtCompacto = (v) => {
  const n = Math.abs(v);
  if (n >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
};

// ─── Cache em memoria (sobrevive a desmontagens da pagina) ──────
// TTL = 5 min, mesmo padrao dos endpoints internos do qualityApi.
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheContasReceber = {
  data: null,        // { lista, clientesMap, administradorasMap, warnings }
  empresasKey: null,
  timestamp: 0,
};
function chaveEmpresas(empresasSelIds) {
  return Array.from(empresasSelIds).sort().join(',');
}
function cacheValido(empresasKey) {
  return _cacheContasReceber.data
    && _cacheContasReceber.empresasKey === empresasKey
    && (Date.now() - _cacheContasReceber.timestamp) < CACHE_TTL_MS;
}

// ─── Componente ──────────────────────────────────────────────
export default function ClienteContasReceber() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];

  // Seleção SINCRONIZADA entre páginas (persiste em localStorage)
  const [empresasSelIds, setEmpresasSelIds] = useEmpresasSelecionadas(
    clientesRede, session?.chaveApi?.id
  );
  const empresasSel = useMemo(
    () => clientesRede.filter(c => empresasSelIds.has(c.id)),
    [clientesRede, empresasSelIds]
  );
  const podeFiltrarEmpresa = clientesRede.length > 1;

  // Hidrata a partir do cache
  const empresasKeyInicial = chaveEmpresas(empresasSelIds);
  const cacheInicial = cacheValido(empresasKeyInicial) ? _cacheContasReceber.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [lista, setLista] = useState(cacheInicial?.lista || []);
  const [clientesMap, setClientesMap] = useState(cacheInicial?.clientesMap || new Map());
  const [administradorasMap, setAdministradorasMap] = useState(cacheInicial?.administradorasMap || new Map());
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState(cacheInicial?.warnings || []);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  const [filtroFonte, setFiltroFonte] = useState('todos');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const carregar = useCallback(async ({ force = false, silencioso = false } = {}) => {
    if (empresasSel.length === 0) {
      setError('Selecione ao menos uma empresa.');
      setLista([]);
      setLoading(false);
      return;
    }

    // Tenta servir do cache antes de bater na API
    const empresasKey = chaveEmpresas(empresasSelIds);
    if (!force && cacheValido(empresasKey)) {
      const c = _cacheContasReceber.data;
      setLista(c.lista);
      setClientesMap(c.clientesMap);
      setAdministradorasMap(c.administradorasMap);
      setWarnings(c.warnings || []);
      setError(null);
      setLoading(false);
      return;
    }

    if (!silencioso) setLoading(true);
    setError(null);
    setWarnings([]);
    // 4 endpoints de titulos por empresa + 2 catalogos por chave_api distinta
    const chavesDistintas = new Set(empresasSel.map(e => e.chave_api_id).filter(Boolean));
    const totalTarefas = empresasSel.length * 4 + chavesDistintas.size * 2;
    setProgresso({ feitos: 0, total: totalTarefas });
    const tick = () => setProgresso(p => ({ ...p, feitos: p.feitos + 1 }));
    try {
      const chaves = await mapService.listarChavesApi();

      // Todos os endpoints de contas a receber exigem dataInicial/dataFinal.
      // Janela: 2 anos para tras + 1 ano a frente, filtrando apenasPendente=true.
      const hoje = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);
      const doisAnosAtras = new Date(hoje); doisAnosAtras.setFullYear(hoje.getFullYear() - 2);
      const umAnoAFrente = new Date(hoje); umAnoAFrente.setFullYear(hoje.getFullYear() + 1);

      const erros = [];
      const seguro = (nome, promise) => promise.catch(err => {
        console.warn(`[ContasReceber] ${nome} falhou:`, err);
        erros.push({ nome, msg: err.message });
        return [];
      }).finally(tick);

      // FETCH PARALELO TOTAL: catalogos (clientes + administradoras) e
      // titulos/duplicatas/cartoes/cheques de cada empresa disparam todos
      // ao mesmo tempo. Cada chamada do qualityApiService ja paginalisa
      // internamente em chunks paralelos por dia, com cache + dedup global.
      const clientesPorChave = new Map();
      const admPorChave = new Map();

      const catalogoPromises = Array.from(chavesDistintas).map(async (chaveApiId) => {
        const chave = chaves.find(c => c.id === chaveApiId);
        if (!chave) { tick(); tick(); return; }
        // Mesmo dentro de cada chave_api, clientes e administradoras correm juntos
        const [clientesQ, administradorasQ] = await Promise.all([
          seguro(`CLIENTE @${chaveApiId}`, qualityApi.buscarClientesQuality(chave.chave)),
          seguro(`ADMINISTRADORA @${chaveApiId}`, qualityApi.buscarAdministradoras(chave.chave)),
        ]);
        const mapaCli = new Map();
        (clientesQ || []).forEach(c => {
          const cod = c.clienteCodigo ?? c.codigo;
          if (cod != null) mapaCli.set(cod, c.razao || c.fantasia || c.nome || `Cliente #${cod}`);
        });
        clientesPorChave.set(chaveApiId, mapaCli);

        const mapaAdm = new Map();
        (administradorasQ || []).forEach(a => {
          const cod = a.administradoraCodigo ?? a.codigo ?? a.codigoAdministradora;
          const nome = a.descricao || a.nomeAdministradora || a.nome ||
            a.razao || a.razaoSocial || a.fantasia || a.nomeFantasia || '';
          if (cod != null && nome) mapaAdm.set(cod, nome);
        });
        admPorChave.set(chaveApiId, mapaAdm);
      });

      const titulosPromises = empresasSel.map(async (emp) => {
        const chave = chaves.find(c => c.id === emp.chave_api_id);
        if (!chave) {
          for (let i = 0; i < 4; i++) tick();
          return [];
        }
        const filtros = {
          empresaCodigo: emp.empresa_codigo,
          apenasPendente: true,
          dataInicial: fmt(doisAnosAtras),
          dataFinal: fmt(umAnoAFrente),
        };
        const [titulos, duplicatas, cartoes, cheques] = await Promise.all([
          seguro(`TITULO_RECEBER #${emp.empresa_codigo}`, qualityApi.buscarTitulosReceber(chave.chave, filtros)),
          seguro(`DUPLICATA #${emp.empresa_codigo}`,      qualityApi.buscarDuplicatas(chave.chave, filtros)),
          seguro(`CARTAO #${emp.empresa_codigo}`,         qualityApi.buscarCartoes(chave.chave, filtros)),
          seguro(`CHEQUE #${emp.empresa_codigo}`,         qualityApi.buscarCheques(chave.chave, filtros)),
        ]);
        // Diagnóstico (dev): revela os campos reais do cheque — procure a
        // data "Bom para" para mapear em extrairVencimento se ainda vier vazia.
        if (import.meta.env.DEV && Array.isArray(cheques) && cheques.length) {
          console.info('[CHEQUE campos]', Object.keys(cheques[0]), cheques[0]);
        }
        const tag = (arr, fonte) => (arr || []).map(r => ({
          fonte,
          raw: r,
          empresaId: emp.id,
          empresaNome: emp.nome,
          chaveApiId: emp.chave_api_id,
        }));
        return [
          ...tag(titulos, 'titulo'),
          ...tag(duplicatas, 'duplicata'),
          ...tag(cartoes, 'cartao'),
          ...tag(cheques, 'cheque'),
        ];
      });

      // Dispara catalogos + transacionais juntos
      const [, resultadosPorEmp] = await Promise.all([
        Promise.all(catalogoPromises),
        Promise.all(titulosPromises),
      ]);
      setWarnings(erros);

      // Mescla os mapas em chaves compostas chaveApiId:codigo (evita colisao)
      const mapaCliGlobal = new Map();
      clientesPorChave.forEach((mapa, chaveApiId) => {
        mapa.forEach((nome, cod) => mapaCliGlobal.set(`${chaveApiId}:${cod}`, nome));
      });
      const mapaAdmGlobal = new Map();
      admPorChave.forEach((mapa, chaveApiId) => {
        mapa.forEach((nome, cod) => mapaAdmGlobal.set(`${chaveApiId}:${cod}`, nome));
      });

      const novaLista = resultadosPorEmp.flat();
      setClientesMap(mapaCliGlobal);
      setAdministradorasMap(mapaAdmGlobal);
      setLista(novaLista);

      // Persiste no cache
      _cacheContasReceber.data = {
        lista: novaLista,
        clientesMap: mapaCliGlobal,
        administradorasMap: mapaAdmGlobal,
        warnings: erros,
      };
      _cacheContasReceber.empresasKey = empresasKey;
      _cacheContasReceber.timestamp = Date.now();
    } catch (err) {
      setError(err.message);
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [empresasSel, empresasSelIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh em background a cada 5min (silencioso)
  useAutoRefresh(() => {
    if (empresasSel.length > 0) carregar({ force: true, silencioso: true });
  });

  const enriched = useMemo(() => {
    return lista.map(it => {
      const t = it.raw;
      const chaveApiId = it.chaveApiId;
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      const valor = extrairValor(t);
      const cliCod = extrairClienteCod(t);
      const cliNome = extrairClienteNome(t)
        || (cliCod != null ? clientesMap.get(`${chaveApiId}:${cliCod}`) : '')
        || (cliCod != null ? clientesMap.get(cliCod) : '')
        || 'Cliente';

      // Para CARTAO: resolve administradora pelo codigo (mostra descricao, nao codigo)
      let admNome = '';
      if (it.fonte === 'cartao') {
        const admCod = extrairAdministradoraCod(t);
        const inline = t.administradoraDescricao || t.administradoraNome ||
          (typeof t.administradora === 'string' ? t.administradora : '');
        admNome = inline
          || (admCod != null ? administradorasMap.get(`${chaveApiId}:${admCod}`) : '')
          || (admCod != null ? administradorasMap.get(admCod) : '')
          || '';
      }
      // Para CHEQUE: banco/agencia ajuda a identificar
      const banco = it.fonte === 'cheque' ? extrairBanco(t) : '';

      return {
        ...it,
        valor,
        vencimento: venc,
        emissao: extrairEmissao(t),
        documento: extrairDocumento(t, it.fonte),
        parcela: extrairParcela(t),
        historico: extrairHistorico(t),
        clienteNome: cliNome,
        clienteCodigo: cliCod,
        administradoraNome: admNome,
        banco,
        diasAteVenc: dias,
        vencido: dias !== null && dias < 0,
        proximo: dias !== null && dias >= 0 && dias <= 7,
      };
    });
  }, [lista, clientesMap, administradorasMap]);

  // "Hoje" considera o proximo dia util quando hoje nao e util, alem de
  // fins de semana/feriados imediatamente anteriores — mesmo mecanismo do
  // dashboard.
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
    return enriched.filter(t => {
      if (filtroFonte !== 'todos' && t.fonte !== filtroFonte) return false;
      if (filtroStatus === 'hoje' && !(t.vencimento && datasHoje.has(t.vencimento))) return false;
      if (filtroStatus === 'vencidos' && !t.vencido) return false;
      if (filtroStatus === 'proximos' && (t.vencido || !t.proximo)) return false;
      if (filtroStatus === 'futuros' && (t.vencido || t.proximo)) return false;
      if (!q) return true;
      return (
        t.clienteNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, busca, filtroStatus, filtroFonte, datasHoje]);

  // Agrupa por data
  const agruparPorData = (lista) => {
    const mapa = new Map();
    lista.forEach(t => {
      const key = t.vencimento || 'sem-data';
      if (!mapa.has(key)) mapa.set(key, { data: t.vencimento, itens: [], total: 0, porFonte: {} });
      const g = mapa.get(key);
      g.itens.push(t);
      g.total += t.valor;
      g.porFonte[t.fonte] = (g.porFonte[t.fonte] || 0) + t.valor;
    });
    const arr = Array.from(mapa.values());
    arr.sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return a.data.localeCompare(b.data);
    });
    arr.forEach(g => {
      const dias = diffDias(g.data);
      g.diasAteVenc = dias;
      g.vencido = dias !== null && dias < 0;
      g.proximo = dias !== null && dias >= 0 && dias <= 7;
      g.itens.sort((a, b) => b.valor - a.valor);
    });
    return arr;
  };

  // Sempre agrupa em árvore: empresa → data → itens (tree-table).
  const empresasComGrupos = useMemo(() => {
    const porEmp = new Map();
    filtrados.forEach(t => {
      const empId = t.empresaId ?? 'sem-empresa';
      if (!porEmp.has(empId)) {
        porEmp.set(empId, {
          empresaId: empId,
          empresaNome: t.empresaNome || 'Sem empresa',
          itens: [], total: 0, qtdVencidos: 0,
        });
      }
      const e = porEmp.get(empId);
      e.itens.push(t);
      e.total += t.valor;
      if (t.vencido) e.qtdVencidos += 1;
    });
    return Array.from(porEmp.values())
      .map(e => ({ ...e, grupos: agruparPorData(e.itens), qtd: e.itens.length }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // Base dos cards: reflete a aba (fonte) + busca, mas NÃO o status — pois os
  // 4 cards são justamente a quebra por status (total/vencidos/próximos/a vencer)
  // daquela aba. Ao trocar de aba, os cards acompanham os valores da fonte.
  const baseCards = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriched.filter(t => {
      if (filtroFonte !== 'todos' && t.fonte !== filtroFonte) return false;
      if (!q) return true;
      return (
        t.clienteNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, filtroFonte, busca]);

  const totais = useMemo(() => {
    const vencidos = baseCards.filter(t => t.vencido);
    const proximos = baseCards.filter(t => !t.vencido && t.proximo);
    const futuros = baseCards.filter(t => !t.vencido && !t.proximo);
    return {
      total: baseCards.reduce((s, t) => s + t.valor, 0),
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
    };
  }, [baseCards]);

  // ── Dashboard da Visão Geral (modelo autosystem) ──
  // Participação por categoria (rosca) — panorama completo, independe de busca.
  const participacaoCategorias = useMemo(() => {
    const acc = {}; const qtd = {};
    ORDEM_FONTES.forEach(k => { acc[k] = 0; qtd[k] = 0; });
    enriched.forEach(t => { acc[t.fonte] = (acc[t.fonte] || 0) + t.valor; qtd[t.fonte] = (qtd[t.fonte] || 0) + 1; });
    return ORDEM_FONTES
      .map(k => ({ key: k, label: FONTE_CFG[k]?.label || k, valor: acc[k] || 0, qtd: qtd[k] || 0, cor: CORES_FONTE[k] || '#94a3b8' }))
      .filter(c => c.valor > 0);
  }, [enriched]);

  // A receber nos próximos 14 dias — soma por dia de vencimento (inclui fins
  // de semana com valor 0).
  const proximos14dias = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const dow = d.getDay();
      dias.push({
        iso, label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        diaSemana: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow],
        ehFimSemana: dow === 0 || dow === 6, valor: 0, qtd: 0,
      });
    }
    const mapaDias = new Map(dias.map(d => [d.iso, d]));
    enriched.forEach(t => { const g = mapaDias.get(t.vencimento); if (g) { g.valor += t.valor; g.qtd++; } });
    return dias;
  }, [enriched]);

  // Top 5 clientes vencidos (Duplicatas ↔ Faturas; Títulos ↔ Notas a prazo).
  const topDuplicatasVencidas = useMemo(() => topClientesFonteVencidos(enriched, 'duplicata'), [enriched]);
  const topTitulosVencidos = useMemo(() => topClientesFonteVencidos(enriched, 'titulo'), [enriched]);

  // Cartões vencidos por administradora (equivalente ao "por conta" do autosystem).
  const cartoesVencidosPorAdm = useMemo(() => {
    const mapa = new Map();
    enriched.forEach(t => {
      if (!t.vencido || t.fonte !== 'cartao') return;
      const nome = t.administradoraNome || 'Sem administradora';
      let g = mapa.get(nome);
      if (!g) { g = { nome, valor: 0, qtd: 0 }; mapa.set(nome, g); }
      g.valor += t.valor; g.qtd++;
    });
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
  }, [enriched]);

  // Recolhe a tree quando filtros/empresas mudam — usuario expande sob demanda.
  // Com uma única empresa, já deixa ela aberta (evita um clique que não agrega).
  useEffect(() => {
    setEmpresasExpandidas(
      empresasComGrupos.length === 1
        ? new Set([empresasComGrupos[0].empresaId])
        : new Set()
    );
    setExpandedDates(new Set());
  }, [filtroStatus, filtroFonte, empresasComGrupos]);

  const toggleDate = (key) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleEmpresa = (empId) => {
    setEmpresasExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };

  const expandirTodos = () => {
    setEmpresasExpandidas(new Set(empresasComGrupos.map(e => e.empresaId)));
    const datas = new Set();
    empresasComGrupos.forEach(e =>
      e.grupos.forEach(g => datas.add(`${e.empresaId}|${g.data || 'sem-data'}`))
    );
    setExpandedDates(datas);
  };
  const colapsarTodos = () => {
    setExpandedDates(new Set());
    setEmpresasExpandidas(new Set());
  };

  if (clientesRede.length === 0) {
    return (
      <div>
        <PageHeader title="Contas a Receber" description="Valores pendentes em aberto" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Sua rede ainda não tem <strong>empresas Webposto</strong> ativas. Contate o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Contas a Receber"
        description="Títulos, duplicatas e cartões em aberto"
      >
        {podeFiltrarEmpresa && (
          <EmpresaMultiSelect
            clientesRede={clientesRede}
            selecionadas={empresasSelIds}
            onToggle={(id) => setEmpresasSelIds(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
            onToggleTodas={() => setEmpresasSelIds(prev =>
              prev.size === clientesRede.length ? new Set() : new Set(clientesRede.map(c => c.id))
            )}
          />
        )}
      </PageHeader>

      {/* Barra de progresso da busca */}
      <BarraProgressoFetch
        loading={loading}
        feitos={progresso.feitos}
        total={progresso.total}
      />

      {/* Warnings parciais por endpoint */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">
              Dados parciais: {warnings.length} {warnings.length === 1 ? 'fonte não pode ser carregada' : 'fontes não puderam ser carregadas'}
            </p>
            <ul className="text-xs text-amber-700/90 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}><span className="font-mono">{w.nome}</span>: {w.msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Abas por tipo (fonte) — acima dos cards. Ao clicar, os cards abaixo
          passam a refletir os valores daquela fonte. */}
      <div className="bg-white rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 overflow-x-auto">
          {[
            { k: 'todos',     label: 'Visão Geral', icon: LayoutGrid,               ativoCls: 'border-emerald-600 text-emerald-700' },
            { k: 'titulo',    label: 'Títulos',     icon: FONTE_CFG.titulo.icon,    ativoCls: 'border-blue-600 text-blue-700' },
            { k: 'duplicata', label: 'Duplicatas',  icon: FONTE_CFG.duplicata.icon, ativoCls: 'border-blue-600 text-blue-700' },
            { k: 'cartao',    label: 'Cartões',     icon: FONTE_CFG.cartao.icon,    ativoCls: 'border-blue-600 text-blue-700' },
            { k: 'cheque',    label: 'Cheques',     icon: FONTE_CFG.cheque.icon,    ativoCls: 'border-teal-600 text-teal-700' },
          ].map(a => {
            const Icon = a.icon;
            const ativo = filtroFonte === a.k;
            return (
              <button key={a.k} onClick={() => setFiltroFonte(a.k)}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo ? a.ativoCls : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60 dark:hover:bg-white/5'
                }`}>
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumo — acompanha a aba (fonte) selecionada */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <ResumoCard icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Total em aberto" valor={formatCurrency(totais.total)} highlight />
        <ResumoCard icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-600"
          label="Vencidos" valor={formatCurrency(totais.vencidos)} danger />
        <ResumoCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Próximos 7 dias" valor={formatCurrency(totais.proximos)} />
        <ResumoCard icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="A vencer" valor={formatCurrency(totais.futuros)} />
      </div>

      {/* Dashboard da Visão Geral (modelo autosystem) — só na aba "todos" */}
      {filtroFonte === 'todos' && enriched.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <CardParticipacaoCategorias dados={participacaoCategorias} onClickCategoria={(key) => setFiltroFonte(key)} />
            <GraficoProximos14Dias dados={proximos14dias} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <CardTopClientes
              titulo="Top 5 — Duplicatas vencidas"
              clientes={topDuplicatasVencidas}
              cor={CORES_FONTE.duplicata}
              icone={FONTE_CFG.duplicata.icon}
              corBgIcone="bg-indigo-50" corTextIcone="text-indigo-600"
              onClickCliente={(nome) => { setFiltroFonte('duplicata'); setBusca(nome); }} />
            <CardTopClientes
              titulo="Top 5 — Títulos vencidos"
              clientes={topTitulosVencidos}
              cor={CORES_FONTE.titulo}
              icone={FONTE_CFG.titulo.icon}
              corBgIcone="bg-violet-50" corTextIcone="text-violet-600"
              onClickCliente={(nome) => { setFiltroFonte('titulo'); setBusca(nome); }} />
          </div>
          {cartoesVencidosPorAdm.length > 0 && (
            <TabelaCartoesPorAdministradora
              contas={cartoesVencidosPorAdm}
              onClickConta={(c) => { setFiltroFonte('cartao'); setBusca(c.nome); }} />
          )}
        </>
      )}

      {/* Filtros: busca + status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente, documento ou histórico..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
          {[
            { k: 'todos', label: 'Todos' },
            { k: 'hoje', label: 'Hoje' },
            { k: 'vencidos', label: 'Vencidos' },
            { k: 'proximos', label: 'Próximos 7d' },
            { k: 'futuros', label: 'A vencer' },
          ].map(tab => (
            <button
              key={tab.k}
              onClick={() => setFiltroStatus(tab.k)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                filtroStatus === tab.k
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tree */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm">Carregando valores pendentes...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os valores</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum valor pendente' : 'Nenhum lançamento encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Não ha contas a receber em aberto' : 'Tente ajustar a busca ou os filtros'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
              {`${empresasComGrupos.length} ${empresasComGrupos.length === 1 ? 'empresa' : 'empresas'} • ${filtrados.length} ${filtrados.length === 1 ? 'lancamento' : 'lancamentos'}`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-gray-500 hover:text-emerald-600 transition-colors">
                Expandir todos
              </button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-gray-500 hover:text-emerald-600 transition-colors">
                Colapsar todos
              </button>
            </div>
          </div>
          {/* Tree-table: empresa → data → cliente. Documento / Histórico / Valor em colunas. */}
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50/70 dark:bg-white/5 border-b border-gray-100 dark:border-white/10 text-[10.5px] uppercase tracking-wider text-gray-500">
                    <th className="text-left font-semibold px-4 py-2.5">Empresa / Data / Cliente</th>
                    <th className="text-left font-semibold px-3 py-2.5 hidden sm:table-cell whitespace-nowrap">Documento</th>
                    <th className="text-left font-semibold px-3 py-2.5 hidden md:table-cell">Histórico</th>
                    <th className="text-right font-semibold px-4 py-2.5 whitespace-nowrap">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {empresasComGrupos.map(emp => {
                    const empAberta = empresasExpandidas.has(emp.empresaId);
                    return (
                      <Fragment key={emp.empresaId}>
                        {/* Nível 1 — empresa */}
                        <tr
                          onClick={() => toggleEmpresa(emp.empresaId)}
                          className="cursor-pointer border-b border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 hover:bg-gray-100/60 dark:hover:bg-white/10"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <ChevronRight className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${empAberta ? 'rotate-90' : ''}`} />
                              <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                              <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{emp.empresaNome}</span>
                              <span className="text-[10.5px] text-gray-400 whitespace-nowrap">
                                {emp.qtd} lanç.
                                {emp.qtdVencidos > 0 && <span className="text-red-500"> · {emp.qtdVencidos} venc.</span>}
                              </span>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell" />
                          <td className="hidden md:table-cell" />
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatCurrency(emp.total)}</td>
                        </tr>

                        {empAberta && emp.grupos.map(g => {
                          const dataKey = `${emp.empresaId}|${g.data || 'sem-data'}`;
                          const dataAberta = expandedDates.has(dataKey);
                          return (
                            <Fragment key={dataKey}>
                              {/* Nível 2 — data (vencimento) */}
                              <tr
                                onClick={() => toggleDate(dataKey)}
                                className="cursor-pointer border-b border-gray-100/70 dark:border-white/5 hover:bg-gray-50/70 dark:hover:bg-white/5"
                              >
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-2 pl-6">
                                    <ChevronRight className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${dataAberta ? 'rotate-90' : ''}`} />
                                    <Calendar className={`h-3.5 w-3.5 flex-shrink-0 ${g.vencido ? 'text-red-500' : 'text-gray-400'}`} />
                                    <span className={`font-medium ${g.vencido ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {g.data ? formatDataBR(g.data) : 'Sem data'}
                                    </span>
                                    <span className="text-[10.5px] text-gray-400 whitespace-nowrap">{g.itens.length} {g.itens.length === 1 ? 'lanç.' : 'lanç.'}</span>
                                    {g.vencido && <span className="text-[10px] font-medium text-red-500">vencido</span>}
                                  </div>
                                </td>
                                <td className="hidden sm:table-cell" />
                                <td className="hidden md:table-cell" />
                                <td className={`px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap ${g.vencido ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>{formatCurrency(g.total)}</td>
                              </tr>

                              {/* Nível 3 — cliente (lançamento) */}
                              {dataAberta && g.itens.map((t, i) => (
                                <tr key={`${t.fonte}-${t.documento}-${i}`} className="border-b border-gray-50 dark:border-white/5 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2 pl-12">
                                      <span
                                        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${DOT_FONTE[t.fonte] || 'bg-gray-300'}`}
                                        title={FONTE_CFG[t.fonte]?.label}
                                      />
                                      <Users className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                      <span className="text-gray-800 dark:text-gray-200 truncate">{t.clienteNome}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 hidden sm:table-cell font-mono text-[12px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {t.documento ? (t.fonte === 'cartao' ? `NSU ${t.documento}` : t.documento) : '—'}
                                  </td>
                                  <td className="px-3 py-2 hidden md:table-cell text-gray-500 dark:text-gray-400 text-[12.5px] max-w-[280px] truncate" title={t.historico || ''}>
                                    {t.historico || '—'}
                                  </td>
                                  <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${t.vencido ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-800 dark:text-gray-200'}`}>{formatCurrency(t.valor)}</td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResumoCard({ icon: Icon, iconBg, iconColor, label, valor, sub, highlight, danger }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : danger ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${iconBg} p-2.5 flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs mb-0.5 ${danger ? 'text-red-600' : 'text-gray-500'}`}>{label}</p>
          <p className={`text-lg font-semibold tracking-tight truncate ${danger ? 'text-red-700' : 'text-gray-900'}`}>{valor}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Participação por categoria (rosca + legenda clicável) ──────
function CardParticipacaoCategorias({ dados, onClickCategoria }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0);
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 flex-shrink-0">
          <PieChartIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Participação por categoria</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'lançamento' : 'lançamentos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      {dados.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-gray-500">Sem dados</div>
      ) : (
        <div className="p-3 grid grid-cols-[1fr_auto] items-center gap-2" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dados} dataKey="valor" nameKey="label"
                cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}
                onClick={(d) => onClickCategoria?.(d.key)} style={{ cursor: 'pointer' }}>
                {dados.map((d, i) => <Cell key={i} fill={d.cor} stroke="white" strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<TooltipPie total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-1 pr-3 max-w-[180px]">
            {dados.map(d => {
              const pct = total > 0 ? (d.valor / total) * 100 : 0;
              return (
                <button key={d.key} onClick={() => onClickCategoria?.(d.key)}
                  className="flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 rounded px-1.5 py-0.5 transition-colors">
                  <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.cor }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{d.label}</p>
                    <p className="text-[10px] text-gray-400 font-mono tabular-nums">{pct.toFixed(1)}% · {formatCurrency(d.valor)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TooltipPie({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? (d.valor / total) * 100 : 0;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{d.label}</p>
      <p className="text-gray-600 mt-0.5">{formatCurrency(d.valor)} · {d.qtd} {d.qtd === 1 ? 'lançamento' : 'lançamentos'}</p>
      <p className="text-gray-400 text-[10.5px]">{pct.toFixed(1)}% do total</p>
    </div>
  );
}

// ─── A receber nos próximos 14 dias (barras por dia) ────────────
function GraficoProximos14Dias({ dados }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const totalQtd = dados.reduce((s, d) => s + d.qtd, 0);
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">A receber nos próximos 14 dias</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'lançamento' : 'lançamentos'} · {formatCurrency(total)}
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
              <YAxis tick={{ fontSize: 10.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtCompacto} />
              <Tooltip content={<TooltipDia />} cursor={{ fill: 'rgba(16, 185, 129, 0.06)' }} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {dados.map((d, i) => <Cell key={i} fill={d.ehFimSemana ? '#cbd5e1' : '#10b981'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
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
      <p className="text-gray-400 text-[10.5px]">{d.qtd} {d.qtd === 1 ? 'lançamento' : 'lançamentos'}</p>
    </div>
  );
}

// ─── Top 5 clientes vencidos (barra de progresso) ───────────────
function CardTopClientes({ titulo, clientes, cor, icone, corBgIcone, corTextIcone, onClickCliente }) {
  const Icone = icone;
  const total = clientes.reduce((s, c) => s + c.valor, 0);
  const totalQtd = clientes.reduce((s, c) => s + c.qtd, 0);
  const maior = clientes[0]?.valor || 1;
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg ${corBgIcone} flex items-center justify-center ${corTextIcone} flex-shrink-0`}>
          <Icone className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{titulo}</h3>
          <p className="text-[10.5px] text-gray-400">
            {totalQtd} {totalQtd === 1 ? 'lançamento' : 'lançamentos'} · {formatCurrency(total)}
          </p>
        </div>
      </div>
      {clientes.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Nenhum lançamento vencido</p>
        </div>
      ) : (
        <div className="px-3 py-2 divide-y divide-gray-50 dark:divide-white/5">
          {clientes.map((c, i) => {
            const pct = maior > 0 ? (c.valor / maior) * 100 : 0;
            return (
              <button key={c.nome} onClick={() => onClickCliente?.(c.nome)}
                className="w-full text-left py-2 px-2 hover:bg-gray-50/60 dark:hover:bg-white/5 rounded-lg transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-100 dark:bg-white/10 text-[10px] font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">{i + 1}</span>
                  <p className="text-[12.5px] font-medium text-gray-800 dark:text-gray-200 truncate flex-1" title={c.nome}>{c.nome}</p>
                  <p className="text-[12px] font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{formatCurrency(c.valor)}</p>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono tabular-nums flex-shrink-0">{c.qtd} {c.qtd === 1 ? 'lanç.' : 'lanç.'}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Cartões vencidos por administradora ────────────────────────
function TabelaCartoesPorAdministradora({ contas, onClickConta }) {
  const total = contas.reduce((s, c) => s + c.valor, 0);
  const totalQtd = contas.reduce((s, c) => s + c.qtd, 0);
  const maior = contas[0]?.valor || 1;
  const corCartoes = CORES_FONTE.cartao;
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden mb-4">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600 flex-shrink-0">
          <CreditCard className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Cartões vencidos por administradora</h3>
          <p className="text-[10.5px] text-gray-400">
            {contas.length} {contas.length === 1 ? 'administradora' : 'administradoras'} · {totalQtd} {totalQtd === 1 ? 'recebível' : 'recebíveis'} · {formatCurrency(total)}
          </p>
        </div>
      </div>

      {/* Mobile: cards */}
      <ul className="md:hidden divide-y divide-gray-100 dark:divide-white/5">
        {contas.map((c) => {
          const pct = total > 0 ? (c.valor / total) * 100 : 0;
          const pctRel = maior > 0 ? (c.valor / maior) * 100 : 0;
          return (
            <li key={c.nome}>
              <button onClick={() => onClickConta?.(c)}
                className="w-full text-left px-4 py-3 hover:bg-sky-50/30 active:bg-sky-50/50 transition-colors min-h-[64px]">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate" title={c.nome}>{c.nome}</p>
                    <p className="text-[10.5px] text-gray-400 font-mono">{c.qtd} {c.qtd === 1 ? 'recebível' : 'recebíveis'}</p>
                  </div>
                  <p className="text-[14px] font-bold text-gray-900 dark:text-gray-100 font-mono tabular-nums flex-shrink-0">{formatCurrency(c.valor)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pctRel}%`, backgroundColor: corCartoes }} />
                  </div>
                  <span className="text-[10.5px] text-gray-500 font-mono tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-white/10">
              <th className="px-4 py-2 bg-gray-100 dark:bg-white/5">Administradora</th>
              <th className="px-3 py-2 bg-gray-100 dark:bg-white/5">Participação</th>
              <th className="px-3 py-2 text-right w-20 bg-gray-100 dark:bg-white/5">Recebíveis</th>
              <th className="px-3 py-2 text-right w-32 bg-gray-100 dark:bg-white/5">Valor vencido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {contas.map((c) => {
              const pct = total > 0 ? (c.valor / total) * 100 : 0;
              const pctRel = maior > 0 ? (c.valor / maior) * 100 : 0;
              return (
                <tr key={c.nome} onClick={() => onClickConta?.(c)}
                  className="hover:bg-sky-50/30 dark:hover:bg-white/5 cursor-pointer transition-colors">
                  <td className="px-4 py-2">
                    <p className="text-[12.5px] font-medium text-gray-900 dark:text-gray-100 truncate max-w-[420px]" title={c.nome}>{c.nome}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden min-w-[80px]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pctRel}%`, backgroundColor: corCartoes }} />
                      </div>
                      <span className="text-[10.5px] text-gray-500 font-mono tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[11.5px] text-gray-700 dark:text-gray-300">{c.qtd}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(c.valor)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50/80 dark:bg-white/5 border-t-2 border-gray-200 dark:border-white/10">
            <tr className="font-semibold">
              <td className="px-4 py-2 text-[11.5px] text-gray-700 dark:text-gray-300">Total</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[11px] text-gray-700 dark:text-gray-300">{totalQtd}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[12.5px] text-gray-900 dark:text-gray-100">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Multi-select de empresas (dropdown com checkboxes) ──────
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
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left">
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
                    className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
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
