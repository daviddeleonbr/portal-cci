// Horário de trabalho de um usuário: os avisos de tarefa (nova tarefa e "vence em
// breve") só chegam dentro dele (migration 230). Sem horário = a qualquer hora.
// Formato salvo: { "<0-6>": [["HH:MM","HH:MM"], …] } — 0 = domingo.
import { useEffect, useState } from 'react';
import { Clock, Copy, Loader2, Plus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import * as usuariosService from '../../services/usuariosSistemaService';

const DIAS = [['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado'], ['0', 'Domingo']];
const PADRAO = [['08:00', '12:00'], ['13:00', '18:00']];
const inp = 'h-9 w-[6.5rem] rounded-lg border border-gray-200 bg-white px-2 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

export default function ModalExpediente({ usuario, onClose, onSalvo }) {
  const [restrito, setRestrito] = useState(false);
  const [dias, setDias] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!usuario) return;
    const exp = usuario.expediente || null;
    const tem = !!exp && Object.values(exp).some(p => p?.length);
    setRestrito(tem);
    // Sem horário: já sugere seg–sex 08–12/13–18 para facilitar
    setDias(tem ? Object.fromEntries(DIAS.map(([d]) => [d, exp[d] || []]))
      : Object.fromEntries(DIAS.map(([d]) => [d, ['1', '2', '3', '4', '5'].includes(d) ? PADRAO.map(p => [...p]) : []])));
    setErro('');
  }, [usuario]);

  if (!usuario) return null;

  const mudar = (d, fn) => setDias(s => ({ ...s, [d]: fn(s[d] || []) }));
  const copiarSegunda = () => setDias(s => ({ ...s, ...Object.fromEntries(['2', '3', '4', '5'].map(d => [d, (s['1'] || []).map(p => [...p])])) }));

  const validar = () => {
    for (const [d, nome] of DIAS) {
      const ps = [...(dias[d] || [])].sort((a, b) => a[0].localeCompare(b[0]));
      for (let i = 0; i < ps.length; i += 1) {
        const [a, b] = ps[i];
        if (!a || !b || b <= a) return `${nome}: o fim precisa ser depois do início.`;
        if (i > 0 && a < ps[i - 1][1]) return `${nome}: os períodos se sobrepõem.`;
      }
    }
    if (!DIAS.some(([d]) => (dias[d] || []).length)) return 'Marque ao menos um dia de trabalho ou escolha "A qualquer hora".';
    return '';
  };

  const salvar = async () => {
    const msg = restrito ? validar() : '';
    if (msg) { setErro(msg); return; }
    setSalvando(true); setErro('');
    try {
      const exp = restrito
        ? Object.fromEntries(DIAS.map(([d]) => [d, [...(dias[d] || [])].sort((a, b) => a[0].localeCompare(b[0]))]).filter(([, p]) => p.length))
        : null;
      await usuariosService.definirExpediente(usuario.id, exp);
      onSalvo?.(exp);
      onClose();
    } catch (e) { setErro(e?.message || 'Falha ao salvar o horário.'); }
    finally { setSalvando(false); }
  };

  const opcao = (ativo) => `flex flex-1 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${ativo ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`;

  return (
    <Modal open onClose={() => !salvando && onClose()} title={`Horário de trabalho · ${usuario.nome}`} size="md"
      footer={(
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={salvando} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      )}>
      <div className="space-y-4">
        <p className="text-[13px] text-gray-600">
          Os avisos de tarefa (nova tarefa e 1 hora antes do vencimento) só chegam dentro deste horário. Fora dele, ficam guardados para o início do próximo expediente; o de vencimento vem no fim do expediente anterior.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className={opcao(!restrito)}>
            <input type="radio" name="exp-modo" checked={!restrito} onChange={() => setRestrito(false)} className="mt-0.5" />
            <span><strong className="block text-gray-900">A qualquer hora</strong><span className="text-xs text-gray-500">Sem restrição de horário</span></span>
          </label>
          <label className={opcao(restrito)}>
            <input type="radio" name="exp-modo" checked={restrito} onChange={() => setRestrito(true)} className="mt-0.5" />
            <span><strong className="block text-gray-900">Só no horário de trabalho</strong><span className="text-xs text-gray-500">Defina os dias e períodos abaixo</span></span>
          </label>
        </div>

        {restrito && (
          <div className="rounded-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> Horário de Brasília</span>
              <button type="button" onClick={copiarSegunda} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Copy className="h-3 w-3" aria-hidden="true" /> Copiar segunda para terça a sexta
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {DIAS.map(([d, nome]) => {
                const ps = dias[d] || [];
                const trabalha = ps.length > 0;
                return (
                  <li key={d} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
                    <label className="flex w-28 shrink-0 items-center gap-2 pt-2 text-sm font-medium text-gray-900">
                      <input type="checkbox" checked={trabalha} onChange={e => mudar(d, () => (e.target.checked ? PADRAO.map(p => [...p]) : []))} />
                      {nome}
                    </label>
                    {!trabalha ? <span className="pt-2 text-sm text-gray-400">Folga</span> : (
                      <div className="flex flex-1 flex-col gap-1.5">
                        {ps.map((p, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <input type="time" value={p[0]} aria-label={`${nome}: início do período ${i + 1}`} className={inp}
                              onChange={e => mudar(d, l => l.map((x, k) => (k === i ? [e.target.value, x[1]] : x)))} />
                            <span className="text-xs text-gray-500">às</span>
                            <input type="time" value={p[1]} aria-label={`${nome}: fim do período ${i + 1}`} className={inp}
                              onChange={e => mudar(d, l => l.map((x, k) => (k === i ? [x[0], e.target.value] : x)))} />
                            {ps.length > 1 && (
                              <button type="button" onClick={() => mudar(d, l => l.filter((_, k) => k !== i))} title="Remover período"
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            )}
                          </div>
                        ))}
                        {ps.length < 3 && (
                          <button type="button" onClick={() => mudar(d, l => [...l, [l[l.length - 1]?.[1] || '13:00', '18:00']])}
                            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                            <Plus className="h-3 w-3" aria-hidden="true" /> Período
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}
