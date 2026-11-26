import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Painel lateral (direita) para edições longas sem perder o contexto da lista.
// Celular: ocupa a tela toda. `cabecalho` substitui o título simples;
// `abas` e `rodape` ficam fixos fora do scroll. Esc fecha (chama onClose, que pode
// perguntar antes se houver alteração não salva).
export default function PainelLateral({ open, onClose, titulo, cabecalho, abas, rodape, children, largura = 'max-w-xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside
            initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`relative flex h-full w-full ${largura} flex-col bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10`}>
            <header className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 dark:border-white/10">
              <div className="min-w-0 flex-1">
                {cabecalho || <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{titulo}</h2>}
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar"
                className="-mr-1 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200">
                <X className="h-4 w-4" />
              </button>
            </header>
            {abas}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {rodape && (
              <footer className="border-t border-gray-100 bg-white px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:px-5 dark:border-white/10 dark:bg-slate-900">
                {rodape}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
