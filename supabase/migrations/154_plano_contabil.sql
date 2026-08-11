-- 154_plano_contabil
-- ============================================================
-- Ferramenta "Exportação Contábil" (admin nível 3).
--
-- Planos de contas CONTÁBEIS importados de planilha (vários planos), cada um
-- atribuível a uma ou mais redes (mesmo modelo de allowlist das máscaras).
-- Servem de destino do de/para: conta gerencial (Autosystem/movto) → conta
-- contábil, para exportar no layout da contabilidade do cliente.
--
-- Tabelas:
--   plano_contabil        — cabeçalho do plano (nome).
--   plano_contabil_conta  — linhas importadas (codigo p/ hierarquia/tree,
--                           codigo_reduzido, descricao, natureza).
--   plano_contabil_rede   — quais redes usam o plano (chave_api XOR as_rede).
--
-- RLS: ferramenta interna da CCI — só admin lê/escreve. anon revogado.
-- Idempotente. Rollback no fim.
-- ============================================================

create table if not exists plano_contabil (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  descricao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists plano_contabil_conta (
  id uuid default gen_random_uuid() primary key,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  codigo text not null,              -- ex: 1.1.01.001 — define a hierarquia (tree)
  codigo_reduzido text,              -- código reduzido usado em alguns layouts
  descricao text not null,
  natureza text,                     -- devedora/credora (livre — vem da planilha)
  ordem int default 0,               -- preserva a ordem de importação
  created_at timestamptz default now(),
  unique (plano_id, codigo)
);
create index if not exists idx_plano_contabil_conta_plano on plano_contabil_conta(plano_id);

create table if not exists plano_contabil_rede (
  id uuid default gen_random_uuid() primary key,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id uuid references as_rede(id) on delete cascade,
  created_at timestamptz default now(),
  constraint plano_contabil_rede_xor check (num_nonnulls(chave_api_id, as_rede_id) = 1),
  unique (plano_id, chave_api_id, as_rede_id)
);
create index if not exists idx_plano_contabil_rede_plano on plano_contabil_rede(plano_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_plano_contabil_updated') then
    create trigger trg_plano_contabil_updated
      before update on plano_contabil
      for each row execute function update_updated_at();
  end if;
end $$;

-- ─── RLS: só admin ───────────────────────────────────────────
alter table plano_contabil        enable row level security;
alter table plano_contabil_conta  enable row level security;
alter table plano_contabil_rede   enable row level security;

revoke all on plano_contabil       from anon;
revoke all on plano_contabil_conta from anon;
revoke all on plano_contabil_rede  from anon;

drop policy if exists plano_contabil_admin       on plano_contabil;
drop policy if exists plano_contabil_conta_admin on plano_contabil_conta;
drop policy if exists plano_contabil_rede_admin  on plano_contabil_rede;

create policy plano_contabil_admin       on plano_contabil       for all using (cci_is_admin()) with check (cci_is_admin());
create policy plano_contabil_conta_admin on plano_contabil_conta for all using (cci_is_admin()) with check (cci_is_admin());
create policy plano_contabil_rede_admin  on plano_contabil_rede  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop table if exists plano_contabil_rede;
--   drop table if exists plano_contabil_conta;
--   drop table if exists plano_contabil;
-- ============================================================
