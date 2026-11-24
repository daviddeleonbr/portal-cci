// Sino de notificações reutilizável (admin e cliente).
// Mostra contador, dropdown com lista, marca como lida ao clicar, e
// permite "marcar todas como lidas". Polling a cada 60s pra refrescar.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellRing, Check, CheckCheck, Info, AlertTriangle, CircleAlert, CircleCheck, Loader2, Smartphone, X } from 'lucide-react';
import { useEhCelular } from '../../hooks/useEhCelular';
import * as notificacoesService from '../../services/notificacoesService';
import * as pushService from '../../services/pushService';

const COR_TIPO = {
  info:    { Icon: Info,         color: 'text-blue-500',    bg: 'bg-blue-50' },
  sucesso: { Icon: CircleCheck,  color: 'text-emerald-500', bg: 'bg-emerald-50' },
  aviso:   { Icon: AlertTriangle,color: 'text-amber-500',   bg: 'bg-amber-50' },
  erro:    { Icon: CircleAlert,  color: 'text-red-500',     bg: 'bg-red-50' },
};

function tempoRelativo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function NotificacoesBell({ usuarioId, tema = 'admin' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const painelRef = useRef(null); // no celular o painel vai num portal (fora de `ref`)
  // Celular: a lista abre em TELA INTEIRA (por cima da barra inferior);
  // computador: menu suspenso.
  const celular = useEhCelular();

  // Tela inteira: trava a rolagem da página por trás; Esc fecha
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    let antes;
    if (celular) { antes = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    return () => { window.removeEventListener('keydown', esc); if (celular) document.body.style.overflow = antes || ''; };
  }, [open, celular]);

  const carregarContador = useCallback(async () => {
    if (!usuarioId) return;
    try {
      const c = await notificacoesService.contarNaoLidas(usuarioId);
      setNaoLidas(c);
    } catch { /* silent */ }
  }, [usuarioId]);

  const carregarLista = useCallback(async () => {
    if (!usuarioId) return;
    setLoading(true);
    try {
      const lista = await notificacoesService.listarMinhas(usuarioId);
      setItems(lista);
      const semLer = lista.filter(n => !n.lida_em).length;
      setNaoLidas(semLer);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [usuarioId]);

  // Poll inicial + a cada 60s pro contador
  useEffect(() => {
    carregarContador();
    const t = setInterval(carregarContador, 60_000);
    return () => clearInterval(t);
  }, [carregarContador]);

  // Carrega a lista quando abre
  useEffect(() => {
    if (open) carregarLista();
  }, [open, carregarLista]);

  // Click fora pra fechar
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current?.contains(e.target) || painelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onClicarNotificacao = async (n) => {
    try {
      if (!n.lida_em) {
        await notificacoesService.marcarComoLida(n.id);
        setItems(prev => prev.map(x => x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x));
        setNaoLidas(c => Math.max(0, c - 1));
      }
    } catch { /* silent */ }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const marcarTodas = async () => {
    if (!usuarioId || naoLidas === 0) return;
    try {
      await notificacoesService.marcarTodasComoLidas(usuarioId);
      const agora = new Date().toISOString();
      setItems(prev => prev.map(x => x.lida_em ? x : { ...x, lida_em: agora }));
      setNaoLidas(0);
    } catch { /* silent */ }
  };

  const corHover = tema === 'cliente' ? 'hover:text-blue-600' : 'hover:text-blue-600';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        title="Notificações"
        className={`relative rounded p-2 text-gray-500 ${corHover} hover:bg-gray-100 transition-colors`}>
        <Bell className="h-5 w-5" />
        {naoLidas > 0 && (
          <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {/* No celular, portal no <body>: o header (sticky z-30) prenderia a camada
          e a barra inferior (z-45) ficaria por cima da tela inteira. */}
      {(() => { const painel = (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={painelRef}
            role={celular ? 'dialog' : undefined} aria-modal={celular ? 'true' : undefined} aria-label="Notificações"
            initial={celular ? { opacity: 0, y: 24 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={celular ? { opacity: 0, y: 24 } : { opacity: 0, y: -6 }}
            transition={{ duration: celular ? 0.2 : 0.15 }}
            className={celular
              ? 'fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)]'
              : 'absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] bg-white rounded-xl border border-gray-200/70 shadow-xl z-50 overflow-hidden'}
          >
            {/* Header */}
            <div className={`flex items-center justify-between gap-2 border-b border-gray-100 ${celular ? 'shrink-0 px-4 h-16' : 'px-4 py-3'}`}>
              <div className="min-w-0">
                <p className={`font-semibold text-gray-900 ${celular ? 'text-lg' : 'text-[13px]'}`}>Notificações</p>
                <p className={`text-gray-400 ${celular ? 'text-xs' : 'text-[10.5px]'}`}>
                  {naoLidas > 0 ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Tudo em dia'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {naoLidas > 0 && (
                  <button onClick={marcarTodas}
                    className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium ${celular ? 'h-10 px-2 text-sm' : 'text-[11px]'}`}>
                    <CheckCheck className={celular ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                    Marcar todas
                  </button>
                )}
                {celular && (
                  <button onClick={() => setOpen(false)} aria-label="Fechar notificações"
                    className="h-10 w-10 -mr-2 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista */}
            <div className={celular ? 'flex-1 overflow-y-auto overscroll-contain' : 'max-h-[420px] overflow-y-auto'}>
              {loading && items.length === 0 ? (
                <div className="py-10 flex items-center justify-center text-gray-400 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Carregando...</span>
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-[12.5px] text-gray-500">Nenhuma notificação por enquanto.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {items.map(n => {
                    const cor = COR_TIPO[n.tipo] || COR_TIPO.info;
                    const Icone = cor.Icon;
                    const naoLida = !n.lida_em;
                    return (
                      <li key={n.id}>
                        <button onClick={() => onClicarNotificacao(n)}
                          className={`w-full flex items-start gap-3 px-4 ${celular ? 'py-4' : 'py-3'} text-left hover:bg-gray-50 transition-colors ${
                            naoLida ? 'bg-blue-50/30' : ''
                          }`}>
                          <div className={`rounded-lg ${cor.bg} p-1.5 flex-shrink-0 mt-0.5`}>
                            <Icone className={`h-3.5 w-3.5 ${cor.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className={`${celular ? 'text-sm' : 'text-[12.5px] truncate'} ${naoLida ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {n.titulo}
                              </p>
                              <span className={`ml-auto text-gray-400 flex-shrink-0 ${celular ? 'text-xs' : 'text-[10px]'}`}>{tempoRelativo(n.created_at)}</span>
                            </div>
                            {n.mensagem && (
                              <p className={`text-gray-600 mt-0.5 ${celular ? 'text-[13px] leading-snug line-clamp-4' : 'text-[11.5px] line-clamp-2'}`}>{n.mensagem}</p>
                            )}
                          </div>
                          {naoLida && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Push neste aparelho (no celular, acima da barra de gestos) */}
            <div className={celular ? 'shrink-0 pb-[env(safe-area-inset-bottom)] bg-gray-50/70' : ''}>
              <PushAparelho usuarioId={usuarioId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      ); return celular && typeof document !== 'undefined' ? createPortal(painel, document.body) : painel; })()}
    </div>
  );
}

// Rodapé do sino: liga/desliga o push NESTE dispositivo (celular ou computador).
// Sempre aparece — quando não dá pra ativar, explica o motivo.
function PushAparelho({ usuarioId }) {
  const [st, setSt] = useState('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    pushService.estado(usuarioId).then(e => { if (vivo) setSt(e); }).catch(() => { if (vivo) setSt('indisponivel'); });
    return () => { vivo = false; };
  }, [usuarioId]);

  const alternar = async () => {
    setOcupado(true); setErro(null);
    try {
      if (st === 'ativo') { await pushService.desativar(usuarioId); setSt('inativo'); }
      else { await pushService.ativar(usuarioId); setSt('ativo'); }
    } catch (e) {
      setErro(e.message || 'Não foi possível ativar.');
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setSt('negado');
    } finally { setOcupado(false); }
  };

  const aviso = (Icone, cor, texto) => (
    <p className="flex items-start gap-2 text-[11.5px] text-gray-600">
      <Icone className={`h-4 w-4 mt-0.5 shrink-0 ${cor}`} />
      <span>{texto}</span>
    </p>
  );
  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-3">
      {st === 'carregando' ? (
        aviso(Loader2, 'text-gray-400 animate-spin', 'Verificando notificações neste dispositivo…')
      ) : st === 'indisponivel' ? (
        aviso(BellRing, 'text-gray-400', 'Este navegador não recebe notificações. Use o Chrome, o Edge ou o app instalado.')
      ) : st === 'sem_sw' ? (
        aviso(BellRing, 'text-gray-400', <>Notificações ainda não disponíveis aqui. Se apareceu o aviso de <strong>nova versão</strong>, atualize o app; senão, recarregue a página. (No ambiente de desenvolvimento elas não funcionam.)</>)
      ) : st === 'precisa_instalar' ? (
        <p className="flex items-start gap-2 text-[11.5px] text-gray-600">
          <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-gray-500" />
          <span>Para receber no iPhone, instale o app: toque em <strong>Compartilhar</strong> e em <strong>Adicionar à Tela de Início</strong>, e abra por lá.</span>
        </p>
      ) : st === 'negado' ? (
        <p className="flex items-start gap-2 text-[11.5px] text-gray-600">
          <BellRing className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <span>As notificações estão bloqueadas para o portal. Libere nas configurações do navegador ou do celular.</span>
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <BellRing className={`h-4 w-4 shrink-0 ${st === 'ativo' ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-gray-900">Receber neste dispositivo</p>
            <p className="text-[10.5px] text-gray-500">{st === 'ativo' ? 'Ativo neste dispositivo' : 'Avisos do BPO mesmo com o portal fechado'}</p>
          </div>
          <button type="button" role="switch" aria-checked={st === 'ativo'} onClick={alternar} disabled={ocupado}
            aria-label="Receber notificações neste dispositivo"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${st === 'ativo' ? 'bg-blue-600' : 'bg-gray-300'}`}>
            {ocupado
              ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
              : <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${st === 'ativo' ? 'translate-x-5' : 'translate-x-0.5'}`} />}
          </button>
        </div>
      )}
      {erro && <p className="mt-2 text-[11px] text-red-600">{erro}</p>}
    </div>
  );
}
