-- ============================================================
-- Contratos gerados a partir de propostas.
-- Fluxo: proposta → "Converter em contrato" → contrato RASCUNHO
-- (revisado) → enviado para assinatura → assinado/ativo.
--
-- `conteudo` (jsonb) guarda o snapshot no momento da conversão:
-- itens da proposta + ids das cláusulas de serviço aplicáveis.
-- ============================================================

create table if not exists cci_contratos (
  id uuid default gen_random_uuid() primary key,

  proposta_id uuid references cci_propostas(id) on delete set null,
  cliente_id  uuid references clientes(id) on delete set null,
  cliente_nome  text not null,
  cliente_cnpj  text,
  cliente_email text,

  titulo      text not null,
  valor_total numeric(14,2) default 0,
  observacoes text,

  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'assinado', 'ativo', 'cancelado')),

  conteudo jsonb,  -- { itens: [...], clausulaIds: [...], geradoEm }

  enviado_em  timestamptz,
  assinado_em timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_contratos_status  on cci_contratos(status);
create index if not exists idx_contratos_cliente on cci_contratos(cliente_id);

create trigger trg_contratos_updated
  before update on cci_contratos
  for each row execute function update_updated_at();

alter table cci_contratos enable row level security;
create policy "Allow all for cci_contratos" on cci_contratos for all using (true) with check (true);
grant all on cci_contratos to anon, authenticated;
