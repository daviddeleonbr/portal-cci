-- ============================================================
-- Tabela de Clientes (empresas atendidas pela CCI)
-- ============================================================

create table if not exists clientes (
  id uuid default gen_random_uuid() primary key,
  nome text not null,                 -- fantasia/nome curto
  razao_social text,
  cnpj text,
  inscricao_estadual text,
  inscricao_municipal text,
  regime_tributario text,             -- Simples Nacional, Lucro Presumido, Lucro Real
  segmento text,                      -- Posto de combustivel, Comercio, etc
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),

  -- Contato
  contato_nome text,
  contato_email text,
  contato_telefone text,

  -- Endereco
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  cep text,

  -- Integracao Webposto (Quality) - opcional
  chave_api_id uuid references chaves_api(id) on delete set null,
  empresa_codigo integer,              -- empresaCodigo no Webposto
  empresa_api_id uuid references empresas_api(id) on delete set null,
  usa_webposto boolean default false,

  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_clientes_cnpj on clientes(cnpj);
create index if not exists idx_clientes_status on clientes(status);
create index if not exists idx_clientes_chave_api on clientes(chave_api_id);
create index if not exists idx_clientes_empresa_codigo on clientes(empresa_codigo);

create trigger trg_clientes_updated
  before update on clientes
  for each row execute function update_updated_at();

alter table clientes enable row level security;
create policy "Allow all for clientes" on clientes for all using (true) with check (true);
