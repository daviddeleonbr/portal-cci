// Tarefas — visão da CCI (gestor): painel de execução, tarefas (com a fila de
// validação) e rotinas recorrentes dos funcionários dos clientes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, ListChecks, Repeat, Plus, Loader2, Pencil, Trash2, Tags, ShieldCheck, AlertTriangle, Clock3, Copy,
  Search, Pause, Play,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import VisoesTarefas from '../components/tarefas/VisoesTarefas';
import TarefaDetalhe from '../components/tarefas/TarefaDetalhe';
import { RotinaModal, DuplicarRotinaModal, NovaTarefaModal, SetoresModal } from '../components/tarefas/FormulariosTarefas';
import * as tarefasService from '../services/tarefasService';
import * as clientesService from '../services/clientesService';
import {
  indicadores, corExecucao, estaAtrasada, descreverRecorrencia, fmtDataHora, hojeYmd, somarDiasYmd, STATUS_TAREFA, statusEfetivo,
  PRIORIDADES, REFERENCIAS, proximaExecucao, fmtDiaMes,
} from '../utils/tarefas';

const nomeCliente = (c) => c?.razao_social || c?.nome || '—';

export default function AdminTarefas() {
  const [aba, setAba] = useState('painel');
  const [clientes, setClientes] = useState([]);
  const [setores, setSetores] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState([]);
  const [rotinas, setRotinas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [abertaId, setAbertaId] = useState(null);
  const [modalRotina, setModalRotina] = useState({ open: false, rotina: null });
  const [modalTarefa, setModalTarefa] = useState(false);
  const [duplicar, setDuplicar] = useState(null);
  const [modalSetores, setModalSetores] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = useCallback((type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  }, []);

  useEffect(() => {
    Promise.all([clientesService.listarClientes(), tarefasService.listarSetores()])
      .then(([cs, ss]) => { setClientes((cs || []).filter(c => c.status === 'ativo')); setSetores(ss); })
      .catch(e => showToast('error', e.message));
  }, [showToast]);

  // Período: últimos N dias até +60 (avulsas futuras) + pendentes mais antigas.
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const de = somarDiasYmd(hojeYmd(), -dias);
      const [noPeriodo, antigas, rots, peds] = await Promise.all([
        tarefasService.listarTarefas({ clienteId: clienteId || undefined, de, ate: somarDiasYmd(hojeYmd(), 60) }),
        tarefasService.listarPendentesAntigas({ clienteId: clienteId || undefined, antesDe: de }),
        tarefasService.listarRotinas({ clienteId: clienteId || undefined }),
        tarefasService.listarPedidosPendentes(),
      ]);
      setPedidos(clienteId ? peds.filter(p => p.tarefa?.cliente?.id === clienteId) : peds);
      const vistos = new Set();
      setLista([...noPeriodo, ...antigas].filter(t => (vistos.has(t.id) ? false : vistos.add(t.id))));
      setRotinas(rots);
    } catch (e) { showToast('error', 'Erro ao carregar tarefas: ' + e.message); }
    finally { setCarregando(false); }
  }, [clienteId, dias, showToast]);
  useEffect(() => { carregar(); }, [carregar]);

  const recarregarSetores = () => tarefasService.listarSetores().then(setSetores).catch(() => {});
  const aguardando = lista.filter(t => t.status === 'aguardando_validacao').length + pedidos.length;

  const abas = [
    { k: 'painel', rot: 'Painel', icon: LayoutDashboard },
    { k: 'tarefas', rot: 'Tarefas', icon: ListChecks, badge: aguardando },
    { k: 'rotinas', rot: 'Rotinas', icon: Repeat },
  ];

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Tarefas" description="Rotinas de trabalho dos funcionários dos clientes — execução e validação pela CCI">
        <button onClick={() => setModalSetores(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Tags className="h-4 w-4" /> Setores
        </button>
        <button onClick={() => setModalRotina({ open: true, rotina: null })}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Repeat className="h-4 w-4" /> Nova rotina
        </button>
        <button onClick={() => setModalTarefa(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4" /> Nova tarefa
        </button>
      </PageHeader>

      {/* Filtros + abas */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 border-b border-gray-200">
          {abas.map(a => (
            <button key={a.k} onClick={() => setAba(a.k)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium ${aba === a.k ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              <a.icon className="h-4 w-4" /> {a.rot}
              {a.badge > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">{a.badge}</span>}
              {aba === a.k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="h-9 max-w-xs rounded-lg border border-gray-200 bg-white px-2 text-sm">
            <option value="">Todas as empresas</option>
            {[...clientes].sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))).map(c => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
          </select>
          <select value={dias} onChange={e => setDias(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
            {[7, 30, 90].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : aba === 'painel' ? (
        <Painel lista={lista} pedidos={pedidos} onAbrir={t => setAbertaId(t.id)} />
      ) : aba === 'tarefas' ? (
        <VisoesTarefas tarefas={lista} rotinas={rotinas} gestor onAbrir={t => setAbertaId(t.id)}
          onAlterado={carregar} onErro={m => showToast('error', m)} abaInicial={aguardando ? 'validacao' : 'abertas'} />
      ) : (
        <TabelaRotinas rotinas={rotinas}
          onEditar={r => setModalRotina({ open: true, rotina: r })}
          setores={setores}
          onDuplicar={r => setDuplicar(r)}
          onAlternar={async r => {
            try { await tarefasService.salvarRotina({ ...r, ativa: !r.ativa }); await carregar(); }
            catch (e) { showToast('error', e.message); }
          }}
          onExcluir={async r => {
            if (!confirm(`Excluir a rotina "${r.nome}"? As tarefas em aberto dela serão canceladas; as demais ficam no histórico.`)) return;
            try { await tarefasService.excluirRotina(r.id); showToast('success', 'Rotina excluída'); await carregar(); }
            catch (e) { showToast('error', e.message); }
          }} />
      )}

      {abertaId && <TarefaDetalhe tarefaId={abertaId} gestor onFechar={() => setAbertaId(null)} onAlterado={carregar} />}
      <RotinaModal open={modalRotina.open} rotina={modalRotina.rotina} clientes={clientes} setores={setores} showToast={showToast}
        onClose={() => setModalRotina({ open: false, rotina: null })}
        onSalvo={() => { setModalRotina({ open: false, rotina: null }); carregar(); }} />
      {duplicar && <DuplicarRotinaModal rotina={duplicar} clientes={clientes} rotinas={rotinas}
        onClose={() => setDuplicar(null)} onSalvo={carregar} />}
      <NovaTarefaModal open={modalTarefa} clientes={clientes} setores={setores} showToast={showToast}
        onClose={() => setModalTarefa(false)} onSalvo={() => { setModalTarefa(false); carregar(); }} />
      <SetoresModal open={modalSetores} setores={setores} showToast={showToast}
        onClose={() => setModalSetores(false)} onSalvo={recarregarSetores} />
    </div>
  );
}

// ─── Painel de execução ─────────────────────────────────────────
function Painel({ lista, pedidos = [], onAbrir }) {
  const ind = indicadores(lista);
  // Árvore simples: empresa → pessoa, ordenada da pior execução para a melhor.
  const porEmpresa = useMemo(() => {
    const m = new Map();
    lista.forEach(t => {
      const k = t.cliente_id;
      if (!m.has(k)) m.set(k, { nome: nomeCliente(t.cliente), tarefas: [], pessoas: new Map() });
      const e = m.get(k);
      e.tarefas.push(t);
      const p = t.responsavel?.nome || 'Sem responsável';
      if (!e.pessoas.has(p)) e.pessoas.set(p, []);
      e.pessoas.get(p).push(t);
    });
    return [...m.values()].map(e => ({
      ...e, ind: indicadores(e.tarefas),
      pessoas: [...e.pessoas.entries()].map(([nome, ts]) => ({ nome, ind: indicadores(ts) }))
        .sort((a, b) => (a.ind.execucao ?? 101) - (b.ind.execucao ?? 101)),
    })).sort((a, b) => (a.ind.execucao ?? 101) - (b.ind.execucao ?? 101));
  }, [lista]);

  const aguardando = lista.filter(t => t.status === 'aguardando_validacao').sort((a, b) => new Date(a.enviada_em) - new Date(b.enviada_em));
  const atencao = lista.filter(t => estaAtrasada(t)).sort((a, b) => new Date(a.vence_em) - new Date(b.vence_em)).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi rot="Execução no prazo" valor={ind.execucao == null ? '—' : `${ind.execucao}%`} cls={corExecucao(ind.execucao)} />
        <Kpi rot="Concluídas" valor={ind.concluidas} sub={`${ind.noPrazo} no prazo`} />
        <Kpi rot="Aguardando validação" valor={ind.aguardando} cls="text-violet-700" />
        <Kpi rot="Atrasadas" valor={ind.atrasadas} cls={ind.atrasadas ? 'text-rose-600' : ''} />
        <Kpi rot="Pendentes no prazo" valor={ind.pendentes} />
      </div>

      {pedidos.length > 0 && (
        <Bloco titulo={`Pedidos de mais prazo / reabertura (${pedidos.length})`} icon={Clock3} vazio="">
          {pedidos.map(p => (
            <button key={p.id} onClick={() => onAbrir({ id: p.tarefa_id })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{p.tarefa?.titulo}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {nomeCliente(p.tarefa?.cliente)} · {p.solicitante_nome} · “{p.motivo}”
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                {p.tipo === 'prorrogacao' ? `prazo até ${fmtDataHora(p.prazo_solicitado)}` : 'reabertura'}
              </span>
            </button>
          ))}
        </Bloco>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bloco titulo="Aguardando validação da CCI" icon={ShieldCheck} vazio="Nada aguardando validação.">
          {aguardando.map(t => <LinhaCurta key={t.id} t={t} onAbrir={onAbrir} extra={`enviada ${fmtDataHora(t.enviada_em)}`} />)}
        </Bloco>
        <Bloco titulo="Atrasadas — pedem atenção" icon={AlertTriangle} vazio="Nenhuma tarefa atrasada.">
          {atencao.map(t => <LinhaCurta key={t.id} t={t} onAbrir={onAbrir} extra={`venceu ${fmtDataHora(t.vence_em)}`} />)}
        </Bloco>
      </div>

      <div className="rounded-xl border border-gray-200/70 bg-white shadow-sm overflow-hidden">
        <p className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">Execução por empresa e por pessoa</p>
        {porEmpresa.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-400">Sem tarefas no período.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-2 text-left">Empresa / pessoa</th><th className="px-3 py-2 text-right">Execução</th>
                <th className="px-3 py-2 text-right">Concluídas</th><th className="px-3 py-2 text-right">Aguardando</th><th className="px-3 py-2 text-right">Atrasadas</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {porEmpresa.map(e => (
                <FragmentoEmpresa key={e.nome} e={e} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentoEmpresa({ e }) {
  const linha = (nome, ind, sub) => (
    <tr key={nome + (sub ? '-p' : '')} className={sub ? 'bg-gray-50/40' : ''}>
      <td className={`px-4 py-2 ${sub ? 'pl-9 text-gray-600' : 'font-medium text-gray-900'}`}>{nome}</td>
      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${corExecucao(ind.execucao)}`}>{ind.execucao == null ? '—' : `${ind.execucao}%`}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{ind.concluidas}</td>
      <td className="px-3 py-2 text-right tabular-nums text-violet-700">{ind.aguardando || ''}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${ind.atrasadas ? 'text-rose-600 font-medium' : 'text-gray-400'}`}>{ind.atrasadas}</td>
    </tr>
  );
  return (
    <>
      {linha(e.nome, e.ind, false)}
      {e.pessoas.map(p => linha(p.nome, p.ind, true))}
    </>
  );
}

function Kpi({ rot, valor, sub, cls = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200/70 bg-white p-3.5 shadow-sm">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{rot}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function Bloco({ titulo, icon, vazio, children }) {
  const Icone = icon;
  const itens = Array.isArray(children) ? children : [children];
  return (
    <div className="rounded-xl border border-gray-200/70 bg-white shadow-sm">
      <p className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800"><Icone className="h-4 w-4 text-gray-400" /> {titulo}</p>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
        {itens.filter(Boolean).length ? itens : <p className="px-4 py-6 text-center text-sm text-gray-400">{vazio}</p>}
      </div>
    </div>
  );
}

function LinhaCurta({ t, onAbrir, extra }) {
  const st = statusEfetivo(t);
  return (
    <button onClick={() => onAbrir(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{t.titulo}</p>
        <p className="truncate text-[11px] text-gray-500">{nomeCliente(t.cliente)} · {t.responsavel?.nome || 'Sem responsável'} · {extra}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TAREFA[st].cls}`}>{STATUS_TAREFA[st].rotulo}</span>
    </button>
  );
}

// ─── Rotinas (igual ao Visor360) ────────────────────────────────
const PRIO_BADGE = {
  critica: 'bg-rose-50 text-rose-700', alta: 'bg-orange-50 text-orange-700',
  media: 'bg-amber-50 text-amber-700', baixa: 'bg-gray-100 text-gray-500',
};
function PrioridadeBadge({ p }) {
  return <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIO_BADGE[p] || PRIO_BADGE.media}`}>{PRIORIDADES[p]?.rotulo}</span>;
}
function StatusRotina({ r }) {
  if (!r.ativa) return <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">Pausada</span>;
  if (!r.responsavel_id) return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Não gera</span>;
  if (r.data_inicio > hojeYmd()) {
    return <span className="whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700" title="As tarefas começam a ser geradas nesta data">Começa {fmtDiaMes(r.data_inicio)}</span>;
  }
  return <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">Ativa</span>;
}
const detalheRotina = (r) => `${r.setor?.nome || 'Sem setor'}${r.checklist?.length ? ` · ${r.checklist.length} etapa(s)` : ''}${
  r.exige_evidencia ? (r.documentos?.length ? ` · ${r.documentos.length} doc. exigido(s)` : ' · exige evidência') : ''}`;
const refRotina = (r) => (r.referencia && r.referencia !== 'mesmo_dia' ? REFERENCIAS.find(x => x.k === r.referencia)?.rot.toLowerCase() : null);
const fmtProx = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—');

function AcaoBtn({ onClick, children, perigo }) {
  return <button type="button" onClick={onClick} className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-medium ${perigo ? 'flex-none border-red-100 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50'}`}>{children}</button>;
}
function IconBtn({ t, onClick, children, perigo }) {
  return <button onClick={onClick} title={t} className={`rounded-md p-1.5 text-gray-400 transition-colors ${perigo ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-700'}`}>{children}</button>;
}

function TabelaRotinas({ rotinas, setores, onEditar, onDuplicar, onAlternar, onExcluir }) {
  const [busca, setBusca] = useState('');
  const [setorF, setSetorF] = useState('');
  const [statusF, setStatusF] = useState('');
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rotinas.filter(r => {
      if (setorF && r.setor_id !== setorF) return false;
      if (statusF === 'ativa' && !(r.ativa && r.responsavel_id)) return false;
      if (statusF === 'pausada' && r.ativa) return false;
      if (statusF === 'sem_resp' && r.responsavel_id) return false;
      if (q && !`${r.nome} ${nomeCliente(r.cliente)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rotinas, busca, setorF, statusF]);

  const sel = 'rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 outline-none focus:border-teal-500';
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative basis-full sm:min-w-[220px] sm:flex-1 sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar rotina…" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
        </div>
        <select value={setorF} onChange={e => setSetorF(e.target.value)} className={`${sel} min-w-0 flex-1 sm:flex-none`}>
          <option value="">Todos os setores</option>{setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className={`${sel} min-w-0 flex-1 sm:flex-none`}>
          <option value="">Todos os status</option><option value="ativa">Ativas</option><option value="pausada">Pausadas</option><option value="sem_resp">Sem responsável</option>
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-gray-200/70 bg-white p-10 text-center text-sm text-gray-400">
          <Repeat className="mx-auto mb-2 h-7 w-7 text-gray-300" />
          {rotinas.length === 0 ? 'Nenhuma rotina ainda — crie a primeira em “Nova rotina”.' : 'Nenhuma rotina para esse filtro.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200/70 bg-white shadow-sm">
          {/* Celular: um card por rotina */}
          <ul className="divide-y divide-gray-100 sm:hidden">
            {lista.map(r => {
              const ref = refRotina(r);
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate text-[14px] font-semibold text-gray-800" title={r.nome}>{r.nome}</span><PrioridadeBadge p={r.prioridade} /></div>
                      <div className="mt-0.5 text-[11px] text-gray-400">{detalheRotina(r)}</div>
                    </div>
                    <StatusRotina r={r} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                    <div className="min-w-0"><div className="text-[9.5px] uppercase tracking-wide text-gray-400">Empresa</div><div className="truncate text-gray-700">{nomeCliente(r.cliente)}</div></div>
                    <div className="min-w-0"><div className="text-[9.5px] uppercase tracking-wide text-gray-400">Responsável</div><div className={`truncate ${r.responsavel ? 'text-gray-700' : 'font-medium text-amber-600'}`}>{r.responsavel?.nome ?? 'Sem responsável'}</div></div>
                    <div className="min-w-0"><div className="text-[9.5px] uppercase tracking-wide text-gray-400">Recorrência</div><div className="truncate text-gray-700">{descreverRecorrencia(r)} · {String(r.horario).slice(0, 5)}{ref && ` · ref. ${ref}`}</div></div>
                    <div className="min-w-0"><div className="text-[9.5px] uppercase tracking-wide text-gray-400">Próxima</div><div className="truncate text-gray-700">{fmtProx(proximaExecucao(r))}</div></div>
                  </div>
                  <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                    <AcaoBtn onClick={() => onEditar(r)}><Pencil className="h-3.5 w-3.5" /> Editar</AcaoBtn>
                    <AcaoBtn onClick={() => onAlternar(r)}>{r.ativa ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Reativar</>}</AcaoBtn>
                    <AcaoBtn onClick={() => onDuplicar(r)}><Copy className="h-3.5 w-3.5" /> Duplicar</AcaoBtn>
                    <AcaoBtn perigo onClick={() => onExcluir(r)}><Trash2 className="h-3.5 w-3.5" /></AcaoBtn>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <tr><th className="px-4 py-2.5">Rotina</th><th className="px-2 py-2.5">Empresa</th><th className="px-2 py-2.5">Responsável</th><th className="px-2 py-2.5">Recorrência</th><th className="px-2 py-2.5">Próxima</th><th className="px-2 py-2.5">Status</th><th className="w-32 px-3 py-2.5 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(r => {
                  const ref = refRotina(r);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-gray-50/70">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2"><span className="max-w-[260px] truncate text-[13px] font-medium text-gray-800" title={r.nome}>{r.nome}</span><PrioridadeBadge p={r.prioridade} /></div>
                        <div className="text-[10.5px] text-gray-400">{detalheRotina(r)}</div>
                      </td>
                      <td className="px-2 py-2.5"><div className="max-w-[160px] truncate text-[12px] text-gray-600">{nomeCliente(r.cliente)}</div></td>
                      <td className="px-2 py-2.5 text-[12px]">{r.responsavel ? <span className="text-gray-600">{r.responsavel.nome}</span> : <span className="font-medium text-amber-600">Sem responsável</span>}</td>
                      <td className="px-2 py-2.5 text-[12px] text-gray-600">{descreverRecorrencia(r)}<div className="text-[10.5px] text-gray-400">vence às {String(r.horario).slice(0, 5)}{ref && <span className="text-sky-700"> · ref. {ref}</span>}</div></td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-[12px] text-gray-600">{fmtProx(proximaExecucao(r))}</td>
                      <td className="px-2 py-2.5"><StatusRotina r={r} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <IconBtn t="Editar" onClick={() => onEditar(r)}><Pencil className="h-4 w-4" /></IconBtn>
                          <IconBtn t={r.ativa ? 'Pausar' : 'Reativar'} onClick={() => onAlternar(r)}>{r.ativa ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</IconBtn>
                          <IconBtn t="Duplicar para outras empresas" onClick={() => onDuplicar(r)}><Copy className="h-4 w-4" /></IconBtn>
                          <IconBtn t="Excluir" perigo onClick={() => onExcluir(r)}><Trash2 className="h-4 w-4" /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">{lista.length} rotina(s) · as tarefas do dia são geradas automaticamente às 00:05</div>
        </div>
      )}
    </div>
  );
}
