import { Navigate, useLocation } from 'react-router-dom';
import { useAdminSession, useClienteSession } from '../../hooks/useAuth';

export function RequireAdmin({ children }) {
  const session = useAdminSession();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/admin" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireCliente({ children }) {
  const session = useClienteSession();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/cliente/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
