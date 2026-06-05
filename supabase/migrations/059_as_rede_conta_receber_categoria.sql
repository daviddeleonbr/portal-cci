-- ============================================================
-- Classificação de contas a receber por categoria (Autosystem).
--
-- Cada conta sintética do plano (1.3.x) pode ser marcada como:
--   - cartoes
--   - cheques
--   - notas_prazo
--   - faturas
--   - outros
--
-- O ClienteContasReceber (autosystem) usa esse mapeamento pra
-- montar as abas/KPIs por categoria. Antes ficava hardcoded por
-- prefixo ('1.3.01' = cartões); agora cada rede configura no
-- admin (alguns clientes têm contas em códigos diferentes).
--
-- Default permissivo: se a rede não tem nada cadastrado, o front
-- aplica o mapeamento padrão histórico (1.3.01 → cartões etc.).
-- ============================================================

create table if not exists as_rede_conta_receber_categoria (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  codigo text not null,                         -- ex.: '1.3.01', '1.3.02.1'
  descricao text,                               -- snapshot do nome
  categoria text not null
    check (categoria in ('cartoes','cheques','notas_prazo','faturas','outros')),
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (as_rede_id, codigo)
);

create index if not exists idx_as_cr_cat_rede on as_rede_conta_receber_categoria(as_rede_id);
create index if not exists idx_as_cr_cat_cat  on as_rede_conta_receber_categoria(as_rede_id, categoria) where ativo = true;

create trigger trg_as_cr_cat_updated
  before update on as_rede_conta_receber_categoria
  for each row execute function update_updated_at();

alter table as_rede_conta_receber_categoria enable row level security;
create policy "Allow all for as_rede_conta_receber_categoria" on as_rede_conta_receber_categoria
  for all using (true) with check (true);
