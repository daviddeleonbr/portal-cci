import { AnimatePresence, motion } from 'framer-motion';

// Barra fina (2px) indeterminada para o topo da pagina, indicando carregamento.
// Visualmente sutil — gradiente que desliza da esquerda para a direita em loop,
// somando ao spinner do botao "Atualizar". Aparece com fade in/out.
//
// Uso:
//   <BarraProgressoTopo loading={loadingDados} />
//
// O bar fica `fixed` no topo do viewport e `z-50` para nao ser coberto por
// sidebar/header. Largura cobre 100% da largura da tela.
export default function BarraProgressoTopo({ loading }) {
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          key="barra-progresso-topo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-50 h-[3px] overflow-hidden bg-blue-500/25 shadow-[0_1px_4px_rgba(59,130,246,0.35)] pointer-events-none"
          aria-hidden="true"
        >
          {/* Pulso 1 — corre da esquerda pra direita */}
          <motion.span
            className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-blue-600 to-transparent"
            initial={{ left: '-35%' }}
            animate={{ left: '105%' }}
            transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
          />
          {/* Pulso 2 — entra defasado pra dar continuidade visual */}
          <motion.span
            className="absolute inset-y-0 w-1/4 rounded-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent"
            initial={{ left: '-30%' }}
            animate={{ left: '110%' }}
            transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, delay: 0.8 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
