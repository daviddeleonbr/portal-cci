// Sangrias › Consulta (portal do cliente) — todos os fechamentos enviados pelos
// usuários da rede, nas empresas que o usuário pode ver (o RLS garante):
// quem enviou, apurado × contado × diferença, retiradas, valor a depositar e a
// tarefa de depósito. Clique abre o detalhe por funcionário.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, ExternalLink, Landmark, Loader2, RefreshCw, Search, X } from 'lucide-react';
import * as sangriasService from '../../services/clienteSangriasService';
import { formatCurrency } from '../../utils/format';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtData = (s) => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : s; };
const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const nomeEmp = (c) => c?.nome || c?.razao_social || 'Empresa';
const corDif = (v) => (Math.abs(Number(v) || 0) < 0.01 ? 'text-emerald-600' : Number(v) > 0 ? 'text-amber-600' : 'text-red-600');
const inp = 'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

// `empresas`: empresas que o usuário pode ver (session.clientesRede).
export default function ConsultaSangrias({ empresas }) {
  const hoje = new Date();
  const [de, setDe] = useState(() => ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 30)));
  const [ate, setAte] = useState(() => ymd(hoje));
  const [empresaF, setEmpresaF] = useState('');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  const porId = useMemo(() => new Map((empresas || []).map(e => [e.id, e])), [empresas]);
  const ids = useMemo(() => (empresaF ? [empresaF] : (empresas || []).map(e => e.id)), [empresaF, empresas]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setLista(await sangriasService.listarFechamentos({ clienteIds: ids, de, ate })); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [ids, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? lista.filter(f => `${f.confirmado_por || ''} ${nomeEmp(porId.get(f.cliente_id))}`.toLowerCase().includes(q)) : lista;
  }, [lista, busca, porId]);

  const tot = filtrada.reduce((a, f) => ({
    apurado: a.apurado + Number(f.total_apurado || 0),
    contado: a.contado + Number(f.total_apresentado || 0),
    dif: a.dif + Number(f.total_diferenca || 0),
    deposito: a.deposito + Number(f.valor_deposito ?? f.total_apresentado ?? 0),
  }), { apurado: 0, contado: 0, dif: 0, deposito: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">De</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Até</label>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className={inp} />
        </div>
        {(empresas || []).length > 1 && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</label>
            <select value={empresaF} onChange={e => setEmpresaF(e.target.value)} className={inp}>
              <option value="">Todas</option>
              {(empresas || []).map(e => <option key={e.id} value={e.id}>{nomeEmp(e)}</option>)}
            </select>
          </div>
        )}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por quem enviou…" className={`${inp} w-full pl-9`} />
        </div>
        <button onClick={carregar} disabled={carregando}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
        {carregando && lista.length === 0 ? (
          <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : filtrada.length === 0 ? (
          <p className="py-14 text-center text-sm text-gray-400">Nenhum fechamento de sangria enviado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-3 py-3">Empresa</th>
                  <th className="px-3 py-3">Enviado por</th>
                  <th className="px-3 py-3 text-right">Apurado</th>
                  <th className="px-3 py-3 text-right">Contado</th>
                  <th className="px-3 py-3 text-right">Diferença</th>
                  <th className="px-3 py-3 text-right">Retiradas</th>
                  <th className="px-3 py-3 text-right">A depositar</th>
                  <th className="px-3 py-3">Depósito</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrada.map(f => (
                  <tr key={f.id} onClick={() => setAberto(f)} className="cursor-pointer hover:bg-gray-50/70">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{fmtData(f.data)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeEmp(porId.get(f.cliente_id))}</td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {f.confirmado_por || '—'}
                      <span className="block text-[11px] text-gray-400">{fmtDataHora(f.confirmado_em)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-800">{formatCurrency(f.total_apurado)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-800">{formatCurrency(f.total_apresentado)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${corDif(f.total_diferenca)}`}>{formatCurrency(f.total_diferenca)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">{Number(f.total_retiradas) ? formatCurrency(f.total_retiradas) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-blue-700">{formatCurrency(f.valor_deposito ?? f.total_apresentado)}</td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {f.tarefa_deposito_id
                        ? <span className="inline-flex items-center gap-1 text-emerald-700"><Landmark className="h-3.5 w-3.5" /> {f.deposito_responsavel_nome || 'Tarefa criada'}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400"><Eye className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-700" colSpan={3}>{filtrada.length} fechamento(s)</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(tot.apurado)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(tot.contado)}</td>
                  <td className={`px-3 py-3 text-right font-mono tabular-nums ${corDif(tot.dif)}`}>{formatCurrency(tot.dif)}</td>
                  <td />
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-blue-700">{formatCurrency(tot.deposito)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {aberto && <DetalheFechamento f={aberto} empresa={porId.get(aberto.cliente_id)} onFechar={() => setAberto(null)} />}
    </div>
  );
}

function DetalheFechamento({ f, empresa, onFechar }) {
  const [erro, setErro] = useState('');
  const abrirArquivo = async (path) => {
    try { window.open(await sangriasService.urlArquivoRetirada(path), '_blank', 'noopener'); }
    catch (e) { setErro(e.message); }
  };
  const regs = f.registros || [];
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Sangrias de {fmtData(f.data)} — {nomeEmp(empresa)}</h3>
            <p className="text-[12px] text-gray-500">Enviado por <strong>{f.confirmado_por || '—'}</strong> em {fmtDataHora(f.confirmado_em)}</p>
          </div>
          <button onClick={onFechar} className="rounded-md p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erro && <p className="text-[12px] text-red-600">{erro}</p>}
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr><th className="py-2">Funcionário</th><th className="py-2 text-right">Apurado</th><th className="py-2 text-right">Contado</th><th className="py-2 text-right">Diferença</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {regs.map((r, i) => {
                const dif = Number(r.diferenca ?? (Number(r.dinheiroApresentado || 0) - Number(r.dinheiroApurado || 0)));
                return (
                  <tr key={i}>
                    <td className="py-2 text-gray-800">{r.nome}<span className="ml-1 font-mono text-[10px] text-gray-400">#{r.funcionarioCodigo}</span>{r.turno && <span className="block text-[11px] text-gray-500">{r.turno}</span>}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(r.dinheiroApurado)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(r.dinheiroApresentado)}</td>
                    <td className={`py-2 text-right font-mono font-semibold tabular-nums ${corDif(dif)}`}>{formatCurrency(dif)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 font-semibold">
              <tr>
                <td className="py-2">Totais</td>
                <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(f.total_apurado)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{formatCurrency(f.total_apresentado)}</td>
                <td className={`py-2 text-right font-mono tabular-nums ${corDif(f.total_diferenca)}`}>{formatCurrency(f.total_diferenca)}</td>
              </tr>
            </tfoot>
          </table>

          {(f.retiradas || []).length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Retiradas antes do depósito</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {f.retiradas.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1 text-gray-800">{r.descricao}</span>
                    {r.arquivo_path && (
                      <button onClick={() => abrirArquivo(r.arquivo_path)} className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> {r.arquivo_nome || 'Arquivo'}
                      </button>
                    )}
                    <span className="w-28 text-right font-mono tabular-nums">{formatCurrency(r.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Contado</p><p className="font-mono font-semibold tabular-nums">{formatCurrency(f.total_apresentado)}</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">(−) Retiradas</p><p className="font-mono font-semibold tabular-nums text-amber-700">{formatCurrency(f.total_retiradas || 0)}</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">(=) A depositar</p><p className="font-mono font-bold tabular-nums text-blue-700">{formatCurrency(f.valor_deposito ?? f.total_apresentado)}</p></div>
          </div>
          {f.tarefa_deposito_id && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700"><Landmark className="h-4 w-4" /> Tarefa de depósito criada para {f.deposito_responsavel_nome || 'o responsável'}.</p>
          )}
          {f.observacoes && (
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Observações</p><p className="text-sm text-gray-700">{f.observacoes}</p></div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
