-- ============================================================
-- Flag por conta para inclusão no "Sangrias" do portal cliente
-- (Webposto). Quando a futura migração para o endpoint
-- SANGRIA_CAIXA da Quality acontecer, apenas as contas marcadas
-- como `usar_em_sangrias = true` serão consideradas na agregação
-- por funcionário/turno.
--
-- Default false: por segurança, nenhuma conta entra até o admin
-- marcar explicitamente.
-- ============================================================

alter table cliente_contas_bancarias
  add column if not exists usar_em_sangrias boolean not null default false;

create index if not exists idx_cli_contas_sangrias
  on cliente_contas_bancarias(chave_api_id)
  where usar_em_sangrias = true;
