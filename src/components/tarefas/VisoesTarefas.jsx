// Visões das tarefas: Lista | Kanban | Agenda (a escolhida fica salva no
// navegador). Usado pela CCI (gestor) e pelo funcionário.
// Celular (<768px): Kanban vira "Quadro" (uma coluna por vez, escolhida em
// chips com contador — arrastar não funciona no toque) e a Agenda vira uma
// faixa de dias + lista do dia escolhido (7 colunas não cabem na tela).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEhCelular } from '../../hooks/useEhCelular';
import { List, Columns3, CalendarDays, ChevronLeft, ChevronRight, Clock, Play, Loader2, ChevronRight as Seta } from 'lucide-react';
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

export default function VisoesTarefas({ tarefas, rotinas = [], gestor = false, onAbrir, onAlterado, onErro, abaInicial, vazio, visaoInicial }) {
  const [visao, setVisao] = useState(() => visaoInicial || lerVisao());
  const trocar = (v) => { setVisao(v); try { localStorage.setItem('tarefas_visao_v2', v); } catch { /* sem storage */ } };
  const celular = useEhCelular();

  return (
    <div>
      <div role="tablist" aria-label="Visualização" className="mb-3 flex sm:inline-flex rounded-lg bg-gray-100 p-1">
        {VISOES.map(v => (
          <button key={v.k} role="tab" aria-selected={visao === v.k} onClick={() => trocar(v.k)}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 h-10 sm:h-auto sm:py-1.5 text-sm sm:text-xs font-medium ${visao === v.k ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-800'}`}>
            <v.icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> {celular && v.k === 'kanban' ? 'Quadro' : v.rot}
          </button>
        ))}
      </div>
      {visao === 'kanban' ? (
        celular
          ? <QuadroCelular tarefas={tarefas} gestor={gestor} onAbrir={onAbrir} onAlterado={onAlterado} onErro={onErro} vazio={vazio} />
          : <Kanban tarefas={tarefas} gestor={gestor} onAbrir={onAbrir} onAlterado={onAlterado} onErro={onErro} />
      ) : visao === 'agenda' ? (
        celular
          ? <AgendaCelular tarefas={tarefas} rotinas={gestor ? rotinas : []} gestor={gestor} onAbrir={onAbrir} />
          : <Agenda tarefas={tarefas} rotinas={gestor ? rotinas : []} onAbrir={onAbrir} />
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

// Altura do quadro = do topo dele até o fim da janela (as colunas rolam por dentro).
function useAlturaAteFim(margem = 24) {
  const ref = useRef(null);
  const [altura, setAltura] = useState(null);
  useEffect(() => {
    let raf = 0;
    const medir = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        const topo = ref.current.getBoundingClientRect().top + window.scrollY;
        setAltura(Math.max(320, window.innerHeight - topo - margem));
      });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', medir); };
  }, [margem]);
  return [ref, altura];
}

// Borda suave de cada coluna, na cor do status (claro e escuro — ver index.css).
const BORDA_STATUS = {
  a_fazer: 'border-gray-200', em_andamento: 'border-blue-200', atrasada: 'border-rose-200',
  aguardando_validacao: 'border-purple-200', concluida: 'border-emerald-200',
};

function Kanban({ tarefas, gestor, onAbrir, onAlterado, onErro }) {
  const [arrastando, setArrastando] = useState(null);
  const [quadroRef, altura] = useAlturaAteFim();
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
    <div ref={quadroRef} className="flex gap-3 overflow-x-auto pb-2" style={altura ? { height: altura } : undefined}>
      {COLUNAS.map(c => (
        <div key={c.k} onDragOver={e => e.preventDefault()} onDrop={() => soltar(c.k)}
          className={`flex min-h-0 min-w-[15rem] flex-1 flex-col rounded-xl border bg-gray-50 p-2 ${BORDA_STATUS[c.k]} ${arrastando ? 'ring-1 ring-dashed ring-gray-300' : ''}`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TAREFA[c.k].cls}`}>{c.rot}</span>
            <span className="text-xs tabular-nums text-gray-400">{porColuna[c.k].length}</span>
          </div>
          <div className="min-h-[4rem] flex-1 space-y-2 overflow-y-auto pr-0.5">
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

// Cor do ponto de status na Agenda.
const PONTO_STATUS = {
  a_fazer: 'bg-slate-400', em_andamento: 'bg-blue-500', atrasada: 'bg-rose-500',
  aguardando_validacao: 'bg-violet-500', concluida: 'bg-emerald-500', cancelada: 'bg-gray-300',
};

function Agenda({ tarefas, rotinas, onAbrir }) {
  const [modo, setModo] = useState('semana');
  const [ref, setRef] = useState(() => new Date());
  const [quadroRef, altura] = useAlturaAteFim();

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
    <div ref={quadroRef} className="flex flex-col overflow-hidden rounded-xl border border-gray-200/70 bg-white shadow-sm"
      style={altura ? { height: altura } : undefined}>
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
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
      <div className="grid flex-shrink-0 grid-cols-7 border-b border-gray-100 text-center text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
        {DIAS_SEM.map(d => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      {/* Linhas dividem a altura disponível; cada dia rola por dentro. */}
      <div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
        {dias.map(d => {
          const lista = porDia.get(chaveDia(d)) || [];
          const prev = previstas(d);
          const foraMes = modo === 'mes' && d.getMonth() !== ref.getMonth();
          const ehHoje = d.getTime() === hoje.getTime();
          const limite = modo === 'semana' ? 50 : 8;
          return (
            <div key={d.toISOString()} className={`overflow-y-auto border-b border-r border-gray-100 p-1.5 ${modo === 'semana' ? 'min-h-[12rem]' : 'min-h-[5rem]'} ${foraMes ? 'bg-gray-50/60' : ''}`}>
              <p className={`mb-1 text-right text-[11px] ${ehHoje ? 'font-bold text-blue-600' : foraMes ? 'text-gray-300' : 'text-gray-500'}`}>{d.getDate()}</p>
              <div className="space-y-1">
                {lista.slice(0, limite).map(t => {
                  const st = statusEfetivo(t);
                  return (
                    <button key={t.id} onClick={() => onAbrir(t)} title={`${t.titulo} — ${STATUS_TAREFA[st].rotulo}`}
                      className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium ${STATUS_TAREFA[st].cls}`}>
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${PONTO_STATUS[st] || 'bg-gray-400'}`} aria-hidden="true" />
                      <span className="min-w-0 truncate">{t.titulo}</span>
                    </button>
                  );
                })}
                {lista.length > limite && <p className="px-1 text-[10px] text-gray-400">+{lista.length - limite} mais</p>}
                {prev.slice(0, modo === 'semana' ? 20 : 4).map(r => (
                  <p key={r.id} title={`Prevista — rotina ${r.nome}`}
                    className="truncate rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[10.5px] text-gray-400">
                    {r.nome}
                  </p>
                ))}
                {modo === 'mes' && prev.length > 4 && <p className="px-1 text-[10px] text-gray-300">+{prev.length - 4} previstas</p>}
              </div>
            </div>
          );
        })}
      </div>
      {rotinas.length > 0 && (
        <p className="flex-shrink-0 px-3 py-2 text-[11px] text-gray-400">Contorno tracejado = ocorrência prevista de rotina (a tarefa é gerada no próprio dia).</p>
      )}
    </div>
  );
}

// ─── Celular ────────────────────────────────────────────────────

// Cartão de tarefa grande (toque em qualquer lugar abre o detalhe).
// `acao` opcional: botão rápido no rodapé (ex.: Iniciar).
function CartaoTarefaCelular({ t, gestor, onAbrir, acao }) {
  const st = statusEfetivo(t);
  const ck = t.checklist || [];
  return (
    <li className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={() => onAbrir(t)} className="flex w-full items-start gap-3 p-4 text-left active:bg-gray-50 rounded-xl">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-gray-900">{t.titulo}</p>
          <ReferenciaBadge t={t} />
          <p className="mt-1 truncate text-[13px] text-gray-600">
            {gestor ? `${t.cliente?.razao_social || t.cliente?.nome || ''} · ${t.responsavel?.nome || 'Sem responsável'}` : (t.setor?.nome || 'Sem setor')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className={`inline-flex items-center gap-1 ${st === 'atrasada' ? 'font-semibold text-rose-700' : 'text-gray-700'}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {fmtDataHora(t.vence_em)}
            </span>
            {ck.length > 0 && <span className="text-gray-600 tabular-nums">Checklist {ck.filter(i => i.feito).length}/{ck.length}</span>}
          </div>
        </div>
        <Seta className="mt-1 h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      {acao}
    </li>
  );
}

// Kanban no celular: chips de status (com contador) + lista da coluna escolhida.
// Começa na coluna mais urgente que tiver tarefa. "Iniciar" substitui o
// arrastar de A fazer → Em andamento; as demais mudanças seguem pelo detalhe.
function QuadroCelular({ tarefas, gestor, onAbrir, onAlterado, onErro, vazio }) {
  const porColuna = useMemo(() => {
    const m = Object.fromEntries(COLUNAS.map(c => [c.k, []]));
    tarefas.forEach(t => { const st = statusEfetivo(t); if (m[st]) m[st].push(t); });
    Object.values(m).forEach(l => l.sort((a, b) => new Date(a.vence_em) - new Date(b.vence_em)));
    m.concluida = m.concluida.slice(-50).reverse();
    return m;
  }, [tarefas]);
  const [coluna, setColuna] = useState(() => {
    const ordem = ['atrasada', 'a_fazer', 'em_andamento', 'aguardando_validacao', 'concluida'];
    return ordem.find(k => porColuna[k].length > 0) || 'a_fazer';
  });
  const [iniciando, setIniciando] = useState(null);

  const iniciar = async (t) => {
    setIniciando(t.id);
    try { await tarefasService.alterarStatus(t.id, 'em_andamento'); onAlterado?.(); }
    catch (e) { onErro?.(e.message); }
    finally { setIniciando(null); }
  };

  const lista = porColuna[coluna] || [];
  return (
    <div>
      <div role="tablist" aria-label="Situação" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {COLUNAS.map(c => {
          const on = c.k === coluna;
          const n = porColuna[c.k].length;
          return (
            <button key={c.k} role="tab" aria-selected={on} onClick={() => setColuna(c.k)}
              className={`snap-start flex h-10 flex-shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${
                on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
              {c.rot}
              <span className={`inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                on ? 'bg-white/20 text-white' : c.k === 'atrasada' && n ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'}`}>{n}</span>
            </button>
          );
        })}
      </div>
      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-800">Nenhuma tarefa em “{COLUNAS.find(c => c.k === coluna)?.rot}”.</p>
          {tarefas.length === 0 && vazio && <p className="mt-1 text-[13px] text-gray-600">{vazio}</p>}
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map(t => (
            <CartaoTarefaCelular key={t.id} t={t} gestor={gestor} onAbrir={onAbrir}
              acao={t.status === 'a_fazer' && (
                <div className="border-t border-gray-100 px-4 py-2">
                  <button type="button" onClick={() => iniciar(t)} disabled={iniciando === t.id}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 -ml-2 text-sm font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-60">
                    {iniciando === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    Iniciar tarefa
                  </button>
                </div>
              )} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Agenda no celular: navegação por semana, faixa com os 7 dias (pontinhos =
// tem tarefa) e a lista do dia escolhido logo abaixo.
function AgendaCelular({ tarefas, rotinas, gestor, onAbrir }) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [dia, setDia] = useState(() => new Date(hoje));
  const ini = inicioSemana(dia);
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });

  const porDia = useMemo(() => {
    const m = new Map();
    tarefas.forEach(t => { const k = chaveDia(new Date(t.vence_em)); if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    m.forEach(l => l.sort((a, b) => new Date(a.vence_em) - new Date(b.vence_em)));
    return m;
  }, [tarefas]);

  const andar = (n) => setDia(d => { const x = new Date(d); x.setDate(x.getDate() + 7 * n); return x; });
  const lista = porDia.get(chaveDia(dia)) || [];
  const previstas = dia > hoje
    ? rotinas.filter(r => rotinaNoDia(r, dia) && !lista.some(t => t.rotina_id === r.id))
    : [];
  const mesAno = dia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const ehHoje = dia.getTime() === hoje.getTime();

  return (
    <div>
      <div className="rounded-xl border border-gray-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between px-1 py-1">
          <button onClick={() => andar(-1)} aria-label="Semana anterior" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 active:bg-gray-100"><ChevronLeft className="h-5 w-5" /></button>
          <div className="text-center">
            <p className="text-sm font-semibold capitalize text-gray-900" aria-live="polite">{mesAno}</p>
            {!ehHoje && <button onClick={() => setDia(new Date(hoje))} className="text-xs font-semibold text-blue-700">Voltar para hoje</button>}
          </div>
          <button onClick={() => andar(1)} aria-label="Próxima semana" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 active:bg-gray-100"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 px-2 pb-2">
          {dias.map((d, i) => {
            const sel = d.getTime() === dia.getTime();
            const eHoje = d.getTime() === hoje.getTime();
            const doDia = porDia.get(chaveDia(d)) || [];
            const temAtrasada = doDia.some(t => statusEfetivo(t) === 'atrasada');
            return (
              <button key={i} onClick={() => setDia(d)} aria-pressed={sel}
                aria-label={`${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${doDia.length} tarefa(s)`}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl ${sel ? 'bg-blue-700 text-white' : eHoje ? 'bg-blue-50 text-blue-800' : 'text-gray-800 active:bg-gray-100'}`}>
                <span className={`text-[11px] font-medium ${sel ? 'text-white/85' : 'text-gray-500'}`}>{DIAS_SEM[i]}</span>
                <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                  {doDia.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white' : temAtrasada ? 'bg-rose-500' : 'bg-blue-600'}`} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 mb-2 px-1 text-[13px] font-semibold text-gray-700 first-letter:uppercase">
        {ehHoje ? 'Hoje' : dia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        <span className="font-normal text-gray-500"> · {lista.length} tarefa{lista.length === 1 ? '' : 's'}</span>
      </p>
      {lista.length === 0 && previstas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-600">Nenhuma tarefa neste dia.</div>
      ) : (
        <ul className="space-y-2">
          {lista.map(t => {
            const st = statusEfetivo(t);
            return (
              <CartaoTarefaCelular key={t.id} t={t} gestor={gestor} onAbrir={onAbrir}
                acao={(
                  <div className="border-t border-gray-100 px-4 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TAREFA[st].cls}`}>{STATUS_TAREFA[st].rotulo}</span>
                  </div>
                )} />
            );
          })}
          {previstas.map(r => (
            <li key={r.id} className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-700">
              {r.nome} <span className="text-xs text-gray-500">· prevista (rotina)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
