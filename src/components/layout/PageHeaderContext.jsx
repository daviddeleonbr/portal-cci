// Context pra elevar o título da página atual até o topbar (Header).
//
// A página chama <PageHeader title="X" description="Y" /> normalmente —
// o componente registra no context e retorna null (não ocupa espaço
// no conteúdo principal). O Header lê do context e renderiza inline.
//
// Páginas FORA do AppLayout admin (ex: portal cliente) não têm Provider —
// nesses casos `usePageHeader()` devolve `null` e o `PageHeader` renderiza
// o header inline como antes (comportamento legado).

import { createContext, useContext, useState, useCallback } from 'react';

const PageHeaderContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const [header, setHeaderState] = useState({ title: null, description: null });
  const setHeader = useCallback((next) => setHeaderState(next), []);
  return (
    <PageHeaderContext.Provider value={{ ...header, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

// Retorna null se chamado fora do Provider (ex: layout cliente).
export function usePageHeader() {
  return useContext(PageHeaderContext);
}
