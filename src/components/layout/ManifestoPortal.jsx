// Mantém o manifesto do PWA de acordo com o portal aberto (admin × cliente)
// quando o usuário navega sem recarregar a página. Ver src/lib/instalacaoPwa.js.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { aplicarManifesto } from '../../lib/instalacaoPwa';

export default function ManifestoPortal() {
  const { pathname } = useLocation();
  useEffect(() => { aplicarManifesto(pathname); }, [pathname]);
  return null;
}
