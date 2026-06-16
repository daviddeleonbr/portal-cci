-- ============================================================
-- Catálogo de serviços oferecidos pela CCI
-- ============================================================
--
-- Centraliza os serviços que a CCI oferece (Consultoria DRE, BPO
-- Financeiro, Fiscal, etc). Esse catálogo alimenta as Propostas e,
-- consequentemente, os Contratos — em vez de redigitar valor e
-- descrição em cada proposta, o usuário só seleciona daqui.

create table if not exists cci_servicos_oferecidos (
  id uuid default gen_random_uuid() primary key,
  nome           text not null,
  descricao      text,
  categoria      text default 'outro'
    check (categoria in ('consultoria', 'bpo', 'fiscal', 'tecnologia', 'treinamento', 'outro')),

  -- Valor de referência (pode ser sobrescrito por proposta).
  -- periodicidade: define se o valor é cobrado por mês/ano/uma vez.
  valor          numeric(14,2) default 0,
  periodicidade  text default 'mensal'
    check (periodicidade in ('mensal', 'anual', 'unico')),

  -- Soft delete via flag (preserva histórico em propostas/contratos
  -- antigos que ainda referenciam o serviço).
  ativo          boolean default true,
  observacoes    text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_servicos_oferecidos_ativo     on cci_servicos_oferecidos(ativo);
create index if not exists idx_servicos_oferecidos_categoria on cci_servicos_oferecidos(categoria);

create trigger trg_servicos_oferecidos_updated
  before update on cci_servicos_oferecidos
  for each row execute function update_updated_at();

alter table cci_servicos_oferecidos enable row level security;
create policy "Allow all for cci_servicos_oferecidos"
  on cci_servicos_oferecidos for all using (true) with check (true);

grant all on cci_servicos_oferecidos to anon, authenticated;
