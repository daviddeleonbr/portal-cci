// Atualização automática de uma tela (substitui o botão "Atualizar").
//
//  - Tempo real: assina postgres_changes das `tabelas` (Supabase Realtime) e
//    chama `recarregar()` quando algo muda — agrupando rajadas (debounce),
//    porque uma ação costuma mexer em várias linhas (tarefa + checklist…).
//    A RLS vale também aqui: cada usuário só recebe eventos do que pode ver.
//  - RECONEXÃO: se o canal cair (erro, timeout, token de 1h vencido/renovado,
//    rede), ele é refeito sozinho com espera crescente (3s → 6s → … → 60s).
//    Antes o canal caía e a tela ficava parada até recarregar a página.
//  - PLANO B: enquanto não estiver "ao vivo", recarrega a cada 30s.
//  - Ao voltar pro app (aba visível de novo / internet voltou): recarrega e,
//    se o canal estiver caído, reconecta na hora.
//
// Uso: const { conectado, estado } = useAtualizacaoAutomatica({ canal, tabelas, recarregar });
//   estado: 'conectando' | 'ao_vivo' | 'reconectando'
//   tabelas: [{ table: 'cci_tarefa' }, { table: 'outra_conta_pagar', filter: 'cliente_id=eq.<id>' }]
//   recarregar: função estável (useCallback) que busca de novo SEM mostrar loading.
// As tabelas precisam estar na publicação supabase_realtime.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const ESPERA_MS = 700;          // debounce dos eventos
const POLLING_MS = 30_000;      // plano B enquanto o canal estiver fora
const BACKOFF_MS = [3_000, 6_000, 15_000, 30_000, 60_000];

export function useAtualizacaoAutomatica({ canal, tabelas, recarregar, ativo = true }) {
  const [estado, setEstado] = useState('conectando');
  const [tentativa, setTentativa] = useState(0); // muda → refaz o canal
  const falhasRef = useRef(0); // quedas seguidas (backoff); zera ao conectar
  const recarregarRef = useRef(recarregar);
  useEffect(() => { recarregarRef.current = recarregar; }, [recarregar]);
  const chaveTabelas = JSON.stringify(tabelas || []);
  const estadoRef = useRef(estado);
  useEffect(() => { estadoRef.current = estado; }, [estado]);

  useEffect(() => {
    if (!ativo || !canal) return undefined;
    let timer = null;
    let timerReconexao = null;
    let encerrado = false; // cleanup do efeito (não é queda)
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => recarregarRef.current?.(), ESPERA_MS);
    };
    const reconectar = (motivo) => {
      if (encerrado || timerReconexao) return;
      const espera = BACKOFF_MS[Math.min(falhasRef.current, BACKOFF_MS.length - 1)];
      falhasRef.current += 1;
      console.warn(`[tempo real] canal "${canal}" caiu (${motivo}). Reconectando em ${espera / 1000}s…`);
      setEstado('reconectando');
      timerReconexao = setTimeout(() => { if (!encerrado) setTentativa(t => t + 1); }, espera);
    };

    // nome único por tentativa: o supabase-js reaproveita canal de mesmo nome
    let ch = supabase.channel(`${canal}#${tentativa}`);
    JSON.parse(chaveTabelas).forEach(({ table, filter }) => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, agendar);
    });
    ch.subscribe((status, err) => {
      if (encerrado) return;
      if (status === 'SUBSCRIBED') {
        // reconectou depois de queda → pode ter perdido eventos: recarrega
        if (tentativa > 0) agendar();
        falhasRef.current = 0;
        setEstado('ao_vivo');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reconectar(`${status}${err?.message ? `: ${err.message}` : ''}`);
      }
    });

    // Plano B: sem tempo real, recarrega de tempos em tempos
    const polling = setInterval(() => {
      if (estadoRef.current !== 'ao_vivo' && document.visibilityState === 'visible') recarregarRef.current?.();
    }, POLLING_MS);

    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      agendar();
      if (estadoRef.current !== 'ao_vivo') { clearTimeout(timerReconexao); timerReconexao = null; setTentativa(t => t + 1); }
    };
    const aoReconectarRede = () => { agendar(); if (estadoRef.current !== 'ao_vivo') setTentativa(t => t + 1); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', aoReconectarRede);

    return () => {
      encerrado = true;
      clearTimeout(timer);
      clearTimeout(timerReconexao);
      clearInterval(polling);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', aoReconectarRede);
      supabase.removeChannel(ch);
    };
    // `tentativa` no deps: refaz o canal a cada reconexão
  }, [canal, chaveTabelas, ativo, tentativa]);


  return { conectado: estado === 'ao_vivo', estado };
}
