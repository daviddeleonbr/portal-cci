-- ============================================================
-- RPC: status real do cron de emissão automática de NFS-e
-- ============================================================
--
-- Lê cron.job / cron.job_run_details (pg_cron) e o Vault para a UI
-- mostrar um indicador verde/amarelo/vermelho em vez de um aviso fixo.
--
-- security definer: roda como o owner (postgres) pra conseguir ler os
-- schemas `cron` e `vault`, que o anon/authenticated não acessam direto.
-- Não expõe o valor do secret — só se ele EXISTE (boolean).

create or replace function public.verificar_status_cron_nf()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobid    bigint;
  v_schedule text;
  v_active   boolean;
  v_secret   boolean;
  v_status   text;
  v_msg      text;
  v_inicio   timestamptz;
begin
  -- Job agendado? (migration 089 cria via cron.schedule)
  select jobid, schedule, active
    into v_jobid, v_schedule, v_active
  from cron.job
  where jobname = 'agendamentos_nf_emitir_diario'
  limit 1;

  -- Secret do Vault usado pelo cron pra autenticar na edge function.
  -- Bloco isolado: se não houver permissão pra ler o Vault, deixa NULL
  -- (desconhecido) em vez de derrubar a verificação do cron.
  begin
    select exists(select 1 from vault.secrets where name = 'service_role_key')
      into v_secret;
  exception when others then
    v_secret := null;
  end;

  if v_jobid is null then
    return jsonb_build_object('agendado', false, 'secret_ok', v_secret);
  end if;

  -- Última execução registrada
  select status, return_message, start_time
    into v_status, v_msg, v_inicio
  from cron.job_run_details
  where jobid = v_jobid
  order by start_time desc
  limit 1;

  return jsonb_build_object(
    'agendado',        true,
    'ativo',           v_active,
    'schedule',        v_schedule,
    'secret_ok',       v_secret,
    'ultima_execucao', v_inicio,
    'ultimo_status',   v_status,
    'ultima_mensagem', v_msg
  );
exception when others then
  -- Ex.: pg_cron não instalado neste ambiente — devolve erro pra UI tratar
  return jsonb_build_object('erro', SQLERRM);
end;
$$;

grant execute on function public.verificar_status_cron_nf() to anon, authenticated;
