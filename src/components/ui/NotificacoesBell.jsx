// Sino de notificações reutilizável (admin e cliente).
// Mostra contador, dropdown com lista, marca como lida ao clicar, e
// permite "marcar todas como lidas". Polling a cada 60s pra refrescar.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, CheckCheck, Info, AlertTriangle, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import * as notificacoesService from '../../services/notificacoesService';

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
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-xl border border-gray-200/70 shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Notificações</p>
                <p className="text-[10.5px] text-gray-400">
                  {naoLidas > 0 ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Tudo em dia'}
                </p>
              </div>
              {naoLidas > 0 && (
                <button onClick={marcarTodas}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium">
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas
                </button>
              )}
            </div>

            {/* Lista */}
            <div className="max-h-[420px] overflow-y-auto">
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
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                            naoLida ? 'bg-blue-50/30' : ''
                          }`}>
                          <div className={`rounded-lg ${cor.bg} p-1.5 flex-shrink-0 mt-0.5`}>
                            <Icone className={`h-3.5 w-3.5 ${cor.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className={`text-[12.5px] truncate ${naoLida ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {n.titulo}
                              </p>
                              <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{tempoRelativo(n.created_at)}</span>
                            </div>
                            {n.mensagem && (
                              <p className="text-[11.5px] text-gray-600 mt-0.5 line-clamp-2">{n.mensagem}</p>
                            )}
                            {n.link && (
                              <p className="text-[10.5px] text-blue-600 mt-1 truncate">{n.link}</p>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
