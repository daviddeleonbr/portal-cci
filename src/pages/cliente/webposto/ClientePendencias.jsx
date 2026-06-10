// Página cliente: lista de pendências CCI → cliente.
// Mostra todas as pendências ativas (abertas, dentro da janela de tempo).
// Cliente pode responder em cada uma. Histórico fica visível.

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, AlertCircle, AlertTriangle, MessageSquare, Send,
  ChevronDown, ChevronRight, CheckCircle2, Calendar,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import { useClienteSession } from '../../../hooks/useAuth';
import * as svc from '../../../services/pendenciasService';

const COR_PRIO = {
  alta:  { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    chip: 'bg-rose-500'    },
  media: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   chip: 'bg-amber-500'   },
  baixa: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', chip: 'bg-emerald-500' },
};
const PRIO_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

function fmtDataHora(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

export default function ClientePendencias() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const chaveApiId = session?.chaveApi?.id;
  const usuarioCliente = session?.usuario;
  // TODAS as empresas vinculadas ao usuário cliente — pendências
  // direcionadas a qualquer uma delas devem aparecer.
  const clientesIds = (session?.clientesRede || []).map(c => c.id);

  const [pendencias, setPendencias] = useState([]);
  const [respostasPorPend, setRespostasPorPend] = useState({}); // pendId → array
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [textosResposta, setTextosResposta] = useState({}); // pendId → string
  const [enviando, setEnviando] = useState(null);

  const carregar = async () => {
    if (clientesIds.length === 0 && !chaveApiId) return;
    setLoading(true); setErro(null);
    try {
      const lista = await svc.pendenciasAtivasParaCliente({
        clientesIds, chaveApiId,
      });
      setPendencias(lista);
      // Pré-carrega respostas pra contar/listar
      const respostas = {};
      await Promise.all(lista.map(async p => {
        try { respostas[p.id] = await svc.listarRespostas(p.id); }
        catch { respostas[p.id] = []; }
      }));
      setRespostasPorPend(respostas);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cliente?.id, chaveApiId]);

  const contadores = useMemo(() => ({
    total: pendencias.length,
    alta:  pendencias.filter(p => p.prioridade === 'alta').length,
    media: pendencias.filter(p => p.prioridade === 'media').length,
    baixa: pendencias.filter(p => p.prioridade === 'baixa').length,
  }), [pendencias]);

  const toggle = (id) => setExpandidas(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const enviarResposta = async (pendencia) => {
    const texto = (textosResposta[pendencia.id] || '').trim();
    if (!texto) return;
    setEnviando(pendencia.id);
    try {
      await svc.adicionarResposta({
        pendenciaId: pendencia.id,
        autorTipo: 'cliente',
        autorId: usuarioCliente?.id,
        autorNome: usuarioCliente?.nome,
        texto,
      });
      const rs = await svc.listarRespostas(pendencia.id);
      setRespostasPorPend(prev => ({ ...prev, [pendencia.id]: rs }));
      setTextosResposta(prev => ({ ...prev, [pendencia.id]: '' }));
      setToast({ tipo: 'success', mensagem: 'Resposta enviada' });
    } catch (err) { setToast({ tipo: 'error', mensagem: err.message }); }
    finally { setEnviando(null); }
  };

  return (
    <div>
      <PageHeader title="Pendências" description="Assuntos que precisam da sua atenção" />

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiPrio cor="gray"    label="Total"  valor={contadores.total} />
        <KpiPrio cor="rose"    label="Alta"   valor={contadores.alta}  />
        <KpiPrio cor="amber"   label="Média"  valor={contadores.media} />
        <KpiPrio cor="emerald" label="Baixa"  valor={contadores.baixa} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm">Carregando pendências...</span>
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      ) : pendencias.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">Nenhuma pendência ativa</p>
          <p className="text-xs text-gray-500 mt-1">Tudo certo por aqui. A CCI te avisa por aqui quando houver algo novo.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pendencias.map(p => {
            const cor = COR_PRIO[p.prioridade] || COR_PRIO.media;
            const expandida = expandidas.has(p.id);
            const respostas = respostasPorPend[p.id] || [];
            return (
              <div key={p.id} className={`bg-white rounded-2xl border ${cor.border} overflow-hidden`}>
                <button onClick={() => toggle(p.id)}
                  className="w-full p-4 text-left flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                  <span className={`h-2 w-2 rounded-full ${cor.chip} flex-shrink-0 mt-2`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="text-[13.5px] font-bold text-gray-900 flex-1 min-w-0">{p.titulo}</h3>
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${cor.bg} ${cor.text} flex-shrink-0`}>
                        {PRIO_LABEL[p.prioridade]}
                      </span>
                    </div>
                    {p.descricao && (
                      <p className={`text-[12.5px] text-gray-600 mt-1 whitespace-pre-wrap ${expandida ? '' : 'line-clamp-2'}`}>
                        {p.descricao}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-[10.5px] text-gray-500 mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-1" title="Criada em">
                        <Calendar className="h-3 w-3" />
                        criada {fmtDataHora(p.criada_em)}
                      </span>
                      {p.mostrar_ate && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            ⏳ resolver até {fmtDataHora(p.mostrar_ate)}
                          </span>
                        </>
                      )}
                      {respostas.length > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {respostas.length} mensagem(s)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-400 flex-shrink-0 mt-1">
                    {expandida ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                </button>

                {expandida && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    {respostas.length > 0 && (
                      <div className="p-4 space-y-2.5 max-h-80 overflow-y-auto">
                        {respostas.map(r => (
                          <div key={r.id} className={`flex ${r.autor_tipo === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                              r.autor_tipo === 'cliente'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-800'
                            }`}>
                              <p className={`text-[10px] mb-0.5 ${r.autor_tipo === 'cliente' ? 'text-blue-100' : 'text-gray-500'}`}>
                                {r.autor_nome || (r.autor_tipo === 'cliente' ? 'Você' : 'CCI')} · {fmtDataHora(r.criada_em)}
                              </p>
                              <p className="text-[12.5px] whitespace-pre-wrap break-words">{r.texto}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-3 border-t border-gray-100 flex gap-2">
                      <textarea
                        value={textosResposta[p.id] || ''}
                        onChange={e => setTextosResposta(prev => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="Sua resposta..."
                        rows={2}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarResposta(p); }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none" />
                      <button onClick={() => enviarResposta(p)}
                        disabled={enviando === p.id || !(textosResposta[p.id] || '').trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 self-stretch text-xs font-semibold text-white">
                        {enviando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} onClose={() => setToast(null)} />}
    </div>
  );
}

function KpiPrio({ cor, label, valor }) {
  const cores = {
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700'    },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700'   },
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
