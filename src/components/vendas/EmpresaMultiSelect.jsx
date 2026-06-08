// Multi-select de empresas — mesmo padrão usado em outras telas do portal.
// Mostra label "Todas (N)" / "K empresas" / "Nenhuma" baseado na seleção.

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2 } from 'lucide-react';

export default function EmpresaMultiSelect({ clientesRede, selecionadas, onToggle, onToggleTodas }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (clientesRede.length === 0) return null;

  const todasMarcadas = selecionadas.size === clientesRede.length;
  const label = selecionadas.size === 0
    ? 'Nenhuma'
    : todasMarcadas
    ? `Todas (${clientesRede.length})`
    : selecionadas.size === 1
    ? clientesRede.find(c => selecionadas.has(c.id))?.fantasia || clientesRede.find(c => selecionadas.has(c.id))?.nome || '1 selecionada'
    : `${selecionadas.size} empresas`;

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-1.5">
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Building2 className="h-2.5 w-2.5" /> Empresas
        </span>
        <button type="button" onClick={() => setAberto(o => !o)}
          className={`h-8 inline-flex items-center justify-between gap-1.5 rounded-lg border px-2 text-[11px] transition-colors min-w-[150px] max-w-[220px] ${
            aberto ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
          }`}>
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </label>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden">
            <button type="button" onClick={onToggleTodas}
              className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
              <input type="checkbox" checked={todasMarcadas}
                onChange={() => {}} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-[11.5px] font-medium text-gray-700">
                {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </span>
            </button>
            <div className="max-h-72 overflow-y-auto">
              {clientesRede.map(emp => {
                const marcada = selecionadas.has(emp.id);
                return (
                  <label key={emp.id}
                    className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type="checkbox" checked={marcada}
                      onChange={() => onToggle(emp.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] text-gray-800 truncate">{emp.fantasia || emp.nome}</p>
                      {emp.cnpj && <p className="text-[9.5px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
