-- ============================================================
-- Gestao financeira interna da CCI (NAO confundir com clientes)
-- Tabelas: plano de contas, fornecedores, contas a pagar
-- ============================================================

-- Plano de contas interno da CCI
create table if not exists cci_plano_contas (
  id uuid default gen_random_uuid() primary key,
  codigo text not null,
  nome text not null,
  tipo text not null default 'analitica' check (tipo in ('sintetica', 'analitica')),
  natureza text not null default 'despesa' check (natureza in ('receita', 'despesa')),
  parent_id uuid references cci_plano_contas(id) on delete set null,
  ativo boolean default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(codigo)
);

create index if not exists idx_cci_plano_parent on cci_plano_contas(parent_id);
create index if not exists idx_cci_plano_codigo on cci_plano_contas(codigo);
create index if not exists idx_cci_plano_natureza on cci_plano_contas(natureza);

-- Fornecedores da CCI
create table if not exists cci_fornecedores (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cpf_cnpj text,
  email text,
  telefone text,
  observacoes text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cci_fornecedor_nome on cci_fornecedores(nome);
create index if not exists idx_cci_fornecedor_cnpj on cci_fornecedores(cpf_cnpj);

-- Contas a pagar da CCI
create table if not exists cci_contas_pagar (
  id uuid default gen_random_uuid() primary key,
  fornecedor_id uuid references cci_fornecedores(id) on delete set null,
  plano_conta_id uuid references cci_plano_contas(id) on delete set null,
  descricao text not null,
  numero_documento text,
  data_emissao date,
  vencimento date not null,
  data_pagamento date,
  valor numeric(14, 2) not null,
  valor_pago numeric(14, 2),
  juros numeric(14, 2) default 0,
  desconto numeric(14, 2) default 0,
  forma_pagamento text,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'vencido', 'cancelado', 'parcial')),
  parcela integer default 1,
  quantidade_parcelas integer default 1,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cci_cp_fornecedor on cci_contas_pagar(fornecedor_id);
create index if not exists idx_cci_cp_plano on cci_contas_pagar(plano_conta_id);
create index if not exists idx_cci_cp_status on cci_contas_pagar(status);
create index if not exists idx_cci_cp_vencimento on cci_contas_pagar(vencimento);

-- Triggers (reutilizam funcao update_updated_at do 001_mascaras_dre.sql)
create trigger trg_cci_plano_updated
  before update on cci_plano_contas
  for each row execute function update_updated_at();

create trigger trg_cci_fornecedor_updated
  before update on cci_fornecedores
  for each row execute function update_updated_at();

create trigger trg_cci_cp_updated
  before update on cci_contas_pagar
  for each row execute function update_updated_at();

-- RLS
alter table cci_plano_contas enable row level security;
alter table cci_fornecedores enable row level security;
alter table cci_contas_pagar enable row level security;

create policy "Allow all for cci_plano_contas" on cci_plano_contas for all using (true) with check (true);
create policy "Allow all for cci_fornecedores" on cci_fornecedores for all using (true) with check (true);
create policy "Allow all for cci_contas_pagar" on cci_contas_pagar for all using (true) with check (true);
