import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Loader2, CalendarDays, CheckCircle2, ArrowLeft,
  ChevronRight, ChevronDown, Calendar, FileText, RefreshCw, Clock,
  Coins, Landmark, Building2, Construction,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import BpoConciliacaoCaixas from '../../BpoConciliacaoCaixas';
import * as bpoConciliacaoService from '../../../services/bpoConciliacaoService';
import { useClienteSession } from '../../../hooks/useAuth';

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
const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
function diaSemana(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const dt = new Date(+y, +m - 1, +d);
  return DIAS_SEMANA[dt.getDay()] || '';
}

const ABAS = [
  { key: 'caixa',    label: 'Conciliação de caixa',    icon: Coins,    descricao: 'Relatórios de fechamento diário de caixa' },
  { key: 'extratos', label: 'Conciliação de extratos', icon: Landmark, descricao: 'Conferência de extratos bancários' },
];

export default function ClienteBPO() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const asRede = session?.asRede;
  const clientesRede = useMemo(() => session?.clientesRede || [], [session]);

  // Empresas elegíveis (com empresa_codigo Autosystem)
  const empresasDisponiveis = useMemo(
    () => clientesRede.filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [clientesRede],
  );

  // Seletor local de empresa (a topbar Autosystem não tem)
  const [empresaId, setEmpresaId] = useState(empresasDisponiveis[0]?.id || null);
  useEffect(() => {
    if (!empresaId && empresasDisponiveis.length > 0) {
      setEmpresaId(empresasDisponiveis[0].id);
    }
  }, [empresasDisponiveis, empresaId]);
  const empresa = useMemo(
    () => empresasDisponiveis.find(c => c.id === empresaId) || null,
    [empresasDisponiveis, empresaId],
  );

  const [aba, setAba] = useState('caixa');

  if (empresasDisponiveis.length === 0) {
    return (
      <div>
        <PageHeader title="Serviços BPO" description="Conciliação de caixa e extratos" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p>
            Sua rede ainda não tem <strong>empresas Autosystem</strong> com
            <code className="font-mono bg-amber-100 px-1 mx-1 rounded">empresa_codigo</code>
            vinculado. Contate o administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Serviços BPO"
        description={asRede?.nome ? `${asRede.nome}` : 'Conciliação de caixa e extratos'}>
        {empresasDisponiveis.length > 1 && (
          <SeletorEmpresa empresas={empresasDisponiveis} empresaId={empresaId} onChange={setEmpresaId} />
        )}
      </PageHeader>

      {/* Empresa ativa */}
      <div className="mb-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-purple-50/40 p-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider">Empresa selecionada</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{empresa?.nome}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {empresa?.cnpj && <p className="text-[11px] text-gray-500 font-mono">{empresa.cnpj}</p>}
            {empresa?.empresa_codigo != null && <p className="text-[11px] text-gray-400">cod {empresa.empresa_codigo}</p>}
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="bg-white rounded-xl border border-gray-100 dark:border-white/10 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 dark:border-white/10 overflow-x-auto">
          {ABAS.map(a => {
            const Icon = a.icon;
            const ativo = aba === a.key;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-start gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p>{a.label}</p>
                  <p className="text-[10.5px] text-gray-400 font-normal">{a.descricao}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {aba === 'caixa' && empresa && (
        <AbaConciliacaoCaixa empresa={empresa} usuario={usuario} />
      )}
      {aba === 'extratos' && empresa && (
        <AbaConciliacaoExtratos empresa={empresa} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Aba: Conciliação de caixa
// ═══════════════════════════════════════════════════════════
function AbaConciliacaoCaixa({ empresa, usuario }) {
  const [dataInicial, setDataInicial] = useState(primeiroDiaDoMesIso());
  const [dataFinal, setDataFinal] = useState(hojeIso());
  const [concluidas, setConcluidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [diaVisualizando, setDiaVisualizando] = useState(null);

  const carregar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    setError(null);
    try {
      const lista = await bpoConciliacaoService.listarConcluidas(empresa.id, {
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
  }, [empresa?.id, dataInicial, dataFinal]);

  useEffect(() => { carregar(); }, [carregar]);

  const diasNoPeriodo = useMemo(() => {
    if (!dataInicial || !dataFinal) return 0;
    const a = new Date(dataInicial);
    const b = new Date(dataFinal);
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  }, [dataInicial, dataFinal]);

  // Detalhamento de um dia já concluído: reusa o BpoConciliacaoCaixas
  // (que já tem caminho específico para redes Autosystem) em modo cliente,
  // com gating `requerConciliacaoConcluida=true` — só libera se o admin
  // marcou a conciliação como concluída.
  if (diaVisualizando) {
    return (
      <div>
        <div className="mb-4">
          <button onClick={() => setDiaVisualizando(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar para a lista
          </button>
        </div>
        <BpoConciliacaoCaixas
          clienteFixed={empresa}
          requerConciliacaoConcluida={true}
          usuarioLogado={usuario?.nome || ''}
          dataInitial={diaVisualizando}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filtro de período */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data inicial</label>
            <input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Data final</label>
            <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
          </div>
          <div className="flex items-center gap-2">
            <AtalhoPeriodo label="Mês atual" onClick={() => {
              setDataInicial(primeiroDiaDoMesIso());
              setDataFinal(hojeIso());
            }} />
            <AtalhoPeriodo label="Mês anterior" onClick={() => {
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

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <ResumoCard icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Relatórios concluídos" valor={concluidas.length}
          sub={diasNoPeriodo > 0 ? `em ${diasNoPeriodo} ${diasNoPeriodo === 1 ? 'dia' : 'dias'} do período` : ''}
          highlight />
        <ResumoCard icon={Calendar} iconBg="bg-violet-50" iconColor="text-violet-600"
          label="Período"
          valor={`${formatDataBR(dataInicial)} → ${formatDataBR(dataFinal)}`}
          valorClassName="text-[13px]" />
        <ResumoCard icon={Clock} iconBg="bg-gray-50" iconColor="text-gray-600"
          label="Dias pendentes"
          valor={diasNoPeriodo > concluidas.length ? (diasNoPeriodo - concluidas.length) : 0}
          sub="aguardando conciliação" />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <span className="text-sm">Carregando relatórios...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os relatórios</p>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : concluidas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-3">
            <CalendarDays className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Nenhum relatório concluído neste período</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Os relatórios aparecerão aqui assim que o responsável do BPO finalizar a conciliação de cada dia.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {concluidas.map((item, i) => (
              <ItemConcluido key={item.id} item={item}
                delay={Math.min(i * 0.02, 0.2)}
                onClick={() => setDiaVisualizando(item.data)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Aba: Conciliação de extratos (em construção)
// ═══════════════════════════════════════════════════════════
function AbaConciliacaoExtratos({ empresa }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 mb-3">
        <Landmark className="h-6 w-6 text-violet-600" />
      </div>
      <p className="text-sm font-medium text-gray-900 mb-1">
        Conciliação de extratos bancários — {empresa?.nome}
      </p>
      <p className="text-xs text-gray-500 max-w-md mx-auto">
        Este módulo será habilitado quando a integração com os extratos bancários do Autosystem
        estiver pronta. Defina a regra de busca e os campos esperados e a gente implementa.
      </p>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────
function AtalhoPeriodo({ label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
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
      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left">
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
              Concluído em {new Date(item.concluida_em).toLocaleString('pt-BR')}
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
        <CheckCircle2 className="h-2.5 w-2.5" /> Concluído
      </span>
      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
    </motion.button>
  );
}

// Seletor single de empresa (igual ao usado em Sangrias)
function SeletorEmpresa({ empresas, empresaId, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const atual = empresas.find(e => e.id === empresaId);
  const label = atual?.nome || 'Selecione';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(o => !o)}
        className={`h-10 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-sm transition-colors min-w-[220px] max-w-[320px] font-medium ${
          aberto ? 'border-violet-400 ring-2 ring-violet-100 text-gray-800 bg-white' : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
        }`}>
        <Building2 className="h-4 w-4 text-violet-500 flex-shrink-0" />
        <span className="truncate flex-1 text-left">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {empresas.map(emp => {
                const ativa = emp.id === empresaId;
                return (
                  <button key={emp.id} type="button"
                    onClick={() => { onChange(emp.id); setAberto(false); }}
                    className={`w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left ${
                      ativa ? 'bg-violet-50/60' : ''
                    }`}>
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      ativa ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12.5px] truncate ${ativa ? 'text-violet-900 font-semibold' : 'text-gray-800'}`}>{emp.nome}</p>
                      {emp.cnpj && <p className="text-[10px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                    </div>
                    {ativa && <CheckCircle2 className="h-4 w-4 text-violet-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
