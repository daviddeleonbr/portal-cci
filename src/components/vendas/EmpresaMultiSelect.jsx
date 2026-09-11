// Multi-select de empresas — mesmo padrão usado em outras telas do portal.
// Mostra label "Todas (N)" / "K empresas" / "Nenhuma" baseado na seleção.
//
// Prop opcional `single` ativa modo de seleção única (radio em vez de
// checkbox, sem "Marcar todas", fecha dropdown ao escolher). O pai deve
// implementar `onToggle(id)` substituindo o estado (new Set([id])) em
// vez de fazer toggle aditivo.

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2 } from 'lucide-react';
import { nomeEmpresa } from '../../utils/nomeEmpresa';
import { useUsarApelido } from '../../lib/apelidoPref';
import { CATEGORIAS_EMPRESA_AUTOSYSTEM, rotuloCategoriaEmpresa } from '../../services/clientesService';

export default function EmpresaMultiSelect({ clientesRede, selecionadas, onToggle, onToggleTodas, single = false }) {
  const [aberto, setAberto] = useState(false);
  const [filtroCat, setFiltroCat] = useState(''); // '' = todas as categorias
  const ref = useRef(null);
  const usarApelido = useUsarApelido();

  // Categorias (Posto/Conveniência/Outros/Unificado) presentes na rede — só
  // aparecem no dropdown quando alguma empresa está classificada.
  const catsPresentes = CATEGORIAS_EMPRESA_AUTOSYSTEM.filter(
    cat => clientesRede.some(e => e.categoria_empresa === cat.key)
  );
  const visiveis = filtroCat
    ? clientesRede.filter(e => e.categoria_empresa === filtroCat)
    : clientesRede;

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
    ? nomeEmpresa(clientesRede.find(c => selecionadas.has(c.id)), usarApelido)
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
            {!single && (
              <button type="button" onClick={onToggleTodas}
                className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <input type="checkbox" checked={todasMarcadas}
                  onChange={() => {}} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-[11.5px] font-medium text-gray-700">
                  {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
                </span>
              </button>
            )}
            {catsPresentes.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-gray-100 bg-gray-50/60">
                <button type="button" onClick={() => setFiltroCat('')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    filtroCat === '' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}>Todas</button>
                {catsPresentes.map(cat => (
                  <button key={cat.key} type="button" onClick={() => setFiltroCat(f => f === cat.key ? '' : cat.key)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      filtroCat === cat.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}>{cat.label}</button>
                ))}
              </div>
            )}
            <div className="max-h-72 overflow-y-auto">
              {visiveis.map(emp => {
                const marcada = selecionadas.has(emp.id);
                const catLabel = rotuloCategoriaEmpresa(emp.categoria_empresa);
                return (
                  <label key={emp.id}
                    className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer">
                    <input type={single ? 'radio' : 'checkbox'} checked={marcada}
                      onChange={() => { onToggle(emp.id); if (single) setAberto(false); }}
                      className={`h-3.5 w-3.5 ${single ? '' : 'rounded'} border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[11.5px] text-gray-800 truncate">{nomeEmpresa(emp, usarApelido)}</p>
                        {catLabel && (
                          <span className="flex-shrink-0 px-1.5 py-px rounded-full bg-blue-50 text-blue-700 text-[8.5px] font-semibold uppercase tracking-wide">{catLabel}</span>
                        )}
                      </div>
                      {emp.cnpj && <p className="text-[9.5px] text-gray-400 font-mono truncate">{emp.cnpj}</p>}
                    </div>
                  </label>
                );
              })}
              {visiveis.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma empresa nesta categoria.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
