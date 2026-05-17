-- ============================================================
-- Espelha (parcialmente) a tabela `grupo_produto` do Autosystem
-- e atribui a cada grupo uma categoria interna do Portal CCI:
--   combustivel | automotivos | conveniencia
--
-- A classificação é manual (admin escolhe pelo modal).
-- ============================================================

create table if not exists as_rede_grupo_produto (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  -- Identificação do grupo no Autosystem (vem de grupo_produto.codigo / grid)
  codigo integer,
  grid integer,
  nome text not null,
  -- Categoria definida pelo admin
  categoria text not null
    check (categoria in ('combustivel', 'automotivos', 'conveniencia')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Não permitir o mesmo grupo classificado duas vezes na mesma rede
  unique (as_rede_id, codigo)
);

create index if not exists idx_as_rede_grupo_produto_rede
  on as_rede_grupo_produto(as_rede_id);
create index if not exists idx_as_rede_grupo_produto_categoria
  on as_rede_grupo_produto(as_rede_id, categoria);

-- Trigger updated_at (reusa função update_updated_at já existente)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_as_rede_grupo_produto_updated') then
    create trigger trg_as_rede_grupo_produto_updated
      before update on as_rede_grupo_produto
      for each row execute function update_updated_at();
  end if;
end$$;

alter table as_rede_grupo_produto enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'as_rede_grupo_produto'
       and policyname = 'Allow all for as_rede_grupo_produto'
  ) then
    create policy "Allow all for as_rede_grupo_produto"
      on as_rede_grupo_produto for all using (true) with check (true);
  end if;
end$$;
