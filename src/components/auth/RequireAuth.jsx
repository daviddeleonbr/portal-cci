import { Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
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

// Bloqueia a rota se o usuário cliente não tem a permissão necessária.
// Diferente de RequireCliente, não redireciona — mostra um aviso para
// que o usuário saiba que a página existe mas o acesso foi restringido.
// Usado em itens que a sidebar já oculta (Sangrias etc.) mas que precisam
// proteção real se a URL for digitada manualmente.
export function RequirePermissaoCliente({ permissao, children }) {
  const session = useClienteSession();
  if (!session) {
    return <Navigate to="/cliente/login" replace />;
  }
  const tem = (session.usuario?.permissoes || []).includes(permissao);
  if (!tem) {
    return (
      <div className="px-6 py-16">
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-12 text-center shadow-sm max-w-lg mx-auto">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-3">
            <Lock className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-gray-900 mb-1">Acesso restrito</p>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            Esta seção está disponível apenas para usuários autorizados.
            Solicite ao administrador da rede a permissão necessária.
          </p>
        </div>
      </div>
    );
  }
  return children;
}
