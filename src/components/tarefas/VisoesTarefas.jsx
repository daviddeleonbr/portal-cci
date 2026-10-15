// Visões das tarefas: Lista | Kanban | Agenda (a escolhida fica salva no
// navegador). Usado pela CCI (gestor) e pelo funcionário.

import { useMemo, useState } from 'react';
import { List, Columns3, CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import ListaTarefas from './ListaTarefas';
import { ReferenciaBadge } from './CamposTarefas';
import * as tarefasService from '../../services/tarefasService';
import { STATUS_TAREFA, statusEfetivo, rotinaNoDia, fmtDataHora } from '../../utils/tarefas';

const VISOES = [
  { k: 'lista', rot: 'Lista', icon: List },
  { k: 'kanban', rot: 'Kanban', icon: Columns3 },
  { k: 'agenda', rot: 'Agenda', icon: CalendarDays },
];
// Padrão: Kanban. A escolha do usuário fica salva (chave v2 = todos recomeçam no Kanban).
const lerVisao = () => { try { return localStorage.getItem('tarefas_visao_v2') || 'kanban'; } catch { return 'kanban'; } };

export default function VisoesTarefas({ tarefas, rotinas = [], gestor = false, onAbrir, onAlterado, onErro, abaInicial, vazio }) {
  const [visao, setVisao] = useState(lerVisao);
  const trocar = (v) => { setVisao(v); try { localStorage.setItem('tarefas_visao_v2', v); } catch { /* sem storage */ } };

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-gray-100 p-1">
        {VISOES.map(v => (
          <button key={v.k} onClick={() => trocar(v.k)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${visao === v.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <v.icon className="h-3.5 w-3.5" /> {v.rot}
          </button>
        ))}
      </div>
      {visao === 'kanban' ? (
        <Kanban tarefas={tarefas} gestor={gestor} onAbrir={onAbrir} onAlterado={onAlterado} onErro={onErro} />
      ) : visao === 'agenda' ? (
        <Agenda tarefas={tarefas} rotinas={gestor ? rotinas : []} onAbrir={onAbrir} />
      ) : (
        <ListaTarefas tarefas={tarefas} gestor={gestor} onAbrir={onAbrir} abaInicial={abaInicial} vazio={vazio} />
      )}
    </div>
  );
}

// ─── Kanban ─────────────────────────────────────────────────────
// Arrastar só faz as transições permitidas; o banco valida (checklist,
// evidência). Aprovar arrastando para Concluída = validação da CCI.
// Devolver/cancelar/reabrir: pelo detalhe (pedem motivo/confirmação).
const COLUNAS = [
  { k: 'a_fazer', rot: 'A fazer' },
  { k: 'em_andamento', rot: 'Em andamento' },
  { k: 'atrasada', rot: 'Atrasada' },
  { k: 'aguardando_validacao', rot: 'Aguardando validação' },
  { k: 'concluida', rot: 'Concluída' },
];

function Kanban({ tarefas, gestor, onAbrir, onAlterado, onErro }) {
  const [arrastando, setArrastando] = useState(null);
  const porColuna = useMemo(() => {
    const m = Object.fromEntries(COLUNAS.map(c => [c.k, []]));
    tarefas.forEach(t => { const st = statusEfetivo(t); if (m[st]) m[st].push(t); });
    Object.values(m).forEach(l => l.sort((a, b) => new Date(a.vence_em) - new Date(b.vence_em)));
    m.concluida = m.concluida.slice(-50).reverse();
    return m;
  }, [tarefas]);

  const soltar = async (destino) => {
    const t = arrastando;
    setArrastando(null);
    if (!t || statusEfetivo(t) === destino) return;
    try {
      if (destino === 'em_andamento' && t.status === 'a_fazer') await tarefasService.alterarStatus(t.id, 'em_andamento');
      else if (destino === 'aguardando_validacao' && ['a_fazer', 'em_andamento'].includes(t.status)) await tarefasService.alterarStatus(t.id, 'aguardando_validacao');
      else if (destino === 'concluida' && gestor && t.status === 'aguardando_validacao') await tarefasService.validarTarefa(t.id, true);
      else { onAbrir(t); return; } // demais mudanças pelo detalhe
      onAlterado?.();
    } catch (e) { onErro?.(e.message); }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUNAS.map(c => (
        <div key={c.k} onDragOver={e => e.preventDefault()} onDrop={() => soltar(c.k)}
          className={`flex min-w-[15rem] flex-1 flex-col rounded-xl bg-gray-50 p-2 ${arrastando ? 'ring-1 ring-dashed ring-gray-300' : ''}`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TAREFA[c.k].cls}`}>{c.rot}</span>
            <span className="text-xs tabular-nums text-gray-400">{porColuna[c.k].length}</span>
          </div>
          <div className="flex-1 space-y-2 min-h-[4rem]">
            {porColuna[c.k].map(t => (
              <div key={t.id} draggable onDragStart={() => setArrastando(t)} onDragEnd={() => setArrastando(null)}
                onClick={() => onAbrir(t)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm hover:border-gray-300">
                <p className="text-[13px] font-medium text-gray-900 leading-snug">{t.titulo}</p>
                <ReferenciaBadge t={t} />
                <p className="mt-0.5 truncate text-[11px] text-gray-500">
                  {gestor ? `${t.cliente?.razao_social || t.cliente?.nome || ''} · ${t.responsavel?.nome || 'Sem responsável'}` : (t.setor?.nome || 'Sem setor')}
                </p>
                <p className={`mt-1 flex items-center gap-1 text-[11px] ${c.k === 'atrasada' ? 'font-medium text-rose-600' : 'text-gray-400'}`}>
                  <Clock className="h-3 w-3" /> {fmtDataHora(t.vence_em)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Agenda (semana / mês) ──────────────────────────────────────
// Tarefas pelo dia do vencimento; para a CCI, também as ocorrências PREVISTAS
// das rotinas ativas em dias futuros (ainda não geradas).
const DIAS_SEM = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const chaveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function inicioSemana(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

function Agenda({ tarefas, rotinas, onAbrir }) {
  const [modo, setModo] = useState('semana');
  const [ref, setRef] = useState(() => new Date());

  const dias = useMemo(() => {
    if (modo === 'semana') {
      const ini = inicioSemana(ref);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });
    }
    const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const ini = inicioSemana(primeiro);
    const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const total = Math.ceil(((ultimo - ini) / 86400000 + 1) / 7) * 7;
    return Array.from({ length: total }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });
  }, [modo, ref]);

  const porDia = useMemo(() => {
    const m = new Map();
    tarefas.forEach(t => { const k = chaveDia(new Date(t.vence_em)); if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return m;
  }, [tarefas]);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  // Previstas: rotinas ativas em dias FUTUROS sem tarefa gerada ainda.
  const previstas = (d) => (d > hoje
    ? rotinas.filter(r => rotinaNoDia(r, d) && !(porDia.get(chaveDia(d)) || []).some(t => t.rotina_id === r.id))
    : []);

  const andar = (n) => setRef(r => {
    const x = new Date(r);
    if (modo === 'semana') x.setDate(x.getDate() + 7 * n); else x.setMonth(x.getMonth() + n);
    return x;
  });
  const titulo = modo === 'semana'
    ? `${dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${dias[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-xl border border-gray-200/70 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => andar(-1)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setRef(new Date())} className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Hoje</button>
          <button onClick={() => andar(1)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
          <span className="ml-2 text-sm font-semibold capitalize text-gray-800">{titulo}</span>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          {['semana', 'mes'].map(m => (
            <button key={m} onClick={() => setModo(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${modo === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{m === 'semana' ? 'Semana' : 'Mês'}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
        {DIAS_SEM.map(d => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map(d => {
          const lista = porDia.get(chaveDia(d)) || [];
          const prev = previstas(d);
          const foraMes = modo === 'mes' && d.getMonth() !== ref.getMonth();
          const ehHoje = d.getTime() === hoje.getTime();
          const limite = modo === 'semana' ? 50 : 3;
          return (
            <div key={d.toISOString()} className={`border-b border-r border-gray-100 p-1.5 ${modo === 'semana' ? 'min-h-[12rem]' : 'min-h-[6.5rem]'} ${foraMes ? 'bg-gray-50/60' : ''}`}>
              <p className={`mb-1 text-right text-[11px] ${ehHoje ? 'font-bold text-blue-600' : foraMes ? 'text-gray-300' : 'text-gray-500'}`}>{d.getDate()}</p>
              <div className="space-y-1">
                {lista.slice(0, limite).map(t => {
                  const st = statusEfetivo(t);
                  return (
                    <button key={t.id} onClick={() => onAbrir(t)} title={t.titulo}
                      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium ${STATUS_TAREFA[st].cls}`}>
                      {t.titulo}
                    </button>
                  );
                })}
                {lista.length > limite && <p className="px-1 text-[10px] text-gray-400">+{lista.length - limite} mais</p>}
                {prev.slice(0, modo === 'semana' ? 20 : 2).map(r => (
                  <p key={r.id} title={`Prevista — rotina ${r.nome}`}
                    className="truncate rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[10.5px] text-gray-400">
                    {r.nome}
                  </p>
                ))}
                {modo === 'mes' && prev.length > 2 && <p className="px-1 text-[10px] text-gray-300">+{prev.length - 2} previstas</p>}
              </div>
            </div>
          );
        })}
      </div>
      {rotinas.length > 0 && (
        <p className="px-3 py-2 text-[11px] text-gray-400">Contorno tracejado = ocorrência prevista de rotina (a tarefa é gerada no próprio dia).</p>
      )}
    </div>
  );
}
