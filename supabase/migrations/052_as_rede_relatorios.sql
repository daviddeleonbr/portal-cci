-- ============================================================
-- Flags de liberação de relatórios por rede Autosystem.
-- Análogo a clientes.exibir_dre/exibir_fluxo_caixa (Webposto),
-- mas no nível da rede inteira — quem tiver acesso ao portal
-- da rede vê (ou não vê) os itens correspondentes na sidebar.
-- ============================================================

alter table as_rede
  add column if not exists exibir_dre          boolean not null default false,
  add column if not exists exibir_fluxo_caixa  boolean not null default false;
