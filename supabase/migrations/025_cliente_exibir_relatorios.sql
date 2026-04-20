-- Flags por empresa cliente para controlar quais relatorios sao visiveis
-- no portal do cliente. O admin decide empresa a empresa.

alter table clientes
  add column if not exists exibir_dre boolean not null default false,
  add column if not exists exibir_fluxo_caixa boolean not null default false;
