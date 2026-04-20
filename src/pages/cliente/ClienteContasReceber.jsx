import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  Loader2, AlertCircle, Search, RefreshCw, ChevronDown,
  Clock, AlertTriangle, CheckCircle2, Calendar, Users,
  DollarSign, FileText, CreditCard, ScrollText, Landmark,
  BarChart3, FileCheck,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { useClienteSession } from '../../hooks/useAuth';
import * as mapService from '../../services/mapeamentoService';
import * as qualityApi from '../../services/qualityApiService';
import { formatCurrency } from '../../utils/format';

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

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
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
    label: 'Titulo',
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
    label: 'Cartao',
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

// ─── Componente ──────────────────────────────────────────────
export default function ClienteContasReceber() {
  const session = useClienteSession();
  const cliente = session?.cliente;

  const [loading, setLoading] = useState(true);
  const [lista, setLista] = useState([]);
  const [clientesMap, setClientesMap] = useState(new Map());
  const [administradorasMap, setAdministradorasMap] = useState(new Map());
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]); // erros parciais por endpoint
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('vencidos');
  const [filtroFonte, setFiltroFonte] = useState('todos');
  const [expandedDates, setExpandedDates] = useState(new Set());

  const carregar = useCallback(async () => {
    if (!cliente?.chave_api_id || !cliente?.empresa_codigo) {
      setError('Esta empresa nao tem integracao Webposto configurada.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const chaves = await mapService.listarChavesApi();
      const chave = chaves.find(c => c.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada');

      // Todos os endpoints de contas a receber exigem dataInicial/dataFinal.
      // Janela ampla: 2 anos atras ate 1 ano a frente pra cobrir parcelamentos.
      const hoje = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);
      const doisAnosAtras = new Date(hoje); doisAnosAtras.setFullYear(hoje.getFullYear() - 2);
      const umAnoAFrente = new Date(hoje); umAnoAFrente.setFullYear(hoje.getFullYear() + 1);
      const filtros = {
        empresaCodigo: cliente.empresa_codigo,
        apenasPendente: true,
        dataInicial: fmt(doisAnosAtras),
        dataFinal: fmt(umAnoAFrente),
      };

      const erros = [];
      const seguro = (nome, promise) => promise.catch(err => {
        console.warn(`[ContasReceber] ${nome} falhou:`, err);
        erros.push({ nome, msg: err.message });
        return [];
      });

      const [titulos, duplicatas, cartoes, cheques, clientesQ, administradorasQ] = await Promise.all([
        seguro('TITULO_RECEBER', qualityApi.buscarTitulosReceber(chave.chave, filtros)),
        seguro('DUPLICATA',      qualityApi.buscarDuplicatas(chave.chave, filtros)),
        seguro('CARTAO',         qualityApi.buscarCartoes(chave.chave, filtros)),
        seguro('CHEQUE',         qualityApi.buscarCheques(chave.chave, filtros)),
        seguro('CLIENTE',        qualityApi.buscarClientesQuality(chave.chave)),
        seguro('ADMINISTRADORA', qualityApi.buscarAdministradoras(chave.chave)),
      ]);
      setWarnings(erros);

      const mapaCli = new Map();
      (clientesQ || []).forEach(c => {
        const cod = c.clienteCodigo ?? c.codigo;
        if (cod != null) mapaCli.set(cod, c.razao || c.fantasia || c.nome || `Cliente #${cod}`);
      });
      setClientesMap(mapaCli);

      const mapaAdm = new Map();
      (administradorasQ || []).forEach(a => {
        const cod = a.administradoraCodigo ?? a.codigo ?? a.codigoAdministradora;
        const nome = a.descricao || a.nomeAdministradora || a.nome ||
          a.razao || a.razaoSocial || a.fantasia || a.nomeFantasia || '';
        if (cod != null && nome) mapaAdm.set(cod, nome);
      });
      setAdministradorasMap(mapaAdm);

      const todos = [
        ...(titulos || []).map(r => ({ fonte: 'titulo', raw: r })),
        ...(duplicatas || []).map(r => ({ fonte: 'duplicata', raw: r })),
        ...(cartoes || []).map(r => ({ fonte: 'cartao', raw: r })),
        ...(cheques || []).map(r => ({ fonte: 'cheque', raw: r })),
      ];
      setLista(todos);
    } catch (err) {
      setError(err.message);
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [cliente?.chave_api_id, cliente?.empresa_codigo]);

  useEffect(() => { carregar(); }, [carregar]);

  const enriched = useMemo(() => {
    return lista.map(it => {
      const t = it.raw;
      const venc = extrairVencimento(t);
      const dias = diffDias(venc);
      const valor = extrairValor(t);
      const cliCod = extrairClienteCod(t);
      const cliNome = extrairClienteNome(t) || (cliCod != null ? clientesMap.get(cliCod) : '') || 'Cliente';

      // Para CARTAO: resolve administradora pelo codigo (mostra descricao, nao codigo)
      let admNome = '';
      if (it.fonte === 'cartao') {
        const admCod = extrairAdministradoraCod(t);
        // Se o payload ja trouxer o nome, usa. Senao resolve via catalogo.
        const inline = t.administradoraDescricao || t.administradoraNome ||
          (typeof t.administradora === 'string' ? t.administradora : '');
        admNome = inline || (admCod != null ? administradorasMap.get(admCod) : '') || '';
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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriched.filter(t => {
      if (filtroFonte !== 'todos' && t.fonte !== filtroFonte) return false;
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
  }, [enriched, busca, filtroStatus, filtroFonte]);

  // Agrupa por data
  const grupos = useMemo(() => {
    const mapa = new Map();
    filtrados.forEach(t => {
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
  }, [filtrados]);

  const chartData = useMemo(() => grupos
    .filter(g => g.data)
    .map(g => ({
      data: g.data,
      label: formatDataCurta(g.data),
      valor: Number(g.total.toFixed(2)),
      titulo: Number((g.porFonte.titulo || 0).toFixed(2)),
      duplicata: Number((g.porFonte.duplicata || 0).toFixed(2)),
      cartao: Number((g.porFonte.cartao || 0).toFixed(2)),
      cheque: Number((g.porFonte.cheque || 0).toFixed(2)),
      vencido: g.vencido,
      proximo: g.proximo,
      qtd: g.itens.length,
    })), [grupos]);

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

  useEffect(() => {
    if (grupos.length === 0) return;
    setExpandedDates(new Set(grupos.slice(0, 5).map(g => g.data || 'sem-data')));
  }, [grupos.length, filtroStatus, filtroFonte]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <PageHeader title="Contas a Receber" description="Valores pendentes em aberto" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>Esta empresa ainda nao tem <strong>integracao Webposto</strong> ativa. Contate o administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Contas a Receber"
        description={`Titulos, duplicatas e cartoes em aberto${cliente?.nome ? ` • ${cliente.nome}` : ''}`}
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

      {/* Warnings parciais por endpoint */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">
              Dados parciais: {warnings.length} {warnings.length === 1 ? 'fonte nao pode ser carregada' : 'fontes nao puderam ser carregadas'}
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
          label="Proximos 7 dias" valor={formatCurrency(totais.proximos)}
          sub={`${totais.qtdProximos} ${totais.qtdProximos === 1 ? 'lancamento' : 'lancamentos'}`} />
        <ResumoCard icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="A vencer" valor={formatCurrency(totais.futuros)}
          sub={`${totais.qtdFuturos} ${totais.qtdFuturos === 1 ? 'lancamento' : 'lancamentos'}`} />
      </div>

      {/* Breakdown por fonte */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <FonteCard fonte="titulo" label="Titulos" valor={totais.porFonte.titulo} qtd={totais.qtdPorFonte.titulo}
          ativo={filtroFonte === 'titulo'} onClick={() => setFiltroFonte(filtroFonte === 'titulo' ? 'todos' : 'titulo')} />
        <FonteCard fonte="duplicata" label="Duplicatas" valor={totais.porFonte.duplicata} qtd={totais.qtdPorFonte.duplicata}
          ativo={filtroFonte === 'duplicata'} onClick={() => setFiltroFonte(filtroFonte === 'duplicata' ? 'todos' : 'duplicata')} />
        <FonteCard fonte="cartao" label="Cartoes" valor={totais.porFonte.cartao} qtd={totais.qtdPorFonte.cartao}
          ativo={filtroFonte === 'cartao'} onClick={() => setFiltroFonte(filtroFonte === 'cartao' ? 'todos' : 'cartao')} />
        <FonteCard fonte="cheque" label="Cheques" valor={totais.porFonte.cheque} qtd={totais.qtdPorFonte.cheque}
          ativo={filtroFonte === 'cheque'} onClick={() => setFiltroFonte(filtroFonte === 'cheque' ? 'todos' : 'cheque')} />
      </div>

      {/* Grafico */}
      {!loading && !error && chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Valores por data de vencimento</h3>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
              <Legenda cor="#6366f1" label="Titulos" />
              <Legenda cor="#8b5cf6" label="Duplicatas" />
              <Legenda cor="#06b6d4" label="Cartoes" />
              <Legenda cor="#14b8a6" label="Cheques" />
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
                <Bar dataKey="titulo" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="duplicata" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cartao" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cheque" stackId="a" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-3 mb-4">
        {/* Linha 1: busca + status */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por cliente, documento ou historico..."
              className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {[
              { k: 'todos', label: 'Todos' },
              { k: 'vencidos', label: 'Vencidos' },
              { k: 'proximos', label: 'Proximos 7d' },
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

        {/* Linha 2: tipo (fonte) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mr-1">Tipo:</span>
          <TipoFiltroBtn
            ativo={filtroFonte === 'todos'}
            onClick={() => setFiltroFonte('todos')}
            label="Todos"
            qtd={totais.qtd}
          />
          {Object.entries(FONTE_CFG).map(([fonte, cfg]) => (
            <TipoFiltroBtn
              key={fonte}
              ativo={filtroFonte === fonte}
              onClick={() => setFiltroFonte(fonte)}
              label={cfg.label + 's'}
              icon={cfg.icon}
              qtd={totais.qtdPorFonte[fonte] || 0}
              activeBg={cfg.chipBg}
              activeColor={cfg.chipColor}
              activeRing={cfg.chipRing}
            />
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
            <p className="font-medium">Nao foi possivel carregar os valores</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">
            {enriched.length === 0 ? 'Nenhum valor pendente' : 'Nenhum lancamento encontrado para o filtro atual'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {enriched.length === 0 ? 'Nao ha contas a receber em aberto' : 'Tente ajustar a busca ou os filtros'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
              {grupos.length} {grupos.length === 1 ? 'data' : 'datas'} • {filtrados.length} {filtrados.length === 1 ? 'lancamento' : 'lancamentos'}
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

function FonteCard({ fonte, label, valor, qtd, ativo, onClick }) {
  const cfg = FONTE_CFG[fonte];
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border p-4 transition-all ${
        ativo ? `${cfg.chipRing.replace('ring-', 'border-')} shadow-sm` : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg ${cfg.iconBg} p-2`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-[15px] font-semibold text-gray-900">{formatCurrency(valor)}</p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.chipBg} ${cfg.chipColor} ring-1 ${cfg.chipRing}`}>
          {qtd} {qtd === 1 ? 'item' : 'itens'}
        </span>
      </div>
    </button>
  );
}

function TipoFiltroBtn({ ativo, onClick, label, icon: Icon, qtd, activeBg, activeColor, activeRing }) {
  const activeCls = activeBg && activeColor && activeRing
    ? `${activeBg} ${activeColor} ring-1 ${activeRing}`
    : 'bg-gray-900 text-white ring-1 ring-gray-900';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
        ativo
          ? activeCls
          : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300 hover:text-gray-900'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        ativo ? 'bg-white/25' : 'bg-gray-100 text-gray-500'
      }`}>
        {qtd}
      </span>
    </button>
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
      <div className="space-y-0.5 mb-1">
        {d.titulo > 0 && (
          <p className="text-gray-600"><span className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle" style={{ background: '#6366f1' }} />Titulos: {formatCurrency(d.titulo)}</p>
        )}
        {d.duplicata > 0 && (
          <p className="text-gray-600"><span className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle" style={{ background: '#8b5cf6' }} />Duplicatas: {formatCurrency(d.duplicata)}</p>
        )}
        {d.cartao > 0 && (
          <p className="text-gray-600"><span className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle" style={{ background: '#06b6d4' }} />Cartoes: {formatCurrency(d.cartao)}</p>
        )}
        {d.cheque > 0 && (
          <p className="text-gray-600"><span className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle" style={{ background: '#14b8a6' }} />Cheques: {formatCurrency(d.cheque)}</p>
        )}
      </div>
      <p className="font-semibold text-gray-900 pt-1 border-t border-gray-100">
        Total: {formatCurrency(d.valor)}
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
                <LancamentoRow key={`${t.fonte}-${t.documento}-${i}`} t={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LancamentoRow({ t }) {
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
            <span className="flex-shrink-0">Emissao: {formatDataBR(t.emissao)}</span>
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
