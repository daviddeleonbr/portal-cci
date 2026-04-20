-- ============================================================
-- Fechamento de sangria em dinheiro por cliente + data
-- O cliente (responsavel pela contagem) digita o apresentado
-- em dinheiro de cada funcionario do dia e salva (trava).
-- ============================================================

create table if not exists cliente_sangrias_fechamento (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  empresa_codigo integer not null,
  data date not null,
  registros jsonb not null, -- [{funcionarioCodigo, nome, dinheiroApurado, dinheiroApresentado, diferenca}]
  total_apurado numeric(14, 2) default 0,
  total_apresentado numeric(14, 2) default 0,
  total_diferenca numeric(14, 2) default 0,
  confirmado_em timestamptz default now(),
  confirmado_por text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(cliente_id, data)
);

create index if not exists idx_cli_sangrias_cliente on cliente_sangrias_fechamento(cliente_id);
create index if not exists idx_cli_sangrias_data on cliente_sangrias_fechamento(data);

create trigger trg_cli_sangrias_updated
  before update on cliente_sangrias_fechamento
  for each row execute function update_updated_at();

alter table cliente_sangrias_fechamento enable row level security;
create policy "Allow all for cliente_sangrias_fechamento" on cliente_sangrias_fechamento for all using (true) with check (true);
