-- Status de conciliacao de caixas por cliente/data.
-- Quando o admin (conciliador) marca como concluida, o cliente passa a ver
-- o relatorio de fechamento de caixas daquele dia no portal.

create table if not exists bpo_conciliacoes_caixas (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  data date not null,
  concluida boolean not null default false,
  concluida_em timestamptz,
  concluida_por text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (cliente_id, data)
);

create index if not exists idx_bpo_conciliacoes_caixas_cliente_data
  on bpo_conciliacoes_caixas (cliente_id, data);
