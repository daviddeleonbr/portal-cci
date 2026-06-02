-- ============================================================
-- HISTÓRICO: criava tabelas para CRUD de reuniões + KPIs.
-- A feature mudou de direção e foi descartada — veja a migration
-- 056 que faz o DROP destas tabelas.
--
-- Este arquivo é mantido (mesmo conteúdo original) apenas para
-- preservar o histórico de migrations entre ambientes que já o
-- aplicaram (Supabase reclama de "missing local migration").
-- ============================================================

create table if not exists cci_reunioes (
  id uuid default gen_random_uuid() primary key,

  rede_tipo text not null check (rede_tipo in ('webposto', 'autosystem')),
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id)   on delete cascade,
  constraint chk_reuniao_rede_xor check (
    (rede_tipo = 'webposto'   and chave_api_id is not null and as_rede_id is null) or
    (rede_tipo = 'autosystem' and as_rede_id   is not null and chave_api_id is null)
  ),

  mes_referencia date not null,

  titulo text,
  observacoes text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'realizada', 'cancelada')),
  realizada_em timestamptz,

  created_by uuid references cci_usuarios_sistema(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reunioes_rede_wp on cci_reunioes(chave_api_id);
create index if not exists idx_reunioes_rede_as on cci_reunioes(as_rede_id);
create index if not exists idx_reunioes_mes     on cci_reunioes(mes_referencia desc);
create index if not exists idx_reunioes_status  on cci_reunioes(status);

create trigger trg_reunioes_updated
  before update on cci_reunioes
  for each row execute function update_updated_at();

alter table cci_reunioes enable row level security;
create policy "Allow all for cci_reunioes" on cci_reunioes
  for all using (true) with check (true);

create table if not exists cci_reunioes_kpis (
  id uuid default gen_random_uuid() primary key,
  reuniao_id uuid not null references cci_reunioes(id) on delete cascade,
  ordem int not null default 0,
  categoria text not null default 'geral'
    check (categoria in ('vendas', 'financeiro', 'operacional', 'geral', 'custom')),
  label text not null,
  valor numeric,
  valor_anterior numeric,
  unidade text,
  meta numeric,
  observacoes text,
  tipo_origem text not null default 'manual'
    check (tipo_origem in ('manual', 'automatico')),
  created_at timestamptz default now()
);

create index if not exists idx_reunioes_kpis_reuniao on cci_reunioes_kpis(reuniao_id, ordem);

alter table cci_reunioes_kpis enable row level security;
create policy "Allow all for cci_reunioes_kpis" on cci_reunioes_kpis
  for all using (true) with check (true);
