-- Helper SQL pra disparar UM job do worker `webposto-sync-vendas` via
-- pg_net (assíncrono, fora do ciclo de vida de qualquer Edge Function).
--
-- Por que: Edge Functions do Supabase matam fetches em background quando
-- a função principal retorna response. EdgeRuntime.waitUntil teoricamente
-- resolve, mas na prática (testado em 07/06/26) workers ficavam órfãos
-- em status 'aguardando' eternamente. pg_net é uma fila do Postgres que
-- executa requests fora do contexto da função que enfileirou, garantindo
-- entrega mesmo após a função-pai terminar.
--
-- A migration 069 já usa pg_net pro cron; aqui só adicionamos um helper
-- pra disparar 1 worker individual a partir do orquestrador batch.

CREATE OR REPLACE FUNCTION cci_webposto_dispara_worker(
  p_supabase_url   text,
  p_service_key    text,
  p_chave_api_id   uuid,
  p_empresa_codigo int,
  p_data_de        date,
  p_data_ate       date,
  p_tipo           text,
  p_job_id         uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := p_supabase_url || '/functions/v1/webposto-sync-vendas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_service_key
    ),
    body := jsonb_build_object(
      'chave_api_id', p_chave_api_id,
      'empresa_codigo', p_empresa_codigo,
      'data_de', to_char(p_data_de, 'YYYY-MM-DD'),
      'data_ate', to_char(p_data_ate, 'YYYY-MM-DD'),
      'tipo', p_tipo,
      'job_id', p_job_id
    ),
    timeout_milliseconds := 180000  -- 3 min, > timeout do worker (150s)
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_dispara_worker(text, text, uuid, int, date, date, text, uuid)
  TO anon, authenticated, service_role;
