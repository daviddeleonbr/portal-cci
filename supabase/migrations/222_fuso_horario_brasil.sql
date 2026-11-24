-- 222_fuso_horario_brasil
-- Fuso do Brasil (America/Sao_Paulo) como padrão do banco.
-- Muda o que é calculado/exibido em "hora local": current_date, now()::date,
-- to_char(timestamptz), cast timestamptz→date e o texto dos timestamptz que a
-- API (PostgREST) devolve (passa de +00:00 para -03:00 — o MESMO instante).
-- NÃO muda nada armazenado: timestamptz continua guardado em UTC.
-- pg_cron segue no seu próprio fuso (cron.timezone), sem alteração.
-- Vale para conexões novas (o pool da API recicla as antigas sozinho).
-- Reverter: alter database postgres reset timezone;

alter database postgres set timezone to 'America/Sao_Paulo';
