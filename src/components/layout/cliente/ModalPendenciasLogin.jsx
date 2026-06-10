// Modal que aparece UMA VEZ por sessão (após login) mostrando as
// pendências ativas pra esse cliente. Marcado em sessionStorage pra não
// reaparecer na mesma aba — F5/relogin volta a aparecer.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useClienteSession } from '../../../hooks/useAuth';
import { pendenciasAtivasParaCliente, registrarVisualizacao } from '../../../services/pendenciasService';

const FLAG_KEY = 'cci-pendencias-mostradas-v1';

const COR_PRIO = {
  alta:  { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    chip: 'bg-rose-500'    },
  media: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   chip: 'bg-amber-500'   },
  baixa: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', chip: 'bg-emerald-500' },
};
const PRIO_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default function ModalPendenciasLogin() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const chaveApiId = session?.chaveApi?.id;
  const tipoCliente = session?.tipoCliente;

  const [pendencias, setPendencias] = useState(null); // null = carregando | array = pronto
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    if (!cliente?.id && !chaveApiId) return;
    // Se já foi mostrado nessa sessão pra esse cliente, não mostra de novo
    try {
      const flag = sessionStorage.getItem(FLAG_KEY);
      if (flag === String(cliente?.id || chaveApiId)) { setFechado(true); return; }
    } catch { /* noop */ }
    (async () => {
      try {
        const lista = await pendenciasAtivasParaCliente({ clienteId: cliente?.id, chaveApiId });
        setPendencias(lista);
        // Registra visualização (pra recorrência): quando uma pendência
        // recorrente é EXIBIDA, marca data — assim só reaparece na próxima
        // ocorrência do padrão (diária/semanal/etc).
        if (cliente?.id && lista.length > 0) {
          lista.forEach(p => {
            if (p.recorrencia && p.recorrencia.tipo !== 'nenhuma') {
              registrarVisualizacao({ pendenciaId: p.id, clienteId: cliente.id })
                .catch(() => { /* noop */ });
            }
          });
        }
      } catch {
        setPendencias([]);
      }
    })();
  }, [cliente?.id, chaveApiId]);

  const fechar = () => {
    try { sessionStorage.setItem(FLAG_KEY, String(cliente?.id || chaveApiId)); } catch { /* noop */ }
    setFechado(true);
  };

  // Não renderiza enquanto carrega, ou se já foi fechado, ou não há pendências
  if (fechado) return null;
  if (pendencias === null) return null;
  if (pendencias.length === 0) return null;

  const linkLista = tipoCliente === 'autosystem'
    ? '/cliente/autosystem/pendencias'
    : '/cliente/webposto/pendencias';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-amber-50/60 to-white flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-bold text-gray-900">
              {pendencias.length === 1
                ? 'Você tem 1 pendência'
                : `Você tem ${pendencias.length} pendências`}
            </h2>
            <p className="text-[11.5px] text-gray-500">
              A CCI precisa da sua atenção em alguns assuntos
            </p>
          </div>
          <button onClick={fechar}
            className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {pendencias.slice(0, 5).map(p => {
            const cor = COR_PRIO[p.prioridade] || COR_PRIO.media;
            return (
              <div key={p.id} className={`rounded-xl border ${cor.border} ${cor.bg} p-3`}>
                <div className="flex items-start gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${cor.chip} flex-shrink-0 mt-1.5`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-[13px] font-bold text-gray-900 flex-1 min-w-0">{p.titulo}</p>
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cor.text} bg-white/70 flex-shrink-0`}>
                        {PRIO_LABEL[p.prioridade]}
                      </span>
                    </div>
                    {p.descricao && (
                      <p className="text-[12px] text-gray-700 mt-1 line-clamp-2 whitespace-pre-wrap">
                        {p.descricao}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {pendencias.length > 5 && (
            <p className="text-[11px] text-center text-gray-500 italic pt-1">
              + {pendencias.length - 5} pendência(s) — ver todas na página
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-3">
          <button onClick={fechar}
            className="text-[12px] font-medium text-gray-500 hover:text-gray-800">
            Ver depois
          </button>
          <Link to={linkLista} onClick={fechar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-colors">
            Ver pendências
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
