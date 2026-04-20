-- ============================================================
-- Chaves de API + Mapeamento por empresa
-- ============================================================

-- Chaves de API dos clientes (Quality, etc)
create table if not exists chaves_api (
  id uuid default gen_random_uuid() primary key,
  nome text not null,                   -- ex: "Rede Trivela"
  provedor text not null default 'quality', -- quality, omie, etc
  chave text not null,
  url_base text not null default 'https://web.qualityautomacao.com.br/INTEGRACAO',
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Empresas importadas da API (cache local)
create table if not exists empresas_api (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  empresa_codigo integer not null,      -- empresaCodigo da API
  cnpj text,
  razao text,
  fantasia text,
  cidade text,
  estado text,
  created_at timestamptz default now(),

  unique(chave_api_id, empresa_codigo)
);

-- Mapeamento: conta da mascara DRE <-> conta do plano gerencial POR EMPRESA
-- (cada empresa pode ter mapeamento independente, ou compartilhar via rede)
create table if not exists mapeamento_empresa_contas (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  grupo_dre_id uuid not null references grupos_dre(id) on delete cascade,
  plano_conta_codigo integer not null,  -- planoContaCodigo da API
  plano_conta_descricao text not null,
  plano_conta_hierarquia text,          -- ex: "2.01.03"
  plano_conta_natureza text,            -- C ou D
  created_at timestamptz default now(),

  unique(chave_api_id, grupo_dre_id, plano_conta_codigo)
);

-- Indexes
create index if not exists idx_empresas_api_chave on empresas_api(chave_api_id);
create index if not exists idx_mapeamento_emp_chave on mapeamento_empresa_contas(chave_api_id);
create index if not exists idx_mapeamento_emp_grupo on mapeamento_empresa_contas(grupo_dre_id);

-- Triggers
create trigger trg_chaves_api_updated
  before update on chaves_api
  for each row execute function update_updated_at();

-- RLS
alter table chaves_api enable row level security;
alter table empresas_api enable row level security;
alter table mapeamento_empresa_contas enable row level security;

create policy "Allow all for chaves_api" on chaves_api for all using (true) with check (true);
create policy "Allow all for empresas_api" on empresas_api for all using (true) with check (true);
create policy "Allow all for mapeamento_empresa_contas" on mapeamento_empresa_contas for all using (true) with check (true);
