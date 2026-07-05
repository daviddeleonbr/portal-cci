// Progresso de carregamento por ETAPAS. Mostra cada passo da busca de dados
// (catálogos + cada empresa) com spinner → ✓ conforme completa, deixando a
// espera mais agradável e transparente do que uma barra parada em 0%.
import { Loader2, CheckCircle2 } from 'lucide-react';

// etapas: [{ id, label, status: 'load' | 'ok' }]
export default function ProgressoEtapas({ etapas = [], titulo = 'Buscando dados...' }) {
  if (etapas.length === 0) return null;
  const total = etapas.length;
  const feitos = etapas.filter((e) => e.status === 'ok').length;
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;
  const concluido = feitos === total;

  return (
    <div className="mb-4 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {concluido
          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          : <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin flex-shrink-0" />}
        <p className="text-[12px] font-medium text-gray-700">{concluido ? 'Dados atualizados' : titulo}</p>
        <span className="ml-auto text-[11px] tabular-nums text-gray-400">{feitos}/{total} · {pct}%</span>
      </div>

      <div className="h-[3px] rounded-full bg-gray-100 overflow-hidden mb-2.5">
        <div
          className={`h-full transition-all duration-300 ease-out ${concluido ? 'bg-emerald-400' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
        {etapas.map((e) => (
          <div key={e.id} className="flex items-center gap-1.5 text-[11.5px] min-w-0">
            {e.status === 'ok'
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              : <Loader2 className="h-3.5 w-3.5 text-gray-300 animate-spin flex-shrink-0" />}
            <span className={`truncate ${e.status === 'ok' ? 'text-gray-400' : 'text-gray-700'}`}>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
