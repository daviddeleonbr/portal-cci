-- ============================================================
-- Mapeamento manual (para clientes sem Webposto)
-- Cada cliente manual tem seu proprio plano de contas
-- ============================================================

create table if not exists mapeamento_manual_contas (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  mascara_id uuid not null references mascaras_dre(id) on delete cascade,
  grupo_dre_id uuid not null references grupos_dre(id) on delete cascade,
  conta_codigo text,                    -- opcional, ex: "01.01"
  conta_descricao text not null,        -- obrigatorio, ex: "Aluguel do escritorio"
  conta_natureza text check (conta_natureza in ('C', 'D')), -- C=credito/receita, D=debito/despesa
  ordem integer default 0,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_map_manual_cliente on mapeamento_manual_contas(cliente_id);
create index if not exists idx_map_manual_mascara on mapeamento_manual_contas(mascara_id);
create index if not exists idx_map_manual_grupo on mapeamento_manual_contas(grupo_dre_id);

create trigger trg_mapeamento_manual_updated
  before update on mapeamento_manual_contas
  for each row execute function update_updated_at();

alter table mapeamento_manual_contas enable row level security;
create policy "Allow all for mapeamento_manual_contas" on mapeamento_manual_contas for all using (true) with check (true);
