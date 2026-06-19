-- ============================================================
-- Cron noturno do sync Webposto.
--
-- Agenda 1× ao dia (4h da madrugada UTC ≈ 1h Brasil) chamando o
-- orquestrador webposto-sync-vendas-batch, que dispara o worker
-- pra cada empresa com sync ativa.
--
-- IMPORTANTE: substituir o subdomínio do projeto na URL inline,
-- e cadastrar a `service_role_key` no Vault antes de rodar:
--
--   select vault.create_secret(
--     '<SERVICE_ROLE_KEY>',
--     'service_role_key',
--     'Usada por cron jobs pra chamar edge functions'
--   );
--
-- Por que NÃO usamos `alter database postgres set app.settings.xxx`:
-- no Supabase managed essa operação precisa superuser e dá
-- "permission denied". O Vault é a alternativa oficial.
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
-- URL inline (subdomínio é público — só a service_role_key é secreta).
select cron.schedule(
  'webposto_sync_diario',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://tyfqqezwekzycfmhehfk.supabase.co/functions/v1/webposto-sync-vendas-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret
                                       from vault.decrypted_secrets
                                      where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
