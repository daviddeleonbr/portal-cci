// Acessos — portal do cliente (Webposto e Autosystem): login, senha e
// contrassenha das adquirentes e outras plataformas da rede.

import { useCallback, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import PaginaAcessos from '../../components/acessos/PaginaAcessos';
import { useClienteSession } from '../../hooks/useAuth';

export default function ClienteAcessos() {
  const session = useClienteSession();
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = useCallback((type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  }, []);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Acessos" description="Logins e senhas das adquirentes e outras plataformas da sua rede" />
      <PaginaAcessos clientes={session?.clientesRede || []} showToast={showToast} />
    </div>
  );
}
