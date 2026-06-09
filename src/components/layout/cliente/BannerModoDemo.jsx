// Botão sticky flutuante: indica modo demo + permite voltar pro admin.
// Pílula compacta no canto inferior direito que expande no hover.

import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { sairModoDemo } from '../../../lib/auth';

export default function BannerModoDemo() {
  const session = useClienteSession();
  const navigate = useNavigate();
  if (!session?._demo) return null;

  const voltarAdmin = () => {
    sairModoDemo();
    navigate('/admin/portal-demo');
  };

  return (
    <button
      onClick={voltarAdmin}
      title="Modo demo · clique pra voltar ao admin"
      className="fixed bottom-5 right-5 z-50 group inline-flex items-center gap-2
                 rounded-full bg-violet-600 hover:bg-violet-700 text-white
                 shadow-lg shadow-violet-600/30 hover:shadow-violet-700/40
                 pl-2.5 pr-3 py-2 transition-all duration-200">
      <span className="relative inline-flex items-center justify-center h-5 w-5">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
      </span>
      <span className="text-[11.5px] font-semibold whitespace-nowrap">
        Demo
      </span>
      <span className="hidden group-hover:inline-flex items-center gap-1 text-[10.5px] font-medium border-l border-white/30 pl-2 whitespace-nowrap">
        <ArrowLeft className="h-3 w-3" />
        Voltar
      </span>
    </button>
  );
}
