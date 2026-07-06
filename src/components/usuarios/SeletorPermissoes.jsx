import { Check } from 'lucide-react';

// Seletor de permissões agrupado, com suporte a permissões POR ABA (sub-itens).
//   catalogo    : PERMISSOES_CLIENTE | PERMISSOES_ADMIN (cada item pode ter `abas`)
//   value       : array de chaves selecionadas
//   onChange    : (novoArray) => void
//   tipoCliente : 'webposto' | 'autosystem' | undefined — filtra abas por ERP
//                 (aba com `tipo` só aparece pro ERP correspondente).
//
// Semântica das abas: default-deny — ao marcar a página, as abas começam
// desmarcadas; o admin marca aba a aba. Desmarcar a página remove as abas.
export default function SeletorPermissoes({ catalogo, value, onChange, tipoCliente }) {
  const sel = new Set(value || []);
  const has = (k) => sel.has(k);
  const abasVis = (p) => (p.abas || []).filter(a => !a.tipo || a.tipo === tipoCliente);

  const commit = (adds = [], removes = []) => {
    const next = new Set(sel);
    adds.forEach(k => next.add(k));
    removes.forEach(k => next.delete(k));
    onChange([...next]);
  };
  const togglePagina = (p) => {
    if (has(p.key)) commit([], [p.key, ...abasVis(p).map(a => a.key)]); // desmarca página → some com as abas
    else commit([p.key]);
  };
  const toggleAba = (a) => (has(a.key) ? commit([], [a.key]) : commit([a.key]));

  // Agrupa preservando a ordem do catálogo.
  const grupos = [];
  const idx = new Map();
  catalogo.forEach(p => {
    if (!idx.has(p.grupo)) { idx.set(p.grupo, grupos.length); grupos.push({ grupo: p.grupo, perms: [] }); }
    grupos[idx.get(p.grupo)].perms.push(p);
  });

  const marcarGrupo = (perms, ligar) => {
    const paginas = perms.map(p => p.key);
    if (ligar) commit(paginas);
    else commit([], [...paginas, ...perms.flatMap(p => abasVis(p).map(a => a.key))]);
  };

  return (
    <div className="space-y-4">
      {grupos.map(({ grupo, perms }) => {
        const marcadas = perms.filter(p => has(p.key)).length;
        return (
          <div key={grupo}>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{grupo}</p>
              <span className="text-[10px] text-gray-400 tabular-nums">{marcadas}/{perms.length}</span>
              <div className="ml-auto flex items-center gap-2 text-[10px]">
                <button type="button" onClick={() => marcarGrupo(perms, true)} className="text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300">·</span>
                <button type="button" onClick={() => marcarGrupo(perms, false)} className="text-gray-500 hover:underline">Limpar</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {perms.map(p => {
                const ativo = has(p.key);
                const abas = abasVis(p);
                const temAbas = abas.length > 0;
                return (
                  <div key={p.key}
                    className={`rounded-lg border transition-all ${ativo ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 bg-white'} ${temAbas ? 'sm:col-span-2' : ''}`}>
                    <label className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer">
                      <span className={`flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 ${ativo ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                        {ativo && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <input type="checkbox" className="sr-only" checked={ativo} onChange={() => togglePagina(p)} />
                      <span className={ativo ? 'text-blue-900 font-medium' : 'text-gray-700'}>{p.label}</span>
                      {temAbas && (
                        <span className="ml-auto text-[10px] text-gray-400">
                          {ativo
                            ? `${abas.filter(a => has(a.key)).length}/${abas.length} abas`
                            : `${abas.length} aba${abas.length === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </label>
                    {ativo && temAbas && (
                      <div className="px-3 pb-2 pl-9 flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-gray-400 self-center mr-0.5">Abas:</span>
                        {abas.map(a => {
                          const on = has(a.key);
                          return (
                            <button type="button" key={a.key} onClick={() => toggleAba(a)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                                on ? 'border-blue-400 bg-blue-100 text-blue-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                              }`}>
                              {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
