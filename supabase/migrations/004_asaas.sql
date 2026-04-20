-- ============================================================
-- Integracao com Asaas (NFS-e, Customers, Invoices)
-- ============================================================

-- Configuracao de credenciais Asaas (1 por empresa CCI, pode evoluir p/ multi-tenant)
create table if not exists configuracoes_asaas (
  id uuid default gen_random_uuid() primary key,
  nome text not null default 'Padrao',        -- ex: "CCI Consultoria"
  api_key text not null,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox', 'producao')),
  wallet_id text,                              -- walletId para split (opcional)
  municipio_servico_id text,                   -- id do servico municipal padrao
  municipio_servico_codigo text,               -- ex: "0107"
  municipio_servico_descricao text,            -- ex: "Assessoria Contabil"
  aliquota_iss numeric(5,2) default 0,         -- aliquota ISS padrao (%)
  observacoes_padrao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cache de customers criados no Asaas (vinculados aos clientes internos)
create table if not exists asaas_customers (
  id uuid default gen_random_uuid() primary key,
  config_id uuid not null references configuracoes_asaas(id) on delete cascade,
  cliente_nome text not null,                  -- nome no nosso sistema
  cliente_cnpj text,
  asaas_customer_id text not null,             -- id retornado pelo Asaas
  email text,
  phone text,
  created_at timestamptz default now(),

  unique(config_id, asaas_customer_id)
);

-- Cache local das notas fiscais emitidas via Asaas
create table if not exists notas_fiscais_asaas (
  id uuid default gen_random_uuid() primary key,
  config_id uuid not null references configuracoes_asaas(id) on delete cascade,
  asaas_invoice_id text not null,              -- id da nota no Asaas
  numero text,                                  -- numero da NFS-e (apos autorizacao)
  cliente_nome text not null,
  cliente_cnpj text,
  valor numeric(14,2) not null,
  valor_iss numeric(14,2) default 0,
  valor_pis numeric(14,2) default 0,
  valor_cofins numeric(14,2) default 0,
  valor_inss numeric(14,2) default 0,
  valor_ir numeric(14,2) default 0,
  valor_csll numeric(14,2) default 0,
  data_emissao date,
  data_autorizacao timestamptz,
  status text default 'PENDING',               -- PENDING, AUTHORIZED, CANCELED, PROCESSING_CANCELLATION, ERROR
  servico_descricao text,
  observacoes text,
  pdf_url text,
  xml_url text,
  erro_mensagem text,
  raw_json jsonb,                               -- dump completo da resposta da API
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(config_id, asaas_invoice_id)
);

-- Indexes
create index if not exists idx_asaas_customers_config on asaas_customers(config_id);
create index if not exists idx_asaas_customers_cnpj on asaas_customers(cliente_cnpj);
create index if not exists idx_asaas_nf_config on notas_fiscais_asaas(config_id);
create index if not exists idx_asaas_nf_status on notas_fiscais_asaas(status);
create index if not exists idx_asaas_nf_data on notas_fiscais_asaas(data_emissao desc);

-- Triggers
create trigger trg_configuracoes_asaas_updated
  before update on configuracoes_asaas
  for each row execute function update_updated_at();

create trigger trg_notas_fiscais_asaas_updated
  before update on notas_fiscais_asaas
  for each row execute function update_updated_at();

-- RLS
alter table configuracoes_asaas enable row level security;
alter table asaas_customers enable row level security;
alter table notas_fiscais_asaas enable row level security;

create policy "Allow all for configuracoes_asaas" on configuracoes_asaas for all using (true) with check (true);
create policy "Allow all for asaas_customers" on asaas_customers for all using (true) with check (true);
create policy "Allow all for notas_fiscais_asaas" on notas_fiscais_asaas for all using (true) with check (true);
