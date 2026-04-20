-- ============================================================
-- Mapeamento plano gerencial -> grupos de Fluxo de Caixa
-- (espelho de mapeamento_empresa_contas + mapeamento_manual_contas)
-- ============================================================

-- Mapeamento webposto: chave_api -> conta do plano gerencial -> grupo do fluxo
create table if not exists mapeamento_empresa_contas_fluxo (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  grupo_fluxo_id uuid not null references grupos_fluxo_caixa(id) on delete cascade,
  plano_conta_codigo text not null,
  plano_conta_descricao text not null,
  plano_conta_hierarquia text,
  plano_conta_natureza text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(chave_api_id, grupo_fluxo_id, plano_conta_codigo)
);

create index if not exists idx_mapemp_fluxo_chave on mapeamento_empresa_contas_fluxo(chave_api_id);
create index if not exists idx_mapemp_fluxo_grupo on mapeamento_empresa_contas_fluxo(grupo_fluxo_id);
create index if not exists idx_mapemp_fluxo_codigo on mapeamento_empresa_contas_fluxo(plano_conta_codigo);

create trigger trg_mapemp_fluxo_updated
  before update on mapeamento_empresa_contas_fluxo
  for each row execute function update_updated_at();

alter table mapeamento_empresa_contas_fluxo enable row level security;
create policy "Allow all for mapeamento_empresa_contas_fluxo" on mapeamento_empresa_contas_fluxo for all using (true) with check (true);

-- Mapeamento manual: cliente + mascara fluxo -> conta manual -> grupo do fluxo
create table if not exists mapeamento_manual_contas_fluxo (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  mascara_id uuid not null references mascaras_fluxo_caixa(id) on delete cascade,
  grupo_fluxo_id uuid not null references grupos_fluxo_caixa(id) on delete cascade,
  conta_codigo text,
  conta_descricao text not null,
  conta_natureza text,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_mapman_fluxo_cliente on mapeamento_manual_contas_fluxo(cliente_id);
create index if not exists idx_mapman_fluxo_mascara on mapeamento_manual_contas_fluxo(mascara_id);
create index if not exists idx_mapman_fluxo_grupo on mapeamento_manual_contas_fluxo(grupo_fluxo_id);

create trigger trg_mapman_fluxo_updated
  before update on mapeamento_manual_contas_fluxo
  for each row execute function update_updated_at();

alter table mapeamento_manual_contas_fluxo enable row level security;
create policy "Allow all for mapeamento_manual_contas_fluxo" on mapeamento_manual_contas_fluxo for all using (true) with check (true);
