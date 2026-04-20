-- ============================================================
-- Classificacao local das contas bancarias por cliente.
-- No Quality todas as contas (CONTA endpoint) sao tratadas como
-- 'Conta Bancaria'; aqui o admin classifica cada uma como:
--   - bancaria  (conta corrente)
--   - aplicacao (investimento / aplicacao financeira)
--   - caixa     (caixa fisico / conta-caixa)
--   - outras    (outras contas)
--
-- A Conciliacao Bancaria mostra somente as classificadas
-- como 'bancaria' ou 'aplicacao'.
-- ============================================================

create table if not exists cliente_contas_bancarias (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  conta_codigo integer not null,        -- CONTA.contaCodigo (Quality)
  descricao text,                       -- nome/descricao copiado do CONTA (apenas ilustrativo)
  tipo text not null default 'bancaria' check (tipo in ('bancaria', 'aplicacao', 'caixa', 'outras')),
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (cliente_id, conta_codigo)
);

create index if not exists idx_cli_contas_cliente on cliente_contas_bancarias(cliente_id);
create index if not exists idx_cli_contas_tipo on cliente_contas_bancarias(tipo);

create trigger trg_cli_contas_updated
  before update on cliente_contas_bancarias
  for each row execute function update_updated_at();

alter table cliente_contas_bancarias enable row level security;
create policy "Allow all for cliente_contas_bancarias" on cliente_contas_bancarias for all using (true) with check (true);
