-- ============================================================
-- Cron noturno do sync Webposto.
--
-- Agenda 1× ao dia (4h da madrugada UTC ≈ 1h Brasil) chamando o
-- orquestrador webposto-sync-vendas-batch, que dispara o worker
-- pra cada empresa com sync ativa.
--
-- IMPORTANTE: substituir <SUPABASE_PROJECT_REF> e <SERVICE_ROLE_KEY>
-- pelos valores reais do projeto antes de rodar a migration. Em
-- ambiente de produção, gerencie as secrets via:
--
--   ALTER DATABASE postgres SET app.settings.webposto_sync_url = '...';
--   ALTER DATABASE postgres SET app.settings.webposto_sync_token = '...';
--
-- Ou (preferido) configure os GUCs no painel da Supabase.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior (idempotente em re-deploys).
do $$
begin
  perform cron.unschedule('webposto_sync_diario');
exception when others then null;
end $$;

-- Agenda 04:00 UTC = 01:00 BRT
select cron.schedule(
  'webposto_sync_diario',
  '0 4 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.webposto_sync_url', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.webposto_sync_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
