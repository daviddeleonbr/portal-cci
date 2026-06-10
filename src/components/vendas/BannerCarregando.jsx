// Banner SUTIL de carregamento — substitui ModalCarregando nas páginas do
// cliente Webposto. Não bloqueia a tela: aparece como uma faixa fina no
// topo enquanto o fetch acontece em background, e some sozinho. Os dados
// (do cache ou novos) renderizam normalmente debaixo do banner.
//
// Uso:
//   <BannerCarregando aberto={loading} mensagem="Atualizando dados..." />

import { Loader2 } from 'lucide-react';

export default function BannerCarregando({ aberto, mensagem = 'Atualizando dados...' }) {
  if (!aberto) return null;
  return (
    <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50/60 border border-blue-100 flex items-center gap-2">
      <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin flex-shrink-0" />
      <p className="text-[11.5px] text-blue-800 font-medium">{mensagem}</p>
    </div>
  );
}

// Skeleton retangular animado pra placeholders de cards/seções.
export function Skeleton({ className = '', height = 'h-4' }) {
  return <div className={`${height} bg-gray-200/70 rounded animate-pulse ${className}`} />;
}

// Card KPI completo em skeleton (mesma altura/forma dos KPIs reais)
export function SkeletonKpi() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col px-4 pt-4 pb-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-gray-100 p-2.5 h-10 w-10 flex-shrink-0 animate-pulse" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton height="h-2.5" className="w-1/2" />
          <Skeleton height="h-6" className="w-3/4" />
          <Skeleton height="h-3" className="w-2/5" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-auto pt-3">
        <Skeleton height="h-4" className="w-16" />
        <Skeleton height="h-4" className="w-16" />
      </div>
    </div>
  );
}

// Card de gráfico (donut, pie, etc.) em skeleton
export function SkeletonGrafico({ height = 'h-72' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-gray-200 animate-pulse" />
        <Skeleton height="h-3.5" className="w-40" />
      </div>
      <div className={`p-4 ${height} flex items-center justify-center`}>
        <div className="rounded-full bg-gray-100 w-32 h-32 animate-pulse" />
      </div>
    </div>
  );
}

// Tabela em skeleton — N linhas com colunas variáveis
export function SkeletonTabela({ linhas = 5, colunas = 5 }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
        <Skeleton height="h-3.5" className="w-44" />
      </div>
      <div className="p-3 space-y-2">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton height="h-3" className="flex-[2]" />
            {Array.from({ length: colunas - 1 }).map((_, j) => (
              <Skeleton key={j} height="h-3" className="flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
