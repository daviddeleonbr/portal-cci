import { useMemo, useState } from 'react';
import { Search, ChevronRight, Lock, Link2, X, Wand2 } from 'lucide-react';
import { organizarCatalogo, alternarPermissao, rotuloPermissao } from '../../utils/permissoesCatalogo';

// Editor de permissões agrupado por módulo (substituiu o antigo SeletorPermissoes).
//   catalogo    : PERMISSOES_CLIENTE | PERMISSOES_ADMIN (itens podem ter `abas`)
//   tipo        : 'cliente' | 'admin' (escolhe módulos/descrições)
//   value       : chaves marcadas · onChange(novoArray)
//   tipoCliente : 'webposto' | 'autosystem' — filtra abas por ERP
//   original    : chaves antes da edição (marca + / − ao lado do item)
//   concedivel  : Set das chaves que quem edita pode CONCEDER (null = todas).
//                 Fora dele: dá para remover se já tinha, não para marcar.
//   perfis      : [{ id, nome, descricao, permissoes }] — "Aplicar modelo"
// Semântica das abas igual à antiga: ao marcar a página as abas começam
// desmarcadas; `abasOpcionais` = nenhuma marcada vale como todas.
export default function EditorPermissoes({
  catalogo, tipo = 'cliente', value, onChange, tipoCliente, original = null, concedivel = null, perfis = [],
}) {
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState(() => new Set());
  const sel = useMemo(() => new Set(value || []), [value]);
  const antes = useMemo(() => (original ? new Set(original) : null), [original]);

  // Abas visíveis para o ERP; catálogo "efetivo" usado nas dependências.
  const cat = useMemo(() => (catalogo || []).map(p => (p.abas
    ? { ...p, abas: p.abas.filter(a => !a.tipo || !tipoCliente || a.tipo === tipoCliente) } : p)), [catalogo, tipoCliente]);
  const grupos = useMemo(() => organizarCatalogo(cat, tipo), [cat, tipo]);
  const pode = (k) => !concedivel || concedivel.has(k);

  const q = busca.trim().toLowerCase();
  const casa = (p) => !q || p.label.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q)
    || p.modulo.toLowerCase().includes(q) || (p.abas || []).some(a => a.label.toLowerCase().includes(q));
  const visiveis = grupos.map(g => ({ ...g, itens: g.itens.filter(casa) })).filter(g => g.itens.length);

  const total = cat.length;
  const marcadas = cat.filter(p => sel.has(p.key)).length;

  const alternar = (k, ligar) => onChange(alternarPermissao([...sel], k, ligar, cat, tipo));
  const alternarAba = (k) => onChange(sel.has(k) ? [...sel].filter(x => x !== k) : [...sel, k]);
  const marcarGrupo = (itens, ligar) => {
    let arr = [...sel];
    itens.forEach(p => {
      if (ligar && !pode(p.key)) return;
      arr = alternarPermissao(arr, p.key, ligar, cat, tipo);
    });
    onChange(arr);
  };
  const aplicarModelo = (id) => {
    const m = perfis.find(x => x.id === id);
    if (!m) return;
    const validas = new Set(cat.flatMap(p => [p.key, ...(p.abas || []).map(a => a.key)]));
    let arr = [];
    (m.permissoes || []).filter(k => validas.has(k) && pode(k)).forEach(k => { arr = alternarPermissao(arr, k, true, cat, tipo); });
    // abas não passam por alternarPermissao (não têm meta): mantém as do modelo
    arr = [...new Set([...arr, ...(m.permissoes || []).filter(k => validas.has(k) && pode(k))])];
    onChange(arr.filter(pode)); // dependência que quem edita não tem também fica de fora
  };
  const toggleGrupo = (m) => setFechados(s => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });

  const marcaDiff = (k) => {
    if (!antes) return null;
    if (sel.has(k) && !antes.has(k)) return <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400" title="Será concedida">+</span>;
    if (!sel.has(k) && antes.has(k)) return <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400" title="Será removida">−</span>;
    return null;
  };

  return (
    <div className="text-[12.5px]">
      {/* Barra: busca + modelo + contador */}
      <div className="sticky top-0 z-10 -mx-4 mb-1 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5 dark:border-white/10 dark:bg-slate-900/95">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar permissão"
            className="h-8 w-full rounded-md border border-gray-200 bg-white pl-7 pr-7 text-[12px] placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-gray-100 dark:focus:ring-blue-500/20" />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
          )}
        </div>
        {perfis.length > 0 && (
          <label className="relative inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white pl-2 pr-1 text-[12px] text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300">
            <Wand2 className="h-3.5 w-3.5 text-gray-400" />
            <select value="" onChange={e => aplicarModelo(e.target.value)} aria-label="Aplicar modelo"
              className="h-full cursor-pointer appearance-none bg-transparent pr-4 focus:outline-none">
              <option value="">Aplicar modelo…</option>
              {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <ChevronRight className="pointer-events-none absolute right-1.5 h-3 w-3 rotate-90 text-gray-400" />
          </label>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          <strong className="font-semibold text-gray-900 dark:text-gray-100">{marcadas}</strong> de {total}
        </span>
      </div>

      {visiveis.length === 0 && <p className="py-8 text-center text-[12px] text-gray-400">Nenhuma permissão com “{busca}”.</p>}

      {visiveis.map(({ modulo, itens }) => {
        const todosDoGrupo = grupos.find(g => g.modulo === modulo).itens;
        const n = todosDoGrupo.filter(p => sel.has(p.key)).length;
        const aberto = q || !fechados.has(modulo);
        return (
          <section key={modulo} className="border-b border-gray-100 last:border-0 dark:border-white/5">
            <div className="flex items-center gap-2 py-2">
              <button type="button" onClick={() => toggleGrupo(modulo)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <ChevronRight className={`h-3 w-3 flex-shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{modulo}</span>
                <span className={`rounded px-1 text-[10px] font-medium tabular-nums ${n ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-400'}`}>
                  {n}/{todosDoGrupo.length}
                </span>
              </button>
              <div className="flex items-center gap-1 text-[10.5px]">
                <button type="button" onClick={() => marcarGrupo(todosDoGrupo, true)}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-gray-100">Todas</button>
                <button type="button" onClick={() => marcarGrupo(todosDoGrupo, false)}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-gray-100">Nenhuma</button>
              </div>
            </div>

            {aberto && (
              <ul className="pb-1.5">
                {itens.map(p => {
                  const ativo = sel.has(p.key);
                  const bloqueado = !ativo && !pode(p.key);
                  const abas = p.abas || [];
                  const nAbas = abas.filter(a => sel.has(a.key)).length;
                  return (
                    <li key={p.key} className={`-mx-2 rounded-md px-2 ${bloqueado ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'}`}>
                      <label className={`flex items-start gap-2.5 py-1.5 ${bloqueado ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        title={bloqueado ? 'Você não tem esta permissão, então não pode concedê-la.' : undefined}>
                        <input type="checkbox" checked={ativo} disabled={bloqueado}
                          onChange={() => alternar(p.key, !ativo)}
                          className="mt-[2px] h-3.5 w-3.5 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-200 focus:ring-offset-0 dark:border-white/20 dark:bg-slate-950" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className={`font-medium ${ativo ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{p.label}</span>
                            {marcaDiff(p.key)}
                            {p.restrita && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" title="Dá acesso a dado sensível">
                                <Lock className="h-2.5 w-2.5" /> Restrita
                              </span>
                            )}
                            {p.depende?.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400" title="Ao marcar, a permissão exigida é marcada junto">
                                <Link2 className="h-2.5 w-2.5" /> requer {p.depende.map(d => rotuloPermissao(cat, d)).join(', ')}
                              </span>
                            )}
                            {bloqueado && <span className="text-[10px] text-gray-400">indisponível</span>}
                          </span>
                          {p.desc && <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">{p.desc}</span>}
                        </span>
                      </label>

                      {ativo && abas.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pb-2 pl-6">
                          <span className="mr-0.5 text-[10.5px] text-gray-400">
                            {p.abasOpcionais ? (nAbas ? 'Abas:' : 'Abas (nenhuma = todas):') : 'Abas:'}
                          </span>
                          {abas.map(a => {
                            const on = sel.has(a.key);
                            const abaBloq = !on && !pode(a.key);
                            return (
                              <button type="button" key={a.key} disabled={abaBloq} onClick={() => alternarAba(a.key)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                  on ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300'
                                     : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-white/10 dark:text-gray-400'}`}>
                                {a.label}{marcaDiff(a.key)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
