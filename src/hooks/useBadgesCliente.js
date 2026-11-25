import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useClienteSession } from './useAuth';
import * as pendenciasService from '../services/pendenciasService';

// Contadores do menu do cliente (chave = `badgeKey` do item). Hoje só
// "Pendências" — ATIVAS p/ esse cliente (escopo de rede/cliente + janela +
// recorrência). Reconta a cada troca de página.
export function useBadgesCliente() {
  const location = useLocation();
  const session = useClienteSession();
  const chaveApiId = session?.chaveApi?.id;
  const clientesIds = useMemo(
    () => (session?.clientesRede || []).map(c => c.id),
    [session?.clientesRede],
  );
  const [badges, setBadges] = useState({});
  useEffect(() => {
    if (!chaveApiId && clientesIds.length === 0) return;
    let cancelado = false;
    (async () => {
      try {
        const n = await pendenciasService.contarAbertasCliente({ clientesIds, chaveApiId });
        if (!cancelado) setBadges({ pendencias: n });
      } catch { /* silencioso */ }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveApiId, clientesIds.join(','), location.pathname]);
  return badges;
}
