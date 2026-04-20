-- ============================================================
-- Schema: Mascaras DRE + Mapeamento de Plano de Contas
-- ============================================================

-- Mascara de DRE (template principal)
create table if not exists mascaras_dre (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  descricao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Grupos da mascara (linhas da DRE)
-- Cada grupo pode ser: grupo (agrupa contas), subtotal (soma de grupos), resultado (lucro/prejuizo)
create table if not exists grupos_dre (
  id uuid default gen_random_uuid() primary key,
  mascara_id uuid not null references mascaras_dre(id) on delete cascade,
  parent_id uuid references grupos_dre(id) on delete set null,
  nome text not null,
  tipo text not null check (tipo in ('receita', 'deducao', 'custo', 'despesa', 'subtotal', 'resultado')),
  sinal integer not null default 1 check (sinal in (1, -1)),
  ordem integer not null default 0,
  formula text, -- para subtotais/resultados, ex: "ROB - DEDUCOES"
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Mapeamento: conta do plano gerencial externo -> grupo da DRE
create table if not exists mapeamento_contas (
  id uuid default gen_random_uuid() primary key,
  grupo_dre_id uuid not null references grupos_dre(id) on delete cascade,
  conta_codigo text not null,       -- codigo da conta no plano externo
  conta_nome text not null,         -- nome descritivo da conta
  created_at timestamptz default now(),

  unique(grupo_dre_id, conta_codigo)
);

-- Indexes
create index if not exists idx_grupos_dre_mascara on grupos_dre(mascara_id);
create index if not exists idx_grupos_dre_parent on grupos_dre(parent_id);
create index if not exists idx_mapeamento_grupo on mapeamento_contas(grupo_dre_id);
create index if not exists idx_mapeamento_codigo on mapeamento_contas(conta_codigo);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_mascaras_dre_updated
  before update on mascaras_dre
  for each row execute function update_updated_at();

create trigger trg_grupos_dre_updated
  before update on grupos_dre
  for each row execute function update_updated_at();

-- RLS policies (permissive for now, tighten later)
alter table mascaras_dre enable row level security;
alter table grupos_dre enable row level security;
alter table mapeamento_contas enable row level security;

create policy "Allow all for mascaras_dre" on mascaras_dre for all using (true) with check (true);
create policy "Allow all for grupos_dre" on grupos_dre for all using (true) with check (true);
create policy "Allow all for mapeamento_contas" on mapeamento_contas for all using (true) with check (true);
