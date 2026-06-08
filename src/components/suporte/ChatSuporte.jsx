// Chat de Suporte CCI — componente compartilhado entre cliente e admin.
//
// Layout em 2 colunas (lista | chat). Tudo via Supabase Realtime —
// novas mensagens / status / atribuição refletem em tempo real nos
// dois lados sem polling.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Plus, Search, Send, Paperclip, Loader2, X,
  AlertCircle, ChevronLeft, CheckCircle2, RotateCcw, MoreVertical,
  Download, FileText, Image as ImageIcon, AlertTriangle, Circle,
  PencilLine,
} from 'lucide-react';
import * as suporte from '../../services/suporteService';

const STATUS_COR = {
  aberta:              { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  em_andamento:        { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  aguardando_cliente:  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  resolvida:           { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  fechada:             { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400' },
};
const PRIORIDADE_COR = {
  normal:  { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400' },
  alta:    { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  urgente: { bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500' },
};
const CATEGORIA_LABEL = Object.fromEntries(suporte.CATEGORIAS.map(c => [c.key, c.label]));

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dz = new Date(d); dz.setHours(0, 0, 0, 0);
  const diff = (hoje - dz) / 86400000;
  if (diff === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'ontem';
  if (diff < 7)   return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function fmtDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function ehImagem(mime) {
  return String(mime || '').startsWith('image/');
}
function fmtBytes(b) {
  const n = Number(b);
  if (!n) return '';
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function iniciais(nome) {
  if (!nome) return '?';
  return String(nome).trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

export default function ChatSuporte({ modo, usuarioId, usuarioNome, contexto = {} }) {
  const isAdmin = modo === 'admin';
  const [conversas, setConversas] = useState([]);
  const [conversaSelId, setConversaSelId] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [loadingLista, setLoadingLista] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState(null);
  const [modalNova, setModalNova] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const conversaSel = conversas.find(c => c.id === conversaSelId);

  // ─── Carregar lista ─────────────────────────────────────
  const carregarLista = useCallback(async () => {
    setLoadingLista(true); setError(null);
    try {
      const lista = isAdmin
        ? await suporte.listarConversasAdmin({})
        : await suporte.listarConversasCliente(usuarioId);
      setConversas(lista);
    } catch (err) { setError(err.message); }
    finally { setLoadingLista(false); }
  }, [isAdmin, usuarioId]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  // Realtime na LISTA — sempre que algo muda em conversas/mensagens,
  // recarrega a sidebar (cheap, é uma query simples).
  useEffect(() => {
    const ch = suporte.escutarLista({
      usuarioClienteId: isAdmin ? null : usuarioId,
      onChange: () => carregarLista(),
    });
    return () => suporte.desescutar(ch);
  }, [isAdmin, usuarioId, carregarLista]);

  // ─── Carregar mensagens da conversa ativa ────────────────
  const carregarMensagens = useCallback(async (cid) => {
    if (!cid) { setMensagens([]); return; }
    setLoadingMsgs(true); setError(null);
    try {
      const msgs = await suporte.listarMensagens(cid);
      setMensagens(msgs);
      await suporte.marcarComoLido({ conversaId: cid, lado: isAdmin ? 'admin' : 'cliente' });
    } catch (err) { setError(err.message); }
    finally { setLoadingMsgs(false); }
  }, [isAdmin]);

  useEffect(() => { carregarMensagens(conversaSelId); }, [conversaSelId, carregarMensagens]);

  // Realtime na CONVERSA ATIVA: nova mensagem appenda, updates da conversa
  // refletem (status, prioridade etc).
  useEffect(() => {
    if (!conversaSelId) return;
    const ch = suporte.escutarConversa({
      conversaId: conversaSelId,
      onMensagem: (msg) => {
        setMensagens(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // Marca como lida no lado oposto ao autor
        if (msg.autor_tipo !== (isAdmin ? 'admin' : 'cliente')) {
          suporte.marcarComoLido({ conversaId: conversaSelId, lado: isAdmin ? 'admin' : 'cliente' });
        }
      },
      onMensagemAtualizada: (msgPayload) => {
        // Realtime traz só os campos da tabela (sem o join). Mescla com
        // o que já tinhamos pra preservar `autor`.
        setMensagens(prev => prev.map(m => m.id === msgPayload.id ? { ...m, ...msgPayload } : m));
      },
      onConversa: (conv) => {
        setConversas(prev => prev.map(c => c.id === conv.id ? { ...c, ...conv } : c));
      },
    });
    return () => suporte.desescutar(ch);
  }, [conversaSelId, isAdmin]);

  // ─── Filtragem da lista ──────────────────────────────────
  const conversasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter(c => {
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
      if (!q) return true;
      return (
        (c.assunto || '').toLowerCase().includes(q) ||
        (c.usuario?.nome || '').toLowerCase().includes(q) ||
        (c.cliente?.nome || '').toLowerCase().includes(q)
      );
    });
  }, [conversas, busca, filtroStatus]);

  const naoLidasTotal = conversas.reduce((s, c) =>
    s + (isAdmin ? c.nao_lidas_admin : c.nao_lidas_cliente), 0);

  const abrirConversa = (id) => {
    setConversaSelId(id);
    setMobileShowChat(true);
  };
  const voltarLista = () => setMobileShowChat(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden flex flex-col lg:flex-row
      h-[calc(100dvh-120px)] sm:h-[calc(100dvh-130px)] lg:h-[calc(100dvh-140px)] min-h-[480px]">

      {/* ────── LISTA LATERAL ────── */}
      <aside className={`${mobileShowChat ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-80 lg:border-r border-gray-200/70`}>
        {/* Header da lista */}
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{isAdmin ? 'Conversas' : 'Suas conversas'}</h3>
            {naoLidasTotal > 0 && (
              <span className="text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                {naoLidasTotal} nova{naoLidasTotal === 1 ? '' : 's'}
              </span>
            )}
            {!isAdmin && (
              <button onClick={() => setModalNova(true)}
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm">
                <Plus className="h-3 w-3" /> Nova
              </button>
            )}
          </div>
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..." className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
          </div>
          {/* Filtro de status (chips compactos) */}
          <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
            {[
              { k: 'todos', label: 'Todas' },
              { k: 'aberta', label: 'Abertas' },
              { k: 'em_andamento', label: 'Em andamento' },
              { k: 'resolvida', label: 'Resolvidas' },
            ].map(f => (
              <button key={f.k} onClick={() => setFiltroStatus(f.k)}
                className={`text-[10.5px] font-medium px-2 py-1 rounded-md whitespace-nowrap ${
                  filtroStatus === f.k ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingLista ? (
            <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-blue-500 mx-auto" /></div>
          ) : conversasFiltradas.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">
                {conversas.length === 0
                  ? (isAdmin ? 'Nenhuma conversa por aqui ainda.' : 'Inicie uma conversa para começar.')
                  : 'Nada corresponde ao filtro.'}
              </p>
            </div>
          ) : conversasFiltradas.map(c => {
            const ativa = conversaSelId === c.id;
            const naoLidas = isAdmin ? c.nao_lidas_admin : c.nao_lidas_cliente;
            const statusInfo = STATUS_COR[c.status] || STATUS_COR.aberta;
            return (
              <button key={c.id} onClick={() => abrirConversa(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors ${
                  ativa ? 'bg-blue-50' : 'hover:bg-gray-50/60'
                }`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${statusInfo.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <p className={`text-[12.5px] font-semibold truncate ${ativa ? 'text-blue-900' : 'text-gray-900'}`}>
                        {c.assunto}
                      </p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtData(c.ultima_mensagem_em)}</span>
                    </div>
                    <p className="text-[10.5px] text-gray-500 truncate">
                      {isAdmin
                        ? `${c.usuario?.nome || '—'} · ${c.as_rede?.nome || c.chaves_api?.nome || '—'}`
                        : CATEGORIA_LABEL[c.categoria] || 'Geral'}
                    </p>
                    {isAdmin && c.admin_atribuido_id && (
                      <p className={`text-[10px] truncate mt-0.5 ${
                        c.admin_atribuido_id === usuarioId ? 'text-emerald-700' : 'text-rose-600'
                      }`}>
                        {c.admin_atribuido_id === usuarioId
                          ? '✓ Você atende'
                          : `🔒 ${c.admin?.nome || 'outro admin'}`}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusInfo.bg} ${statusInfo.text}`}>
                        {suporte.STATUS.find(s => s.key === c.status)?.label}
                      </span>
                      {c.prioridade !== 'normal' && (
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORIDADE_COR[c.prioridade]?.bg} ${PRIORIDADE_COR[c.prioridade]?.text}`}>
                          {c.prioridade}
                        </span>
                      )}
                      {naoLidas > 0 && (
                        <span className="ml-auto text-[9.5px] font-bold bg-rose-500 text-white min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                          {naoLidas}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ────── CHAT PRINCIPAL ────── */}
      <main className={`${mobileShowChat ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-w-0`}>
        {!conversaSel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
              <MessageCircle className="h-7 w-7 text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Selecione uma conversa</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              {isAdmin
                ? 'Escolha um chamado na lista para responder.'
                : 'Abra uma conversa na lista ao lado ou clique em "Nova" para começar.'}
            </p>
          </div>
        ) : (
          <ChatAtivo
            conversa={conversaSel}
            mensagens={mensagens}
            loadingMsgs={loadingMsgs}
            isAdmin={isAdmin}
            usuarioId={usuarioId}
            usuarioNome={usuarioNome}
            onVoltarMobile={voltarLista}
            onAcaoAdmin={async () => { await carregarLista(); }}
          />
        )}
      </main>

      {/* Modal nova conversa (somente cliente) */}
      {!isAdmin && modalNova && (
        <ModalNovaConversa
          onClose={() => setModalNova(false)}
          usuarioId={usuarioId}
          contexto={contexto}
          onCriada={async (conv) => {
            setModalNova(false);
            await carregarLista();
            abrirConversa(conv.id);
          }}
        />
      )}

      {error && (
        <div className="absolute bottom-3 right-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-center gap-2 shadow-md max-w-xs">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><X className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  );
}

// ─── Chat ativo (mensagens + composer) ────────────────────
function ChatAtivo({ conversa, mensagens, loadingMsgs, isAdmin, usuarioId, usuarioNome, onVoltarMobile, onAcaoAdmin }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const scrollRef = useRef(null);

  // Scroll automático no final ao chegar mensagem nova
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens.length]);

  const statusInfo = STATUS_COR[conversa.status] || STATUS_COR.aberta;
  const conversaTerminada = ['resolvida', 'fechada'].includes(conversa.status);

  const enviar = async () => {
    if (!texto.trim() && !arquivo) return;
    setEnviando(true); setErroEnvio(null);
    try {
      await suporte.enviarMensagem({
        conversaId: conversa.id, autorId: usuarioId,
        autorTipo: isAdmin ? 'admin' : 'cliente',
        texto, arquivo,
      });
      setTexto(''); setArquivo(null);
    } catch (err) { setErroEnvio(err.message); }
    finally { setEnviando(false); }
  };

  const acaoStatus = async (novoStatus) => {
    if (!isAdmin) return;
    setShowMenu(false);
    try {
      await suporte.alterarStatus({ conversaId: conversa.id, novoStatus, adminId: usuarioId, adminNome: usuarioNome });
      onAcaoAdmin?.();
    } catch (err) { setErroEnvio(err.message); }
  };
  const acaoPrioridade = async (p) => {
    if (!isAdmin) return;
    setShowMenu(false);
    try {
      await suporte.alterarPrioridade({ conversaId: conversa.id, prioridade: p, adminId: usuarioId });
      onAcaoAdmin?.();
    } catch (err) { setErroEnvio(err.message); }
  };

  // Conversa "travada" por outro admin (este lado não pode mais responder).
  const atribuidaAOutroAdmin = isAdmin
    && conversa.admin_atribuido_id
    && conversa.admin_atribuido_id !== usuarioId;
  const bloqueado = atribuidaAOutroAdmin;
  const nomeAdminAtribuido = conversa.admin?.nome
    || conversa.usuario_admin?.nome
    || 'outro admin';

  return (
    <>
      {/* Header da conversa */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-white">
        <button onClick={onVoltarMobile} className="lg:hidden p-1 rounded hover:bg-gray-100">
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{conversa.assunto}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusInfo.bg} ${statusInfo.text}`}>
              {suporte.STATUS.find(s => s.key === conversa.status)?.label}
            </span>
            <span className="text-[10.5px] text-gray-500">{CATEGORIA_LABEL[conversa.categoria]}</span>
            {conversa.prioridade !== 'normal' && (
              <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORIDADE_COR[conversa.prioridade]?.bg} ${PRIORIDADE_COR[conversa.prioridade]?.text}`}>
                {conversa.prioridade}
              </span>
            )}
            {isAdmin && conversa.usuario && (
              <span className="text-[10.5px] text-gray-500 truncate">· {conversa.usuario.nome}</span>
            )}
          </div>
        </div>
        {isAdmin && conversa.admin_atribuido_id && (
          <span className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap ${
            atribuidaAOutroAdmin
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`} title={atribuidaAOutroAdmin
            ? `Em atendimento por ${nomeAdminAtribuido}`
            : 'Você está atendendo este chamado'}>
            {atribuidaAOutroAdmin ? `Atendido por ${nomeAdminAtribuido}` : 'Você atende'}
          </span>
        )}
        {isAdmin && !bloqueado && (
          <div className="relative">
            <button onClick={() => setShowMenu(s => !s)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                <p className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
                {suporte.STATUS.filter(s => s.key !== 'fechada').map(s => (
                  <button key={s.key} onClick={() => acaoStatus(s.key)}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COR[s.key]?.dot}`} />
                    {s.label}
                  </button>
                ))}
                <div className="border-t border-gray-100 my-1" />
                <p className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">Prioridade</p>
                {suporte.PRIORIDADES.map(p => (
                  <button key={p.key} onClick={() => acaoPrioridade(p.key)}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${PRIORIDADE_COR[p.key]?.dot}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50/40 px-3 sm:px-4 py-3 space-y-2">
        {loadingMsgs ? (
          <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin text-blue-500 mx-auto" /></div>
        ) : mensagens.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">Sem mensagens ainda.</p>
        ) : mensagens.map((m, i) => (
          <Mensagem key={m.id} msg={m}
            isAdmin={isAdmin}
            usuarioId={usuarioId}
            anterior={mensagens[i - 1]}
            onEdicaoErro={(err) => setErroEnvio(err)}
          />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-100 bg-white p-3">
        {bloqueado && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11.5px] text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>
              Este atendimento já está sendo conduzido por <strong>{nomeAdminAtribuido}</strong>.
              Apenas ele pode responder ou alterar o status. Você pode acompanhar a conversa, mas não pode interagir.
            </span>
          </div>
        )}
        {conversaTerminada && !isAdmin && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11.5px] text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>Esta conversa foi marcada como resolvida. Responda abaixo para reabri-la.</span>
          </div>
        )}
        {erroEnvio && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-800 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{erroEnvio}</span>
          </div>
        )}
        {arquivo && (
          <div className="mb-2 inline-flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-[11.5px] text-blue-800">
            <Paperclip className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{arquivo.name}</span>
            <span className="text-blue-500">{fmtBytes(arquivo.size)}</span>
            <button onClick={() => setArquivo(null)} className="text-blue-600 hover:text-blue-800"><X className="h-3 w-3" /></button>
          </div>
        )}
        {!bloqueado && (
          <div className="flex items-end gap-2">
            <label className="cursor-pointer p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50">
              <Paperclip className="h-4 w-4" />
              <input type="file" className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 10 * 1024 * 1024) { setErroEnvio('Arquivo maior que 10 MB'); return; }
                  setArquivo(f); setErroEnvio(null);
                }} />
            </label>
            <textarea value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
              }}
              placeholder="Escreva sua mensagem... (Shift+Enter para nova linha)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 max-h-32" />
            <button onClick={enviar} disabled={enviando || (!texto.trim() && !arquivo)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold text-white">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Bubble de mensagem ───────────────────────────────────
function Mensagem({ msg, isAdmin, usuarioId, anterior, onEdicaoErro }) {
  const ehMeuLado = (isAdmin && msg.autor_tipo === 'admin') || (!isAdmin && msg.autor_tipo === 'cliente');
  const ehMeuAutor = msg.autor_id === usuarioId;
  const ehSistema = msg.autor_tipo === 'sistema';
  const mostraAvatar = !anterior || anterior.autor_tipo !== msg.autor_tipo;
  const [urlArquivo, setUrlArquivo] = useState(null);

  // Edição inline — só pra mensagens próprias, com texto, dentro da janela.
  const [editando, setEditando]   = useState(false);
  const [draft, setDraft]         = useState(msg.texto || '');
  const [salvando, setSalvando]   = useState(false);
  const [agora, setAgora]         = useState(() => Date.now());
  useEffect(() => {
    if (!editando) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [editando]);
  const idadeSeg = (agora - new Date(msg.created_at).getTime()) / 1000;
  const segRestantes = Math.max(0, Math.floor(suporte.JANELA_EDICAO_SEG - idadeSeg));
  const podeEditar = ehMeuAutor && !ehSistema && msg.texto && idadeSeg <= suporte.JANELA_EDICAO_SEG;

  useEffect(() => {
    let cancelado = false;
    if (msg.arquivo_path) {
      suporte.urlAssinada(msg.arquivo_path).then(u => { if (!cancelado) setUrlArquivo(u); }).catch(() => {});
    }
    return () => { cancelado = true; };
  }, [msg.arquivo_path]);

  const salvarEdicao = async () => {
    const txt = draft.trim();
    if (!txt || txt === msg.texto) { setEditando(false); return; }
    setSalvando(true);
    try {
      await suporte.editarMensagem({ mensagemId: msg.id, autorId: usuarioId, novoTexto: txt });
      setEditando(false);
      // O realtime UPDATE vai refletir o novo texto em tela.
    } catch (err) {
      onEdicaoErro?.(err.message);
    } finally { setSalvando(false); }
  };
  const cancelarEdicao = () => { setDraft(msg.texto || ''); setEditando(false); };

  if (ehSistema) {
    return (
      <div className="flex justify-center">
        <div className="text-[10.5px] text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1 flex items-center gap-1.5">
          <AlertTriangle className="h-2.5 w-2.5 text-gray-400" />
          <span>{msg.texto}</span>
          <span className="text-gray-300">·</span>
          <span>{fmtDataHora(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  const corBubble = ehMeuLado
    ? 'bg-blue-600 text-white rounded-br-sm'
    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm';
  const corMeta = ehMeuLado ? 'text-blue-100' : 'text-gray-400';

  return (
    <div className={`group flex gap-2 ${ehMeuLado ? 'justify-end' : 'justify-start'}`}>
      {!ehMeuLado && mostraAvatar && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {iniciais(msg.autor?.nome)}
        </div>
      )}
      {!ehMeuLado && !mostraAvatar && <div className="w-7 flex-shrink-0" />}
      <div className={`max-w-[78%] sm:max-w-[68%] flex flex-col ${ehMeuLado ? 'items-end' : 'items-start'}`}>
        {!ehMeuLado && mostraAvatar && (
          <p className="text-[10px] font-semibold text-gray-500 mb-0.5 px-1">{msg.autor?.nome}</p>
        )}
        <div className={`relative px-3 py-2 rounded-2xl shadow-sm ${corBubble}`}>
          {msg.arquivo_path && (
            <ArquivoBubble msg={msg} url={urlArquivo} ehMeuLado={ehMeuLado} />
          )}
          {editando ? (
            <div className="min-w-[220px]">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarEdicao(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelarEdicao(); }
                }}
                rows={Math.min(6, Math.max(2, (draft.match(/\n/g) || []).length + 1))}
                className="w-full resize-none rounded-lg text-[13px] leading-snug px-2 py-1.5 bg-white/10 text-white placeholder:text-blue-100/70 focus:outline-none focus:ring-2 focus:ring-white/40" />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[9.5px] text-blue-100">
                  {segRestantes > 0 ? `${segRestantes}s restantes · Esc cancela · Enter salva` : 'Tempo esgotado'}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={cancelarEdicao} className="px-2 py-0.5 text-[10.5px] rounded text-blue-100 hover:bg-white/10">
                    Cancelar
                  </button>
                  <button onClick={salvarEdicao} disabled={salvando || !draft.trim() || segRestantes === 0}
                    className="px-2 py-0.5 text-[10.5px] font-semibold rounded bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                    {salvando ? '…' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            msg.texto && (
              <p className="text-[13px] leading-snug whitespace-pre-wrap break-words">{msg.texto}</p>
            )
          )}
          <p className={`text-[9.5px] mt-1 ${corMeta} flex items-center gap-1`}>
            <span>{fmtDataHora(msg.created_at)}</span>
            {msg.editada_em && (
              <span title={`Editada em ${fmtDataHora(msg.editada_em)}`} className="italic">
                · editada
              </span>
            )}
            {ehMeuLado && msg.lida_em && <span>· lida</span>}
          </p>

          {/* Botão de editar — só aparece no hover, no canto, na minha mensagem,
              enquanto a janela de 5 min não estoura. */}
          {podeEditar && !editando && (
            <button onClick={() => { setDraft(msg.texto || ''); setEditando(true); }}
              title="Editar mensagem"
              className={`absolute -top-2 ${ehMeuLado ? '-left-2' : '-right-2'}
                opacity-0 group-hover:opacity-100 transition-opacity
                h-6 w-6 rounded-full bg-white shadow-md border border-gray-200
                text-gray-500 hover:text-blue-600 flex items-center justify-center`}>
              <PencilLine className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArquivoBubble({ msg, url, ehMeuLado }) {
  const ehImg = ehImagem(msg.arquivo_tipo);
  const cor = ehMeuLado ? 'text-white/90' : 'text-gray-700';
  if (ehImg && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1.5">
        <img src={url} alt={msg.arquivo_nome}
          className="max-h-60 rounded-lg border border-white/20" />
      </a>
    );
  }
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer"
      className={`mb-1.5 flex items-center gap-2 px-2.5 py-2 rounded-lg ${ehMeuLado ? 'bg-blue-500/30 hover:bg-blue-500/40' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}>
      {ehImg ? <ImageIcon className={`h-4 w-4 ${cor}`} /> : <FileText className={`h-4 w-4 ${cor}`} />}
      <div className="min-w-0 flex-1">
        <p className={`text-[11.5px] font-medium truncate ${cor}`}>{msg.arquivo_nome}</p>
        <p className={`text-[10px] ${ehMeuLado ? 'text-white/60' : 'text-gray-500'}`}>{fmtBytes(msg.arquivo_tamanho)}</p>
      </div>
      <Download className={`h-3.5 w-3.5 ${cor} flex-shrink-0`} />
    </a>
  );
}

// ─── Modal "Nova conversa" (cliente) ──────────────────────
function ModalNovaConversa({ onClose, usuarioId, contexto, onCriada }) {
  const [assunto, setAssunto] = useState('');
  const [categoria, setCategoria] = useState('geral');
  const [prioridade, setPrioridade] = useState('normal');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    setErro(null); setSalvando(true);
    try {
      const c = await suporte.criarConversa({
        usuarioClienteId: usuarioId,
        asRedeId:   contexto.asRedeId,
        chaveApiId: contexto.chaveApiId,
        clienteId:  contexto.clienteId,
        assunto, categoria, prioridade,
        textoInicial: texto,
      });
      onCriada?.(c);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Nova conversa</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Assunto</label>
              <input type="text" value={assunto} onChange={e => setAssunto(e.target.value)}
                placeholder="Ex: Dúvida sobre conciliação de fevereiro"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Categoria</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {suporte.CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Prioridade</label>
                <select value={prioridade} onChange={e => setPrioridade(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  {suporte.PRIORIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Mensagem</label>
              <textarea value={texto} onChange={e => setTexto(e.target.value)}
                rows={5} placeholder="Descreva sua dúvida ou solicitação..."
                className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none" />
            </div>
            {erro && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={submit} disabled={salvando || !assunto.trim() || !texto.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
