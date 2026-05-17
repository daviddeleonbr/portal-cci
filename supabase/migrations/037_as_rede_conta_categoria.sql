-- ============================================================
-- Categoriza cada conta (do plano de contas Autosystem) em uma
-- forma de recebimento usada no Portal CCI:
--   dinheiro | cartao_pix | cheque | a_prazo | outros
--
-- O código da conta no Autosystem é textual e hierárquico
-- (ex: "1.1.01.01"), então `codigo` é text.
-- ============================================================

create table if not exists as_rede_conta_categoria (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  codigo text not null,
  nome text not null,
  categoria text not null
    check (categoria in ('dinheiro', 'cartao_pix', 'cheque', 'a_prazo', 'outros')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (as_rede_id, codigo)
);

create index if not exists idx_as_rede_conta_categoria_rede
  on as_rede_conta_categoria(as_rede_id);
create index if not exists idx_as_rede_conta_categoria_categoria
  on as_rede_conta_categoria(as_rede_id, categoria);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_as_rede_conta_categoria_updated') then
    create trigger trg_as_rede_conta_categoria_updated
      before update on as_rede_conta_categoria
      for each row execute function update_updated_at();
  end if;
end$$;

alter table as_rede_conta_categoria enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'as_rede_conta_categoria'
       and policyname = 'Allow all for as_rede_conta_categoria'
  ) then
    create policy "Allow all for as_rede_conta_categoria"
      on as_rede_conta_categoria for all using (true) with check (true);
  end if;
end$$;
