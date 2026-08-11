-- 159_de_para_exclusao
-- ============================================================
-- Regras de EXCLUSÃO da Exportação Contábil (admin nível 3).
--
-- Lançamentos que a contabilidade já importa por outro módulo (fiscal, DP)
-- não devem sair no arquivo. Cada regra é uma condição por conta de débito
-- e/ou crédito; casando, a linha é omitida da exportação. Por rede+plano.
--
-- Ex.: débito PDV + crédito Receita  → excluir (entra pelo módulo fiscal)
--      débito Estoque + crédito Contas a Pagar → excluir
-- Só admin (RLS). Idempotente. Rollback no fim.
-- ============================================================

create table if not exists de_para_exclusao (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  cond_conta_debitar text,                   -- null = qualquer
  cond_conta_creditar text,                  -- null = qualquer
  descricao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint de_para_exclusao_cond_chk check (cond_conta_debitar is not null or cond_conta_creditar is not null)
);
create index if not exists idx_de_para_exclusao_rede on de_para_exclusao(as_rede_id, plano_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_de_para_exclusao_updated') then
    create trigger trg_de_para_exclusao_updated before update on de_para_exclusao
      for each row execute function update_updated_at();
  end if;
end $$;

alter table de_para_exclusao enable row level security;
revoke all on de_para_exclusao from anon;
drop policy if exists de_para_exclusao_admin on de_para_exclusao;
create policy de_para_exclusao_admin on de_para_exclusao for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop table if exists de_para_exclusao;
-- ============================================================
