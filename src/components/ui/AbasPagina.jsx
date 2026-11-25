// Abas do topo da página: a selecionada fica cheia na cor da marca, as outras discretas.
// No celular a faixa rola na horizontal e traz a aba ativa para a vista.
import { useEffect, useRef } from 'react';

// abas: [{ id, rotulo, Icon }]
export default function AbasPagina({ abas, ativa, onTrocar, rotulo = 'Seções da página' }) {
  const ativaRef = useRef(null);
  useEffect(() => { ativaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [ativa]);

  // Setas, Home e End trocam de aba (teclado)
  const teclar = (e) => {
    const i = abas.findIndex(a => a.id === ativa);
    const n = { ArrowRight: (i + 1) % abas.length, ArrowLeft: (i - 1 + abas.length) % abas.length, Home: 0, End: abas.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    e.currentTarget.children[n]?.focus();
    onTrocar(abas[n].id);
  };

  return (
    <div role="tablist" aria-label={rotulo} onKeyDown={teclar}
      className="no-print mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-gray-200/70 bg-white p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {abas.map(a => {
        const sel = a.id === ativa;
        return (
          <button key={a.id} ref={sel ? ativaRef : null} type="button" role="tab" aria-selected={sel} tabIndex={sel ? 0 : -1} onClick={() => onTrocar(a.id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
              sel ? 'bg-blue-600 font-semibold text-white shadow-sm' : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}>
            <a.Icon className={`h-3.5 w-3.5 ${sel ? '' : 'opacity-70'}`} strokeWidth={sel ? 2.25 : 2} aria-hidden="true" /> {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}
