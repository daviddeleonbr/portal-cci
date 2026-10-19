// Peças de formulário das Tarefas — portadas do Visor360 (mesmo comportamento):
// multi-seleção de empresas, select com busca, documentos exigidos e o selo
// "ref. sex 02/10" (período a que a tarefa se refere).

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CalendarClock, Check, ChevronDown, FileText, Plus, Search, X } from 'lucide-react';
import { rotuloReferencia } from '../../utils/tarefas';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Fecha o painel ao clicar fora (e no Esc).
function useFechaFora(aberto, setAberto) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (ev) => { if (ref.current && !ref.current.contains(ev.target)) setAberto(false); };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); setAberto(false); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true); };
  }, [aberto, setAberto]);
  return ref;
}

// Várias empresas num dropdown: busca, marcar/desmarcar todas (as filtradas,
// quando há busca) e resumo no botão. O painel abre NO FLUXO (empurra o
// conteúdo) para não ser cortado por modais com rolagem.
// `empresas`: [{ id, nome }] · `value`: [id]
export function EmpresasMultiSelect({ empresas, value, onChange, placeholder = 'Selecione as empresas' }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useFechaFora(aberto, setAberto);

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    return q ? empresas.filter(e => norm(e.nome).includes(q)) : empresas;
  }, [empresas, busca]);

  const sel = new Set(value);
  const alterna = (id) => onChange(sel.has(id) ? value.filter(x => x !== id) : [...value, id]);
  const marcarTodas = () => onChange([...new Set([...value, ...filtradas.map(e => e.id)])]);
  const desmarcarTodas = () => { const f = new Set(filtradas.map(e => e.id)); onChange(value.filter(id => !f.has(id))); };

  const resumo = value.length === 0 ? placeholder
    : value.length === empresas.length ? `Todas as empresas (${empresas.length})`
    : value.length === 1 ? (empresas.find(e => e.id === value[0])?.nome || '1 empresa')
    : `${value.length} empresas selecionadas`;

  return (
    <div ref={ref}>
      <button type="button" onClick={() => { setBusca(''); setAberto(!aberto); }}
        className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left text-sm outline-none transition-colors ${aberto ? 'border-teal-500 ring-2 ring-teal-100' : 'border-gray-200 hover:border-gray-300'}`}>
        <Building2 className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <span className={`min-w-0 flex-1 truncate ${value.length ? 'text-gray-900' : 'text-gray-400'}`}>{resumo}</span>
        {value.length > 0 && value.length < empresas.length && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">{value.length}/{empresas.length}</span>}
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa…" autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
            {busca && <button type="button" onClick={() => setBusca('')} className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[12px]">
            <div className="flex gap-3">
              <button type="button" onClick={marcarTodas} className="font-medium text-teal-700 hover:underline">Marcar todas{busca && ' (filtradas)'}</button>
              <button type="button" onClick={desmarcarTodas} className="font-medium text-gray-500 hover:underline">Desmarcar todas{busca && ' (filtradas)'}</button>
            </div>
            <span className="text-gray-400">{value.length} de {empresas.length}</span>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtradas.map(e => {
              const on = sel.has(e.id);
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => alterna(e.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-gray-50 ${on ? 'text-gray-900' : 'text-gray-600'}`}>
                    <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${on ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 bg-white'}`}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{e.nome}</span>
                  </button>
                </li>
              );
            })}
            {filtradas.length === 0 && <li className="px-3 py-3 text-center text-[12px] text-gray-400">Nenhuma empresa encontrada.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// Posição do painel flutuante (fixed, relativo à janela): abre para baixo ou,
// sem espaço, para cima. Vai num portal no <body> para não ser cortado pelo
// overflow de modais/tabelas.
function posicaoPainel(el) {
  const r = el.getBoundingClientRect();
  const alturaMax = 300;
  const abaixo = window.innerHeight - r.bottom;
  const paraCima = abaixo < alturaMax && r.top > abaixo;
  return {
    left: r.left, width: Math.max(r.width, 220),
    ...(paraCima ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
  };
}

// Escolha ÚNICA com busca (ex.: responsável). `vazio` é a opção sem valor (''),
// sempre no topo. O painel flutua sobre o conteúdo (portal, não é cortado).
export function SelectBusca({ opcoes, value, onChange, vazio, placeholderBusca = 'Buscar…', vazioLista = 'Ninguém encontrado.' }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const painelRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (ev) => {
      if (ref.current?.contains(ev.target) || painelRef.current?.contains(ev.target)) return;
      setAberto(false);
    };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); setAberto(false); } };
    const reposiciona = (ev) => {
      if (painelRef.current?.contains(ev?.target)) return; // rolagem da própria lista
      if (ref.current) setPos(posicaoPainel(ref.current));
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', reposiciona);
    window.addEventListener('scroll', reposiciona, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', reposiciona);
      window.removeEventListener('scroll', reposiciona, true);
    };
  }, [aberto]);

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    return q ? opcoes.filter(o => norm(o.label).includes(q)) : opcoes;
  }, [opcoes, busca]);
  const atual = opcoes.find(o => o.value === value);
  const escolhe = (v) => { onChange(v); setAberto(false); };

  const item = (v, label, apagado = false) => (
    <li key={v || '_vazio'}>
      <button type="button" onClick={() => escolhe(v)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 ${v === value ? 'font-medium text-teal-700' : apagado ? 'text-gray-400' : 'text-gray-700'}`}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {v === value && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
      </button>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setBusca(''); if (!aberto) setPos(posicaoPainel(ref.current)); setAberto(!aberto); }}
        className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left text-sm outline-none transition-colors ${aberto ? 'border-teal-500 ring-2 ring-teal-100' : 'border-gray-200 hover:border-gray-300'}`}>
        <span className={`min-w-0 flex-1 truncate ${atual ? 'text-gray-900' : 'text-gray-500'}`}>{atual?.label ?? vazio ?? 'Selecione'}</span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && pos && createPortal(
        <div ref={painelRef} style={{ position: 'fixed', ...pos }}
          className="z-[70] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={placeholderBusca} autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
            {busca && <button type="button" onClick={() => setBusca('')} className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {vazio !== undefined && !busca && item('', vazio, true)}
            {filtradas.map(o => item(o.value, o.label))}
            {filtradas.length === 0 && <li className="px-3 py-3 text-center text-[12px] text-gray-400">{vazioLista}</li>}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Documentos exigidos para concluir (ex.: "PDF do fechamento de caixa").
// Vazia = basta qualquer foto ou documento.
export function DocumentosEditor({ valor, onChange }) {
  const [novo, setNovo] = useState('');
  const add = () => {
    const n = novo.trim(); if (!n) return;
    if (!valor.some(d => d.toLowerCase() === n.toLowerCase())) onChange([...valor, n.slice(0, 80)]);
    setNovo('');
  };
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="text-[12px] font-medium text-gray-600">Documentos exigidos <span className="font-normal text-gray-400">(opcional)</span></div>
      <p className="mb-2 text-[11px] text-gray-400">Dê nome a cada anexo obrigatório — a tarefa só é enviada com todos anexados. Sem nomes, basta uma foto ou documento.</p>
      {valor.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {valor.map((d, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-700">
              <FileText className="h-3.5 w-3.5 text-teal-600" />{d}
              <button type="button" onClick={() => onChange(valor.filter((_, j) => j !== i))} aria-label={`Remover ${d}`} className="rounded p-0.5 text-gray-300 hover:text-red-500"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Ex.: PDF do fechamento de caixa — Enter para adicionar" maxLength={80}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-teal-500" />
        <button type="button" disabled={!novo.trim()} onClick={add} aria-label="Adicionar documento" className="rounded-lg border border-gray-200 bg-white px-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// Selo "ref. sex 02/10": período a que a tarefa se refere (rotinas com referência).
export function ReferenciaBadge({ t, grande = false }) {
  const r = rotuloReferencia(t);
  if (!r) return null;
  return (
    <span title={`Referente a ${r}`}
      className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-sky-50 font-medium text-sky-700 ${grande ? 'px-2 py-0.5 text-[12px]' : 'px-1.5 py-0.5 text-[10.5px]'}`}>
      <CalendarClock className={grande ? 'h-3.5 w-3.5' : 'h-3 w-3'} /> ref. {r}
    </span>
  );
}
