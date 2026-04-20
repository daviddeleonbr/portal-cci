import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import {
  AlertCircle, Loader2, CalendarDays, CheckCircle2, ArrowLeft,
  ChevronRight, Calendar, FileText, RefreshCw, Clock,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BpoConciliacaoCaixas from '../BpoConciliacaoCaixas';
import * as bpoConciliacaoService from '../../services/bpoConciliacaoService';
import { useClienteSession } from '../../hooks/useAuth';

// ─── Helpers de data ─────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function toIso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function hojeIso() {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function primeiroDiaDoMesIso() {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, 1);
}
function formatDataBR(s) {
  if (!s) return '—';
  const iso = String(s).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'];
function diaSemana(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const dt = new Date(+y, +m - 1, +d);
  return DIAS_SEMANA[dt.getDay()] || '';
}

export default function ClienteBPO() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const usuario = session?.usuario;

  const [dataInicial, setDataInicial] = useState(primeiroDiaDoMesIso());
  const [dataFinal, setDataFinal] = useState(hojeIso());
  const [concluidas, setConcluidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [diaVisualizando, setDiaVisualizando] = useState(null);

  const carregar = useCallback(async () => {
    if (!cliente?.id) return;
    setLoading(true);
    setError(null);
    try {
      const lista = await bpoConciliacaoService.listarConcluidas(cliente.id, {
        dataInicial,
        dataFinal,
      });
      setConcluidas(lista);
    } catch (err) {
      setError(err.message);
      setConcluidas([]);
    } finally {
      setLoading(false);
    }
  }, [cliente?.id, dataInicial, dataFinal]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quantos dias tem no periodo (pra % concluido)
  const diasNoPeriodo = useMemo(() => {
    if (!dataInicial || !dataFinal) return 0;
    const a = new Date(dataInicial);
    const b = new Date(dataFinal);
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  }, [dataInicial, dataFinal]);

  if (!cliente?.id) return <Navigate to="/cliente/dashboard" replace />;

  if (!cliente.usa_webposto || !cliente.chave_api_id || !cliente.empresa_codigo) {
    return (
      <div>
        <PageHeader title="Servicos BPO" description="Relatorios de fechamento de caixa" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Esta empresa ainda nao tem <strong>integracao Webposto</strong> ativa. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  // ═══ Visualizando um relatorio especifico ═══════════════════
  if (diaVisualizando) {
    return (
      <div>
        <div className="no-print mb-4">
          <button
            onClick={() => setDiaVisualizando(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a lista
          </button>
        </div>
        <BpoConciliacaoCaixas
          clienteFixed={cliente}
          requerConciliacaoConcluida={true}
          usuarioLogado={usuario?.nome || ''}
          dataInitial={diaVisualizando}
        />
      </div>
    );
  }

  // ═══ Lista de relatorios concluidos ══════════════════════════
  return (
    <div>
      <PageHeader
        title="Servicos BPO"
        description={`Relatorios de fechamento de caixa concluidos${cliente?.nome ? ` • ${cliente.nome}` : ''}`}
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

      {/* Filtro de periodo */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data inicial</label>
            <input
              type="date"
              value={dataInicial}
              onChange={e => setDataInicial(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data final</label>
            <input
              type="date"
              value={dataFinal}
              onChange={e => setDataFinal(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <AtalhoPeriodo label="Mes atual" onClick={() => {
              setDataInicial(primeiroDiaDoMesIso());
              setDataFinal(hojeIso());
            }} />
            <AtalhoPeriodo label="Mes anterior" onClick={() => {
              const d = new Date();
              d.setMonth(d.getMonth() - 1);
              const y = d.getFullYear();
              const m = d.getMonth() + 1;
              const ultimo = new Date(y, m, 0).getDate();
              setDataInicial(toIso(y, m, 1));
              setDataFinal(toIso(y, m, ultimo));
            }} />
          </div>
        </div>
      </div>

      {/* Resumo do periodo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <ResumoCard
          icon={CheckCircle2}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="Relatorios concluidos"
          valor={concluidas.length}
          sub={diasNoPeriodo > 0 ? `em ${diasNoPeriodo} ${diasNoPeriodo === 1 ? 'dia' : 'dias'} do periodo` : ''}
          highlight
        />
        <ResumoCard
          icon={Calendar}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Periodo"
          valor={`${formatDataBR(dataInicial)} → ${formatDataBR(dataFinal)}`}
          valorClassName="text-[13px]"
        />
        <ResumoCard
          icon={Clock}
          iconBg="bg-gray-50"
          iconColor="text-gray-600"
          label="Dias pendentes"
          valor={diasNoPeriodo > concluidas.length ? (diasNoPeriodo - concluidas.length) : 0}
          sub="aguardando conciliacao"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando relatorios...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Nao foi possivel carregar os relatorios</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : concluidas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
            <CalendarDays className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum relatorio concluido neste periodo</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Os relatorios aparecerao aqui assim que o responsavel do BPO finalizar a conciliacao de cada dia.
            Tente ampliar o periodo ou aguarde a conferencia da equipe.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {concluidas.map((item, i) => (
              <ItemConcluido
                key={item.id}
                item={item}
                delay={Math.min(i * 0.02, 0.2)}
                onClick={() => setDiaVisualizando(item.data)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AtalhoPeriodo({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
    >
      {label}
    </button>
  );
}

function ResumoCard({ icon: Icon, iconBg, iconColor, label, valor, sub, highlight, valorClassName }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${highlight ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg ${iconBg} p-2.5 flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className={`font-semibold text-gray-900 tracking-tight truncate ${valorClassName || 'text-xl'}`}>
            {valor}
          </p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function ItemConcluido({ item, onClick, delay }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 flex-shrink-0">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900">{formatDataBR(item.data)}</p>
          <span className="text-[11px] text-gray-400">• {diaSemana(item.data)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
          {item.concluida_em && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Concluido em {new Date(item.concluida_em).toLocaleString('pt-BR')}
            </span>
          )}
          {item.concluida_por && (
            <span>Por <strong className="text-gray-700">{item.concluida_por}</strong></span>
          )}
          {item.observacoes && (
            <span className="inline-flex items-center gap-1 text-gray-400 truncate max-w-[300px]">
              <FileText className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{item.observacoes}</span>
            </span>
          )}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 text-[10px] font-medium flex-shrink-0">
        <CheckCircle2 className="h-2.5 w-2.5" /> Concluido
      </span>
      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
    </motion.button>
  );
}
