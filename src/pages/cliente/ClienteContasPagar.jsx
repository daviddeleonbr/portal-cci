import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  Receipt, Loader2, AlertCircle, Search, RefreshCw, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar, Building2,
  DollarSign, FileText, BarChart3,
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

function formatDataCurta(s) {
  const iso = String(s).slice(0, 10);
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : '—';
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

// ─── Componente ──────────────────────────────────────────────
export default function ClienteContasPagar() {
  const session = useClienteSession();
  const cliente = session?.cliente;

  const [loading, setLoading] = useState(true);
  const [titulos, setTitulos] = useState([]);
  const [fornecedoresMap, setFornecedoresMap] = useState(new Map());
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('vencidos');
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const carregar = useCallback(async () => {
    if (!cliente?.chave_api_id || !cliente?.empresa_codigo) {
      setError('Esta empresa não tem integração Webposto configurada.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // 1 endpoint de titulos + 1 catalogo de fornecedores
    setProgresso({ feitos: 0, total: 2 });
    const tick = () => setProgresso(p => ({ ...p, feitos: p.feitos + 1 }));
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API não encontrada');

      const filtros = { empresaCodigo: cliente.empresa_codigo, apenasPendente: true };

      const [dados, forns] = await Promise.all([
        qualityApi.buscarTitulosPagar(chave.chave, filtros).finally(tick),
        qualityApi.buscarFornecedoresQuality(chave.chave).catch(() => []).finally(tick),
      ]);

      const mapaForn = new Map();
      (forns || []).forEach(f => {
        const cod = f.fornecedorCodigo ?? f.codigo;
        if (cod != null) mapaForn.set(cod, f.razao || f.fantasia || f.nome || `Fornecedor #${cod}`);
      });
      setFornecedoresMap(mapaForn);
      setTitulos(dados || []);
    } catch (err) {
      setError(err.message);
      setTitulos([]);
    } finally {
      setLoading(false);
    }
  }, [cliente?.chave_api_id, cliente?.empresa_codigo]);

  useEffect(() => { carregar(); }, [carregar]);

  const enriched = useMemo(() => {
    return (titulos || []).map(t => {
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      const valor = extrairValor(t);
      const fornCod = extrairFornecedorCod(t);
      const fornNome = extrairFornecedorNome(t) || (fornCod != null ? fornecedoresMap.get(fornCod) : '') || 'Fornecedor';
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

  // Dados pro grafico
  const chartData = useMemo(() => grupos
    .filter(g => g.data)
    .map(g => ({
      data: g.data,
      label: formatDataCurta(g.data),
      valor: Number(g.total.toFixed(2)),
      vencido: g.vencido,
      proximo: g.proximo,
      qtd: g.itens.length,
    })), [grupos]);

  const totais = useMemo(() => {
    const tot = enriched.reduce((s, t) => s + t.valor, 0);
    const vencidos = enriched.filter(t => t.vencido);
    const proximos = enriched.filter(t => !t.vencido && t.proximo);
    const futuros = enriched.filter(t => !t.vencido && !t.proximo);
    return {
      total: tot,
      qtd: enriched.length,
      vencidos: vencidos.reduce((s, t) => s + t.valor, 0),
      qtdVencidos: vencidos.length,
      proximos: proximos.reduce((s, t) => s + t.valor, 0),
      qtdProximos: proximos.length,
      futuros: futuros.reduce((s, t) => s + t.valor, 0),
      qtdFuturos: futuros.length,
    };
  }, [enriched]);

  // Auto-expande os primeiros grupos quando filtros mudam
  useEffect(() => {
    if (grupos.length === 0) return;
    setExpandedDates(new Set(grupos.slice(0, 5).map(g => g.data || 'sem-data')));
  }, [grupos.length, filtroStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDate = (key) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const expandirTodos = () => setExpandedDates(new Set(grupos.map(g => g.data || 'sem-data')));
  const colapsarTodos = () => setExpandedDates(new Set());

  if (!cliente?.chave_api_id || !cliente?.empresa_codigo) {
    return (
      <div>
        <PageHeader title="Contas a Pagar" description="Títulos pendentes de pagamento" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Esta empresa ainda não tem <strong>integração Webposto</strong> ativa. Contate o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Contas a Pagar"
        description={`Títulos pendentes de pagamento${cliente?.nome ? ` • ${cliente.nome}` : ''}`}
      >
        <button
          onClick={carregar}
          disabled={loading}
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
          label="Total pendente" valor={formatCurrency(totais.total)}
          sub={`${totais.qtd} ${totais.qtd === 1 ? 'titulo' : 'titulos'}`} highlight />
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

      {/* Grafico */}
      {!loading && !error && chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Valores por data de vencimento</h3>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
              <Legenda cor="#ef4444" label="Vencido" />
              <Legenda cor="#f59e0b" label="Próximos 7d" />
              <Legenda cor="#3b82f6" label="A vencer" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.vencido ? '#ef4444' : entry.proximo ? '#f59e0b' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
              {grupos.length} {grupos.length === 1 ? 'data' : 'datas'} • {filtrados.length} {filtrados.length === 1 ? 'titulo' : 'titulos'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={expandirTodos} className="text-[11px] text-gray-500 hover:text-blue-600 transition-colors">
                Expandir todos
              </button>
              <span className="text-[11px] text-gray-300">|</span>
              <button onClick={colapsarTodos} className="text-[11px] text-gray-500 hover:text-blue-600 transition-colors">
                Colapsar todos
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {grupos.map((g, i) => (
              <DateGroup
                key={g.data || 'sem-data'}
                grupo={g}
                expanded={expandedDates.has(g.data || 'sem-data')}
                onToggle={() => toggleDate(g.data || 'sem-data')}
                delay={Math.min(i * 0.02, 0.2)}
              />
            ))}
          </div>
        </>
      )}
    </div>
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

function Legenda({ cor, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: cor }} />
      {label}
    </span>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900 mb-1">
        {formatDataBR(d.data)} • {diaSemana(d.data)}
      </p>
      <p className="text-gray-500 mb-1">
        {d.qtd} {d.qtd === 1 ? 'titulo' : 'titulos'}
      </p>
      <p className="font-semibold" style={{ color: d.vencido ? '#ef4444' : d.proximo ? '#f59e0b' : '#3b82f6' }}>
        {formatCurrency(d.valor)}
      </p>
    </div>
  );
}

function DateGroup({ grupo, expanded, onToggle, delay }) {
  const { data, itens, total, vencido, proximo, diasAteVenc } = grupo;

  const statusChip = vencido
    ? { bg: 'bg-red-50', color: 'text-red-700', ring: 'ring-red-200', label: diasAteVenc !== null ? `Vencido ha ${Math.abs(diasAteVenc)}d` : 'Vencido' }
    : proximo
    ? { bg: 'bg-amber-50', color: 'text-amber-700', ring: 'ring-amber-200', label: diasAteVenc === 0 ? 'Vence hoje' : `Vence em ${diasAteVenc}d` }
    : { bg: 'bg-emerald-50', color: 'text-emerald-700', ring: 'ring-emerald-200', label: diasAteVenc !== null ? `Em ${diasAteVenc}d` : '—' };

  const borderColor = vencido ? 'border-red-100' : proximo ? 'border-amber-100' : 'border-gray-100';
  const barColor = vencido ? 'bg-red-500' : proximo ? 'bg-amber-500' : 'bg-blue-500';

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
            {itens.length} {itens.length === 1 ? 'titulo' : 'titulos'}
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
                <TituloRow key={`${t.documento}-${i}`} t={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TituloRow({ t }) {
  return (
    <div className="flex items-center gap-4 pl-8 pr-5 py-2.5 hover:bg-white transition-colors">
      <div className="rounded-md bg-white border border-gray-200 p-1.5 flex-shrink-0">
        <Receipt className="h-3.5 w-3.5 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Building2 className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-gray-900 truncate">{t.fornecedorNome}</p>
          {t.parcela && <span className="text-[10px] text-gray-400 flex-shrink-0">• parc {t.parcela}</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
          {t.documento && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <FileText className="h-3 w-3" /> {t.documento}
            </span>
          )}
          {t.emissao && (
            <span className="flex-shrink-0">Emissão: {formatDataBR(t.emissao)}</span>
          )}
          {t.historico && <span className="truncate text-gray-400">{t.historico}</span>}
        </div>
      </div>
      <p className="text-[13px] font-semibold text-gray-900 flex-shrink-0">
        {formatCurrency(t.valor)}
      </p>
    </div>
  );
}
