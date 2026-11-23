-- 211_realtime_tarefas_outras_contas
-- Atualização automática (sem botão "Atualizar") em Minhas tarefas e Outras
-- contas a pagar: as telas assinam postgres_changes destas tabelas e recarregam
-- a lista quando algo muda (ver src/hooks/useAtualizacaoAutomatica.js).
--
-- Segurança: o Realtime aplica a RLS de SELECT de cada tabela com o JWT do
-- assinante — cada usuário só recebe eventos de linhas que já pode ler
-- (cci_tarefa_sel / tenant das filhas; outra_conta_tenant). Nada muda na RLS.
-- Idempotente.

do $$
declare
  t text;
begin
  foreach t in array array[
    'cci_tarefa', 'cci_tarefa_checklist', 'cci_tarefa_evidencia', 'cci_tarefa_pedido',
    'outra_conta_pagar'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
