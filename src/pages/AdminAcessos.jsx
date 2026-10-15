// Acessos — visão da CCI: login, senha e contrassenha das adquirentes e outras
// plataformas de todos os clientes (por empresa ou rede toda).

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import PaginaAcessos from '../components/acessos/PaginaAcessos';
import * as clientesService from '../services/clientesService';

export default function AdminAcessos() {
  const [clientes, setClientes] = useState([]);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const showToast = useCallback((type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  }, []);

  useEffect(() => {
    clientesService.listarClientes()
      .then(cs => setClientes((cs || []).filter(c => c.status === 'ativo')))
      .catch(e => showToast('error', e.message));
  }, [showToast]);

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Acessos" description="Logins e senhas das adquirentes e outras plataformas dos clientes" />
      <PaginaAcessos admin clientes={clientes} showToast={showToast} />
    </div>
  );
}
