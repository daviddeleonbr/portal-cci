import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { alternarRede, alternarEmpresa, estadoRede, contarAcesso, acessoTodasRedes } from '../../utils/acessoRedes';

// Aba "Redes" do painel de acessos (admin N1, migration 238).
//   redes : [{ id, tipo: 'wp'|'as', nome, empresas: [{ id, nome, cnpj }] }]
//   valor : acesso_redes (null = todas) · onChange(novo)
export default function AbaRedesAdmin({ redes, valor, onChange, semAcesso }) {
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState(() => new Set());
  const todas = !valor;
  const q = busca.trim().toLowerCase();
  const casa = (txt) => (txt || '').toLowerCase().includes(q);
  const lista = redes
    .map(r => ({ ...r, empresasFiltradas: q && !casa(r.nome) ? r.empresas.filter(e => casa(e.nome) || (e.cnpj || '').includes(q)) : r.empresas }))
    .filter(r => !q || casa(r.nome) || r.empresasFiltradas.length);
  const cont = contarAcesso(valor, redes);
  const alternarAberta = (k) => setAbertas(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const opcao = (on, titulo, sub, onClick) => (
    <button type="button" onClick={onClick}
      className={`flex flex-1 items-start gap-2 rounded-md border px-3 py-2 text-left ${on ? 'border-blue-300 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-gray-200 hover:border-gray-300 dark:border-white/10'}`}>
      <span className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-[4px] ${on ? 'border-blue-600' : 'border-gray-300 dark:border-white/20'}`} />
      <span><span className="block text-[12.5px] font-medium text-gray-900 dark:text-gray-100">{titulo}</span><span className="block text-[11px] text-gray-500 dark:text-gray-400">{sub}</span></span>
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Define de quais redes e empresas este admin vê cadastros, relatórios e rotinas. Admins N2 e N3 sempre veem todas.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {opcao(todas, 'Todas as redes e empresas', `As ${redes.length} redes e as cadastradas depois`, () => onChange(null))}
        {opcao(!todas, 'Somente as selecionadas', 'Rede inteira ou empresas avulsas', () => { if (todas) onChange(acessoTodasRedes(redes)); })}
      </div>

      {!todas && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar rede ou empresa"
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2.5 text-[12.5px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-gray-100" />
            </div>
            <span className="mr-auto whitespace-nowrap text-[11px] tabular-nums text-gray-500 sm:mr-0">
              {cont.inteiras} rede{cont.inteiras === 1 ? '' : 's'}{cont.avulsas ? ` + ${cont.avulsas} empresa${cont.avulsas === 1 ? '' : 's'}` : ''}
            </span>
            <button type="button" onClick={() => onChange(acessoTodasRedes(redes))} className="rounded px-1.5 py-0.5 text-[10.5px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5">Todas</button>
            <button type="button" onClick={() => onChange({ chaves_api: [], as_redes: [], empresas: [] })} className="rounded px-1.5 py-0.5 text-[10.5px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5">Nenhuma</button>
          </div>

          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-white/5 dark:border-white/10">
            {lista.map(r => {
              const k = `${r.tipo}:${r.id}`;
              const est = estadoRede(valor, r);
              const aberta = abertas.has(k) || !!q;
              const qtdSel = est === 'inteira' ? r.empresas.length : r.empresas.filter(e => valor.empresas.includes(e.id)).length;
              return (
                <li key={k}>
                  <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <button type="button" onClick={() => alternarAberta(k)} aria-label={aberta ? 'Recolher' : 'Ver empresas'}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10">
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${aberta ? 'rotate-90' : ''}`} />
                    </button>
                    <input type="checkbox" checked={est === 'inteira'} ref={el => { if (el) el.indeterminate = est === 'parcial'; }}
                      onChange={() => onChange(alternarRede(valor, r))} title="Rede inteira (inclusive empresas futuras)"
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 focus:ring-offset-0 dark:border-white/20 dark:bg-slate-950" />
                    <button type="button" onClick={() => alternarAberta(k)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-gray-800 dark:text-gray-200">{r.nome}</button>
                    <span className={`rounded px-1 text-[9.5px] font-semibold uppercase ${r.tipo === 'wp' ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'}`}>{r.tipo === 'wp' ? 'Webposto' : 'Autosystem'}</span>
                    <span className="w-24 text-right text-[10.5px] tabular-nums text-gray-500">
                      {est === 'inteira' ? 'rede inteira' : `${qtdSel} de ${r.empresas.length}`}
                    </span>
                  </div>
                  {aberta && (
                    <ul className="border-t border-gray-100 bg-gray-50/50 py-0.5 pl-9 dark:border-white/5 dark:bg-white/[0.02]">
                      {r.empresasFiltradas.map(e => (
                        <li key={e.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-2 py-1">
                            <input type="checkbox" checked={est === 'inteira' || valor.empresas.includes(e.id)}
                              onChange={() => onChange(alternarEmpresa(valor, r, e.id))}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 focus:ring-offset-0 dark:border-white/20 dark:bg-slate-950" />
                            <span className="flex-1 truncate text-[12px] text-gray-700 dark:text-gray-300">{e.nome}</span>
                            {e.cnpj && <span className="hidden font-mono text-[10.5px] text-gray-400 sm:inline">{e.cnpj}</span>}
                          </label>
                        </li>
                      ))}
                      {r.empresasFiltradas.length === 0 && <li className="px-2 py-1 text-[11px] text-gray-400">Sem empresas cadastradas.</li>}
                    </ul>
                  )}
                </li>
              );
            })}
            {lista.length === 0 && <li className="px-3 py-4 text-center text-[11.5px] text-gray-400">Nenhuma rede encontrada.</li>}
          </ul>
          <p className="mt-1.5 text-[10.5px] text-gray-500 dark:text-gray-400">
            Marcar a rede libera também as empresas cadastradas nela depois. Marcar empresas avulsas, não.
          </p>
          {semAcesso && <p className="mt-1 text-[11px] text-rose-600">Selecione ao menos uma rede ou empresa.</p>}
        </div>
      )}
    </div>
  );
}
