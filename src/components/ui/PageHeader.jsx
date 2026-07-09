// PageHeader: quando usado DENTRO do AppLayout (admin), eleva título +
// descrição pro topbar via Context — libera área útil.
//
// Quando usado FORA do Provider (ex: layout cliente), renderiza inline
// como antes — mantém retrocompatibilidade total.

import { useEffect } from 'react';
import { usePageHeader } from '../layout/PageHeaderContext';

export default function PageHeader({ title, description, children, sticky = false }) {
  const ctx = usePageHeader();
  const dentroDoProvider = ctx != null;

  useEffect(() => {
    if (!dentroDoProvider) return;
    ctx.setHeader({ title, description });
    return () => ctx.setHeader({ title: null, description: null });
    // ctx.setHeader é estável (useCallback no provider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, dentroDoProvider]);

  if (dentroDoProvider) {
    // Modo elevado: actions ficam onde o PageHeader é chamado.
    if (!children) return null;
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>
      </div>
    );
  }

  // Modo legado: header inline completo (usado pelo layout cliente).
  const linha = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 truncate">{title}</h1>
        {description && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500 truncate">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>}
    </div>
  );

  // Sticky: barra de filtros colada no topo (logo abaixo do ClienteHeader h-16),
  // com fundo translúcido + blur (glassmorphism). Sangra até as bordas da área
  // de conteúdo (-mx / -mt casam com o padding do <main>), então já nasce grudada
  // no topo — sem "viajar" com a rolagem antes de fixar. Compacta: título menor,
  // linha única, sem a descrição (a rede já aparece na topbar).
  if (sticky) {
    return (
      <div className="sticky top-16 z-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 mb-6 sm:mb-8 border-b border-gray-200/50 bg-white/50 supports-[backdrop-filter]:bg-white/40 backdrop-blur-lg">
        <div className="px-4 sm:px-6 lg:px-8 py-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 truncate">{title}</h1>
          {children && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>}
        </div>
      </div>
    );
  }

  return <div className="mb-6 sm:mb-8">{linha}</div>;
}
