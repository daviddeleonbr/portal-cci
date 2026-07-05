// Aviso flutuante (fixo, canto inferior direito) sugerindo que o usuário
// atualize os dados — aparece após um tempo de inatividade, informando que
// pode haver dados mais recentes na API. Traz um botão para atualizar na hora.
import { createPortal } from 'react-dom';
import { RefreshCw, X, Info } from 'lucide-react';

export default function AvisoAtualizar({
  visivel,
  onAtualizar,
  onFechar,
  atualizando = false,
  mensagem = 'Você está nesta tela há um tempo — pode haver dados mais recentes. Atualize para ver os números mais atuais.',
}) {
  if (!visivel) return null;
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[60] w-[min(92vw,22rem)]">
      <div className="rounded-xl border border-blue-200 bg-white shadow-xl p-3.5 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Info className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] text-gray-700 leading-snug">{mensagem}</p>
          <button
            onClick={onAtualizar}
            disabled={atualizando}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? 'animate-spin' : ''}`} />
            Atualizar agora
          </button>
        </div>
        <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Fechar" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
