-- ============================================================
-- Classificação de administradoras de cartão por REDE (chave_api).
-- Marca quais administradoras (endpoint ADMINISTRADORA do Quality) são
-- de CARTÃO FROTA. Usado, entre outros, pra estimar as transações de
-- frota na calculadora de precificação.
--
-- Espelha o padrão de cliente_contas_bancarias: config por rede vale
-- pra todas as empresas.
-- ============================================================

create table if not exists cliente_administradoras (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  administradora_codigo integer not null,
  descricao text,
  frota boolean not null default false,   -- marcada como cartão frota
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (chave_api_id, administradora_codigo)
);

create index if not exists idx_cliente_administradoras_rede
  on cliente_administradoras(chave_api_id);

create trigger trg_cliente_administradoras_updated
  before update on cliente_administradoras
  for each row execute function update_updated_at();

alter table cliente_administradoras enable row level security;
create policy "Allow all for cliente_administradoras"
  on cliente_administradoras for all using (true) with check (true);

grant all on cliente_administradoras to anon, authenticated;
