// Histórico do LMC gerencial ("Lançar medições"): lançamentos, alterações,
// fechamentos e reaberturas de dia (tabela lmc_real_historico, migração 239).
// Cada "salvar" grava várias linhas com o MESMO horário (uma transação) — aqui
// elas viram um cartão só: o que foi lançado/alterado em cada tanque, quem e quando.
import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Lock, LockOpen, PencilLine, ClipboardEdit } from 'lucide-react';
import * as lmcRealService from '../../services/lmcRealService';
import Modal from '../ui/Modal';

const fmtData = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : '—'; };
const fmtL = (v) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`);
const fmtQuando = (ts) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// O que mudou num lançamento (um combustível): uma linha por tanque (ou do combustível)
function mudancas(antes, depois) {
  const a = antes || {}; const d = depois || {};
  const tqs = [...new Set([
    ...Object.keys(a.escritural_tanques || {}), ...Object.keys(a.motivos_tanques || {}),
    ...Object.keys(d.escritural_tanques || {}), ...Object.keys(d.motivos_tanques || {}),
  ])].sort((x, y) => x.localeCompare(y, 'pt-BR', { numeric: true }));
  const linhas = tqs.map(tq => ({
    rot: `Tanque ${tq}`,
    escA: a.escritural_tanques?.[tq], escD: d.escritural_tanques?.[tq],
    motA: a.motivos_tanques?.[tq] || '', motD: d.motivos_tanques?.[tq] || '',
  }));
  if (a.escritural_produto != null || d.escritural_produto != null || a.motivo || d.motivo) {
    linhas.push({ rot: 'Combustível', escA: a.escritural_produto, escD: d.escritural_produto, motA: a.motivo || '', motD: d.motivo || '' });
  }
  // no "alterado" mostra só o que mudou
  return antes && depois
    ? linhas.filter(l => Number(l.escA ?? NaN) !== Number(l.escD ?? NaN) && !(l.escA == null && l.escD == null) || l.motA !== l.motD)
    : linhas;
}

function agrupar(hist) {
  const grupos = new Map();
  hist.forEach(h => {
    const k = h.acao === 'reaberto' ? `r|${h.id}` : `${h.data}|${h.em}`;
    const g = grupos.get(k) || { k, data: h.data, em: h.em, usuario: h.usuario_nome, itens: [] };
    g.itens.push(h);
    grupos.set(k, g);
  });
  return [...grupos.values()].sort((a, b) => b.em.localeCompare(a.em));
}

const TIPO = {
  reaberto: { rot: 'Dia reaberto', icone: LockOpen, cls: 'bg-amber-50 text-amber-800', barra: 'border-l-amber-400' },
  alterado: { rot: 'Medições alteradas', icone: PencilLine, cls: 'bg-violet-50 text-violet-800', barra: 'border-l-violet-500' },
  lancado:  { rot: 'Medições lançadas', icone: ClipboardEdit, cls: 'bg-blue-50 text-blue-800', barra: 'border-l-blue-500' },
};

export default function HistoricoLmc({ clienteId, de, ate, data = null, nomeChave, onFechar }) {
  const [hist, setHist] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;
    lmcRealService.listarHistorico(clienteId, data ? { data } : { de, ate })
      .then(h => { if (!cancelado) setHist(h); })
      .catch(e => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, [clienteId, de, ate, data]);

  const grupos = useMemo(() => agrupar(hist || []), [hist]);

  return (
    <Modal open onClose={onFechar} size="xl"
      title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-blue-700" aria-hidden="true" />
        Histórico das medições {data ? `· ${fmtData(data)}` : `· ${fmtData(de)} a ${fmtData(ate)}`}</span>}>
      {erro ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Não foi possível carregar o histórico: {erro}</p>
      ) : !hist ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-600">Nenhum lançamento registrado {data ? 'neste dia' : 'no período'}.</p>
      ) : (
        <ol className="space-y-2.5">
          {grupos.map(g => {
            const reab = g.itens.find(h => h.acao === 'reaberto');
            const tipo = reab ? TIPO.reaberto
              : g.itens.some(h => h.acao === 'alterado' || h.acao === 'removido') ? TIPO.alterado : TIPO.lancado;
            const fechou = g.itens.some(h => h.acao === 'fechado');
            const porProduto = g.itens.filter(h => ['lancado', 'alterado', 'removido'].includes(h.acao))
              .sort((a, b) => nomeChave(a.produto_chave).localeCompare(nomeChave(b.produto_chave)));
            return (
              <li key={g.k} className={`rounded-xl border border-l-4 border-gray-200 bg-white p-3 ${tipo.barra}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tipo.cls}`}>
                    <tipo.icone className="h-3 w-3" aria-hidden="true" /> {tipo.rot}
                  </span>
                  {!data && <span className="text-sm font-semibold text-gray-900">Dia {fmtData(g.data)}</span>}
                  {fechou && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                      <Lock className="h-3 w-3" aria-hidden="true" /> dia fechado
                    </span>
                  )}
                  <span className="ml-auto text-[12px] text-gray-600">
                    {g.usuario ? <><strong className="font-medium text-gray-800">{g.usuario}</strong> · </> : ''}{fmtQuando(g.em)}
                  </span>
                </div>
                {reab?.motivo && <p className="mt-1.5 text-[13px] text-gray-800"><strong>Motivo:</strong> {reab.motivo}</p>}
                {porProduto.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-[12px] tabular-nums">
                      <thead><tr className="text-right text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="py-1 text-left">Combustível</th><th className="py-1 text-left">Tanque</th>
                        <th className="py-1">Escritural real</th><th className="py-1 pl-3 text-left">Motivo</th>
                      </tr></thead>
                      <tbody>
                        {porProduto.flatMap(h => {
                          const ls = mudancas(h.acao === 'lancado' ? null : h.antes, h.acao === 'removido' ? null : h.depois);
                          const nome = nomeChave(h.produto_chave);
                          if (!ls.length) return [];
                          return ls.map((l, i) => {
                            const alt = h.acao === 'alterado';
                            const escMudou = alt && Number(l.escA ?? NaN) !== Number(l.escD ?? NaN) && !(l.escA == null && l.escD == null);
                            const motMudou = alt && l.motA !== l.motD;
                            return (
                              <tr key={`${h.id}-${i}`} className="border-t border-gray-100 text-right align-top">
                                <td className="py-1.5 text-left font-medium text-gray-800">{i === 0 ? nome : ''}{i === 0 && h.acao === 'removido' && <span className="ml-1 text-[11px] font-normal text-red-700">(removido)</span>}</td>
                                <td className="py-1.5 text-left text-gray-700">{l.rot}</td>
                                <td className="whitespace-nowrap py-1.5 text-gray-900">
                                  {h.acao === 'removido' ? <s className="text-gray-500">{fmtL(l.escA)}</s>
                                    : escMudou ? <><s className="text-gray-500">{fmtL(l.escA)}</s> → <strong>{fmtL(l.escD)}</strong></>
                                      : fmtL(l.escD)}
                                </td>
                                <td className="py-1.5 pl-3 text-left text-gray-700">
                                  {motMudou
                                    ? <>{l.motA && <s className="text-gray-500">{l.motA}</s>}{l.motA && ' → '}{l.motD || <em className="text-gray-500">sem motivo</em>}</>
                                    : (h.acao === 'removido' ? l.motA : l.motD) || ''}
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
