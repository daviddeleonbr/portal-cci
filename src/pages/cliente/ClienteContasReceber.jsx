import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronDown, ChevronRight,
  Clock, AlertTriangle, CheckCircle2, Calendar, Users,
  DollarSign, FileText, CreditCard, ScrollText, Landmark,
  FileCheck, Building2, LayoutGrid,
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
    t.valor ?? t.valorTitulo ?? t.valorOriginal ?? t.valorLiquido
  );
}

function extrairVencimento(t) {
  // Cartao costuma usar dataCredito/dataPrevisao (quando a adquirente repassa);
  // Cheque pode usar dataBomPara/dataDeposito
  const raw = t.dataVencimento || t.vencimento || t.dataVenc || t.data_vencimento ||
    t.dataCredito || t.dataPrevisao || t.dataPrevisaoCredito ||
    t.dataBomPara || t.dataDeposito || t.dataCompensacao || null;
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
    chipBg: 'bg-indigo-50',
    chipColor: 'text-indigo-700',
    chipRing: 'ring-indigo-200',
    iconBg: 'bg-indigo-50 text-indigo-600',
  },
  duplicata: {
    label: 'Duplicata',
    icon: Landmark,
    chipBg: 'bg-violet-50',
    chipColor: 'text-violet-700',
    chipRing: 'ring-violet-200',
    iconBg: 'bg-violet-50 text-violet-600',
  },
  cartao: {
    label: 'Cartão',
    icon: CreditCard,
    chipBg: 'bg-cyan-50',
    chipColor: 'text-cyan-700',
    chipRing: 'ring-cyan-200',
    iconBg: 'bg-cyan-50 text-cyan-600',
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

  const carregar = useCallback(async ({ force = false } = {}) => {
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

    setLoading(true);
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

  const grupos = useMemo(() => agruparPorData(filtrados), [filtrados]);

  // Em modo multi-empresa, agrupa: empresa → data → itens
  const empresasComGrupos = useMemo(() => {
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
    return Array.from(porEmp.values())
      .map(e => ({ ...e, grupos: agruparPorData(e.itens), qtd: e.itens.length }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados, multiEmpresa]);

  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    const porFonte = { titulo: 0, duplicata: 0, cartao: 0, cheque: 0 };
    const qtdPorFonte = { titulo: 0, duplicata: 0, cartao: 0, cheque: 0 };
    enriched.forEach(t => {
      porFonte[t.fonte] = (porFonte[t.fonte] || 0) + t.valor;
      qtdPorFonte[t.fonte] = (qtdPorFonte[t.fonte] || 0) + 1;
    });
    return {
      total: tot,
      qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
      porFonte,
      qtdPorFonte,
    };
  }, [enriched]);

  // Recolhe a tree quando filtros/empresas mudam — usuario expande sob demanda
  useEffect(() => {
    setEmpresasExpandidas(new Set());
    setExpandedDates(new Set());
  }, [filtroStatus, filtroFonte, multiEmpresa, empresasComGrupos, grupos.length]);

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
      setEmpresasExpandidas(new Set(empresasComGrupos.map(e => e.empresaId)));
      const datas = new Set();
      empresasComGrupos.forEach(e =>
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

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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

      {/* Abas por tipo (fonte) */}
      <div className="bg-white rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
          {[
            { k: 'todos',     label: 'Visão Geral', icon: LayoutGrid,                qtd: totais.qtd,                       valor: totais.total,                cor: 'emerald' },
            { k: 'titulo',    label: 'Títulos',     icon: FONTE_CFG.titulo.icon,    qtd: totais.qtdPorFonte.titulo || 0,    valor: totais.porFonte.titulo || 0,    cor: 'indigo'  },
            { k: 'duplicata', label: 'Duplicatas',  icon: FONTE_CFG.duplicata.icon, qtd: totais.qtdPorFonte.duplicata || 0, valor: totais.porFonte.duplicata || 0, cor: 'violet'  },
            { k: 'cartao',    label: 'Cartões',     icon: FONTE_CFG.cartao.icon,    qtd: totais.qtdPorFonte.cartao || 0,    valor: totais.porFonte.cartao || 0,    cor: 'cyan'    },
            { k: 'cheque',    label: 'Cheques',     icon: FONTE_CFG.cheque.icon,    qtd: totais.qtdPorFonte.cheque || 0,    valor: totais.porFonte.cheque || 0,    cor: 'teal'    },
          ].map(a => {
            const Icon = a.icon;
            const ativo = filtroFonte === a.k;
            const corClasses = {
              emerald: ativo ? 'border-emerald-600 text-emerald-700' : '',
              indigo:  ativo ? 'border-indigo-600 text-indigo-700' : '',
              violet:  ativo ? 'border-violet-600 text-violet-700' : '',
              cyan:    ativo ? 'border-cyan-600 text-cyan-700' : '',
              teal:    ativo ? 'border-teal-600 text-teal-700' : '',
            }[a.cor];
            const badgeClasses = {
              emerald: ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
              indigo:  ativo ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
              violet:  ativo ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
              cyan:    ativo ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
              teal:    ativo ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400',
            }[a.cor];
            return (
              <button key={a.k} onClick={() => setFiltroFonte(a.k)}
                className={`flex flex-col items-start gap-0.5 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap min-w-[140px] ${
                  ativo ? corClasses : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60 dark:hover:bg-white/5'
                }`}>
                <span className="flex items-center gap-2 w-full">
                  <Icon className="h-4 w-4" />
                  {a.label}
                  <span className={`ml-auto text-[10.5px] px-1.5 py-0.5 rounded-full ${badgeClasses}`}>
                    {a.qtd}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                  {formatCurrency(a.valor)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
      ) : grupos.length === 0 ? (
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
              {multiEmpresa
                ? `${empresasComGrupos.length} ${empresasComGrupos.length === 1 ? 'empresa' : 'empresas'} • ${filtrados.length} ${filtrados.length === 1 ? 'lancamento' : 'lancamentos'}`
                : `${grupos.length} ${grupos.length === 1 ? 'data' : 'datas'} • ${filtrados.length} ${filtrados.length === 1 ? 'lancamento' : 'lancamentos'}`}
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
          {multiEmpresa ? (
            <div className="space-y-3">
              {empresasComGrupos.map(emp => {
                const empAberta = empresasExpandidas.has(emp.empresaId);
                return (
                  <div key={emp.empresaId} className="bg-white rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleEmpresa(emp.empresaId)}
                      className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                        empAberta
                          ? 'bg-emerald-50/40 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20'
                          : 'hover:bg-gray-50/60 dark:hover:bg-white/5'
                      }`}
                    >
                      <motion.div animate={{ rotate: empAberta ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </motion.div>
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">{emp.empresaNome}</p>
                        <p className="text-[10.5px] text-gray-500">
                          {emp.grupos.length} {emp.grupos.length === 1 ? 'data' : 'datas'} ·
                          {' '}{emp.qtd} {emp.qtd === 1 ? 'lancamento' : 'lancamentos'}
                          {emp.qtdVencidos > 0 && <span className="ml-1 text-red-600 dark:text-red-400">· {emp.qtdVencidos} vencido{emp.qtdVencidos === 1 ? '' : 's'}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total</p>
                        <p className="text-[14px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(emp.total)}</p>
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {empAberta && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2 p-3 bg-gray-50/30 dark:bg-white/[0.02]">
                            {emp.grupos.map((g, i) => {
                              const dataKey = `${emp.empresaId}|${g.data || 'sem-data'}`;
                              return (
                                <DateGroup
                                  key={dataKey}
                                  grupo={g}
                                  expanded={expandedDates.has(dataKey)}
                                  onToggle={() => toggleDate(dataKey)}
                                  delay={Math.min(i * 0.02, 0.2)}
                                  multiEmpresa={false}
                                />
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {grupos.map((g, i) => (
                <DateGroup
                  key={g.data || 'sem-data'}
                  grupo={g}
                  expanded={expandedDates.has(g.data || 'sem-data')}
                  onToggle={() => toggleDate(g.data || 'sem-data')}
                  delay={Math.min(i * 0.02, 0.2)}
                  multiEmpresa={false}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResumoCard({ icon: Icon, iconBg, iconColor, label, valor, sub, highlight }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-gray-100'}`}>
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

function DateGroup({ grupo, expanded, onToggle, delay, multiEmpresa }) {
  const { data, itens, total, vencido, proximo, diasAteVenc } = grupo;

  const statusChip = vencido
    ? { bg: 'bg-red-50', color: 'text-red-700', ring: 'ring-red-200', label: diasAteVenc !== null ? `Vencido ha ${Math.abs(diasAteVenc)}d` : 'Vencido' }
    : proximo
    ? { bg: 'bg-amber-50', color: 'text-amber-700', ring: 'ring-amber-200', label: diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${diasAteVenc}d` }
    : { bg: 'bg-emerald-50', color: 'text-emerald-700', ring: 'ring-emerald-200', label: diasAteVenc !== null ? `Em ${diasAteVenc}d` : '—' };

  const borderColor = vencido ? 'border-red-100' : proximo ? 'border-amber-100' : 'border-gray-100';
  const barColor = vencido ? 'bg-red-500' : proximo ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-white rounded-xl border ${borderColor} overflow-hidden`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className={`h-10 w-1 rounded-full ${barColor} flex-shrink-0`} />
        <div className="flex-shrink-0 min-w-[90px]">
          <p className="text-sm font-semibold text-gray-900">{data ? formatDataBR(data) : 'Sem data'}</p>
          <p className="text-[11px] text-gray-400">{data ? diaSemana(data) : '—'}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip.bg} ${statusChip.color} ring-1 ${statusChip.ring} flex-shrink-0`}>
          {statusChip.label}
        </span>
        <div className="flex-1" />
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-semibold ${vencido ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(total)}
          </p>
          <p className="text-[11px] text-gray-400">
            {itens.length} {itens.length === 1 ? 'lancamento' : 'lancamentos'}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 divide-y divide-gray-50 bg-gray-50/30">
              {itens.map((t, i) => (
                <LancamentoRow key={`${t.fonte}-${t.documento}-${i}`} t={t} multiEmpresa={multiEmpresa} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LancamentoRow({ t, multiEmpresa }) {
  const cfg = FONTE_CFG[t.fonte];
  return (
    <div className="flex items-center gap-4 pl-8 pr-5 py-2.5 hover:bg-white transition-colors">
      <div className={`rounded-md ${cfg.iconBg} p-1.5 flex-shrink-0`}>
        <cfg.icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <Users className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-gray-900 truncate">{t.clienteNome}</p>
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${cfg.chipBg} ${cfg.chipColor} ring-1 ${cfg.chipRing} flex-shrink-0`}>
            {cfg.label}
          </span>
          {t.administradoraNome && (
            <span className="text-[10px] text-cyan-700 bg-cyan-50 rounded px-1.5 py-0.5 flex-shrink-0">
              {t.administradoraNome}
            </span>
          )}
          {t.banco && (
            <span className="text-[10px] text-teal-700 bg-teal-50 rounded px-1.5 py-0.5 flex-shrink-0">
              {t.banco}
            </span>
          )}
          {t.parcela && <span className="text-[10px] text-gray-400 flex-shrink-0">• parc {t.parcela}</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
          {t.documento && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <FileText className="h-3 w-3" />
              {t.fonte === 'cartao' ? `NSU ${t.documento}` : t.documento}
            </span>
          )}
          {t.emissao && (
            <span className="flex-shrink-0">Emissão: {formatDataBR(t.emissao)}</span>
          )}
          {t.historico && <span className="truncate text-gray-400">{t.historico}</span>}
        </div>
        {multiEmpresa && t.empresaNome && (
          <p className="text-[10px] text-gray-400 truncate flex items-center gap-1 mt-0.5">
            <Building2 className="h-2.5 w-2.5" /> {t.empresaNome}
          </p>
        )}
      </div>
      <p className="text-[13px] font-semibold text-gray-900 flex-shrink-0">
        {formatCurrency(t.valor)}
      </p>
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
