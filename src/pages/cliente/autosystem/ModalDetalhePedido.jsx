// Detalhe + liberação de pedido de compra.
// - Rascunho/qualquer status: mostra itens e info
// - Aguardando liberação: permite definir qtd liberada por item e liberar/recusar

import { useEffect, useState } from 'react';
import {
  X, Loader2, ShoppingCart, Send, CheckCircle2, XCircle,
  Trash2, Printer, Building2, AlertCircle, Package, MessageSquare,
} from 'lucide-react';
import * as svc from '../../../services/pedidosCompraService';

function fmtMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function fmtNumero(v) { return new Intl.NumberFormat('pt-BR').format(Number(v) || 0); }
function fmtData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

const STATUS_ITEM_OPCOES = svc.STATUS_ITEM;

export default function ModalDetalhePedido({ pedidoId, session, usuario, onClose, onAtualizado, onExcluir }) {
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [acao, setAcao] = useState(null);
  // edições temporárias de liberação por item
  const [liberacao, setLiberacao] = useState({}); // { itemId: { quantidadeLiberada, status, observacao } }

  const carregar = async () => {
    setLoading(true); setErro(null);
    try {
      const p = await svc.obterPedido(pedidoId);
      setPedido(p);
      // Inicia liberacao com qtd solicitada. Checkbox `liberado` preserva
      // o estado salvo (se o item já tinha sido liberado antes).
      const init = {};
      (p.itens || []).forEach(i => {
        init[i.id] = {
          quantidadeLiberada: Number(i.quantidade_liberada || i.quantidade_solicitada),
          liberado:           i.status === 'liberado',
          observacao:         i.observacao_liberador || '',
        };
      });
      setLiberacao(init);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [pedidoId]);

  const permissoes = usuario?.permissoes || [];
  const temPermLiberar = permissoes.includes('compras_liberar') || permissoes.includes('admin');
  const podeLiberar = pedido?.status === 'aguardando_liberacao' && temPermLiberar;
  const podeEnviar = pedido?.status === 'rascunho';

  const enviar = async () => {
    setAcao('enviar'); setErro(null);
    try {
      const p = await svc.enviarParaLiberacao(pedido.id);
      setPedido(prev => ({ ...prev, ...p }));
      onAtualizado(p);
    } catch (e) { setErro(e.message); }
    finally { setAcao(null); }
  };

  const marcarTodos = () => {
    const novo = {};
    (pedido.itens || []).forEach(i => {
      novo[i.id] = {
        quantidadeLiberada: Number(i.quantidade_solicitada),
        liberado: true,
        observacao: liberacao[i.id]?.observacao || '',
      };
    });
    setLiberacao(novo);
  };

  const desmarcarTodos = () => {
    const novo = {};
    (pedido.itens || []).forEach(i => {
      novo[i.id] = {
        quantidadeLiberada: Number(i.quantidade_solicitada),
        liberado: false,
        observacao: liberacao[i.id]?.observacao || '',
      };
    });
    setLiberacao(novo);
  };

  const confirmarLiberacao = async () => {
    setAcao('liberar'); setErro(null);
    try {
      // Mapeia checkbox → status do banco:
      //   liberado=true  → 'liberado' (usa qtd informada)
      //   liberado=false → 'recusado' (qtd liberada = 0)
      const itensLiberacao = (pedido.itens || []).map(i => {
        const lib = liberacao[i.id] || {};
        return {
          itemId: i.id,
          quantidadeLiberada: lib.liberado ? (lib.quantidadeLiberada || 0) : 0,
          status:             lib.liberado ? 'liberado' : 'recusado',
          observacao:         lib.observacao || '',
        };
      });
      const p = await svc.liberarPedido(pedido.id, {
        itensLiberacao,
        liberadoPor: usuario?.id,
      });
      const completo = await svc.obterPedido(pedido.id);
      setPedido(completo);
      onAtualizado(p);
    } catch (e) { setErro(e.message); }
    finally { setAcao(null); }
  };

  if (loading || !pedido) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm text-gray-700">Carregando pedido...</span>
        </div>
      </div>
    );
  }

  const statusInfo = svc.STATUS.find(s => s.key === pedido.status) || svc.STATUS[0];
  const corStatus = {
    gray: 'bg-gray-100 text-gray-700', amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700', violet: 'bg-violet-100 text-violet-700',
  }[statusInfo.cor];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-gray-900 truncate">{pedido.fornecedor || 'Sem fornecedor'}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${corStatus}`}>
                  {statusInfo.label}
                </span>
                <span className="text-[11px] text-gray-500">criado {fmtData(pedido.criado_em)}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 rounded-xl p-3">
            <Info icon={Building2} label="Empresa" valor={`#${pedido.empresa_codigo}`} />
            <Info label="Total solicitado" valor={fmtMoeda(pedido.total_solicitado)} destaque="blue" />
            {Number(pedido.total_liberado) > 0 && (
              <Info label="Total liberado" valor={fmtMoeda(pedido.total_liberado)} destaque="emerald" />
            )}
            <Info label="Enviado em" valor={fmtData(pedido.enviado_em)} />
          </div>

          {pedido.observacoes && (
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" /> Observações
              </p>
              <p className="text-[12.5px] text-gray-700">{pedido.observacoes}</p>
            </div>
          )}

          {/* Aviso: aguardando liberação mas sem permissão pra liberar */}
          {pedido?.status === 'aguardando_liberacao' && !temPermLiberar && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Este pedido está aguardando liberação. Você não tem a permissão
                <strong> "Compras · Liberar pedidos" </strong> — entre em contato com a
                CCI para que a permissão seja liberada.
              </span>
            </div>
          )}

          {/* Liberação: ações em massa */}
          {podeLiberar && (
            <div className="flex items-center gap-2">
              <button onClick={marcarTodos}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 text-[12px] font-semibold transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Marcar todos
              </button>
              <button onClick={desmarcarTodos}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 text-[12px] font-semibold transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Desmarcar todos
              </button>
            </div>
          )}

          {/* Itens */}
          <div>
            <h3 className="text-[13px] font-bold text-gray-800 flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-blue-600" /> Itens ({pedido.itens.length})
            </h3>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Produto</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600">Solicitado</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600">Custo unit.</th>
                    {podeLiberar ? (
                      <>
                        <th className="text-right px-2 py-2 font-semibold text-gray-600 w-32">Qtd liberada</th>
                        <th className="text-center px-2 py-2 font-semibold text-gray-600 w-24">Liberar</th>
                      </>
                    ) : (
                      <>
                        <th className="text-right px-2 py-2 font-semibold text-gray-600">Liberado</th>
                        <th className="text-center px-2 py-2 font-semibold text-gray-600">Status</th>
                      </>
                    )}
                    <th className="text-right px-2 py-2 font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map(i => {
                    const total = Number(i.custo_unitario || 0) * Number(i.quantidade_solicitada || 0);
                    const lib = liberacao[i.id] || {};
                    const stItem = STATUS_ITEM_OPCOES.find(s => s.key === (podeLiberar ? lib.status : i.status));
                    const corItem = {
                      amber: 'bg-amber-100 text-amber-700',
                      emerald: 'bg-emerald-100 text-emerald-700',
                      rose: 'bg-rose-100 text-rose-700',
                    }[stItem?.cor] || 'bg-gray-100 text-gray-700';
                    return (
                      <tr key={i.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{i.produto_nome || '—'}</p>
                          <p className="text-[10.5px] text-gray-400 font-mono">#{i.produto_codigo}</p>
                          {i.status_estoque && (
                            <span className="text-[9.5px] text-gray-500 mt-0.5 inline-block">
                              Estoque {fmtNumero(i.estoque_atual)} · {i.status_estoque}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNumero(i.quantidade_solicitada)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtMoeda(i.custo_unitario)}</td>
                        {podeLiberar ? (
                          <>
                            <td className="px-2 py-2">
                              <input type="number" min={0} max={Number(i.quantidade_solicitada)}
                                value={lib.quantidadeLiberada || 0}
                                disabled={!lib.liberado}
                                onChange={e => setLiberacao(p => ({ ...p, [i.id]: { ...lib, quantidadeLiberada: Number(e.target.value) || 0 } }))}
                                className="w-full text-right rounded border border-gray-200 px-2 py-1 text-[12px] font-mono tabular-nums focus:border-blue-400 focus:outline-none disabled:opacity-40 disabled:bg-gray-50 disabled:cursor-not-allowed" />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox"
                                  checked={!!lib.liberado}
                                  onChange={e => setLiberacao(p => ({ ...p, [i.id]: { ...lib, liberado: e.target.checked, quantidadeLiberada: e.target.checked ? Number(i.quantidade_solicitada) : 0 } }))}
                                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                              </label>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNumero(i.quantidade_liberada)}</td>
                            <td className="px-2 py-2 text-center">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${corItem}`}>
                                {stItem?.label}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="px-2 py-2 text-right font-mono tabular-nums font-semibold text-gray-800">
                          {fmtMoeda(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {erro && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40">
          <div className="flex items-center gap-2">
            <button onClick={onExcluir}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 px-3 py-1.5 text-[12.5px] font-semibold transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold transition-colors">
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="text-[12.5px] font-medium text-gray-500 hover:text-gray-800">
              Fechar
            </button>
            {podeEnviar && (
              <button onClick={enviar} disabled={acao === 'enviar'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50">
                {acao === 'enviar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar pra liberação
              </button>
            )}
            {podeLiberar && (
              <button onClick={confirmarLiberacao} disabled={acao === 'liberar'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50">
                {acao === 'liberar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirmar liberação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icone, label, valor, destaque }) {
  const cores = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
  };
  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-0.5">
        {Icone && <Icone className="h-3 w-3" />}
        {label}
      </p>
      <p className={`text-[13.5px] font-bold ${cores[destaque] || 'text-gray-900'}`}>{valor || '—'}</p>
    </div>
  );
}
