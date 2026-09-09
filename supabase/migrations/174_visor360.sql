-- Flag "Utiliza Visor360" por cliente (Webposto, em `clientes`) e por rede
-- (Autosystem, em `as_rede`). Quando marcada, o portal do cliente esconde as
-- seções Comercial e Financeiro e mostra um botão "Acessar Visor360".
-- Espelha o padrão dos flags de relatórios (025_cliente_exibir_relatorios.sql /
-- 052_as_rede_relatorios.sql).

alter table clientes
  add column if not exists usa_visor360 boolean not null default false;

alter table as_rede
  add column if not exists usa_visor360 boolean not null default false;
