import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronRight, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar,
  DollarSign, Building2,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BarraProgressoFetch from '../../components/ui/BarraProgressoFetch';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { formatCurrency } from '../../utils/format';
import { ehDiaUtil, proximoDiaUtil, isoDate as isoDateUtil } from '../../utils/diasUteis';

// ─── Helpers ─────────────────────────────────────────────────
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

function extrairValor(t) {
  return toNumber(
    t.valorSaldo ?? t.saldo ?? t.valorAberto ?? t.valorPendente ??
    t.valor ?? t.valorTitulo ?? t.valorOriginal
  );
}

function extrairVencimento(t) {
  const raw = t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function extrairEmissao(t) {
  return t.dataEmissao || t.emissao || t.dataCadastro || t.data_emissao || null;
}

function extrairDocumento(t) {
  return t.numeroDocumento || t.documento || t.numeroTitulo || t.nrDocumento || t.nrTitulo ||
    t.titulo || t.tituloPagarCodigo || t.codigoTitulo || t.codigo || '';
}

function extrairFornecedorCod(t) {
  return t.fornecedorCodigo ?? t.codigoFornecedor ?? t.pessoaCodigo ?? t.codigoPessoa ?? null;
}

function extrairFornecedorNome(t) {
  return t.fornecedorNome || t.fornecedor || t.nomeFornecedor || t.razao || t.razaoSocial || t.fantasia || '';
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

// ─── Cache em memoria (sobrevive a desmontagens da pagina) ──────
// Usuario navega para outra pagina e volta: nao refetcha enquanto estiver
// fresca. TTL = 5 min (mesmo dos endpoints internos do qualityApi).
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheContasPagar = {
  data: null,        // { titulos, fornecedoresMap }
  empresasKey: null, // string com IDs ordenados das empresas selecionadas
  timestamp: 0,
};
function chaveEmpresas(empresasSelIds) {
  return Array.from(empresasSelIds).sort().join(',');
}
function cacheValido(empresasKey) {
  return _cacheContasPagar.data
    && _cacheContasPagar.empresasKey === empresasKey
    && (Date.now() - _cacheContasPagar.timestamp) < CACHE_TTL_MS;
}

// ─── Componente ──────────────────────────────────────────────
export default function ClienteContasPagar() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const clientesRede = session?.clientesRede || [];

  // Multi-selecao de empresas — independente da topbar.
  // Default: todas as empresas da rede selecionadas.
  const [empresasSelIds, setEmpresasSelIds] = useState(() =>
    new Set((session?.clientesRede || []).map(c => c.id))
  );
  const empresasSel = useMemo(
    () => clientesRede.filter(c => empresasSelIds.has(c.id)),
    [clientesRede, empresasSelIds]
  );
  const podeFiltrarEmpresa = clientesRede.length > 1;
  const multiEmpresa = empresasSel.length > 1;

  // Hidrata a partir do cache se ele bate com a selecao inicial das empresas
  const empresasKeyInicial = chaveEmpresas(empresasSelIds);
  const cacheInicial = cacheValido(empresasKeyInicial) ? _cacheContasPagar.data : null;

  const [loading, setLoading] = useState(!cacheInicial);
  const [titulos, setTitulos] = useState(cacheInicial?.titulos || []);
  const [fornecedoresMap, setFornecedoresMap] = useState(cacheInicial?.fornecedoresMap || new Map());
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('hoje');
  // Chaves: data unica em single-empresa, "<empresaId>|<data>" em multi-empresa
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [empresasExpandidas, setEmpresasExpandidas] = useState(new Set());
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const carregar = useCallback(async ({ force = false } = {}) => {
    if (empresasSel.length === 0) {
      setError('Selecione ao menos uma empresa.');
      setTitulos([]);
      setLoading(false);
      return;
    }

    // Tenta servir do cache antes de bater na API
    const empresasKey = chaveEmpresas(empresasSelIds);
    if (!force && cacheValido(empresasKey)) {
      const c = _cacheContasPagar.data;
      setTitulos(c.titulos);
      setFornecedoresMap(c.fornecedoresMap);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    // 1 fetch de titulos por empresa + 1 fetch de fornecedores por chave_api distinta
    const chavesDistintas = new Set(empresasSel.map(e => e.chave_api_id).filter(Boolean));
    const totalTarefas = empresasSel.length + chavesDistintas.size;
    setProgresso({ feitos: 0, total: totalTarefas });
    const tick = () => setProgresso(p => ({ ...p, feitos: p.feitos + 1 }));
    try {
      const chaves = await mapService.listarChavesApi();

      // FETCH PARALELO TOTAL: catalogos (fornecedores) + titulos por empresa
      // disparam todos juntos. O `qualityApiService` ja paginalisa cada chamada
      // em chunks paralelos por dia + cache + dedup, entao a soma e otimizada.
      const fornsPromises = Array.from(chavesDistintas).map(async (chaveApiId) => {
        const chave = chaves.find(c => c.id === chaveApiId);
        if (!chave) { tick(); return [chaveApiId, new Map()]; }
        const forns = await qualityApi.buscarFornecedoresQuality(chave.chave).catch(() => []).finally(tick);
        const mapa = new Map();
        (forns || []).forEach(f => {
          const cod = f.fornecedorCodigo ?? f.codigo;
          if (cod != null) mapa.set(cod, f.razao || f.fantasia || f.nome || `Fornecedor #${cod}`);
        });
        return [chaveApiId, mapa];
      });

      const titulosPromises = empresasSel.map(async (emp) => {
        const chave = chaves.find(c => c.id === emp.chave_api_id);
        if (!chave) { tick(); return []; }
        const filtros = { empresaCodigo: emp.empresa_codigo, apenasPendente: true };
        const dados = await qualityApi.buscarTitulosPagar(chave.chave, filtros).catch(() => []).finally(tick);
        return (dados || []).map(t => ({
          ...t,
          _empresaId: emp.id,
          _empresaNome: emp.nome,
          _chaveApiId: emp.chave_api_id,
        }));
      });

      const [fornsArr, resultados] = await Promise.all([
        Promise.all(fornsPromises),
        Promise.all(titulosPromises),
      ]);

      // Mescla todos os fornecedores em um unico mapa (compoe a chave por
      // chaveApi+codigo para evitar colisao entre redes diferentes).
      const mapaFornGlobal = new Map();
      fornsArr.forEach(([chaveApiId, mapa]) => {
        mapa.forEach((nome, cod) => {
          mapaFornGlobal.set(`${chaveApiId}:${cod}`, nome);
        });
      });
      const titulosNovos = resultados.flat();
      setFornecedoresMap(mapaFornGlobal);
      setTitulos(titulosNovos);
      // Persiste no cache para hidratacao em proximos mounts
      _cacheContasPagar.data = { titulos: titulosNovos, fornecedoresMap: mapaFornGlobal };
      _cacheContasPagar.empresasKey = empresasKey;
      _cacheContasPagar.timestamp = Date.now();
    } catch (err) {
      setError(err.message);
      setTitulos([]);
    } finally {
      setLoading(false);
    }
  }, [empresasSel, empresasSelIds]);

  useEffect(() => { carregar(); }, [carregar]);

  const enriched = useMemo(() => {
    return (titulos || []).map(t => {
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      const valor = extrairValor(t);
      const fornCod = extrairFornecedorCod(t);
      const chaveApiId = t._chaveApiId;
      const fornNome = extrairFornecedorNome(t)
        || (fornCod != null ? fornecedoresMap.get(`${chaveApiId}:${fornCod}`) : '')
        || (fornCod != null ? fornecedoresMap.get(fornCod) : '')
        || 'Fornecedor';
      return {
        raw: t,
        valor,
        vencimento: venc,
        emissao: extrairEmissao(t),
        documento: extrairDocumento(t),
        parcela: extrairParcela(t),
        historico: extrairHistorico(t),
        fornecedorNome: fornNome,
        fornecedorCodigo: fornCod,
        empresaId: t._empresaId,
        empresaNome: t._empresaNome,
        diasAteVenc: dias,
        vencido: dias !== null && dias < 0,
        proximo: dias !== null && dias >= 0 && dias <= 7,
      };
    });
  }, [titulos, fornecedoresMap]);

  // "Hoje" considera o proximo dia util quando hoje nao e util — quando hoje
  // for fim de semana/feriado, antecipa para o proximo util e inclui as datas
  // nao uteis imediatamente anteriores.
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
      if (filtroStatus === 'hoje' && !(t.vencimento && datasHoje.has(t.vencimento))) return false;
      if (filtroStatus === 'vencidos' && !t.vencido) return false;
      if (filtroStatus === 'proximos' && (t.vencido || !t.proximo)) return false;
      if (filtroStatus === 'futuros' && (t.vencido || t.proximo)) return false;
      if (!q) return true;
      return (
        t.fornecedorNome.toLowerCase().includes(q) ||
        String(t.documento).toLowerCase().includes(q) ||
        (t.historico || '').toLowerCase().includes(q)
      );
    });
  }, [enriched, busca, filtroStatus, datasHoje]);

  // Agrupa por data de vencimento
  const grupos = useMemo(() => {
    const mapa = new Map();
    filtrados.forEach(t => {
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
    // classifica grupo pelo status da data
    arr.forEach(g => {
      const dias = diffDias(g.data);
      g.diasAteVenc = dias;
      g.vencido = dias !== null && dias < 0;
      g.proximo = dias !== null && dias >= 0 && dias <= 7;
      g.itens.sort((a, b) => b.valor - a.valor);
    });
    return arr;
  }, [filtrados]);

  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    const hoje = enriched.filter(t => t.vencimento && datasHoje.has(t.vencimento));
    return {
      total: tot,
      qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
      hoje: hoje.reduce((s, t) => s + t.valor, 0),
      qtdHoje: hoje.length,
    };
  }, [enriched, datasHoje]);

  // "Hoje" pode estar antecipado quando hoje nao e dia util
  const hojeAntecipado = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return !ehDiaUtil(hoje);
  }, []);
  const proximoUtilIso = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return isoDateUtil(proximoDiaUtil(hoje));
  }, []);

  // Em modo multi-empresa, agrupa: empresa → data → itens
  const treeEmpresas = useMemo(() => {
    if (!multiEmpresa) return [];
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
    // Para cada empresa, agrupa por data (mesma logica do `grupos`)
    const arr = Array.from(porEmp.values()).map(emp => {
      const mapaData = new Map();
      emp.itens.forEach(t => {
        const k = t.vencimento || 'sem-data';
        if (!mapaData.has(k)) mapaData.set(k, { data: t.vencimento, itens: [], total: 0 });
        const g = mapaData.get(k);
        g.itens.push(t);
        g.total += t.valor;
      });
      const grupos = Array.from(mapaData.values()).sort((a, b) => {
        if (!a.data) return 1;
        if (!b.data) return -1;
        return a.data.localeCompare(b.data);
      });
      grupos.forEach(g => {
        const dias = diffDias(g.data);
        g.diasAteVenc = dias;
        g.vencido = dias !== null && dias < 0;
        g.proximo = dias !== null && dias >= 0 && dias <= 7;
        g.itens.sort((a, b) => b.valor - a.valor);
      });
      return {
        ...emp,
        grupos,
        qtd: emp.itens.length,
      };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [filtrados, multiEmpresa]);

  // Recolhe a tree quando filtros/empresas mudam — usuario expande sob demanda
  useEffect(() => {
    setEmpresasExpandidas(new Set());
    setExpandedDates(new Set());
  }, [filtroStatus, multiEmpresa, treeEmpresas, grupos.length]);

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
    if (multiEmpresa) {
      setEmpresasExpandidas(new Set(treeEmpresas.map(e => e.empresaId)));
      const datas = new Set();
      treeEmpresas.forEach(e =>
        e.grupos.forEach(g => datas.add(`${e.empresaId}|${g.data || 'sem-data'}`))
      );
      setExpandedDates(datas);
    } else {
      setExpandedDates(new Set(grupos.map(g => g.data || 'sem-data')));
    }
  };
  const colapsarTodos = () => {
    setExpandedDates(new Set());
    setEmpresasExpandidas(new Set());
  };

  if (clientesRede.length === 0) {
    return (
      <div>
        <PageHeader title="Contas a Pagar" description="Títulos pendentes de pagamento" />
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
        title="Contas a Pagar"
        description="Títulos pendentes de pagamento"
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
        <button
          onClick={() => carregar({ force: true })}
          disabled={loading || empresasSel.length === 0}
          title="Força recarga ignorando o cache"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </PageHeader>

      {/* Barra de progresso da busca */}
      <BarraProgressoFetch
        loading={loading}
        feitos={progresso.feitos}
        total={progresso.total}
      />

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ResumoCard icon={DollarSign} iconBg="bg-blue-50" iconColor="text-blue-600"
          label={hojeAntecipado ? 'A pagar (próximo dia útil)' : 'A pagar hoje'}
          valor={formatCurrency(totais.hoje)}
          sub={hojeAntecipado
            ? (totais.qtdHoje > 0
                ? `${totais.qtdHoje} ${totais.qtdHoje === 1 ? 'titulo' : 'titulos'} em ${formatDataBR(proximoUtilIso)}`
                : `previsto para ${formatDataBR(proximoUtilIso)}`)
            : (totais.qtdHoje > 0
                ? `${totais.qtdHoje} ${totais.qtdHoje === 1 ? 'titulo vence' : 'titulos vencem'} hoje`
                : 'nenhum vencimento hoje')}
          highlight />
        <ResumoCard icon={AlertTriangle} iconBg="bg-red-50" iconColor="text-red-600"
          label="Vencidos" valor={formatCurrency(totais.vencidos)}
          sub={`${totais.qtdVencidos} ${totais.qtdVencidos === 1 ? 'titulo' : 'titulos'}`} />
        <ResumoCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Próximos 7 dias" valor={formatCurrency(totais.proximos)}
          sub={`${totais.qtdProximos} ${totais.qtdProximos === 1 ? 'titulo' : 'titulos'}`} />
        <ResumoCard icon={Calendar} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="A vencer" valor={formatCurrency(totais.futuros)}
          sub={`${totais.qtdFuturos} ${totais.qtdFuturos === 1 ? 'titulo' : 'titulos'}`} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor, documento ou histórico..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors"
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
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando títulos pendentes...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os títulos</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum título pendente' : 'Nenhum título encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Todas as contas estao em dia' : 'Tente ajustar a busca ou o filtro'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Títulos por vencimento</h3>
            <span className="text-[11px] text-gray-400">
              {multiEmpresa
                ? `· ${treeEmpresas.length} ${treeEmpresas.length === 1 ? 'empresa' : 'empresas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`
                : `· ${grupos.length} ${grupos.length === 1 ? 'data' : 'datas'} · ${filtrados.length} ${filtrados.length === 1 ? 'titulo' : 'titulos'}`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Expandir todos
              </button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Colapsar todos
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{multiEmpresa ? 'Empresa / Data / Documento' : 'Vencimento / Documento'}</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Fornecedor</th>
                  <th className="px-3 py-2.5">Parcela</th>
                  <th className="px-3 py-2.5">Emissão</th>
                  <th className="px-3 py-2.5">Histórico</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {multiEmpresa
                  ? treeEmpresas.map(emp => {
                      const empAberta = empresasExpandidas.has(emp.empresaId);
                      return (
                        <React.Fragment key={`emp-${emp.empresaId}`}>
                          <tr onClick={() => toggleEmpresa(emp.empresaId)}
                            className={`cursor-pointer transition-colors ${empAberta ? 'bg-blue-50/40 dark:bg-blue-500/15' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}`}>
                            <td className="px-4 py-2.5" colSpan={6}>
                              <div className="flex items-center gap-2">
                                <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                </motion.div>
                                <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
                                  <Building2 className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                  <p className="text-[13px] font-semibold text-gray-900 truncate">{emp.empresaNome}</p>
                                  <p className="text-[10.5px] text-gray-500">
                                    {emp.grupos.length} {emp.grupos.length === 1 ? 'data' : 'datas'}
                                    {emp.qtdVencidos > 0 && <span className="ml-1 text-red-600 dark:text-red-400">· {emp.qtdVencidos} vencido{emp.qtdVencidos === 1 ? '' : 's'}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
                              {emp.qtd}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[13px] font-bold text-gray-900">
                              {formatCurrency(emp.total)}
                            </td>
                          </tr>
                          {empAberta && emp.grupos.map(g => renderGrupoTree(g, emp.empresaId, multiEmpresa, expandedDates, toggleDate))}
                        </React.Fragment>
                      );
                    })
                  : grupos.map(g => renderGrupoTree(g, null, multiEmpresa, expandedDates, toggleDate))
                }
              </tbody>
              <tfoot className="bg-gray-50/60 dark:bg-white/[0.03] border-t border-gray-100 dark:border-white/10">
                <tr className="text-[12px] font-semibold">
                  <td className="px-4 py-3" colSpan={6}>
                    Total · {filtrados.length} {filtrados.length === 1 ? 'titulo' : 'titulos'} em {grupos.length} {grupos.length === 1 ? 'data' : 'datas'}
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
    </div>
  );
}

// Renderiza um grupo (data + itens). Em modo multi-empresa, indenta para
// caber sob a linha da empresa e usa chave composta para o expand/collapse.
function renderGrupoTree(g, empresaId, multiEmpresa, expandedDates, toggleDate) {
  const dataKey = g.data || 'sem-data';
  const key = empresaId ? `${empresaId}|${dataKey}` : dataKey;
  const aberto = expandedDates.has(key);
  const statusCfg = g.vencido
    ? { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-300', ring: 'ring-red-200 dark:ring-red-500/30',
        label: g.diasAteVenc !== null ? `Vencido há ${Math.abs(g.diasAteVenc)}d` : 'Vencido',
        bar: 'bg-red-500' }
    : g.proximo
    ? { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-200 dark:ring-amber-500/30',
        label: g.diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${g.diasAteVenc}d`,
        bar: 'bg-amber-500' }
    : { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-500/30',
        label: g.diasAteVenc !== null ? `Em ${g.diasAteVenc}d` : '—',
        bar: 'bg-emerald-500' };
  const indentDataPL = multiEmpresa ? 48 : 16;  // 16 = px-4
  const indentItemPL = multiEmpresa ? 88 : 56;
  return (
    <React.Fragment key={key}>
      <tr onClick={() => toggleDate(key)}
        className={`cursor-pointer transition-colors ${aberto ? 'bg-blue-50/30 dark:bg-blue-500/10' : 'hover:bg-gray-50/60 dark:hover:bg-white/5'}`}>
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
              <p className="text-[10.5px] text-gray-400">{g.data ? diaSemana(g.data) : '—'}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.bg} ${statusCfg.text} ring-1 ${statusCfg.ring}`}>
            {statusCfg.label}
          </span>
        </td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-[11px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[12px] text-gray-700">
          {g.itens.length}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-[12.5px] font-semibold ${g.vencido ? 'text-red-700 dark:text-red-400' : 'text-gray-900'}`}>
          {formatCurrency(g.total)}
        </td>
      </tr>
      {aberto && g.itens.map((t, i) => (
        <tr key={`${key}-${t.documento}-${i}`} className="bg-gray-50/30 dark:bg-white/[0.02] hover:bg-gray-50/60 dark:hover:bg-white/5">
          <td className="py-1.5" style={{ paddingLeft: indentItemPL, paddingRight: 12 }}>
            <span className="font-mono tabular-nums text-[11.5px] text-gray-700">
              {t.documento || `#${i + 1}`}
            </span>
          </td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 truncate max-w-[240px]">
            <p className="text-[11.5px] text-gray-800 truncate">{t.fornecedorNome}</p>
          </td>
          <td className="px-3 py-1.5 text-[11px] text-gray-600 font-mono tabular-nums">{t.parcela || '—'}</td>
          <td className="px-3 py-1.5 text-[11px] text-gray-600 font-mono tabular-nums">{t.emissao ? formatDataBR(t.emissao) : '—'}</td>
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
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-white' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${iconBg} p-2.5 flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-lg font-semibold text-gray-900 tracking-tight truncate">{valor}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
        </div>
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
            aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
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
                onChange={() => {}} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
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
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
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

