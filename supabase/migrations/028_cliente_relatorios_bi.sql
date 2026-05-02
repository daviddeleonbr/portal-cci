-- ============================================================
-- Relatorios de BI (Power BI) cadastrados pela CCI por rede/cliente.
-- O cliente acessa pelo portal e visualiza via iframe embutido;
-- o link publico nao e exposto na UI (so o nome e descricao).
-- Feature transitoria: sera descontinuada quando os relatorios da
-- plataforma proprios cobrirem todos os casos.
-- ============================================================

create table if not exists cliente_relatorios_bi (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade, -- null = visivel para toda a rede
  nome text not null,
  descricao text,
  link_publico text not null,            -- URL do Power BI publico (incorporavel)
  ordem int not null default 0,          -- ordenacao na listagem
  ativo boolean not null default true,   -- soft-delete
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rel_bi_rede on cliente_relatorios_bi(chave_api_id);
create index if not exists idx_rel_bi_cliente on cliente_relatorios_bi(cliente_id);
create index if not exists idx_rel_bi_ativo on cliente_relatorios_bi(ativo);

create trigger trg_rel_bi_updated
  before update on cliente_relatorios_bi
  for each row execute function update_updated_at();

alter table cliente_relatorios_bi enable row level security;
create policy "Allow all for cliente_relatorios_bi" on cliente_relatorios_bi
  for all using (true) with check (true);
