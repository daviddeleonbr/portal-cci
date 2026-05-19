import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, ChevronDown, Search, Check, Zap } from 'lucide-react';

// Seletor de rede compartilhado pelas telas BPO admin.
// Aceita redes Webposto (chaves_api) e Autosystem (as_rede) juntas e marca
// o tipo com badge ao lado do nome.
//
// Props:
//   chavesApi: array de chaves_api (rede Webposto)
//   redesAutosystem: array de as_rede
//   contagensPorRede: opcional, Map<id, number> (qtd de empresas por rede)
//   value: { tipo: 'webposto'|'autosystem', id: <uuid> } | null
//   onChange: (next) => void
//   disabled?: boolean
//   placeholder?: string
export default function SeletorRedeBPO({
  chavesApi = [],
  redesAutosystem = [],
  contagensPorRede,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione uma rede...',
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const opcoes = useMemo(() => {
    const wb = (chavesApi || [])
      .filter(c => c.ativo !== false)
      .map(c => ({
        tipo: 'webposto',
        id: c.id,
        nome: c.nome,
        provedor: c.provedor,
        qtd: contagensPorRede ? (contagensPorRede.get(c.id) || 0) : null,
      }));
    const as_ = (redesAutosystem || [])
      .filter(r => r.ativo !== false)
      .map(r => ({
        tipo: 'autosystem',
        id: r.id,
        nome: r.nome,
        provedor: 'AUTOSYSTEM',
        qtd: contagensPorRede ? (contagensPorRede.get(r.id) || 0) : null,
      }));
    const todos = [...wb, ...as_].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    if (!busca.trim()) return todos;
    const q = busca.trim().toLowerCase();
    return todos.filter(o => (o.nome || '').toLowerCase().includes(q) || (o.provedor || '').toLowerCase().includes(q));
  }, [chavesApi, redesAutosystem, contagensPorRede, busca]);

  const atual = useMemo(() => {
    if (!value) return null;
    return opcoes.find(o => o.tipo === value.tipo && o.id === value.id)
      || [...chavesApi.map(c => ({ tipo: 'webposto', id: c.id, nome: c.nome, provedor: c.provedor })),
          ...redesAutosystem.map(r => ({ tipo: 'autosystem', id: r.id, nome: r.nome, provedor: 'AUTOSYSTEM' }))]
        .find(o => o.tipo === value.tipo && o.id === value.id)
      || null;
  }, [value, opcoes, chavesApi, redesAutosystem]);

  const handleSelect = (op) => {
    onChange({ tipo: op.tipo, id: op.id });
    setAberto(false);
    setBusca('');
  };

  return (
    <div ref={ref} className="relative">
      <button type="button"
        disabled={disabled}
        onClick={() => setAberto(o => !o)}
        className={`w-full h-10 inline-flex items-center justify-between gap-2 rounded-lg border px-3 text-sm transition-colors ${
          aberto
            ? 'border-blue-400 ring-2 ring-blue-100 text-gray-800 bg-white'
            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
        } disabled:opacity-60 disabled:cursor-not-allowed`}>
        <Network className="h-4 w-4 text-gray-400 flex-shrink-0" />
        {atual ? (
          <span className="truncate flex-1 text-left flex items-center gap-2">
            <span className="truncate">{atual.nome}</span>
            <BadgeIntegracao tipo={atual.tipo} />
          </span>
        ) : (
          <span className="truncate flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200/70 shadow-xl z-40 overflow-hidden min-w-[340px]">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar rede..."
                  className="w-full h-8 pl-8 pr-2 text-[12px] rounded-md border border-gray-200 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {opcoes.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-400">
                  Nenhuma rede {busca ? `para "${busca}"` : 'cadastrada'}.
                </p>
              ) : opcoes.map(op => {
                const selecionada = atual && atual.tipo === op.tipo && atual.id === op.id;
                return (
                  <button key={`${op.tipo}:${op.id}`} type="button"
                    onClick={() => handleSelect(op)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left ${
                      selecionada ? 'bg-blue-50/60' : ''
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] truncate ${selecionada ? 'text-blue-900 font-semibold' : 'text-gray-800'}`}>
                          {op.nome}
                        </p>
                        <BadgeIntegracao tipo={op.tipo} />
                      </div>
                      <p className="text-[10.5px] text-gray-400">
                        {op.provedor && <span className="font-mono uppercase">{op.provedor}</span>}
                        {op.qtd != null && <> · {op.qtd} empresa{op.qtd === 1 ? '' : 's'}</>}
                      </p>
                    </div>
                    {selecionada && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeIntegracao({ tipo }) {
  if (tipo === 'autosystem') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px] font-medium flex-shrink-0 whitespace-nowrap">
        <Zap className="h-2 w-2" /> Autosystem
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px] font-medium flex-shrink-0 whitespace-nowrap">
      <Zap className="h-2 w-2" /> Webposto
    </span>
  );
}
