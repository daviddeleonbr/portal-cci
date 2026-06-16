-- ============================================================
-- Cron job: emite NFs agendadas todos os dias às 4h (horário de Brasília)
-- ============================================================
--
-- Pré-requisitos:
--   1) Extensões pg_cron e pg_net habilitadas (esta migration habilita)
--   2) Vault secret 'service_role_key' criada com a service_role do projeto
--      → setar manualmente uma vez (ver INSTRUÇÃO no final do arquivo)
--   3) Edge function `agendamentos-nf-emitir` deployada
--      (supabase functions deploy agendamentos-nf-emitir)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Agendamento ─────────────────────────────────────────────
-- URL do projeto inline — não dá pra usar `alter database set` no
-- Supabase managed (precisa superuser). A URL é pública, sem risco.
-- A `service_role_key` continua no Vault (essa SIM é secreta).
--
-- '0 7 * * *' = 7h UTC = 4h da manhã em Brasília (GMT-3)
-- Ajuste se quiser outro horário; pg_cron usa UTC por padrão.
select cron.schedule(
  'agendamentos_nf_emitir_diario',
  '0 7 * * *',
  $$
  select net.http_post(
    url     := 'https://tyfqqezwekzycfmhehfk.supabase.co/functions/v1/agendamentos-nf-emitir',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret
                                       from vault.decrypted_secrets
                                      where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- INSTRUÇÕES — execute UMA vez no SQL Editor, depois de aplicar
-- ============================================================
--
-- 1) Cadastrar a service_role_key no Vault:
--    a. Dashboard → Project Settings → API → copiar `service_role` (secret)
--    b. No SQL Editor:
--       select vault.create_secret(
--         '<COLE_A_SERVICE_ROLE_KEY_AQUI>',
--         'service_role_key',
--         'Usada pelo cron pra chamar edge functions'
--       );
--
-- 2) Deploy da edge function:
--       supabase functions deploy agendamentos-nf-emitir
--
-- 3) Testar manualmente (sem esperar o cron):
--       select net.http_post(
--         url     := 'https://tyfqqezwekzycfmhehfk.supabase.co/functions/v1/agendamentos-nf-emitir',
--         headers := jsonb_build_object(
--           'Content-Type',  'application/json',
--           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--         ),
--         body    := '{}'::jsonb
--       );
--    → retorna um request_id; veja o resultado em net._http_response.
--
-- 4) Verificar histórico de execução do cron:
--       select * from cron.job_run_details
--        where jobname = 'agendamentos_nf_emitir_diario'
--        order by start_time desc limit 10;
--
-- 5) Pausar/retomar:
--       update cron.job set active = false where jobname = 'agendamentos_nf_emitir_diario';
--       update cron.job set active = true  where jobname = 'agendamentos_nf_emitir_diario';
--
-- 6) Remover totalmente:
--       select cron.unschedule('agendamentos_nf_emitir_diario');
--
-- ============================================================
