import { useAdminSession } from '../hooks/useAuth';
import ChatSuporte from '../components/suporte/ChatSuporte';

export default function AdminSuporte() {
  const session = useAdminSession();
  return (
    <ChatSuporte
      modo="admin"
      usuarioId={session?.usuario?.id}
      usuarioNome={session?.usuario?.nome}
    />
  );
}
