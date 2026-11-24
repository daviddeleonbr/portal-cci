-- 220_realtime_outra_conta_arquivo
-- Outras contas a pagar em tempo real também quando o comprovante muda
-- (outra_conta_pagar já está na publicação desde a 211). Idempotente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outra_conta_arquivo'
  ) then
    alter publication supabase_realtime add table public.outra_conta_arquivo;
  end if;
end $$;
