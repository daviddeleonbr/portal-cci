// Detalhe de uma tarefa — usado pela CCI (gestor) e pelo funcionário.
// Funcionário: marca checklist, anexa evidências (foto pela câmera / documento),
// comenta e envia para validação. CCI: tudo isso + editar checklist, aprovar ou
// devolver (com motivo), cancelar e reabrir. As regras valem no banco.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Loader2, CheckCircle2, Circle, Camera, Paperclip, Send, Trash2, FileText, Image as ImageIcon,
  MessageSquare, History, ShieldCheck, Undo2, Ban, RotateCcw, Plus, AlertTriangle, Clock, Pencil,
} from 'lucide-react';
import * as tarefas from '../../services/tarefasService';
import { ReferenciaBadge, SelectBusca, DocumentosEditor } from './CamposTarefas';
import { STATUS_TAREFA, PRIORIDADES, statusEfetivo, bloqueioEnvio, fmtDataHora } from '../../utils/tarefas';

export default function TarefaDetalhe({ tarefaId, gestor = false, onFechar, onAlterado }) {
  const [t, setT] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [comentario, setComentario] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [editando, setEditando] = useState(false);
  const inputArquivo = useRef(null);
  const inputCamera = useRef(null);
  const docAlvo = useRef(null);

  const carregar = useCallback(async () => {
    try { setT(await tarefas.buscarTarefa(tarefaId)); }
    catch (e) { setErro(e.message); }
  }, [tarefaId]);
  useEffect(() => { carregar(); }, [carregar]);

  // Executa uma ação, recarrega e avisa a lista.
  const acao = async (fn) => {
    setOcupado(true); setErro('');
    try { await fn(); await carregar(); onAlterado?.(); return true; }
    catch (e) { setErro(e.message); return false; }
    finally { setOcupado(false); }
  };

  if (!t) {
    return (
      <Moldura onFechar={onFechar}>
        <div className="flex justify-center py-16">{erro ? <p className="text-sm text-rose-600">{erro}</p> : <Loader2 className="h-6 w-6 animate-spin text-teal-600" />}</div>
      </Moldura>
    );
  }

  const st = statusEfetivo(t);
  const emExecucao = ['a_fazer', 'em_andamento'].includes(t.status);
  const bloqueio = bloqueioEnvio(t, t.checklist, t.evidencias);
  const anexos = t.evidencias.filter(e => e.tipo !== 'comentario');
  const comentarios = t.evidencias.filter(e => e.tipo === 'comentario');
  const docs = t.documentos || [];

  const escolherArquivo = (doc, camera = false) => {
    docAlvo.current = doc;
    (camera ? inputCamera : inputArquivo).current?.click();
  };
  const onArquivo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) acao(() => tarefas.anexarEvidencia(t.id, f, docAlvo.current));
  };
  const abrirAnexo = async (ev) => {
    try { window.open(await tarefas.urlEvidencia(ev.storage_path), '_blank', 'noopener'); }
    catch (e) { setErro(e.message); }
  };

  return (
    <Moldura onFechar={onFechar}>
      <input ref={inputArquivo} type="file" className="hidden" onChange={onArquivo}
        accept="image/*,application/pdf,.xlsx,.docx,.csv" />
      <input ref={inputCamera} type="file" className="hidden" onChange={onArquivo} accept="image/*" capture="environment" />

      {/* Cabeçalho */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TAREFA[st].cls}`}>{STATUS_TAREFA[st].rotulo}</span>
              <span className={`text-[11px] font-semibold ${PRIORIDADES[t.prioridade]?.cls}`}>Prioridade {PRIORIDADES[t.prioridade]?.rotulo}</span>
              {t.rotina_id && <span className="text-[11px] text-gray-400">· Rotina</span>}
              <ReferenciaBadge t={t} grande />
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-gray-900 leading-snug">{t.titulo}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {t.cliente?.razao_social || t.cliente?.nome}
              {t.setor?.nome ? ` · ${t.setor.nome}` : ''}
              {t.responsavel?.nome ? ` · ${t.responsavel.nome}` : ''}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {gestor && t.status !== 'cancelada' && !editando && (
              <button onClick={() => setEditando(true)} title="Editar tarefa" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
            )}
            <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-gray-500">
          <span className={`inline-flex items-center gap-1 ${st === 'atrasada' ? 'text-rose-600 font-medium' : ''}`}>
            <Clock className="h-3.5 w-3.5" /> Vence {fmtDataHora(t.vence_em)}
          </span>
          {t.enviada_em && <span>Enviada {fmtDataHora(t.enviada_em)}</span>}
          {t.concluida_em && <span>Aprovada {fmtDataHora(t.concluida_em)}{t.validada_por_nome ? ` por ${t.validada_por_nome}` : ''}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {erro && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {erro}
          </div>
        )}
        {editando && (
          <EditarTarefa t={t} onCancelar={() => setEditando(false)}
            onSalvar={campos => acao(() => tarefas.atualizarTarefa(t.id, campos)).then(ok => { if (ok) setEditando(false); })} />
        )}
        {!editando && t.descricao && <p className="text-sm text-gray-700 whitespace-pre-line">{t.descricao}</p>}

        {/* Checklist */}
        {(t.checklist.length > 0 || gestor) && (
          <Secao titulo={`Checklist (${t.checklist.filter(i => i.feito).length}/${t.checklist.length})`}>
            <ul className="space-y-1">
              {t.checklist.map(i => (
                <li key={i.id} className="flex items-center gap-2">
                  <button disabled={ocupado || (!emExecucao && !gestor)} onClick={() => acao(() => tarefas.marcarChecklist(i.id, !i.feito))}
                    className="flex flex-1 items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 disabled:cursor-default">
                    {i.feito ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 flex-shrink-0 text-gray-300" />}
                    <span className={`text-sm ${i.feito ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{i.rotulo}</span>
                    {i.feito && i.feito_por_nome && <span className="ml-auto text-[10.5px] text-gray-400 whitespace-nowrap">{i.feito_por_nome}</span>}
                  </button>
                  {gestor && (
                    <button onClick={() => acao(() => tarefas.removerChecklist(i.id))} className="rounded p-1 text-gray-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </li>
              ))}
            </ul>
            {gestor && emExecucao && (
              <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); const r = novoItem.trim(); if (r) acao(() => tarefas.adicionarChecklist(t.id, r, t.checklist.length)).then(() => setNovoItem('')); }}>
                <input value={novoItem} onChange={e => setNovoItem(e.target.value)} placeholder="Novo item do checklist"
                  className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm" />
                <button className="rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50"><Plus className="h-4 w-4" /></button>
              </form>
            )}
          </Secao>
        )}

        {/* Evidências */}
        <Secao titulo={`Evidências${t.exige_evidencia ? ' (obrigatória)' : ''}`}>
          {docs.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {docs.map(d => {
                const feitos = anexos.filter(e => e.documento === d);
                return (
                  <li key={d} className="rounded-lg border border-gray-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800">{d}</span>
                      {emExecucao && (
                        <div className="flex gap-1">
                          <BotaoMini onClick={() => escolherArquivo(d, true)} icon={Camera} rot="Foto" />
                          <BotaoMini onClick={() => escolherArquivo(d)} icon={Paperclip} rot="Arquivo" />
                        </div>
                      )}
                    </div>
                    {feitos.map(ev => <LinhaAnexo key={ev.id} ev={ev} onAbrir={abrirAnexo} onRemover={emExecucao || gestor ? () => acao(() => tarefas.removerEvidencia(ev)) : null} />)}
                  </li>
                );
              })}
            </ul>
          )}
          {anexos.filter(e => !e.documento || !docs.includes(e.documento)).map(ev => (
            <LinhaAnexo key={ev.id} ev={ev} onAbrir={abrirAnexo} onRemover={emExecucao || gestor ? () => acao(() => tarefas.removerEvidencia(ev)) : null} />
          ))}
          {emExecucao && (
            <div className="mt-2 flex gap-2">
              <BotaoMini onClick={() => escolherArquivo(null, true)} icon={Camera} rot="Tirar foto" />
              <BotaoMini onClick={() => escolherArquivo(null)} icon={Paperclip} rot="Anexar arquivo" />
            </div>
          )}
          {anexos.length === 0 && !emExecucao && <p className="text-xs text-gray-400">Nenhuma evidência anexada.</p>}
        </Secao>

        {/* Pedidos de mais prazo / reabertura */}
        <PedidosTarefa t={t} gestor={gestor} acao={acao} />

        {/* Comentários */}
        <Secao titulo="Comentários" icon={MessageSquare}>
          <ul className="space-y-2">
            {comentarios.map(c => (
              <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[11px] text-gray-500"><span className="font-medium text-gray-700">{c.usuario_nome}</span> · {fmtDataHora(c.criado_em)}</p>
                <p className="text-sm text-gray-800 whitespace-pre-line">{c.conteudo}</p>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); const x = comentario.trim(); if (x) acao(() => tarefas.comentar(t.id, x)).then(() => setComentario('')); }}>
            <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Escreva um comentário"
              className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm" />
            <button disabled={!comentario.trim() || ocupado} className="rounded-lg bg-gray-900 px-3 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
        </Secao>

        {/* Histórico */}
        <Secao titulo="Histórico" icon={History}>
          <ul className="space-y-1">
            {t.eventos.map(ev => (
              <li key={ev.id} className="flex gap-2 text-[12px]">
                <span className="text-gray-400 tabular-nums whitespace-nowrap">{fmtDataHora(ev.criado_em)}</span>
                <span className="text-gray-700">{ev.descricao}</span>
                <span className="ml-auto text-gray-400 whitespace-nowrap">{ev.usuario_nome}</span>
              </li>
            ))}
          </ul>
        </Secao>
      </div>

      {/* Ações */}
      <div className="border-t border-gray-100 px-5 py-3 space-y-2">
        {devolvendo && (
          <div className="flex gap-2">
            <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da devolução (o que precisa refazer)"
              className="flex-1 h-9 rounded-lg border border-amber-300 px-3 text-sm" />
            <button disabled={motivo.trim().length < 5 || ocupado}
              onClick={() => acao(() => tarefas.validarTarefa(t.id, false, motivo.trim())).then(() => { setDevolvendo(false); setMotivo(''); })}
              className="rounded-lg bg-amber-600 px-3 text-sm font-medium text-white disabled:opacity-50">Devolver</button>
            <button onClick={() => setDevolvendo(false)} className="rounded-lg px-2 text-sm text-gray-500">Cancelar</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {ocupado && <Loader2 className="mr-auto h-4 w-4 animate-spin text-gray-400" />}
          {/* Funcionário (e CCI) — enviar para validação */}
          {emExecucao && (
            <>
              {bloqueio && <p className="mr-auto text-[11.5px] text-amber-700">{bloqueio}</p>}
              <button disabled={!!bloqueio || ocupado} onClick={() => acao(() => tarefas.alterarStatus(t.id, 'aguardando_validacao'))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                <Send className="h-4 w-4" /> Concluir e enviar para validação
              </button>
            </>
          )}
          {/* CCI */}
          {gestor && t.status === 'aguardando_validacao' && !devolvendo && (
            <>
              <button onClick={() => setDevolvendo(true)} disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50">
                <Undo2 className="h-4 w-4" /> Devolver para refazer
              </button>
              <button onClick={() => acao(() => tarefas.validarTarefa(t.id, true))} disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                <ShieldCheck className="h-4 w-4" /> Aprovar conclusão
              </button>
            </>
          )}
          {gestor && emExecucao && (
            <button onClick={() => { if (confirm('Cancelar esta tarefa?')) acao(() => tarefas.alterarStatus(t.id, 'cancelada')); }} disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <Ban className="h-4 w-4" /> Cancelar tarefa
            </button>
          )}
          {gestor && ['concluida', 'cancelada'].includes(t.status) && (
            <button onClick={() => acao(() => tarefas.alterarStatus(t.id, 'em_andamento'))} disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <RotateCcw className="h-4 w-4" /> Reabrir
            </button>
          )}
          {!gestor && t.status === 'aguardando_validacao' && (
            <p className="text-sm text-violet-700">Enviada — aguardando a validação da CCI.</p>
          )}
        </div>
      </div>
    </Moldura>
  );
}

function Moldura({ children, onFechar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onFechar}>
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Secao({ titulo, icon: Icone, children }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {Icone && <Icone className="h-3.5 w-3.5" />} {titulo}
      </h3>
      {children}
    </section>
  );
}

function BotaoMini({ onClick, icon, rot }) {
  const Icone = icon;
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
      <Icone className="h-3.5 w-3.5" /> {rot}
    </button>
  );
}

