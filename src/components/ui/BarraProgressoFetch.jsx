import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

// Barra de progresso da busca de dados — informa ao usuario que o app
// continua trabalhando durante fetches longos. Some 600ms apos atingir 100%
// para dar uma sensacao de "concluido" antes de desaparecer.
export default function BarraProgressoFetch({ loading, feitos, total, label = 'Carregando dados...', labelConcluido = 'Dados atualizados' }) {
  const [visivel, setVisivel] = useState(false);
  const pct = total > 0 ? Math.min(100, (feitos / total) * 100) : 0;

  useEffect(() => {
    if (loading && total > 0) {
      setVisivel(true);
      return;
    }
    if (!loading && visivel) {
      const id = setTimeout(() => setVisivel(false), 600);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, total]);

  if (!visivel) return null;
  const concluido = !loading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-1 py-1.5 mb-3"
    >
      <div className="flex items-center gap-2 mb-1">
        {concluido ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 text-gray-400 animate-spin flex-shrink-0" />
        )}
        <p className="text-[11px] text-gray-500">
          {concluido ? labelConcluido : label}
        </p>
        <span className="ml-auto text-[10.5px] tabular-nums text-gray-400">
          {feitos}/{total} · {Math.round(pct)}%
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          className={`h-full ${concluido ? 'bg-emerald-400' : 'bg-blue-500'}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}
