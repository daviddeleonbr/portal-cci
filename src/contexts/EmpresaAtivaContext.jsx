// Estado global da "empresa ativa" pras páginas Autosystem.
//
// Hoje (sem este context) cada página tinha seu próprio Set de empresas
// selecionadas. Pra rede com múltiplas empresas, o usuário precisava
// re-marcar tudo a cada página visitada — UX ruim.
//
// Com este context: 1 empresa selecionada COMPARTILHADA entre páginas.
// Trocou no Dashboard? Reflete em DRE, Fluxo, Vendas etc.
// Persiste em localStorage por rede pra sobreviver F5 e novas sessões.
//
// Default na primeira carga: empresa com menor `empresa_codigo` numérico
// (não confundir com `grid`).
//
// EXCEÇÕES intencionais — Contas a Pagar e Contas a Receber NÃO usam este
// context (continuam com seleção própria por página, persistida em
// localStorage separado). Motivo: fluxo financeiro costuma ter recorte
// próprio (admin financeiro vê todas, gestor de loja vê só a dele).

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useClienteSession } from '../hooks/useAuth';

const EmpresaAtivaContext = createContext({
  empresaId: null,
  setEmpresaId: () => {},
  empresasDisponiveis: [],
});

export function EmpresaAtivaProvider({ children }) {
  const session = useClienteSession();
  const asRedeId = session?.asRede?.id;

  const empresasDisponiveis = useMemo(
    () => (session?.clientesRede || [])
      .filter(c => c.empresa_codigo != null && c.empresa_codigo !== ''),
    [session?.clientesRede],
  );

  const storageKey = asRedeId ? `cci_empresa_ativa_${asRedeId}` : null;

  // Estado inicial: tenta localStorage; valida depois quando empresas carregarem.
  const [empresaId, setEmpresaIdInner] = useState(() => {
    if (!storageKey) return null;
    try { return localStorage.getItem(storageKey); } catch { return null; }
  });

  // Setter público — atualiza estado e persiste.
  const setEmpresaId = useCallback((id) => {
    setEmpresaIdInner(id);
    if (storageKey && id) {
      try { localStorage.setItem(storageKey, id); } catch { /* noop */ }
    }
  }, [storageKey]);

  // Default ao carregar (ou quando a empresa atual sumiu da lista):
  // empresa com menor empresa_codigo numérico.
  useEffect(() => {
    if (!asRedeId || empresasDisponiveis.length === 0) return;
    const aindaValida = empresaId && empresasDisponiveis.some(e => e.id === empresaId);
    if (aindaValida) return;

    const menor = [...empresasDisponiveis].sort(
      (a, b) => Number(a.empresa_codigo) - Number(b.empresa_codigo),
    )[0];
    setEmpresaId(menor.id);
  }, [asRedeId, empresasDisponiveis, empresaId, setEmpresaId]);

  const value = useMemo(
    () => ({ empresaId, setEmpresaId, empresasDisponiveis }),
    [empresaId, setEmpresaId, empresasDisponiveis],
  );

  return (
    <EmpresaAtivaContext.Provider value={value}>
      {children}
    </EmpresaAtivaContext.Provider>
  );
}

export function useEmpresaAtiva() {
  return useContext(EmpresaAtivaContext);
}
