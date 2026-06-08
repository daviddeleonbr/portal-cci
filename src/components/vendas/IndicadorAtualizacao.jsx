// Indicador visual da última atualização dos dados.
//
// Lê o timestamp do cache v3 (RAM) e mostra "Atualizado às HH:MM" + tempo
// relativo ("há 3min"). Atualiza o texto a cada 30s pra ficar fresco.
//
// USO:
//   <IndicadorAtualizacao pagina="dashboard" chaveApiId={...} />

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { ultimaAtualizacao } from '../../services/webpostoCacheV3';

function fmtRelativo(ms) {
  if (!ms) return null;
  const seg = Math.round(ms / 1000);
  if (seg < 60)  return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60)  return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h   < 24)  return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

function fmtHora(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function IndicadorAtualizacao({ pagina, chaveApiId, periodicoMs = 30000 }) {
  // Tick periódico só pra forçar re-render e atualizar texto relativo
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), periodicoMs);
    return () => clearInterval(id);
  }, [periodicoMs]);

  if (!chaveApiId) return null;
  const ts = ultimaAtualizacao(pagina, chaveApiId);
  if (!ts) return null;

  const idadeMs = Date.now() - ts;
  const relativo = fmtRelativo(idadeMs);
  const hora     = fmtHora(ts);

  return (
    <span
      title={`Última atualização: ${hora}`}
      className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-gray-500 whitespace-nowrap">
      <Clock className="h-3 w-3 text-gray-400" />
      <span>Atualizado {relativo}</span>
      <span className="text-gray-300">·</span>
      <span className="font-mono tabular-nums">{hora}</span>
    </span>
  );
}
