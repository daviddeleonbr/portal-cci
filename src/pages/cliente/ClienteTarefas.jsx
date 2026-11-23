// "Minhas tarefas" — portal do cliente (Webposto e Autosystem).
// O funcionário vê só as tarefas em que é responsável (RLS), executa
// (checklist, evidências, comentários) e envia para a validação da CCI.
// Sem botão "Atualizar": a lista se atualiza sozinha (tempo real + ao voltar
// pro app) — ver useAtualizacaoAutomatica.

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import IndicadorAtualizado from '../../components/ui/IndicadorAtualizado';
import { useAtualizacaoAutomatica } from '../../hooks/useAtualizacaoAutomatica';
import { useClienteSession } from '../../hooks/useAuth';
import VisoesTarefas from '../../components/tarefas/VisoesTarefas';
import TarefaDetalhe from '../../components/tarefas/TarefaDetalhe';
import * as tarefasService from '../../services/tarefasService';
import { estaAtrasada, venceHoje, hojeYmd, somarDiasYmd } from '../../utils/tarefas';

export default function ClienteTarefas() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [abertaId, setAbertaId] = useState(null);
  // Toque num resumo (Atrasadas / Vencem hoje / Em validação) → abre a Lista
  // já filtrada. `seq` remonta as visões com a aba escolhida.
  const [atalho, setAtalho] = useState(null);
  const irPara = (aba) => setAtalho(a => ({ aba, seq: (a?.seq || 0) + 1 }));

  const session = useClienteSession();
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  // silencioso = atualização automática (sem spinner; erro não apaga a lista)
  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso) setAtualizando(true); else { setCarregando(true); setErro(''); }
    try {
      const de = somarDiasYmd(hojeYmd(), -60);
      const [noPeriodo, antigas] = await Promise.all([
        tarefasService.listarTarefas({ de, ate: somarDiasYmd(hojeYmd(), 60) }),
        tarefasService.listarPendentesAntigas({ antesDe: de }),
      ]);
      const vistos = new Set();
      setLista([...noPeriodo, ...antigas].filter(t => (vistos.has(t.id) ? false : vistos.add(t.id))));
      setAtualizadoEm(new Date());
      if (silencioso) setErro('');
    } catch (e) { if (!silencioso) setErro(e.message); }
    finally { setCarregando(false); setAtualizando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Tempo real: qualquer mudança nas tarefas (ou nas partes delas) que o
  // usuário pode ver recarrega a lista. A RLS filtra no servidor.
  const recarregarSilencioso = useCallback(() => carregar({ silencioso: true }), [carregar]);
  const { conectado } = useAtualizacaoAutomatica({
    canal: `tarefas:${session?.usuario?.id || 'anon'}`,
    tabelas: [{ table: 'cci_tarefa' }, { table: 'cci_tarefa_checklist' }, { table: 'cci_tarefa_evidencia' }, { table: 'cci_tarefa_pedido' }],
    recarregar: recarregarSilencioso,
    ativo: !!session?.usuario?.id,
  });

  const atrasadas = lista.filter(t => estaAtrasada(t)).length;
  const hoje = lista.filter(t => venceHoje(t)).length;
  const validacao = lista.filter(t => t.status === 'aguardando_validacao').length;

  return (
    <div>
      <PageHeader title="Minhas tarefas" description="Rotinas e tarefas atribuídas a você pela CCI">
        <IndicadorAtualizado em={atualizadoEm} conectado={conectado} atualizando={atualizando} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Resumo rot="Atrasadas" valor={atrasadas} cls={atrasadas ? 'text-rose-700' : 'text-gray-900'} onClick={() => irPara('atrasadas')} />
        <Resumo rot="Vencem hoje" valor={hoje} cls={hoje ? 'text-amber-700' : 'text-gray-900'} onClick={() => irPara('hoje')} />
        <Resumo rot="Em validação" valor={validacao} cls={validacao ? 'text-violet-700' : 'text-gray-900'} onClick={() => irPara('validacao')} />
      </div>

      {erro && <p className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{erro}</p>}
      {carregando && lista.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
      ) : (
        <VisoesTarefas key={atalho?.seq || 0} tarefas={lista} onAbrir={t => setAbertaId(t.id)} onAlterado={recarregarSilencioso} onErro={setErro}
          abaInicial={atalho?.aba || (atrasadas ? 'atrasadas' : 'abertas')}
          visaoInicial={atalho ? 'lista' : undefined}
          vazio="Nenhuma tarefa por aqui. As rotinas atribuídas pela CCI aparecem nesta tela." />
      )}

      {abertaId && <TarefaDetalhe tarefaId={abertaId} onFechar={() => setAbertaId(null)} onAlterado={recarregarSilencioso} />}
    </div>
  );
}

function Resumo({ rot, valor, cls, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${rot}: ${valor}. Ver na lista`}
      className="rounded-xl border border-gray-200/70 bg-white p-3 text-left shadow-sm hover:border-gray-300 active:bg-gray-50">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 leading-tight">{rot}</p>
      <p className={`mt-1 text-2xl sm:text-xl font-bold tabular-nums ${cls}`}>{valor}</p>
    </button>
  );
}
