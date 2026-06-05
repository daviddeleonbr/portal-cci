-- ============================================================
-- Classificação de contas a receber por PREFIXO (Autosystem).
--
-- Substitui o modelo anterior (uma linha por conta individual)
-- por um modelo de prefixos: o admin cadastra quais prefixos
-- pertencem a cada categoria, e qualquer conta debitar que comece
-- com esse prefixo é classificada.
--
-- Exemplo: prefixo '1.3.01' como 'cartoes' classifica '1.3.01',
-- '1.3.01.05', '1.3.01.06' (todas as analíticas).
--
-- "Outros" é derivada: qualquer conta 1.3.* que não casa com
-- nenhum prefixo cadastrado vira "Outros" no front. Não precisa
-- cadastrar.
--
-- Categorias: cartoes, cheques, notas_prazo, faturas.
-- ============================================================

drop table if exists as_rede_conta_receber_categoria cascade;

create table as_rede_categoria_prefixo (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  categoria text not null
    check (categoria in ('cartoes','cheques','notas_prazo','faturas')),
  prefixo text not null,                  -- ex.: '1.3.01', '1.3.04'
  descricao text,                         -- rótulo amigável (opcional)
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (as_rede_id, prefixo)            -- um prefixo pertence a uma só categoria
);

create index idx_as_cat_pref_rede  on as_rede_categoria_prefixo(as_rede_id);
create index idx_as_cat_pref_ativo on as_rede_categoria_prefixo(as_rede_id, categoria) where ativo = true;

create trigger trg_as_cat_pref_updated
  before update on as_rede_categoria_prefixo
  for each row execute function update_updated_at();

alter table as_rede_categoria_prefixo enable row level security;
create policy "Allow all for as_rede_categoria_prefixo" on as_rede_categoria_prefixo
  for all using (true) with check (true);
