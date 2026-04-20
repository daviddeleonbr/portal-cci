import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
};

const styles = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
};

export default function Toast({ show, type = 'success', message, onClose }) {
  const Icon = icons[type];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className={`fixed top-6 left-1/2 z-[100] flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${styles[type]}`}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">{message}</p>
          <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
