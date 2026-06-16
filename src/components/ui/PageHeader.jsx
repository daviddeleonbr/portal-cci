// PageHeader: quando usado DENTRO do AppLayout (admin), eleva título +
// descrição pro topbar via Context — libera área útil.
//
// Quando usado FORA do Provider (ex: layout cliente), renderiza inline
// como antes — mantém retrocompatibilidade total.

import { useEffect } from 'react';
import { usePageHeader } from '../layout/PageHeaderContext';

export default function PageHeader({ title, description, children }) {
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
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 truncate">{title}</h1>
        {description && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500 truncate">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
