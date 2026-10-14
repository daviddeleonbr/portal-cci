// "Minhas tarefas" — portal do cliente (Webposto e Autosystem).
// O funcionário vê só as tarefas em que é responsável (RLS), executa
// (checklist, evidências, comentários) e envia para a validação da CCI.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import VisoesTarefas from '../../components/tarefas/VisoesTarefas';
import TarefaDetalhe from '../../components/tarefas/TarefaDetalhe';
import * as tarefasService from '../../services/tarefasService';
import { estaAtrasada, venceHoje, hojeYmd, somarDiasYmd } from '../../utils/tarefas';

export default function ClienteTarefas() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [abertaId, setAbertaId] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const de = somarDiasYmd(hojeYmd(), -60);
      const [noPeriodo, antigas] = await Promise.all([
        tarefasService.listarTarefas({ de, ate: somarDiasYmd(hojeYmd(), 60) }),
        tarefasService.listarPendentesAntigas({ antesDe: de }),
      ]);
      const vistos = new Set();
      setLista([...noPeriodo, ...antigas].filter(t => (vistos.has(t.id) ? false : vistos.add(t.id))));
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const atrasadas = lista.filter(t => estaAtrasada(t)).length;
  const hoje = lista.filter(t => venceHoje(t)).length;
  const validacao = lista.filter(t => t.status === 'aguardando_validacao').length;

  return (
    <div>
      <PageHeader title="Minhas tarefas" description="Rotinas e tarefas atribuídas a você pela CCI">
        <button onClick={carregar} disabled={carregando}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Resumo rot="Atrasadas" valor={atrasadas} cls={atrasadas ? 'text-rose-600' : 'text-gray-900'} />
        <Resumo rot="Vencem hoje" valor={hoje} cls="text-amber-600" />
        <Resumo rot="Em validação" valor={validacao} cls="text-violet-700" />
      </div>

      {erro && <p className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{erro}</p>}
      {carregando && lista.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : (
        <VisoesTarefas tarefas={lista} onAbrir={t => setAbertaId(t.id)} onAlterado={carregar} onErro={setErro}
          abaInicial={atrasadas ? 'atrasadas' : 'abertas'}
          vazio="Nenhuma tarefa por aqui. As rotinas atribuídas pela CCI aparecem nesta tela." />
      )}

      {abertaId && <TarefaDetalhe tarefaId={abertaId} onFechar={() => setAbertaId(null)} onAlterado={carregar} />}
    </div>
  );
}

function Resumo({ rot, valor, cls }) {
  return (
    <div className="rounded-xl border border-gray-200/70 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{rot}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${cls}`}>{valor}</p>
    </div>
  );
}
