// Atualização automática de uma tela (substitui o botão "Atualizar").
//
//  - Tempo real: assina postgres_changes das `tabelas` (Supabase Realtime) e
//    chama `recarregar()` quando algo muda — agrupando rajadas (debounce),
//    porque uma ação costuma mexer em várias linhas (tarefa + checklist…).
//    A RLS vale também aqui: cada usuário só recebe eventos do que pode ver.
//  - Ao voltar pro app (aba visível de novo / internet voltou): recarrega —
//    cobre celular dormindo, conexão caída e eventos perdidos nesse meio-tempo.
//
// Uso: const { conectado } = useAtualizacaoAutomatica({ canal, tabelas, recarregar });
//   tabelas: [{ table: 'cci_tarefa' }, { table: 'outra_conta_pagar', filter: 'cliente_id=eq.<id>' }]
//   recarregar: função estável (useCallback) que busca de novo SEM mostrar loading.
// As tabelas precisam estar na publicação supabase_realtime (migração 211).
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const ESPERA_MS = 700;

export function useAtualizacaoAutomatica({ canal, tabelas, recarregar, ativo = true }) {
  const [conectado, setConectado] = useState(false);
  const recarregarRef = useRef(recarregar);
  useEffect(() => { recarregarRef.current = recarregar; }, [recarregar]);
  const chaveTabelas = JSON.stringify(tabelas || []);

  useEffect(() => {
    if (!ativo || !canal) return undefined;
    let timer = null;
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => recarregarRef.current?.(), ESPERA_MS);
    };

    let ch = supabase.channel(canal);
    JSON.parse(chaveTabelas).forEach(({ table, filter }) => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, agendar);
    });
    ch.subscribe((status) => setConectado(status === 'SUBSCRIBED'));

    const aoVoltar = () => { if (document.visibilityState === 'visible') agendar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', agendar);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', agendar);
      supabase.removeChannel(ch);
      setConectado(false);
    };
  }, [canal, chaveTabelas, ativo]);

  return { conectado };
}