function LinhaAnexo({ ev, onAbrir, onRemover }) {
  const Icone = ev.tipo === 'foto' ? ImageIcon : FileText;
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50">
      <Icone className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <button onClick={() => onAbrir(ev)} className="min-w-0 flex-1 truncate text-left text-sm text-teal-700 hover:underline">{ev.nome || 'arquivo'}</button>
      <span className="text-[10.5px] text-gray-400 whitespace-nowrap">{ev.usuario_nome} · {fmtDataHora(ev.criado_em)}</span>
      {onRemover && <button onClick={onRemover} className="rounded p-1 text-gray-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

// ─── Pedidos de mais prazo / reabertura ────────────────────────
// Funcionário pede (com motivo); a CCI aprova (ajustando o prazo) ou recusa.
const ROT_PEDIDO = { prorrogacao: 'Mais prazo', reabertura: 'Reabertura' };
const paraInputLocal = (iso) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function PedidosTarefa({ t, gestor, acao }) {
  const [form, setForm] = useState(null); // { tipo, motivo, prazo }
  const [decisao, setDecisao] = useState({}); // pedidoId → { prazo, resposta }
  const pendentes = t.pedidos.filter(p => p.status === 'pendente');
  const decididos = t.pedidos.filter(p => p.status !== 'pendente');
  const temPendente = (tipo) => pendentes.some(p => p.tipo === tipo);
  const podePrazo = !gestor && ['a_fazer', 'em_andamento'].includes(t.status) && !temPendente('prorrogacao');
  const podeReabrir = !gestor && ['aguardando_validacao', 'concluida'].includes(t.status) && !temPendente('reabertura');

  if (!pendentes.length && !decididos.length && !podePrazo && !podeReabrir) return null;

  const enviar = () => acao(() => tarefas.solicitarPedido(
    t.id, form.tipo, form.motivo.trim(), form.tipo === 'prorrogacao' ? new Date(form.prazo).toISOString() : null,
  )).then(() => setForm(null));

  return (
    <Secao titulo="Pedidos">
      {pendentes.map(p => {
        const d = decisao[p.id] || { prazo: paraInputLocal(p.prazo_solicitado), resposta: '' };
        const setD = (patch) => setDecisao(x => ({ ...x, [p.id]: { ...d, ...patch } }));
        return (
          <div key={p.id} className="mb-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
            <p className="text-sm font-medium text-amber-900">
              {ROT_PEDIDO[p.tipo]} pedida por {p.solicitante_nome}
              {p.tipo === 'prorrogacao' && <> — até <strong>{fmtDataHora(p.prazo_solicitado)}</strong></>}
            </p>
            <p className="mt-0.5 text-[12.5px] text-amber-900/80">“{p.motivo}”</p>
            {gestor ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {p.tipo === 'prorrogacao' && (
                  <label className="text-[11px] text-gray-600">Prazo concedido
                    <input type="datetime-local" value={d.prazo} onChange={e => setD({ prazo: e.target.value })}
                      className="mt-0.5 block h-8 rounded-md border border-gray-200 bg-white px-2 text-xs" />
                  </label>
                )}
                <input value={d.resposta} onChange={e => setD({ resposta: e.target.value })} placeholder="Resposta (obrigatória para recusar)"
                  className="h-8 min-w-[12rem] flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs" />
                <button onClick={() => acao(() => tarefas.decidirPedido(p.id, false, d.resposta.trim()))} disabled={d.resposta.trim().length < 5}
                  className="h-8 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 disabled:opacity-40">Recusar</button>
                <button onClick={() => acao(() => tarefas.decidirPedido(p.id, true, d.resposta.trim() || null,
                  p.tipo === 'prorrogacao' ? new Date(d.prazo).toISOString() : null))}
                  className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white">Aprovar</button>
              </div>
            ) : (
              <p className="mt-1 text-[11.5px] text-amber-700">Aguardando a decisão da CCI.</p>
            )}
          </div>
        );
      })}

      {form ? (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <p className="text-sm font-medium text-gray-800">{form.tipo === 'prorrogacao' ? 'Pedir mais prazo' : 'Pedir reabertura'}</p>
          {form.tipo === 'prorrogacao' && (
            <label className="block text-[11px] text-gray-600">Novo prazo
              <input type="datetime-local" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
                className="mt-0.5 block h-9 rounded-lg border border-gray-200 px-2 text-sm" />
            </label>
          )}
          <textarea rows={2} value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
            placeholder="Explique o motivo (mínimo 10 caracteres)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500">Cancelar</button>
            <button onClick={enviar} disabled={form.motivo.trim().length < 10}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Enviar pedido</button>
          </div>
        </div>
      ) : (podePrazo || podeReabrir) && (
        <div className="flex flex-wrap gap-2">
          {podePrazo && <BotaoMini icon={Clock} rot="Pedir mais prazo" onClick={() => setForm({ tipo: 'prorrogacao', motivo: '', prazo: paraInputLocal(new Date(Math.max(Date.now(), new Date(t.vence_em))).getTime() + 86400000) })} />}
          {podeReabrir && <BotaoMini icon={RotateCcw} rot="Pedir reabertura" onClick={() => setForm({ tipo: 'reabertura', motivo: '' })} />}
        </div>
      )}

      {decididos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {decididos.map(p => (
            <li key={p.id} className="text-[11.5px] text-gray-500">
              {ROT_PEDIDO[p.tipo]} {p.status === 'aprovado' ? 'aprovada' : 'recusada'} por {p.decidido_por_nome} em {fmtDataHora(p.decidido_em)}
              {p.prazo_concedido ? ` (até ${fmtDataHora(p.prazo_concedido)})` : ''}{p.resposta ? ` — “${p.resposta}”` : ''}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ─── Editar a tarefa (CCI) ──────────────────────────────────────
const inpEd = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const lblEd = 'mb-1 block text-xs font-medium text-gray-500';
const pad2 = (n) => String(n).padStart(2, '0');

function EditarTarefa({ t, onCancelar, onSalvar }) {
  const v = new Date(t.vence_em);
  const [f, setF] = useState({
    titulo: t.titulo, descricao: t.descricao || '', responsavel_id: t.responsavel_id || '', setor_id: t.setor_id || '',
    prioridade: t.prioridade, data: `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`,
    hora: `${pad2(v.getHours())}:${pad2(v.getMinutes())}`, exige_evidencia: t.exige_evidencia, documentos: t.documentos || [],
  });
  const [pessoas, setPessoas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (p) => setF(x => ({ ...x, ...p }));

  useEffect(() => {
    let cancel = false;
    Promise.all([tarefas.listarResponsaveisPorClientes([t.cliente]), tarefas.listarSetores()])
      .then(([mapa, ss]) => { if (!cancel) { setPessoas(mapa[t.cliente.id] || []); setSetores(ss); } })
      .catch(e => { if (!cancel) setErro(e.message); });
    return () => { cancel = true; };
  }, [t.cliente]);

  const salvar = async () => {
    if (f.titulo.trim().length < 2) return setErro('Informe o título.');
    if (!f.responsavel_id) return setErro('Escolha o responsável.');
    setSalvando(true); setErro('');
    try {
      await onSalvar({
        titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, responsavel_id: f.responsavel_id,
        setor_id: f.setor_id || null, prioridade: f.prioridade, vence_em: new Date(`${f.data}T${f.hora}:00`).toISOString(),
        exige_evidencia: f.exige_evidencia, documentos: f.exige_evidencia ? f.documentos : [],
      });
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  return (
    <div className="space-y-3 rounded-xl border border-teal-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800">Editar tarefa</p>
      {t.rotina_id && <p className="text-[11px] text-gray-500">Vale só para esta tarefa — para as próximas, edite a rotina.</p>}
      <div><label className={lblEd}>Título</label><input value={f.titulo} onChange={e => set({ titulo: e.target.value })} className={inpEd} /></div>
      <div><label className={lblEd}>Descrição / instruções</label>
        <textarea rows={2} value={f.descricao} onChange={e => set({ descricao: e.target.value })} className={inpEd} /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={lblEd}>Responsável</label>
          <SelectBusca value={pessoas.some(p => p.id === f.responsavel_id) ? f.responsavel_id : ''} onChange={v2 => set({ responsavel_id: v2 })}
            vazio={t.responsavel?.nome && !pessoas.length ? t.responsavel.nome : 'Selecione…'} placeholderBusca="Buscar pessoa…"
            vazioLista="Nenhum funcionário com acesso a Tarefas." opcoes={pessoas.map(p => ({ value: p.id, label: p.nome }))} /></div>
        <div><label className={lblEd}>Setor</label>
          <select value={f.setor_id} onChange={e => set({ setor_id: e.target.value })} className={inpEd}>
            <option value="">Sem setor</option>
            {setores.filter(s => s.ativo || s.id === f.setor_id).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className={lblEd}>Vence em</label><input type="date" value={f.data} onChange={e => set({ data: e.target.value })} className={inpEd} /></div>
        <div><label className={lblEd}>Hora</label><input type="time" value={f.hora} onChange={e => set({ hora: e.target.value })} className={inpEd} /></div>
        <div><label className={lblEd}>Prioridade</label>
          <select value={f.prioridade} onChange={e => set({ prioridade: e.target.value })} className={inpEd}>
            {['critica', 'alta', 'media', 'baixa'].map(p => <option key={p} value={p}>{PRIORIDADES[p].rotulo}</option>)}
          </select></div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-gray-600">
        <input type="checkbox" checked={f.exige_evidencia} onChange={e => set({ exige_evidencia: e.target.checked })} /> Exigir foto ou documento para concluir
      </label>
      {f.exige_evidencia && <DocumentosEditor valor={f.documentos} onChange={d => set({ documentos: d })} />}
      {erro && <p className="text-[12px] text-red-600">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
        <button onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar
        </button>
      </div>
    </div>
  );
}
