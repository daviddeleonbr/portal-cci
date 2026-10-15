// Formulários da CCI (gestor): rotina recorrente, tarefa avulsa e setores.

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, GripVertical, Loader2, Plus, Repeat, Trash2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import * as tarefas from '../../services/tarefasService';
import {
  DIAS_SEMANA, PRIORIDADES, REFERENCIAS, MODOS_PERSONALIZADA, ehPersonalizada, descreverRecorrencia, hojeYmd, somarDiasYmd,
} from '../../utils/tarefas';
import { EmpresasMultiSelect, SelectBusca, DocumentosEditor } from './CamposTarefas';
import { useRedesClientes, redeDe } from '../../hooks/useRedesClientes';

const input = 'w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
const rotuloCls = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1';
const nomeCliente = (c) => c?.razao_social || c?.nome || '';

function Campo({ rot, children, className = '' }) {
  return <div className={className}><label className={rotuloCls}>{rot}</label>{children}</div>;
}

// Lista editável de textos (checklist / documentos exigidos).
function ListaTextos({ valores, onChange, placeholder }) {
  const [novo, setNovo] = useState('');
  const add = () => { const v = novo.trim(); if (v) { onChange([...valores, v]); setNovo(''); } };
  return (
    <div>
      <ul className="space-y-1">
        {valores.map((v, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-sm text-gray-800">
            <span className="flex-1">{v}</span>
            <button type="button" onClick={() => onChange(valores.filter((_, k) => k !== i))} className="text-gray-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex gap-2">
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder={placeholder} className={input}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="rounded-lg border border-gray-200 px-3 text-gray-600 hover:bg-gray-50"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ─── Rotina recorrente (igual ao Visor360) ──────────────────────
const inp = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const lbl = 'mb-1 block text-xs font-medium text-gray-500';
const chip = (on) => `rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${on ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`;
const alterna = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

// Funcionários (com Tarefas) que podem ser responsáveis em cada empresa:
// { clienteId: [usuários] }. Resultado guardado junto da chave consultada.
function useResponsaveisPor(clientes, ids) {
  const chave = [...ids].sort().join(',');
  const [res, setRes] = useState({ chave: null, mapa: {} });
  useEffect(() => {
    if (!chave) return undefined;
    const alvo = clientes.filter(c => chave.split(',').includes(c.id));
    let cancel = false;
    tarefas.listarResponsaveisPorClientes(alvo)
      .catch(() => ({}))
      .then(mapa => { if (!cancel) setRes({ chave, mapa }); });
    return () => { cancel = true; };
  }, [clientes, chave]);
  const atual = res.chave === chave;
  return { mapa: atual ? res.mapa : {}, carregando: !!chave && !atual };
}

export function RotinaModal({ open, ...props }) {
  return open ? <RotinaForm {...props} /> : null;
}

function RotinaForm({ rotina, clientes, setores, onClose, onSalvo, showToast }) {
  const editando = !!rotina?.id;
  const [nome, setNome] = useState(rotina?.nome ?? '');
  const [descricao, setDescricao] = useState(rotina?.descricao ?? '');
  const [emps, setEmps] = useState(rotina?.cliente_id ? [rotina.cliente_id] : []);
  const [setor, setSetor] = useState(rotina?.setor_id ?? '');
  const [resp, setResp] = useState(rotina?.responsavel_id ?? '');
  // Várias empresas: opção de um responsável diferente para cada uma.
  const [porEmpresa, setPorEmpresa] = useState(false);
  const [respPor, setRespPor] = useState({});
  const [freq, setFreq] = useState(ehPersonalizada(rotina?.frequencia) ? 'personalizada' : (rotina?.frequencia ?? 'diaria'));
  const [modo, setModo] = useState(ehPersonalizada(rotina?.frequencia) ? rotina.frequencia : 'dias_semana');
  const [diasSem, setDiasSem] = useState(rotina?.dias_semana?.length ? rotina.dias_semana : [1]);
  const [diasMes, setDiasMes] = useState(rotina?.dias_mes?.length ? rotina.dias_mes : [1]);
  const [diasAno, setDiasAno] = useState(rotina?.dias_ano ?? []);
  const [novoAno, setNovoAno] = useState('');
  const [horario, setHorario] = useState(String(rotina?.horario || '18:00').slice(0, 5));
  // Início da implementação: as tarefas só são geradas a partir desta data.
  const [inicio, setInicio] = useState(editando ? rotina.data_inicio : hojeYmd());
  const [prio, setPrio] = useState(rotina?.prioridade ?? 'media');
  const [exige, setExige] = useState(rotina?.exige_evidencia ?? false);
  const [referencia, setReferencia] = useState(rotina?.referencia ?? 'mesmo_dia');
  const [documentos, setDocumentos] = useState(rotina?.documentos ?? []);
  const [checklist, setChecklist] = useState(rotina?.checklist ?? []);
  const [novoItem, setNovoItem] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const empresas = useMemo(() => clientes.map(c => ({ id: c.id, nome: nomeCliente(c) }))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [clientes]);
  const { mapa, carregando } = useResponsaveisPor(clientes, emps);
  const multi = !editando && emps.length > 1;
  // Responsável único: só quem tem acesso a TODAS as empresas escolhidas.
  const comuns = useMemo(() => {
    if (!emps.length) return [];
    const [primeira, ...resto] = emps;
    return (mapa[primeira] || []).filter(u => resto.every(id => (mapa[id] || []).some(x => x.id === u.id)));
  }, [mapa, emps]);
  const opcoes = (lista) => lista.map(u => ({ value: u.id, label: u.nome }));
  const respDe = (id) => (id in respPor ? respPor[id] : resp);
  const valido = (id, uid) => (uid && (mapa[id] || []).some(u => u.id === uid) ? uid : null);
  const frequencia = freq === 'personalizada' ? modo : freq;
  const ajudaRef = REFERENCIAS.find(r => r.k === referencia)?.ajuda;

  const adicionaItem = () => { if (novoItem.trim()) { setChecklist([...checklist, novoItem.trim()]); setNovoItem(''); } };

  async function enviar(e) {
    e.preventDefault(); setErro(null);
    if (nome.trim().length < 3) return setErro('O nome precisa ter ao menos 3 caracteres.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || '')) return setErro('Informe a data de início da implementação.');
    if (!editando && emps.length === 0) return setErro('Escolha ao menos uma empresa.');
    if (freq === 'personalizada' && ((modo === 'dias_semana' && !diasSem.length) || (modo === 'dias_mes' && !diasMes.length) || (modo === 'dias_ano' && !diasAno.length)))
      return setErro('Escolha ao menos um dia para a recorrência personalizada.');
    const base = {
      nome: nome.trim(), descricao: descricao.trim(), setor_id: setor || null, frequencia,
      dias_semana: diasSem, dias_mes: diasMes, dias_ano: diasAno, horario, prioridade: prio,
      exige_evidencia: exige, referencia, documentos: exige ? documentos : [],
      checklist: checklist.map(c => c.trim()).filter(Boolean), ativa: rotina?.ativa ?? true, data_inicio: inicio,
    };
    setSalvando(true);
    try {
      if (editando) {
        await tarefas.salvarRotina({ id: rotina.id, cliente_id: rotina.cliente_id, ...base, responsavel_id: valido(rotina.cliente_id, resp) });
      } else {
        for (const id of emps) {
          await tarefas.salvarRotina({ ...base, cliente_id: id, responsavel_id: valido(id, multi && porEmpresa ? respDe(id) : resp) });
        }
      }
      showToast('success', editando ? 'Rotina atualizada' : emps.length > 1 ? `${emps.length} rotinas criadas` : 'Rotina criada');
      onSalvo();
    } catch (ex) { setErro(ex.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} size="xl"
      title={<span className="flex items-center gap-2"><Repeat className="h-4 w-4 text-teal-500" /> {editando ? 'Editar rotina' : 'Nova rotina'}</span>}
      footer={(
        <div className="flex items-center justify-end gap-2">
          {erro && <span className="mr-auto text-[12px] text-red-600">{erro}</span>}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button type="submit" form="form-rotina" disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {editando ? 'Salvar' : emps.length > 1 ? `Criar em ${emps.length} empresas` : 'Criar rotina'}
          </button>
        </div>
      )}>
      <form id="form-rotina" onSubmit={enviar} className="space-y-3">
        <div><label className={lbl}>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Medição dos tanques" className={inp} autoFocus /></div>
        <div><label className={lbl}>Descrição (opcional)</label><textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={inp} /></div>
        {!editando && (
          <div>
            <label className={lbl}>Empresas {empresas.length > 1 && <span className="text-gray-400">— uma rotina é criada por empresa</span>}</label>
            <EmpresasMultiSelect empresas={empresas} value={emps} onChange={setEmps} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={lbl}>Responsável{carregando && <span className="text-gray-400"> (carregando…)</span>}</label>
            {multi && porEmpresa
              ? <div className="flex h-[42px] items-center rounded-lg border border-dashed border-teal-300 bg-teal-50 px-3 text-[13px] font-medium text-teal-700">Definido por empresa ↓</div>
              : <SelectBusca value={comuns.some(u => u.id === resp) ? resp : ''} onChange={setResp}
                  vazio="Sem responsável (não gera)" placeholderBusca="Buscar pessoa…" opcoes={opcoes(comuns)}
                  vazioLista={emps.length ? (multi ? 'Ninguém com acesso a todas — use responsável por empresa.' : 'Nenhum funcionário com acesso a Tarefas.') : 'Escolha a empresa primeiro.'} />}
            {multi && (
              <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-600">
                <input type="checkbox" checked={porEmpresa} onChange={e => setPorEmpresa(e.target.checked)} className="h-3.5 w-3.5 accent-teal-600" />
                Responsável diferente por empresa
              </label>
            )}
          </div>
          <div><label className={lbl}>Setor</label>
            <select value={setor} onChange={e => setSetor(e.target.value)} className={inp}>
              <option value="">Sem setor</option>
              {setores.filter(s => s.ativo || s.id === setor).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select></div>
          <div><label className={lbl}>Prioridade</label>
            <select value={prio} onChange={e => setPrio(e.target.value)} className={inp}>
              {['critica', 'alta', 'media', 'baixa'].map(p => <option key={p} value={p}>{PRIORIDADES[p].rotulo}</option>)}
            </select></div>
        </div>

        {multi && porEmpresa && (
          <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className={`${lbl} mb-0`}>Responsável por empresa</label>
              <span className="flex items-center gap-2 text-[11.5px] text-gray-500">
                Aplicar a todas:
                <span className="w-56"><SelectBusca value="" vazio="Sem responsável" placeholderBusca="Buscar pessoa…" opcoes={opcoes(comuns)}
                  vazioLista="Ninguém com acesso a todas."
                  onChange={v => setRespPor(Object.fromEntries(emps.map(id => [id, v])))} /></span>
              </span>
            </div>
            <div className="space-y-1.5">
              {emps.map(id => {
                const nomeEmp = empresas.find(e => e.id === id)?.nome ?? 'Empresa';
                return (
                  <div key={id} className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_260px]">
                    <span className="truncate text-[13px] text-gray-700" title={nomeEmp}>{nomeEmp}</span>
                    <SelectBusca value={valido(id, respDe(id)) || ''} onChange={nv => setRespPor(m => ({ ...m, [id]: nv }))}
                      vazio="Sem responsável (não gera)" placeholderBusca="Buscar pessoa…" opcoes={opcoes(mapa[id] || [])}
                      vazioLista="Nenhum funcionário com acesso a Tarefas." />
                  </div>
                );
              })}
            </div>
            {emps.some(id => !valido(id, respDe(id))) && <p className="mt-2 text-[11.5px] text-amber-700">Empresas sem responsável terão a rotina criada, mas ela não gera tarefas até alguém ser definido.</p>}
          </div>
        )}

        <div className="rounded-lg border border-gray-100 p-3">
          <label className={lbl}>Recorrência</label>
          <div className="mb-2 flex flex-wrap items-center gap-1.5 md:flex-nowrap">
            {[['diaria', 'Todos os dias'], ['dias_uteis', 'Dias úteis'], ['personalizada', 'Personalizada']].map(([k, l]) => (
              <button type="button" key={k} onClick={() => setFreq(k)} className={`${chip(freq === k)} whitespace-nowrap`}>{l}</button>
            ))}
            <div className="ml-auto flex flex-shrink-0 flex-wrap items-center gap-2 whitespace-nowrap">
              <span className="text-[12px] text-gray-500" title="As tarefas desta rotina só começam a ser geradas a partir desta data.">início em</span>
              <input type="date" value={inicio || ''} onChange={e => setInicio(e.target.value)} required
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
              <span className="text-[12px] text-gray-500">vence às</span>
              <input type="time" value={horario} onChange={e => setHorario(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
            </div>
          </div>
          {freq === 'personalizada' && (
            <div className="space-y-2">
              <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-[12px]">
                {MODOS_PERSONALIZADA.map(m => (
                  <button type="button" key={m.k} onClick={() => setModo(m.k)}
                    className={`flex-1 rounded-md px-2 py-1.5 font-medium ${modo === m.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{m.rot}</button>
                ))}
              </div>
              {modo === 'dias_semana' && (
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map(d => <button type="button" key={d.v} onClick={() => setDiasSem(alterna(diasSem, d.v))} className={chip(diasSem.includes(d.v))}>{d.rot}</button>)}
                </div>
              )}
              {modo === 'dias_mes' && (
                <div>
                  <div className="grid grid-cols-7 gap-1 sm:grid-cols-11">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <button type="button" key={n} onClick={() => setDiasMes(alterna(diasMes, n))} className={chip(diasMes.includes(n))}>{n}</button>)}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Em meses mais curtos, os dias 29–31 caem no último dia do mês.</p>
                </div>
              )}
              {modo === 'dias_ano' && (
                <div>
                  <div className="flex gap-2">
                    <input type="date" value={novoAno} onChange={e => setNovoAno(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
                    <button type="button" disabled={!novoAno}
                      onClick={() => { const md = novoAno.slice(5); if (!diasAno.includes(md)) setDiasAno([...diasAno, md].sort()); setNovoAno(''); }}
                      className="rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">Adicionar</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {diasAno.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-[12px] text-teal-700">
                        {d.slice(3)}/{d.slice(0, 2)}
                        <button type="button" onClick={() => setDiasAno(diasAno.filter(x => x !== d))}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-teal-700">{descreverRecorrencia({ frequencia, dias_semana: diasSem, dias_mes: diasMes, dias_ano: diasAno })}, com vencimento às {horario}.</p>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <label className={lbl}>Referente a</label>
            <div className="flex flex-wrap gap-1.5">
              {REFERENCIAS.map(r => <button type="button" key={r.k} onClick={() => setReferencia(r.k)} className={chip(referencia === r.k)}>{r.rot}</button>)}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">{ajudaRef}{referencia !== 'mesmo_dia' && ' A data de referência aparece em cada tarefa gerada.'}</p>
          </div>
        </div>

        <div>
          <label className={lbl}>Checklist-modelo (copiado para cada tarefa gerada)</label>
          <ul className="space-y-1">
            {checklist.map((c, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
                <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                <input value={c} onChange={e => setChecklist(checklist.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1 bg-transparent text-[13px] text-gray-900 outline-none" />
                <button type="button" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="rounded p-1 text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-1.5">
            <input value={novoItem} onChange={e => setNovoItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionaItem(); } }}
              placeholder="Adicionar etapa e pressionar Enter…" className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-900 outline-none focus:border-teal-500" />
            <button type="button" disabled={!novoItem.trim()} onClick={adicionaItem} className="rounded-lg border border-gray-200 bg-white px-2.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-gray-600"><input type="checkbox" checked={exige} onChange={e => setExige(e.target.checked)} /> Exigir foto ou documento para concluir</label>
        {exige && <DocumentosEditor valor={documentos} onChange={setDocumentos} />}
        {editando && <p className="text-[11px] text-gray-400">Alterações valem para as próximas tarefas geradas. Nas tarefas em aberto, só a referência e os documentos exigidos são atualizados.</p>}
      </form>
    </Modal>
  );
}

// Duplicar: escolhe as empresas; as cópias nascem SEM responsável e empresas
// que já têm uma rotina com o mesmo nome são ignoradas.
export function DuplicarRotinaModal({ rotina, clientes, rotinas, onClose, onSalvo }) {
  const empresas = useMemo(() => clientes.filter(c => c.id !== rotina.cliente_id)
    .map(c => ({ id: c.id, nome: nomeCliente(c) })).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes, rotina]);
  const [emps, setEmps] = useState([]);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const duplicar = async () => {
    setErro(null); setSalvando(true);
    try { setOk(await tarefas.duplicarRotina(rotina, emps, rotinas)); onSalvo(); }
    catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={`Duplicar "${rotina.nome}"`}
      footer={(
        <div className="flex items-center justify-end gap-2">
          {erro && <span className="mr-auto text-[12px] text-red-600">{erro}</span>}
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">{ok !== null ? 'Fechar' : 'Cancelar'}</button>
          {ok === null && (
            <button disabled={!emps.length || salvando} onClick={duplicar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicar
            </button>
          )}
        </div>
      )}>
      {ok !== null ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">{ok} rotina(s) criada(s). Defina o responsável de cada uma para começarem a gerar tarefas.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-gray-500">Escolha as empresas. As cópias são criadas <b>sem responsável</b> (empresas que já têm uma rotina com o mesmo nome são ignoradas).</p>
          {empresas.length > 0
            ? <EmpresasMultiSelect empresas={empresas} value={emps} onChange={setEmps} />
            : <p className="text-[12px] text-gray-400">Não há outras empresas disponíveis.</p>}
        </div>
      )}
    </Modal>
  );
}

// ─── Tarefa avulsa ──────────────────────────────────────────────
export function NovaTarefaModal({ open, ...props }) {
  return open ? <NovaTarefaForm {...props} /> : null;
}

// Rede → uma ou mais empresas → responsável de cada empresa (uma tarefa por empresa).
function NovaTarefaForm({ clientes, setores, onClose, onSalvo, showToast }) {
  const redes = useRedesClientes(clientes);
  const [rede, setRede] = useState('');
  const [emps, setEmps] = useState([]);
  const [respPor, setRespPor] = useState({});
  const [form, setForm] = useState({
    setor_id: '', titulo: '', descricao: '', prioridade: 'media',
    data: somarDiasYmd(hojeYmd(), 1), hora: '18:00', exige_evidencia: false, documentos: [], checklist: [],
  });
  const [salvando, setSalvando] = useState(false);
  const set = (p) => setForm(f => ({ ...f, ...p }));

  const empresasRede = useMemo(() => clientes.filter(c => redeDe(c) === rede)
    .map(c => ({ id: c.id, nome: nomeCliente(c) })).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes, rede]);
  const { mapa, carregando } = useResponsaveisPor(clientes, emps);
  const valido = (id) => ((mapa[id] || []).some(u => u.id === respPor[id]) ? respPor[id] : '');
  // "Aplicar a todas": só quem tem acesso a todas as empresas escolhidas.
  const comuns = emps.length > 1
    ? (mapa[emps[0]] || []).filter(u => emps.every(id => (mapa[id] || []).some(x => x.id === u.id))) : [];

  const faltando = [
    !rede && 'rede', !emps.length && 'empresa', emps.some(id => !valido(id)) && 'responsável',
    form.titulo.trim().length < 2 && 'título',
  ].filter(Boolean);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { data, hora, ...resto } = form;
      const vence_em = new Date(`${data}T${hora}:00`).toISOString();
      for (const id of emps) {
        await tarefas.criarTarefa({ ...resto, titulo: resto.titulo.trim(), cliente_id: id, responsavel_id: valido(id), vence_em });
      }
      showToast('success', emps.length > 1 ? `${emps.length} tarefas criadas` : 'Tarefa criada');
      onSalvo();
    } catch (e) { showToast('error', 'Erro ao criar a tarefa: ' + e.message); }
    finally { setSalvando(false); }
  };

  const nomeEmp = (id) => empresasRede.find(e => e.id === id)?.nome || 'Empresa';
  return (
    <Modal open onClose={onClose} title="Nova tarefa avulsa" size="lg"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-amber-700">{faltando.length ? `Falta: ${faltando.join(', ')}.` : ''}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={salvar} disabled={salvando || faltando.length > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {emps.length > 1 ? `Criar ${emps.length} tarefas` : 'Criar tarefa'}
            </button>
          </div>
        </div>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rot="Título" className="sm:col-span-2">
          <input className={input} value={form.titulo} onChange={e => set({ titulo: e.target.value })} />
        </Campo>
        <Campo rot="Rede" className="sm:col-span-2">
          <SelectBusca value={rede} onChange={v => { setRede(v); setEmps([]); setRespPor({}); }} vazio="Selecione a rede…"
            placeholderBusca="Buscar rede…" vazioLista="Nenhuma rede encontrada." opcoes={redes} />
        </Campo>
        {rede && (
          <Campo rot={`Empresas${emps.length > 1 ? ' — uma tarefa por empresa' : ''}`} className="sm:col-span-2">
            <EmpresasMultiSelect empresas={empresasRede} value={emps} onChange={setEmps} />
          </Campo>
        )}
        {emps.length > 0 && (
          <Campo rot={`${emps.length > 1 ? 'Responsável por empresa' : 'Responsável'}${carregando ? ' (carregando…)' : ''}`} className="sm:col-span-2">
            {emps.length === 1 ? (
              <SelectBusca value={valido(emps[0])} onChange={v => setRespPor({ [emps[0]]: v })} vazio="Selecione o responsável…"
                placeholderBusca="Buscar pessoa…" vazioLista="Nenhum funcionário com acesso a Tarefas."
                opcoes={(mapa[emps[0]] || []).map(u => ({ value: u.id, label: u.nome }))} />
            ) : (
              <div className="space-y-1.5 rounded-lg border border-gray-100 p-3">
                {comuns.length > 0 && (
                  <div className="mb-1 flex items-center justify-end gap-2 text-[11.5px] text-gray-500">
                    Aplicar a todas:
                    <span className="w-56"><SelectBusca value="" vazio="—" placeholderBusca="Buscar pessoa…"
                      opcoes={comuns.map(u => ({ value: u.id, label: u.nome }))}
                      onChange={v => setRespPor(Object.fromEntries(emps.map(id => [id, v])))} /></span>
                  </div>
                )}
                {emps.map(id => (
                  <div key={id} className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_260px]">
                    <span className="truncate text-[13px] text-gray-700" title={nomeEmp(id)}>{nomeEmp(id)}</span>
                    <SelectBusca value={valido(id)} onChange={v => setRespPor(m => ({ ...m, [id]: v }))} vazio="Selecione…"
                      placeholderBusca="Buscar pessoa…" vazioLista="Nenhum funcionário com acesso a Tarefas."
                      opcoes={(mapa[id] || []).map(u => ({ value: u.id, label: u.nome }))} />
                  </div>
                ))}
              </div>
            )}
          </Campo>
        )}
        <Campo rot="Setor">
          <select className={input} value={form.setor_id} onChange={e => set({ setor_id: e.target.value })}>
            <option value="">Sem setor</option>
            {setores.filter(s => s.ativo).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rot="Prioridade">
          <select className={input} value={form.prioridade} onChange={e => set({ prioridade: e.target.value })}>
            {Object.entries(PRIORIDADES).map(([k, p]) => <option key={k} value={k}>{p.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rot="Descrição / instruções" className="sm:col-span-2">
          <textarea rows={2} className={`${input} h-auto py-2`} value={form.descricao} onChange={e => set({ descricao: e.target.value })} />
        </Campo>
        <Campo rot="Vence em"><input type="date" className={input} value={form.data} onChange={e => set({ data: e.target.value })} /></Campo>
        <Campo rot="Hora"><input type="time" className={input} value={form.hora} onChange={e => set({ hora: e.target.value })} /></Campo>
        <Campo rot="Checklist" className="sm:col-span-2">
          <ListaTextos valores={form.checklist} onChange={v => set({ checklist: v })} placeholder="Adicionar item (Enter)" />
        </Campo>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.exige_evidencia} onChange={e => set({ exige_evidencia: e.target.checked })} />
          Exige evidência (foto ou documento) para enviar
        </label>
        {form.exige_evidencia && (
          <Campo rot="Evidências obrigatórias (opcional)" className="sm:col-span-2">
            <ListaTextos valores={form.documentos} onChange={v => set({ documentos: v })} placeholder="Ex.: Foto da nota fiscal" />
          </Campo>
        )}
      </div>
    </Modal>
  );
}

// ─── Setores ────────────────────────────────────────────────────
export function SetoresModal({ open, setores, onClose, onSalvo, showToast }) {
  const [novo, setNovo] = useState('');
  const salvar = async (s) => {
    try { await tarefas.salvarSetor(s); onSalvo(); }
    catch (e) { showToast('error', 'Erro ao salvar o setor: ' + e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Setores" size="sm">
      <ul className="space-y-1">
        {setores.map(s => (
          <li key={s.id} className="flex items-center gap-2">
            <input defaultValue={s.nome} onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.nome) salvar({ id: s.id, nome: v }); }}
              className={`${input} ${s.ativo ? '' : 'text-gray-400'}`} />
            <button onClick={() => salvar({ id: s.id, ativo: !s.ativo })} title={s.ativo ? 'Desativar' : 'Ativar'}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border ${s.ativo ? 'border-gray-200 text-gray-600' : 'border-emerald-200 text-emerald-700'}`}>
              {s.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); const v = novo.trim(); if (v) salvar({ nome: v, ordem: (setores.length + 1) * 10 }).then(() => setNovo('')); }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Novo setor" className={input} />
        <button className="rounded-lg bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button>
      </form>
      <button onClick={onClose} className="sr-only"><X /></button>
    </Modal>
  );
}
