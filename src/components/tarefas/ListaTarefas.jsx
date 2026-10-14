// Lista de tarefas com abas rápidas (contadores), busca e ordenação por
// urgência — usada pela CCI (gestor) e pelo funcionário (só as dele).

import { useMemo, useState } from 'react';
import { Search, CheckSquare, Paperclip, Repeat, Clock } from 'lucide-react';
import {
  STATUS_TAREFA, PRIORIDADES, statusEfetivo, estaAtrasada, venceHoje, fmtDataHora,
} from '../../utils/tarefas';
import { ReferenciaBadge } from './CamposTarefas';

const ABAS = [
  { k: 'abertas',    rot: 'Em aberto',            f: t => ['a_fazer', 'em_andamento'].includes(t.status) },
  { k: 'atrasadas',  rot: 'Atrasadas',            f: t => estaAtrasada(t) },
  { k: 'hoje',       rot: 'Vencem hoje',          f: t => venceHoje(t) },
  { k: 'validacao',  rot: 'Aguardando validação', f: t => t.status === 'aguardando_validacao' },
  { k: 'concluidas', rot: 'Concluídas',           f: t => t.status === 'concluida' },
  { k: 'todas',      rot: 'Todas',                f: () => true },
];

// Urgência: atrasadas → vencem hoje → prioridade → vencimento.
function ordemUrgencia(a, b) {
  const p = (t) => (estaAtrasada(t) ? 0 : venceHoje(t) ? 1 : 2);
  return p(a) - p(b)
    || (PRIORIDADES[b.prioridade]?.peso || 0) - (PRIORIDADES[a.prioridade]?.peso || 0)
    || new Date(a.vence_em) - new Date(b.vence_em);
}

export default function ListaTarefas({ tarefas, gestor = false, onAbrir, abaInicial = 'abertas', vazio }) {
  const [aba, setAba] = useState(abaInicial);
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => Object.fromEntries(ABAS.map(a => [a.k, tarefas.filter(a.f).length])), [tarefas]);
  const lista = useMemo(() => {
    const filtro = ABAS.find(a => a.k === aba)?.f || (() => true);
    const termo = busca.trim().toLowerCase();
    return tarefas
      .filter(filtro)
      .filter(t => !termo || `${t.titulo} ${t.cliente?.razao_social || t.cliente?.nome || ''} ${t.responsavel?.nome || ''} ${t.setor?.nome || ''}`
        .toLowerCase().includes(termo))
      .sort(aba === 'concluidas' ? (a, b) => new Date(b.concluida_em || 0) - new Date(a.concluida_em || 0) : ordemUrgencia);
  }, [tarefas, aba, busca]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {ABAS.map(a => (
            <button key={a.k} onClick={() => setAba(a.k)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                aba === a.k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {a.rot}
              <span className={`ml-1.5 tabular-nums ${aba === a.k ? 'text-white/70' : a.k === 'atrasadas' && contagem[a.k] ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>{contagem[a.k]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarefa…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm" />
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
          {vazio || 'Nenhuma tarefa nesta aba.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map(t => {
            const st = statusEfetivo(t);
            const ck = t.checklist || [];
            const anexos = (t.evidencias || []).filter(e => e.tipo !== 'comentario').length;
            return (
              <li key={t.id}>
                <button onClick={() => onAbrir(t)}
                  className="w-full rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-left shadow-sm hover:border-gray-300 hover:shadow transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className="truncate">{t.titulo}</span><ReferenciaBadge t={t} /></p>
                      <p className="mt-0.5 text-[11.5px] text-gray-500 truncate">
                        {gestor && <>{t.cliente?.razao_social || t.cliente?.nome}{' · '}</>}
                        {t.setor?.nome || 'Sem setor'}
                        {gestor && t.responsavel?.nome ? ` · ${t.responsavel.nome}` : ''}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TAREFA[st].cls}`}>{STATUS_TAREFA[st].rotulo}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span className={`inline-flex items-center gap-1 ${st === 'atrasada' ? 'font-medium text-rose-600' : ''}`}>
                      <Clock className="h-3.5 w-3.5" /> {fmtDataHora(t.vence_em)}
                    </span>
                    <span className={`font-medium ${PRIORIDADES[t.prioridade]?.cls}`}>{PRIORIDADES[t.prioridade]?.rotulo}</span>
                    {ck.length > 0 && (
                      <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> {ck.filter(i => i.feito).length}/{ck.length}</span>
                    )}
                    {(t.exige_evidencia || anexos > 0) && (
                      <span className={`inline-flex items-center gap-1 ${t.exige_evidencia && anexos === 0 ? 'text-amber-600' : ''}`}>
                        <Paperclip className="h-3.5 w-3.5" /> {anexos}{t.documentos?.length ? `/${t.documentos.length}` : ''}{t.exige_evidencia ? ' evid.' : ''}
                      </span>
                    )}
                    {t.rotina_id && <span className="inline-flex items-center gap-1 text-gray-400"><Repeat className="h-3.5 w-3.5" /> rotina</span>}
                    {(t.pedidos || []).some(p => p.status === 'pendente' && p.tipo === 'prorrogacao') && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">prazo pedido</span>
                    )}
                    {(t.pedidos || []).some(p => p.status === 'pendente' && p.tipo === 'reabertura') && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">reabertura pedida</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
