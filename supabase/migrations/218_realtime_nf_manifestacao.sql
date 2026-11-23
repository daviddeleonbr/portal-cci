-- 218_realtime_nf_manifestacao
-- Tempo real na Manifestação de Notas (admin e cliente): lista e detalhe
-- recarregam quando a nota, os produtos ou os anexos mudam. A RLS continua
-- valendo no Realtime (cada um só recebe o que pode ver). Idempotente.

do $$
declare
  t text;
begin
  foreach t in array array['nf_manifestacao', 'nf_manifestacao_produto', 'nf_manifestacao_arquivo'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
