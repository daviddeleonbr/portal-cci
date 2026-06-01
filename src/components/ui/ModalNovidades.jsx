// Modal "Novidades" que aparece UMA vez por usuário cliente após login.
// Consome cci_mensagens_iniciais via mensagensIniciaisService. Múltiplas
// mensagens pendentes formam fila: cada fechamento marca como visualizada
// e avança para a próxima.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, Wrench, AlertTriangle, Info, ArrowRight, Loader2,
} from 'lucide-react';
import { useClienteSession } from '../../hooks/useAuth';
import * as mensagensService from '../../services/mensagensIniciaisService';

const CAT_VISUAL = {
  novidade: {
    label: 'Novidade',
    icone: Sparkles,
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    acento: 'from-blue-500 to-blue-600',
    halo: 'bg-blue-400/30',
  },
  atualizacao: {
    label: 'Atualização',
    icone: Wrench,
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    acento: 'from-emerald-500 to-teal-600',
    halo: 'bg-emerald-400/30',
  },
  manutencao: {
    label: 'Manutenção',
    icone: AlertTriangle,
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
    acento: 'from-amber-500 to-orange-500',
    halo: 'bg-amber-400/30',
  },
  aviso: {
    label: 'Aviso',
    icone: Info,
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    acento: 'from-rose-500 to-rose-600',
    halo: 'bg-rose-400/30',
  },
};

export default function ModalNovidades() {
  const session = useClienteSession();
  const usuario = session?.usuario;
  const tipoCliente = session?.tipoCliente;

  const [pendentes, setPendentes] = useState([]);
  const [idx, setIdx] = useState(0);
  const [carregado, setCarregado] = useState(false);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    if (!usuario?.id || !tipoCliente) return;
    let cancel = false;
    (async () => {
      try {
        const lista = await mensagensService.listarPendentesParaUsuario({
          usuarioId: usuario.id, tipoCliente,
        });
        if (!cancel) {
          setPendentes(lista);
          setIdx(0);
          setCarregado(true);
        }
      } catch {
        if (!cancel) setCarregado(true);
      }
    })();
    return () => { cancel = true; };
  }, [usuario?.id, tipoCliente]);

  if (!carregado || pendentes.length === 0 || idx >= pendentes.length) return null;

  const msg = pendentes[idx];
  const cat = CAT_VISUAL[msg.categoria] || CAT_VISUAL.novidade;
  const Icone = cat.icone;
  const total = pendentes.length;
  const ehUltima = idx === total - 1;

  const avancar = async () => {
    setFechando(true);
    try {
      await mensagensService.marcarComoVisualizada(msg.id, usuario.id);
    } catch { /* ignora — pior caso aparece de novo no próximo login */ }
    setFechando(false);
    setIdx(i => i + 1); // se passar do tamanho, useEffect oculta
  };

  return (
    <AnimatePresence>
      <motion.div
        key={msg.id}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
        >
          {/* Halo decorativo no topo */}
          <div className={`absolute -top-20 -left-20 h-48 w-48 rounded-full blur-3xl pointer-events-none ${cat.halo}`} />

          {/* Botão fechar (X) — equivale a "avançar" */}
          <button onClick={avancar} disabled={fechando}
            className="absolute top-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-7 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${cat.acento} text-white shadow-lg`}>
                <Icone className="h-5 w-5" />
              </div>
              <span className={`inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider rounded-full px-2 py-0.5 border font-semibold ${cat.pill}`}>
                {cat.label}
              </span>
              {total > 1 && (
                <span className="ml-auto text-[11px] text-gray-400 font-medium">
                  {idx + 1} de {total}
                </span>
              )}
            </div>

            <h2 className="text-[18px] font-semibold text-gray-900 leading-tight mb-2">
              {msg.titulo}
            </h2>
            <p className="text-[13.5px] text-gray-600 leading-relaxed whitespace-pre-line">
              {msg.conteudo}
            </p>
          </div>

          <div className="px-7 py-4 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between gap-3">
            <p className="text-[10.5px] text-gray-400">
              Esta mensagem aparece apenas uma vez.
            </p>
            <button onClick={avancar} disabled={fechando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
              {fechando ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  {ehUltima ? 'Entendi' : 'Próxima'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
