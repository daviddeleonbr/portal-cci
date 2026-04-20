-- ============================================================
-- Schema: Mascaras Fluxo de Caixa
-- Estrutura espelhada de mascaras_dre, adaptada para classificacao
-- de entradas/saidas de caixa por grupo (operacional, investimento,
-- financiamento) + subtotais e resultado liquido.
-- ============================================================

-- Mascara de Fluxo de Caixa (template principal)
create table if not exists mascaras_fluxo_caixa (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  descricao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Grupos da mascara (linhas do fluxo)
-- Tipos (mesma sistematica da DRE):
--   grupo      - agrupa contas (ex: ATIVIDADES OPERACIONAIS)
--   entrada    - linha de entrada de caixa (ex: RECEBIMENTOS DE CLIENTES)
--   saida      - linha de saida de caixa (ex: PAGAMENTO A FORNECEDORES)
--   subtotal   - soma intermediaria (ex: = FLUXO OPERACIONAL)
--   resultado  - resultado liquido do periodo (ex: = VARIACAO DE CAIXA)
create table if not exists grupos_fluxo_caixa (
  id uuid default gen_random_uuid() primary key,
  mascara_id uuid not null references mascaras_fluxo_caixa(id) on delete cascade,
  parent_id uuid references grupos_fluxo_caixa(id) on delete set null,
  nome text not null,
  tipo text not null check (tipo in ('grupo', 'entrada', 'saida', 'subtotal', 'resultado')),
  sinal integer not null default 1 check (sinal in (1, -1)),
  ordem integer not null default 0,
  formula text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Mapeamento: conta do plano gerencial externo -> grupo do fluxo
create table if not exists mapeamento_contas_fluxo (
  id uuid default gen_random_uuid() primary key,
  grupo_fluxo_id uuid not null references grupos_fluxo_caixa(id) on delete cascade,
  conta_codigo text not null,
  conta_nome text not null,
  created_at timestamptz default now(),

  unique(grupo_fluxo_id, conta_codigo)
);

-- Indexes
create index if not exists idx_grupos_fluxo_mascara on grupos_fluxo_caixa(mascara_id);
create index if not exists idx_grupos_fluxo_parent on grupos_fluxo_caixa(parent_id);
create index if not exists idx_mapeamento_fluxo_grupo on mapeamento_contas_fluxo(grupo_fluxo_id);
create index if not exists idx_mapeamento_fluxo_codigo on mapeamento_contas_fluxo(conta_codigo);

-- Triggers (reutilizando funcao update_updated_at criada em 001_mascaras_dre.sql)
create trigger trg_mascaras_fluxo_updated
  before update on mascaras_fluxo_caixa
  for each row execute function update_updated_at();

create trigger trg_grupos_fluxo_updated
  before update on grupos_fluxo_caixa
  for each row execute function update_updated_at();

-- RLS policies (permissive, consistente com DRE)
alter table mascaras_fluxo_caixa enable row level security;
alter table grupos_fluxo_caixa enable row level security;
alter table mapeamento_contas_fluxo enable row level security;

create policy "Allow all for mascaras_fluxo_caixa" on mascaras_fluxo_caixa for all using (true) with check (true);
create policy "Allow all for grupos_fluxo_caixa" on grupos_fluxo_caixa for all using (true) with check (true);
create policy "Allow all for mapeamento_contas_fluxo" on mapeamento_contas_fluxo for all using (true) with check (true);
