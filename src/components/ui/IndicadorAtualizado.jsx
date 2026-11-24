// "Atualizado agora / há N min" — mostra que a tela se atualiza sozinha
// (tempo real, ver useAtualizacaoAutomatica). Ponto verde pulsando = conectado
// ao tempo real; cinza = sem conexão (a tela ainda recarrega ao voltar pro app).
import { useEffect, useState } from 'react';

function tempoDesde(d, agora) {
  if (!d) return '';
  const s = Math.max(0, Math.round((agora - d) / 1000));
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// estado (opcional, do useAtualizacaoAutomatica): 'reconectando' mostra o aviso.
export default function IndicadorAtualizado({ em, conectado, estado, atualizando = false, className = '' }) {
  const reconectando = !conectado && estado === 'reconectando';
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className={`inline-flex items-center gap-1.5 text-xs text-gray-600 ${className}`} role="status" aria-live="polite"
      title={conectado ? 'Esta tela se atualiza sozinha quando algo muda.' : 'Sem conexão em tempo real — reconectando; enquanto isso a tela atualiza a cada 30 segundos.'}>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {conectado && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? 'bg-blue-600' : reconectando ? 'bg-amber-500' : 'bg-gray-400'}`} />
      </span>
      {atualizando ? 'Atualizando…' : em ? `Atualizado ${tempoDesde(em, agora)}` : 'Carregando…'}
      {conectado && <span className="text-blue-700 font-medium">· ao vivo</span>}
      {reconectando && <span className="text-amber-700">· reconectando…</span>}
    </p>
  );
}
