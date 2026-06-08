import { useClienteSession } from '../../../hooks/useAuth';
import ChatSuporte from '../../../components/suporte/ChatSuporte';

export default function ClienteSuporte() {
  const session = useClienteSession();
  return (
    <ChatSuporte
      modo="cliente"
      usuarioId={session?.usuario?.id}
      usuarioNome={session?.usuario?.nome}
      contexto={{
        asRedeId:   session?.asRede?.id,
        chaveApiId: session?.chaveApi?.id,
        clienteId:  session?.cliente?.id,
      }}
    />
  );
}
