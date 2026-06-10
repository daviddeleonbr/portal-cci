// Admin · Comunicações · Pendências
//
// CRUD de pendências CCI → clientes. Cada pendência pode ser direcionada
// a uma rede inteira (chave_api_id) ou a um cliente específico. Tem
// prioridade (alta/média/baixa) e janela de exibição (mostrar_apos /
// mostrar_ate). Fica visível na lista até admin marcar como resolvida.

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertCircle, Plus, X, CheckCircle2, RefreshCw, Trash2,
  AlertTriangle, MessageSquare, Calendar, Network, Building2, Edit2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import { useAdminSession } from '../hooks/useAuth';
import * as svc from '../services/pendenciasService';
import { supabase } from '../lib/supabase';

const COR_PRIORIDADE = {
  alta:  { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-500'    },
  media: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-500'   },
  baixa: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-500' },
};

function fmtDataHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

export default function AdminPendencias() {
  const session = useAdminSession();
  const usuarioId = session?.usuario?.id;
  const usuarioNome = session?.usuario?.nome;

  const [pendencias, setPendencias] = useState([]);
  const [redes, setRedes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('aberta');
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas');
  const [busca, setBusca] = useState('');

  // Modal de criar/editar
  const [editando, setEditando] = useState(null); // null | 'novo' | objeto pendencia

  // Painel de respostas
  const [respostasAbertas, setRespostasAbertas] = useState(null); // pendencia
  const [respostas, setRespostas] = useState([]);
  const [respostaTexto, setRespostaTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    setLoading(true); setErro(null);
    try {
      const [pends, redesData, clientesData] = await Promise.all([
        svc.listarPendencias({}),
        supabase.from('chaves_api').select('id, nome').order('nome'),
        supabase.from('clientes').select('id, nome, chave_api_id').eq('status', 'ativo').order('nome'),
      ]);
      setPendencias(pends);
      setRedes(redesData.data || []);
      setClientes(clientesData.data || []);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendencias
      .filter(p => filtroStatus === 'todas' || p.status === filtroStatus)
      .filter(p => filtroPrioridade === 'todas' || p.prioridade === filtroPrioridade)
      .filter(p => !q || (p.titulo || '').toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q));
  }, [pendencias, filtroStatus, filtroPrioridade, busca]);

  const contadores = useMemo(() => ({
    todas:     pendencias.length,
    abertas:   pendencias.filter(p => p.status === 'aberta').length,
    resolvidas:pendencias.filter(p => p.status === 'resolvida').length,
  }), [pendencias]);

  const resolver = async (p) => {
    if (!confirm(`Marcar "${p.titulo}" como resolvida?`)) return;
    try {
      await svc.resolverPendencia(p.id, usuarioId);
      setToast({ tipo: 'success', mensagem: 'Pendência resolvida' });
      await carregar();
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
  };

  const reabrir = async (p) => {
    try {
      await svc.reabrirPendencia(p.id);
      setToast({ tipo: 'success', mensagem: 'Pendência reaberta' });
      await carregar();
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
  };

  const excluir = async (p) => {
    if (!confirm(`Excluir permanentemente "${p.titulo}"? Não há como desfazer.`)) return;
    try {
      await svc.excluirPendencia(p.id);
      setToast({ tipo: 'success', mensagem: 'Pendência excluída' });
      await carregar();
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
  };

  const abrirRespostas = async (p) => {
    setRespostasAbertas(p);
    try {
      const rs = await svc.listarRespostas(p.id);
      setRespostas(rs);
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
  };

  const enviarResposta = async () => {
    if (!respostaTexto.trim()) return;
    setEnviando(true);
    try {
      await svc.adicionarResposta({
        pendenciaId: respostasAbertas.id,
        autorTipo: 'admin',
        autorId: usuarioId,
        autorNome: usuarioNome,
        texto: respostaTexto.trim(),
      });
      const rs = await svc.listarRespostas(respostasAbertas.id);
      setRespostas(rs);
      setRespostaTexto('');
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
    finally { setEnviando(false); }
  };

  return (
    <div>
      <PageHeader title="Pendências" description="Assuntos pendentes de resposta do cliente">
        <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Nova pendência
        </button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <CardKpi cor="rose"    label="Abertas"    valor={contadores.abertas}   />
        <CardKpi cor="emerald" label="Resolvidas" valor={contadores.resolvidas} />
        <CardKpi cor="gray"    label="Total"      valor={contadores.todas}     />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={filtroStatus} onChange={setFiltroStatus} options={[
          { value: 'aberta',    label: 'Abertas',    badge: contadores.abertas },
          { value: 'resolvida', label: 'Resolvidas', badge: contadores.resolvidas },
          { value: 'todas',     label: 'Todas',      badge: contadores.todas },
        ]} />
        <span className="text-gray-300">·</span>
        <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[12px]">
          <option value="todas">Todas prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por título ou descrição..."
          className="ml-auto h-8 w-full sm:w-72 rounded-md border border-gray-200 bg-white px-3 text-[12px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando pendências...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          Nenhuma pendência {filtroStatus !== 'todas' && `${filtroStatus}`} encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map(p => (
            <ItemPendencia key={p.id} pendencia={p}
              onResolver={() => resolver(p)}
              onReabrir={() => reabrir(p)}
              onExcluir={() => excluir(p)}
              onEditar={() => setEditando(p)}
              onAbrirRespostas={() => abrirRespostas(p)} />
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {editando && (
        <ModalPendencia
          pendencia={editando === 'novo' ? null : editando}
          redes={redes}
          clientes={clientes}
          onSalvar={async (payload) => {
            try {
              if (editando === 'novo') {
                await svc.criarPendencia({ ...payload, criadaPor: usuarioId });
                setToast({ tipo: 'success', mensagem: 'Pendência criada' });
              } else {
                await svc.atualizarPendencia(editando.id, payload);
                setToast({ tipo: 'success', mensagem: 'Pendência atualizada' });
              }
              setEditando(null);
              await carregar();
            } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
          }}
          onFechar={() => setEditando(null)} />
      )}

      {/* Modal respostas */}
      {respostasAbertas && (
        <ModalRespostas
          pendencia={respostasAbertas}
          respostas={respostas}
          texto={respostaTexto}
          setTexto={setRespostaTexto}
          enviando={enviando}
          onEnviar={enviarResposta}
          onFechar={() => { setRespostasAbertas(null); setRespostas([]); setRespostaTexto(''); }} />
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────

function CardKpi({ cor, label, valor }) {
  const cores = {
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700'    },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    gray:    { bg: 'bg-gray-50',    text: 'text-gray-700'    },
  };
  const c = cores[cor] || cores.gray;
  return (
    <div className={`${c.bg} rounded-xl p-3.5`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${c.text} mt-0.5`}>{valor}</p>
    </div>
  );
}

function Tabs({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-3 h-7 rounded text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
            value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}>
          {o.label}
          {o.badge != null && (
            <span className={`text-[9.5px] font-bold px-1 rounded ${value === o.value ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
              {o.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ItemPendencia({ pendencia: p, onResolver, onReabrir, onExcluir, onEditar, onAbrirRespostas }) {
  const cor = COR_PRIORIDADE[p.prioridade] || COR_PRIORIDADE.media;
  const escopo = p.chave_api_id
    ? { icone: Network, label: p.chave_api?.nome || '—', sublabel: 'rede inteira' }
    : { icone: Building2, label: p.cliente?.nome || '—', sublabel: 'cliente específico' };
  const Escopo = escopo.icone;
  const resolvida = p.status === 'resolvida';

  return (
    <div className={`bg-white rounded-xl border ${cor.border} overflow-hidden ${resolvida ? 'opacity-60' : ''}`}>
      <div className="p-3.5 flex items-start gap-3">
        <div className={`h-1 w-1.5 rounded-full ${cor.badge} mt-2 flex-shrink-0`} title={p.prioridade} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="text-[13.5px] font-bold text-gray-900 truncate">{p.titulo}</h3>
              {p.descricao && (
                <p className="text-[12px] text-gray-600 mt-0.5 whitespace-pre-wrap line-clamp-2">{p.descricao}</p>
              )}
            </div>
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${cor.bg} ${cor.text} flex-shrink-0`}>
              {p.prioridade}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Escopo className="h-3 w-3" />
              <span className="font-medium">{escopo.label}</span>
              <span className="text-gray-400">· {escopo.sublabel}</span>
            </span>
            {p.mostrar_apos && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1" title="Aparece a partir de">
                  <Calendar className="h-3 w-3" />
                  desde {fmtDataHora(p.mostrar_apos)}
                </span>
              </>
            )}
            {p.mostrar_ate && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1" title="Aparece até">
                  <Calendar className="h-3 w-3" />
                  até {fmtDataHora(p.mostrar_ate)}
                </span>
              </>
            )}
            {(() => {
              const r = svc.resumirRecorrencia(p.recorrencia);
              if (!r) return null;
              return (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1 text-blue-700 font-medium" title="Frequência de exibição">
                    🔁 {r}
                  </span>
                </>
              );
            })()}
            <span className="text-gray-300">·</span>
            <span title="Criada em">criada {fmtDataHora(p.criada_em)}</span>
            {resolvida && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  resolvida {fmtDataHora(p.resolvida_em)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onAbrirRespostas}
            title="Ver/responder mensagens"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700">
            <MessageSquare className="h-3 w-3" />
            Conversa
          </button>
          {!resolvida ? (
            <>
              <button onClick={onEditar}
                title="Editar"
                className="rounded-md border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700">
                <Edit2 className="h-3 w-3" />
              </button>
              <button onClick={onResolver}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white">
                <CheckCircle2 className="h-3 w-3" />
                Resolver
              </button>
            </>
          ) : (
            <button onClick={onReabrir}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700">
              <RefreshCw className="h-3 w-3" />
              Reabrir
            </button>
          )}
          <button onClick={onExcluir}
            title="Excluir"
            className="rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalPendencia({ pendencia, redes, clientes, onSalvar, onFechar }) {
  const [titulo, setTitulo] = useState(pendencia?.titulo || '');
  const [descricao, setDescricao] = useState(pendencia?.descricao || '');
  const [prioridade, setPrioridade] = useState(pendencia?.prioridade || 'media');
  const [tipoEscopo, setTipoEscopo] = useState(
    pendencia?.cliente_id ? 'cliente' : 'rede'
  );
  const [chaveApiId, setChaveApiId] = useState(pendencia?.chave_api_id || '');
  const [clienteId,  setClienteId]  = useState(pendencia?.cliente_id  || '');
  const [mostrarApos, setMostrarApos] = useState(
    pendencia?.mostrar_apos ? toLocalInput(pendencia.mostrar_apos) : ''
  );
  const [mostrarAte, setMostrarAte] = useState(
    pendencia?.mostrar_ate ? toLocalInput(pendencia.mostrar_ate) : ''
  );
  // Recorrência
  const [recTipo, setRecTipo] = useState(pendencia?.recorrencia?.tipo || 'nenhuma');
  const [recDias, setRecDias] = useState(
    Array.isArray(pendencia?.recorrencia?.dias) ? pendencia.recorrencia.dias : []
  );
  const [recIntervalo, setRecIntervalo] = useState(
    pendencia?.recorrencia?.tipo === 'intervalo' ? (pendencia.recorrencia.dias || 7) : 7
  );
  const [salvando, setSalvando] = useState(false);

  function toLocalInput(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const clientesFiltrados = useMemo(() => {
    if (tipoEscopo !== 'cliente') return clientes;
    return chaveApiId
      ? clientes.filter(c => c.chave_api_id === chaveApiId)
      : clientes;
  }, [clientes, tipoEscopo, chaveApiId]);

  // Monta objeto recorrencia a partir do form
  const montarRecorrencia = () => {
    if (recTipo === 'nenhuma') return null;
    if (recTipo === 'diaria')  return { tipo: 'diaria' };
    if (recTipo === 'dias_semana') return { tipo: 'dias_semana', dias: recDias };
    if (recTipo === 'intervalo')   return { tipo: 'intervalo', dias: Math.max(1, Number(recIntervalo) || 1) };
    return null;
  };

  const toggleDiaSemana = (v) => setRecDias(prev =>
    prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v].sort()
  );

  const submit = async (e) => {
    e?.preventDefault();
    if (recTipo === 'dias_semana' && recDias.length === 0) {
      alert('Selecione pelo menos 1 dia da semana.');
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        prioridade,
        chaveApiId: tipoEscopo === 'rede' ? chaveApiId : null,
        clienteId:  tipoEscopo === 'cliente' ? clienteId : null,
        mostrarApos: mostrarApos ? new Date(mostrarApos).toISOString() : null,
        mostrarAte:  mostrarAte  ? new Date(mostrarAte).toISOString()  : null,
        recorrencia: montarRecorrencia(),
      });
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onFechar}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-bold text-gray-900">
            {pendencia ? 'Editar pendência' : 'Nova pendência'}
          </h2>
          <button type="button" onClick={onFechar} className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <Campo label="Título *">
            <input type="text" required value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Pendência fiscal de janeiro"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </Campo>

          <Campo label="Descrição">
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Explique o que precisa ser feito pelo cliente..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </Campo>

          <Campo label="Prioridade *">
            <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
              {svc.PRIORIDADES.map(p => (
                <button key={p.key} type="button" onClick={() => setPrioridade(p.key)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    prioridade === p.key
                      ? `${COR_PRIORIDADE[p.key].bg} ${COR_PRIORIDADE[p.key].text}`
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </Campo>

          <Campo label="Direcionar para *">
            <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 mb-2">
              <button type="button" onClick={() => setTipoEscopo('rede')}
                className={`px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1 ${tipoEscopo === 'rede' ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                <Network className="h-3 w-3" /> Rede inteira
              </button>
              <button type="button" onClick={() => setTipoEscopo('cliente')}
                className={`px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1 ${tipoEscopo === 'cliente' ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                <Building2 className="h-3 w-3" /> Cliente específico
              </button>
            </div>
            {tipoEscopo === 'rede' ? (
              <select required value={chaveApiId} onChange={e => setChaveApiId(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">Selecione uma rede...</option>
                {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            ) : (
              <>
                <select value={chaveApiId} onChange={e => setChaveApiId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white mb-2">
                  <option value="">Filtrar por rede (opcional)</option>
                  {redes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
                <select required value={clienteId} onChange={e => setClienteId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="">Selecione um cliente...</option>
                  {clientesFiltrados.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </>
            )}
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Aparecer a partir de" hint="opcional · vazio = imediato">
              <input type="datetime-local" value={mostrarApos} onChange={e => setMostrarApos(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </Campo>
            <Campo label="Aparecer até" hint="opcional · vazio = sem prazo">
              <input type="datetime-local" value={mostrarAte} onChange={e => setMostrarAte(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </Campo>
          </div>

          <Campo label="Frequência de exibição" hint="passo a passo">
            <WizardRecorrencia
              tipo={recTipo} setTipo={setRecTipo}
              dias={recDias} toggleDia={toggleDiaSemana}
              intervalo={recIntervalo} setIntervalo={setRecIntervalo}
            />
          </Campo>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-end gap-2">
          <button type="button" onClick={onFechar}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={salvando}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold text-white">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {pendencia ? 'Salvar alterações' : 'Criar pendência'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[11.5px] font-semibold text-gray-700 mb-1">
        {label}
        {hint && <span className="ml-1 text-[10.5px] text-gray-400 font-normal">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ModalRespostas({ pendencia, respostas, texto, setTexto, enviando, onEnviar, onFechar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold text-gray-900 truncate">{pendencia.titulo}</h2>
            <p className="text-[10.5px] text-gray-500">Conversa com o cliente</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 bg-gray-50/40 space-y-2.5">
          {respostas.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-8">Nenhuma mensagem ainda.</p>
          ) : respostas.map(r => (
            <div key={r.id} className={`flex ${r.autor_tipo === 'admin' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                r.autor_tipo === 'admin' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
              }`}>
                <p className={`text-[10px] mb-0.5 ${r.autor_tipo === 'admin' ? 'text-blue-100' : 'text-gray-500'}`}>
                  {r.autor_nome || (r.autor_tipo === 'admin' ? 'CCI' : 'Cliente')} · {fmtDataHora(r.criada_em)}
                </p>
                <p className="text-[12.5px] whitespace-pre-wrap break-words">{r.texto}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-100 flex gap-2">
          <textarea value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Escreva sua mensagem..."
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onEnviar(); }}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none" />
          <button onClick={onEnviar} disabled={enviando || !texto.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 self-stretch text-xs font-semibold text-white">
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wizard de recorrência: 2 passos ────────────────────────
// Step 1 (sempre visível): escolha do tipo via cards
// Step 2 (só se tipo precisa de detalhe): dias da semana OU intervalo
function WizardRecorrencia({ tipo, setTipo, dias, toggleDia, intervalo, setIntervalo }) {
  const passo1Concluido = !!tipo;
  const precisaPasso2 = tipo === 'dias_semana' || tipo === 'intervalo';
  const passo2Concluido = tipo === 'dias_semana' ? dias.length > 0
                        : tipo === 'intervalo'   ? Number(intervalo) >= 1
                        : false;

  return (
    <div className="space-y-2">
      {/* Passo 1 — tipo */}
      <PassoBox numero={1} titulo="Escolha a frequência"
        concluido={passo1Concluido}
        resumo={passo1Concluido ? svc.RECORRENCIA_OPCOES.find(o => o.key === tipo)?.label : null}>
        <div className="grid grid-cols-2 gap-2">
          {svc.RECORRENCIA_OPCOES.map(opt => (
            <button key={opt.key} type="button"
              onClick={() => setTipo(opt.key)}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                tipo === opt.key
                  ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-100'
                  : 'border-gray-200 bg-white hover:bg-gray-50/60 hover:border-gray-300'
              }`}>
              <p className={`text-[12.5px] font-semibold ${tipo === opt.key ? 'text-blue-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{opt.hint}</p>
            </button>
          ))}
        </div>
      </PassoBox>

      {/* Passo 2 — detalhe (só pra dias_semana ou intervalo) */}
      {precisaPasso2 && (
        <PassoBox numero={2}
          titulo={tipo === 'dias_semana' ? 'Selecione os dias da semana' : 'Defina o intervalo'}
          concluido={passo2Concluido}
          resumo={
            tipo === 'dias_semana' && passo2Concluido
              ? dias.map(v => svc.DIAS_SEMANA.find(d => d.v === v)?.label).filter(Boolean).join(', ')
              : tipo === 'intervalo' && passo2Concluido
              ? `a cada ${intervalo} dia(s)`
              : null
          }>
          {tipo === 'dias_semana' && (
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Marque os dias em que a pendência deve aparecer:</p>
              <div className="flex flex-wrap gap-1.5">
                {svc.DIAS_SEMANA.map(d => (
                  <button key={d.v} type="button"
                    onClick={() => toggleDia(d.v)}
                    className={`h-9 w-12 text-[12px] font-semibold rounded-lg border transition-colors ${
                      dias.includes(d.v)
                        ? 'bg-blue-600 border-blue-700 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tipo === 'intervalo' && (
            <div>
              <p className="text-[11px] text-gray-500 mb-2">A pendência reaparece após esse número de dias da última exibição:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-gray-700 font-medium">A cada</span>
                <input type="number" min="1" max="365"
                  value={intervalo}
                  onChange={e => setIntervalo(e.target.value)}
                  className="h-10 w-24 rounded-lg border border-gray-200 px-3 text-[13px] text-center font-bold focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                <span className="text-[13px] text-gray-700 font-medium">dia(s)</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {[1, 7, 15, 30, 60, 90].map(n => (
                  <button key={n} type="button"
                    onClick={() => setIntervalo(n)}
                    className={`h-7 px-2.5 text-[11px] font-semibold rounded border transition-colors ${
                      Number(intervalo) === n
                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {n === 1 ? 'todo dia' : n === 7 ? 'semanal' : n === 15 ? 'quinzenal' : n === 30 ? 'mensal' : `${n} dias`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </PassoBox>
      )}
    </div>
  );
}

// Caixa de um passo do wizard — header com número/título/resumo + conteúdo
function PassoBox({ numero, titulo, resumo, concluido, children }) {
  return (
    <div className={`rounded-xl border ${concluido ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2.5">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 ${
          concluido ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'
        }`}>
          {concluido ? <CheckCircle2 className="h-3.5 w-3.5" /> : numero}
        </span>
        <p className="text-[12.5px] font-semibold text-gray-800 flex-1 truncate">{titulo}</p>
        {resumo && (
          <span className="text-[10.5px] text-gray-500 italic truncate max-w-[40%]" title={resumo}>
            {resumo}
          </span>
        )}
      </div>
      <div className="p-3">
        {children}
      </div>
    </div>
  );
}
