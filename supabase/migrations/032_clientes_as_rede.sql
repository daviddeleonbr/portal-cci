-- ============================================================
-- Liga clientes a uma rede Autosystem (as_rede).
-- Necessario para que clientes importados via Autosystem possam
-- ser filtrados/listados por rede.
-- ============================================================

alter table clientes
  add column if not exists as_rede_id uuid references as_rede(id) on delete set null;

create index if not exists idx_clientes_as_rede on clientes(as_rede_id);
