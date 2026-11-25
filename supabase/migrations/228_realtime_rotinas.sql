-- 228_realtime_rotinas
-- Tarefas do admin em tempo real: as rotinas (cci_rotina) entram na publicação do
-- Realtime. cci_tarefa, checklist, evidência e pedido já estão (migration 211).
-- Segurança: o Realtime aplica a RLS de SELECT com o JWT do assinante, e
-- cci_rotina é só da CCI (cci_rotina_adm). Nada muda na RLS. Idempotente.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cci_rotina'
  ) then
    alter publication supabase_realtime add table public.cci_rotina;
  end if;
end $$;
