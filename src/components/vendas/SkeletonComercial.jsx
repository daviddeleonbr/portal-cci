// Skeleton de carregamento para as telas comerciais (Vendas / Produtividade).
// Mostra placeholders no lugar dos KPIs + bloco de tabela/gráfico enquanto os
// dados do período carregam (ex.: ao trocar o mês). Melhora a percepção de
// velocidade vs. um modal bloqueante ou dados antigos "congelados".

function Bloco({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} />;
}

export default function SkeletonComercial({ cards = 4, linhas = 6, comAbas = true }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando dados do período">
      {comAbas && (
        <div className="bg-white rounded-xl border border-gray-100 mb-4 p-2 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Bloco key={i} className="h-7 w-28" />)}
        </div>
      )}

      {/* Linha de KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Bloco className="h-3 w-24" />
              <Bloco className="h-8 w-8 rounded-xl" />
            </div>
            <Bloco className="h-8 w-32" />
            <Bloco className="h-3 w-20" />
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Bloco className="h-3 w-full" />
              <Bloco className="h-3 w-full" />
              <Bloco className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Bloco de tabela / lista */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
        <Bloco className="h-4 w-56" />
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bloco className="h-8 w-8 rounded-lg" />
            <Bloco className="h-3 flex-1" />
            <Bloco className="h-3 w-24 hidden sm:block" />
            <Bloco className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
