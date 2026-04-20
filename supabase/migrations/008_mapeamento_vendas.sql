-- ============================================================
-- Mapeamento de componentes de Venda para grupos da DRE
-- (Webposto: vendas nao tem planoConta direto, vem de VENDA_ITEM)
-- ============================================================

create table if not exists mapeamento_vendas_dre (
  id uuid default gen_random_uuid() primary key,
  mascara_id uuid not null references mascaras_dre(id) on delete cascade,
  tipo text not null check (tipo in (
    'receita_bruta',     -- soma de totalVenda dos itens
    'cmv',                -- soma de totalCusto dos itens
    'impostos',           -- ICMS + PIS + COFINS + CBS + IBS dos itens
    'descontos',          -- soma de totalDesconto dos itens
    'acrescimos'          -- soma de totalAcrescimo dos itens
  )),
  grupo_dre_id uuid references grupos_dre(id) on delete set null,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(mascara_id, tipo)
);

create index if not exists idx_map_vendas_mascara on mapeamento_vendas_dre(mascara_id);
create index if not exists idx_map_vendas_grupo on mapeamento_vendas_dre(grupo_dre_id);

create trigger trg_mapeamento_vendas_updated
  before update on mapeamento_vendas_dre
  for each row execute function update_updated_at();

alter table mapeamento_vendas_dre enable row level security;
create policy "Allow all for mapeamento_vendas_dre" on mapeamento_vendas_dre for all using (true) with check (true);
