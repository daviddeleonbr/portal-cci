// Consulta das conferências de recebimentos enviadas (cliente e CCI): por
// período e empresa, quem conferiu, sistema × conferido × diferença; clique
// abre o detalhe por forma de recebimento.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, RefreshCw, X } from 'lucide-react';
import * as conferenciaService from '../../services/conferenciaRecebimentosService';
import { formatCurrency } from '../../utils/format';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtData = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : s; };
const nomeEmp = (c) => c?.nome || c?.razao_social || 'Empresa';
const corDif = (v) => (Math.abs(Number(v) || 0) < 0.005 ? 'text-emerald-600' : Number(v) > 0 ? 'text-amber-600' : 'text-red-600');
const inp = 'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

export default function ConsultaConferencias({ empresas }) {
  const hoje = new Date();
  const [de, setDe] = useState(() => ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 30)));
  const [ate, setAte] = useState(() => ymd(hoje));
  const [empresaF, setEmpresaF] = useState('');
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  const porId = useMemo(() => new Map((empresas || []).map(e => [e.id, e])), [empresas]);
  const ids = useMemo(() => (empresaF ? [empresaF] : (empresas || []).map(e => e.id)), [empresaF, empresas]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setLista(await conferenciaService.listarConferencias({ clienteIds: ids, de, ate })); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [ids, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const tot = lista.reduce((a, f) => ({ s: a.s + Number(f.total_sistema || 0), c: a.c + Number(f.total_conferido || 0), d: a.d + Number(f.total_diferenca || 0) }), { s: 0, c: 0, d: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">De</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className={inp} /></div>
        <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Até</label>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className={inp} /></div>
        {(empresas || []).length > 1 && (
          <div className="min-w-[220px] flex-1"><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</label>
            <select value={empresaF} onChange={e => setEmpresaF(e.target.value)} className={`${inp} w-full`}>
              <option value="">Todas</option>
              {(empresas || []).map(e => <option key={e.id} value={e.id}>{nomeEmp(e)}</option>)}
            </select></div>
        )}
        <button onClick={carregar} disabled={carregando}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        {carregando && lista.length === 0 ? (
          <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : lista.length === 0 ? (
          <p className="py-14 text-center text-sm text-gray-400">Nenhum resumo de caixa no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr><th className="px-4 py-3">Data</th><th className="px-3 py-3">Empresa</th><th className="px-3 py-3">Conferido por</th>
                  <th className="px-3 py-3 text-right">Sistema</th><th className="px-3 py-3 text-right">Conferido</th><th className="px-3 py-3 text-right">Diferença</th><th className="w-10" /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map(f => (
                  <tr key={f.id} onClick={() => setAberto(f)} className="cursor-pointer hover:bg-gray-50/70">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{fmtData(f.data)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeEmp(porId.get(f.cliente_id))}</td>
                    <td className="px-3 py-2.5 text-gray-700">{f.confirmado_por || '—'}
                      <span className="block text-[11px] text-gray-400">{new Date(f.confirmado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(f.total_sistema)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(f.total_conferido)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${corDif(f.total_diferenca)}`}>{formatCurrency(f.total_diferenca)}</td>
                    <td className="px-3 py-2.5 text-gray-400"><Eye className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
                <tr><td className="px-4 py-3" colSpan={3}>{lista.length} resumo(s)</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(tot.s)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(tot.c)}</td>
                  <td className={`px-3 py-3 text-right font-mono tabular-nums ${corDif(tot.d)}`}>{formatCurrency(tot.d)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {aberto && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setAberto(null)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Recebimentos de {fmtData(aberto.data)} — {nomeEmp(porId.get(aberto.cliente_id))}</h3>
                <p className="text-[12px] text-gray-500">Conferido por <strong>{aberto.confirmado_por || '—'}</strong> em {new Date(aberto.confirmado_em).toLocaleString('pt-BR')}</p>
              </div>
              <button onClick={() => setAberto(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr><th className="py-2">Forma de recebimento</th><th className="py-2 text-right">Sistema</th><th className="py-2 text-right">Conferido</th><th className="py-2 text-right">Diferença</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(aberto.itens || []).map((i, k) => (
                    <tr key={k}>
                      <td className="py-2 text-gray-800">{i.rotulo}{i.adicionada && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Sem lançamento</span>}<span className="block text-[11px] text-gray-400">{conferenciaService.ROTULO_TIPO[i.tipo] || i.tipo}</span></td>
                      <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(i.sistema)}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(i.conferido)}</td>
                      <td className={`py-2 text-right font-mono font-semibold tabular-nums ${corDif(i.diferenca)}`}>{formatCurrency(i.diferenca)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 font-semibold">
                  <tr><td className="py-2">Totais</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(aberto.total_sistema)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(aberto.total_conferido)}</td>
                    <td className={`py-2 text-right font-mono tabular-nums ${corDif(aberto.total_diferenca)}`}>{formatCurrency(aberto.total_diferenca)}</td></tr>
                </tfoot>
              </table>
              {aberto.observacoes && <p className="mt-3 text-sm text-gray-700"><strong>Observações:</strong> {aberto.observacoes}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
