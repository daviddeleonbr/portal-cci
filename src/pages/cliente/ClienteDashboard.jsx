import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Coins, FileSpreadsheet, ListTodo,
  ChevronRight, Calendar, Clock, User, Zap,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { CardSkeleton } from '../../components/ui/LoadingSkeleton';
import { useSimulatedLoading } from '../../hooks/useSimulatedLoading';
import { useClienteSession } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import * as tarefasService from '../../services/clienteTarefasService';

// Dias uteis (seg-sex) do mes atual ate ontem
function diasUteisDoMesAteOntem() {
  const hoje = new Date();
  const dias = [];
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  for (let d = 1; d <= ontem.getDate(); d++) {
    const dt = new Date(ano, mes, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    dias.push(`${yy}-${mm}-${dd}`);
  }
  return dias;
}

function formatDataBR(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

function diaSemana(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][dt.getDay()];
}

export default function ClienteDashboard() {
  const loading = useSimulatedLoading(400);
  const session = useClienteSession();
  const cliente = session?.cliente;
  const chaveApi = session?.chaveApi;
  const usuario = session?.usuario;
  const primeiroNome = (usuario?.nome || cliente?.contato_nome || 'Cliente').split(' ')[0];
  const nomeCliente = cliente?.nome || '';
  const cnpjCliente = cliente?.cnpj || '';

  const temAcessoTotal = !!usuario?.permissoes?.includes('gerenciar_usuarios');
  const meuNome = (usuario?.nome || '').trim().toLowerCase();

  const [pendencias, setPendencias] = useState({ sangrias: [], extratos: [], tarefas: [] });
  const [loadingPend, setLoadingPend] = useState(true);

  useEffect(() => {
    if (!cliente?.id) return;
    (async () => {
      try {
        setLoadingPend(true);
        const diasUteis = diasUteisDoMesAteOntem();
        if (diasUteis.length === 0) {
          setPendencias({ sangrias: [], extratos: [], tarefas: [] });
          return;
        }
        const mesInicio = diasUteis[0];
        const mesFim = diasUteis[diasUteis.length - 1];

        const [{ data: fechs }, { data: exts }] = await Promise.all([
          supabase.from('cliente_sangrias_fechamento')
            .select('data')
            .eq('cliente_id', cliente.id)
            .gte('data', mesInicio).lte('data', mesFim),
          supabase.from('extratos_bancarios')
            .select('data_inicial, data_final')
            .eq('cliente_id', cliente.id)
            .gte('data_final', mesInicio).lte('data_inicial', mesFim),
        ]);

        const diasFechados = new Set((fechs || []).map(r => r.data));
        const diasComExtrato = new Set();
        (exts || []).forEach(e => {
          const ini = new Date(e.data_inicial + 'T00:00:00');
          const fim = new Date(e.data_final + 'T00:00:00');
          for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
            const yy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            diasComExtrato.add(`${yy}-${mm}-${dd}`);
          }
        });

        const sangriasPendentes = diasUteis.filter(d => !diasFechados.has(d));
        const extratosPendentes = diasUteis.filter(d => !diasComExtrato.has(d));

        let tarefasPend = [];
        if (chaveApi?.id) {
          try {
            const todas = await tarefasService.listar(chaveApi.id);
            tarefasPend = todas.filter(t => t.status === 'pendente' || t.status === 'em_andamento');
            if (!temAcessoTotal) {
              tarefasPend = tarefasPend.filter(t =>
                (t.responsavel || '').trim().toLowerCase() === meuNome
              );
            }
          } catch (_) { /* noop */ }
        }

        setPendencias({
          sangrias: sangriasPendentes,
          extratos: extratosPendentes,
          tarefas: tarefasPend,
        });
      } finally { setLoadingPend(false); }
    })();
  }, [cliente?.id, chaveApi?.id, temAcessoTotal, meuNome]);

  const totalPendencias = pendencias.sangrias.length + pendencias.extratos.length + pendencias.tarefas.length;
  const titulo = `Ola, ${primeiroNome}`;
  const descricao = cnpjCliente ? `${nomeCliente} - ${cnpjCliente}` : nomeCliente;

  if (loading || loadingPend) {
    return (
      <div>
        <PageHeader title={titulo} description={descricao} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={titulo} description={descricao} />

      {totalPendencias === 0 ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-emerald-200/60 dark:bg-emerald-500/10 p-6 flex items-center gap-4 shadow-sm">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Tudo em dia!</p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Nenhuma tarefa pendente para este mes
              {!temAcessoTotal && ' atribuida a voce'}.
            </p>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Resumo das pendencias */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <ResumoCard
              icon={Coins} cor="amber"
              label="Sangrias pendentes" valor={pendencias.sangrias.length}
              sub={pendencias.sangrias.length === 0 ? 'Nenhuma pendente' : 'dias uteis sem fechamento'}
            />
            <ResumoCard
              icon={FileSpreadsheet} cor="blue"
              label="Extratos pendentes" valor={pendencias.extratos.length}
              sub={pendencias.extratos.length === 0 ? 'Nenhum pendente' : 'dias uteis sem extrato'}
            />
            <ResumoCard
              icon={ListTodo} cor="indigo"
              label="Tarefas em aberto" valor={pendencias.tarefas.length}
              sub={temAcessoTotal ? 'da rede toda' : 'atribuidas a voce'}
            />
          </div>

          {/* Detalhes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <DiasPendentesCard
              titulo="Sangrias do mes nao enviadas"
              icon={Coins}
              cor="amber"
              dias={pendencias.sangrias}
              linkLabel="Enviar sangrias"
              link="/cliente/sangrias"
            />
            <DiasPendentesCard
              titulo="Extratos bancarios nao enviados"
              icon={FileSpreadsheet}
              cor="blue"
              dias={pendencias.extratos}
              linkLabel="Enviar extratos"
              link="/cliente/documentos"
            />
          </div>

          {pendencias.tarefas.length > 0 && (
            <TarefasCard tarefas={pendencias.tarefas} temAcessoTotal={temAcessoTotal} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Resumo card (coluna/topo) ───────────────────────────────
function ResumoCard({ icon: Icon, cor, label, valor, sub }) {
  const cores = {
    amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700', border: 'border-amber-200' },
    blue:  { bg: 'bg-blue-50 dark:bg-blue-500/10',   text: 'text-blue-700',  border: 'border-blue-200' },
    indigo:{ bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-700', border: 'border-indigo-200' },
  };
  const c = cores[cor] || cores.blue;
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center border ${c.bg} ${c.border}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valor > 0 ? c.text : 'text-gray-500'}`}>{valor}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </motion.div>
  );
}

// ─── Card de dias pendentes (sangria ou extrato) ─────────────
function DiasPendentesCard({ titulo, icon: Icon, cor, dias, linkLabel, link }) {
  const cores = {
    amber: { bg: 'from-amber-400 to-orange-500', chip: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200' },
    blue:  { bg: 'from-blue-500 to-indigo-600',   chip: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border-blue-200' },
  };
  const c = cores[cor] || cores.blue;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${c.bg} flex items-center justify-center shadow-sm flex-shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{titulo}</p>
          <p className="text-[11px] text-gray-500">
            {dias.length === 0 ? 'Nenhuma pendencia' : `${dias.length} dia${dias.length === 1 ? '' : 's'} util${dias.length === 1 ? '' : 'eis'}`}
          </p>
        </div>
        {dias.length > 0 && (
          <Link to={link}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors">
            {linkLabel} <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {dias.length === 0 ? (
        <div className="px-5 py-10 text-center flex-1 flex flex-col items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-2" />
          <p className="text-xs text-gray-500">Todos os dias do mes em dia</p>
        </div>
      ) : (
        <div className="p-3 flex flex-wrap gap-1.5">
          {dias.map(d => (
            <span key={d} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${c.chip}`}>
              <Calendar className="h-3 w-3 opacity-70" />
              <span className="font-mono tabular-nums">{formatDataBR(d)}</span>
              <span className="text-[9px] opacity-70 uppercase">{diaSemana(d)}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Card de tarefas do gestor ───────────────────────────────
function TarefasCard({ tarefas, temAcessoTotal }) {
  const coresPrio = {
    urgente: 'bg-red-50 dark:bg-red-500/10 text-red-700 border-red-200',
    alta:    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200',
    normal:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 border-indigo-200',
    baixa:   'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
          <ListTodo className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Tarefas em aberto
            {!temAcessoTotal && <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase tracking-wider">atribuidas a voce</span>}
          </p>
          <p className="text-[11px] text-gray-500">
            {tarefas.length} {tarefas.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}
          </p>
        </div>
        <Link to="/cliente/tarefas"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Ver todas <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-100">
        {tarefas.slice(0, 8).map(t => {
          const atrasada = tarefasService.isAtrasada(t);
          return (
            <Link key={t.id} to="/cliente/tarefas"
              className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/60 transition-colors">
              <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                atrasada ? 'bg-red-500' : t.status === 'em_andamento' ? 'bg-blue-500' : 'bg-amber-500'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 font-medium truncate">{t.titulo}</p>
                {t.descricao && (
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{t.descricao}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  {t.prioridade && t.prioridade !== 'normal' && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${coresPrio[t.prioridade] || coresPrio.normal}`}>
                      {t.prioridade}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-1.5 py-0.5 border ${
                    t.status === 'em_andamento' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border-blue-200'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200'
                  }`}>
                    {t.status === 'em_andamento' ? <><Zap className="h-2.5 w-2.5" /> em andamento</> : <><Clock className="h-2.5 w-2.5" /> pendente</>}
                  </span>
                  {t.responsavel && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                      <User className="h-2.5 w-2.5 text-gray-400" /> {t.responsavel}
                    </span>
                  )}
                  {t.prazo && (
                    <span className={`inline-flex items-center gap-1 text-[10px] ${atrasada ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                      <Calendar className="h-2.5 w-2.5 text-gray-400" /> {formatDataBR(t.prazo)}
                      {atrasada && ' · atrasada'}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
            </Link>
          );
        })}
        {tarefas.length > 8 && (
          <Link to="/cliente/tarefas"
            className="block px-5 py-2.5 text-center text-[11px] font-medium text-blue-600 hover:bg-gray-50/60">
            + {tarefas.length - 8} tarefa{tarefas.length - 8 === 1 ? '' : 's'} adicional{tarefas.length - 8 === 1 ? '' : 'is'}
          </Link>
        )}
      </div>
    </motion.div>
  );
}
