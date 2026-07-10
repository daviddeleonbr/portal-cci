// Toast "Nova versão disponível" — aparece quando o service worker detecta
// um deploy novo. Um clique em Atualizar aplica o SW novo e recarrega, sem
// precisar de logout/login. Escuta o evento `pwa:nova-versao` disparado em
// main.jsx (via iniciarAtualizacaoPwa).
import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { aplicarAtualizacao } from '../../pwaUpdate';

export default function NovaVersaoToast() {
  const [visivel, setVisivel] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    const onNova = () => setVisivel(true);
    window.addEventListener('pwa:nova-versao', onNova);
    return () => window.removeEventListener('pwa:nova-versao', onNova);
  }, []);

  if (!visivel) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm">
      <div className="flex items-center gap-3 rounded-xl bg-gray-900 text-white shadow-2xl ring-1 ring-black/10 px-4 py-3">
        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-blue-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">Nova versão disponível</p>
          <p className="text-[11px] text-gray-400 leading-tight mt-0.5">Atualize para carregar as últimas melhorias.</p>
        </div>
        <button
          onClick={() => { setAplicando(true); aplicarAtualizacao(); }}
          disabled={aplicando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 text-[12px] font-semibold text-white flex-shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${aplicando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button onClick={() => setVisivel(false)} aria-label="Dispensar"
          className="text-gray-500 hover:text-gray-300 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
