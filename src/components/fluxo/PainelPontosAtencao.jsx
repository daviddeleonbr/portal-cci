// Fluxo de Caixa: transferências entre empresas (visão da rede) e pontos de atenção
// detectados por regra (utils/fluxoCaixa/anomalias e intercompany). Só leitura —
// nada é reclassificado; cada item mostra o valor e os lançamentos para conferir.
import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Info, ListChecks, Loader2, Search, SearchCheck, Settings2 } from 'lucide-react';
import Modal from '../ui/Modal';
import { formatCurrency } from '../../utils/format';

const NIVEL = {
  conferir: { rotulo: 'Conferir', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  atencao: { rotulo: 'Atenção', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  info: { rotulo: 'Informativo', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
};
const dataBR = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');

// qtdContas / onConfigurar: contas cadastradas de transferência entre filiais
export function TransferenciasEntreEmpresas({ analise, eliminar, onEliminar, nomeEmpresa, qtdContas = 0, onConfigurar }) {
  const [aberto, setAberto] = useState(false);
  if (!analise) return null;
  const { resumo, pares } = analise;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm no-print">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
        <ArrowRightLeft className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-800">Transferências entre empresas da rede</h3>
        <span className="text-[11px] text-gray-500">
          · {resumo.pares} par{resumo.pares === 1 ? '' : 'es'} casado{resumo.pares === 1 ? '' : 's'} ({formatCurrency(resumo.valorPares)})
          {resumo.soltas > 0 && ` · ${resumo.soltas} sem contrapartida`}
        </span>
        {onConfigurar && (
          <button type="button" onClick={onConfigurar} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50"
            title="Contas (plano/contrapartida) usadas para transferências entre filiais">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Contas de transferência{qtdContas ? ` (${qtdContas})` : ''}
          </button>
        )}
        {pares.length > 0 && (
          <label className={`${onConfigurar ? '' : 'ml-auto '}inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-gray-700`}>
            <input type="checkbox" checked={eliminar} onChange={e => onEliminar(e.target.checked)} className="h-3.5 w-3.5" />
            Eliminar do consolidado
          </label>
        )}
      </div>
      <div className="px-5 py-3 text-[12px] leading-relaxed text-gray-600">
        {!pares.length && !analise.soltas.length ? (
          <>Nenhuma transferência entre as empresas foi identificada no período.{!qtdContas && ' Cadastre as contas usadas nessas transferências para o casamento não depender do histórico dos lançamentos.'}</>
        ) : eliminar && pares.length > 0
          ? <>O dinheiro que só passou de uma empresa para outra <strong>não entrou nem saiu do grupo</strong>: {resumo.pares === 1 ? 'o par abaixo foi tirado' : `os ${resumo.pares} pares abaixo foram tirados`} das entradas e saídas do fluxo consolidado ({[resumo.comprovados && `${resumo.comprovados} comprovado${resumo.comprovados === 1 ? '' : 's'}`, resumo.provaveis && `${resumo.provaveis} provável${resumo.provaveis === 1 ? '' : 'eis'}`].filter(Boolean).join(', ')}). Pontas sem par continuam no fluxo e aparecem em Pontos de atenção.</>
          : pares.length === 0 ? <>Nenhum par casado; as pontas soltas estão em Pontos de atenção.</>
          : <>As transferências entre empresas estão <strong>somadas</strong> no fluxo consolidado (entradas e saídas brutas ficam maiores). Marque &quot;Eliminar do consolidado&quot; para ver só o que entrou e saiu do grupo.</>}
        {pares.length > 0 && (
          <button type="button" onClick={() => setAberto(a => !a)} className="ml-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700">
            <ChevronRight className={`h-3 w-3 transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden="true" /> {aberto ? 'Ocultar pares' : 'Ver pares'}
          </button>
        )}
      </div>
      {aberto && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead className="bg-gray-50/80 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-2">Evidência</th><th className="px-3 py-2">De → Para</th><th className="px-3 py-2">Saída</th><th className="px-3 py-2">Entrada</th><th className="px-4 py-2 text-right">Valor</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pares.map((p, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${p.nivel === 'comprovado' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                      {p.nivel === 'comprovado' ? 'Comprovado' : 'Provável'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-800">{nomeEmpresa(p.empresaOrigem)} → {nomeEmpresa(p.empresaDestino)}</td>
                  <td className="px-3 py-2 text-gray-600">{dataBR(p.saida.data)} · {p.saida.pessoa || p.saida.descricao}</td>
                  <td className="px-3 py-2 text-gray-600">{dataBR(p.entrada.data)} · {p.entrada.pessoa || p.entrada.descricao}{p.diasEntre > 0 && <span className="text-gray-400"> ({p.diasEntre} dia{p.diasEntre === 1 ? '' : 's'} depois)</span>}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-900">{formatCurrency(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Escolha das contas (plano/contrapartida) usadas em transferências entre filiais.
// candidatos: [{ codigo, nome, qtd }] — os códigos que movimentaram no período.
export function ModalContasIntercompany({ aberto, candidatos = [], selecionadas = [], salvando = false, onSalvar, onFechar }) {
  const [marcadas, setMarcadas] = useState(() => new Set(selecionadas));
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todos = [...candidatos];
    selecionadas.forEach(c => { if (!todos.some(x => x.codigo === c)) todos.push({ codigo: c, nome: '(sem movimento no período)', qtd: 0 }); });
    return todos.filter(c => !q || `${c.codigo} ${c.nome}`.toLowerCase().includes(q))
      .sort((a, b) => (marcadas.has(b.codigo) - marcadas.has(a.codigo)) || a.codigo.localeCompare(b.codigo));
  }, [candidatos, selecionadas, busca, marcadas]);
  const alternar = (c) => setMarcadas(s => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  return (
    <Modal open={aberto} onClose={() => !salvando && onFechar()} title="Contas de transferência entre filiais" size="md"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{marcadas.size} conta{marcadas.size === 1 ? '' : 's'} marcada{marcadas.size === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="button" disabled={salvando} onClick={() => onSalvar([...marcadas].map(c => ({ codigo: c, descricao: candidatos.find(x => x.codigo === c)?.nome || null })))}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </div>
        </div>
      )}>
      <p className="mb-3 text-[13px] text-gray-600">Marque as contas (plano ou contrapartida) que a rede usa para passar dinheiro de uma empresa para outra. Lançamentos nelas são casados entre as empresas e, no consolidado, saem do fluxo. Vale para todas as empresas desta rede.</p>
      <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3">
        <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código ou nome…" className="h-full flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
        {lista.length === 0 ? <p className="px-3 py-4 text-sm text-gray-500">Nenhuma conta encontrada.</p> : lista.map(c => (
          <label key={c.codigo} className="flex cursor-pointer items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-[13px] last:border-0 hover:bg-gray-50">
            <input type="checkbox" checked={marcadas.has(c.codigo)} onChange={() => alternar(c.codigo)} className="h-3.5 w-3.5" />
            <span className="w-24 shrink-0 font-mono text-[12px] text-gray-500">{c.codigo}</span>
            <span className="min-w-0 flex-1 truncate text-gray-800">{c.nome}</span>
            {c.qtd > 0 && <span className="shrink-0 text-[11px] text-gray-400">{c.qtd} lanç.</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export function PontosAtencao({ achados = [], nomeEmpresa }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const [todos, setTodos] = useState(false);
  if (!achados.length) return null;
  const visiveis = todos ? achados : achados.slice(0, 8);
  const alternar = (id) => setAbertos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cont = achados.reduce((m, a) => ({ ...m, [a.nivel]: (m[a.nivel] || 0) + 1 }), {});
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm no-print">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
        <SearchCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-800">Pontos de atenção</h3>
        <span className="text-[11px] text-gray-500">
          · {['conferir', 'atencao', 'info'].filter(n => cont[n]).map(n => `${cont[n]} ${NIVEL[n].rotulo.toLowerCase()}`).join(' · ')}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
          <Info className="h-3 w-3" aria-hidden="true" /> Indícios para conferir — nada foi alterado
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {visiveis.map(a => {
          const aberto = abertos.has(a.id);
          const temEvid = (a.evidencias || []).length > 0;
          return (
            <li key={a.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${NIVEL[a.nivel].cls}`}>{NIVEL[a.nivel].rotulo}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900">{a.titulo}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600">{a.detalhe}</p>
                  {temEvid && (
                    <button type="button" onClick={() => alternar(a.id)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:text-blue-700">
                      <ChevronRight className={`h-3 w-3 transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden="true" /> {aberto ? 'Ocultar' : 'Ver'} lançamentos ({a.evidencias.length})
                    </button>
                  )}
                  {aberto && (
                    <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2.5 text-[11.5px]">
                      {a.evidencias.map((e, i) => (
                        <li key={i} className="flex flex-wrap gap-x-3 text-gray-700">
                          <span className="font-mono text-gray-500">{dataBR(e.data)}</span>
                          {e.empresaCodigo != null && <span className="text-gray-500">{nomeEmpresa(e.empresaCodigo)}</span>}
                          <span className="min-w-0 flex-1 truncate">{e.pessoa ? `${e.pessoa} · ` : ''}{e.descricao}</span>
                          <span className="font-mono tabular-nums">{formatCurrency(e.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-gray-700">{formatCurrency(a.valor)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {achados.length > 8 && (
        <button type="button" onClick={() => setTodos(t => !t)} className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-2 text-[12px] font-medium text-blue-600 hover:bg-gray-50">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> {todos ? 'Mostrar menos' : `Ver todos (${achados.length})`}
        </button>
      )}
    </div>
  );
}
