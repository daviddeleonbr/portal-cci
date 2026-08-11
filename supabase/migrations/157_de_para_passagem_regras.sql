-- 157_de_para_passagem_regras
-- ============================================================
-- Reconcilia o de/para com o modelo revisado (regras SEPARADAS provisão/
-- pagamento + contas de PASSAGEM marcadas manualmente).
--
-- A 156 já foi aplicada numa versão anterior (de_para_mapa/de_para_regra
-- existem; de_para_conta_passagem e as colunas novas não). Nunca se reedita
-- migração aplicada — este é o incremento. Também garante a coluna
-- `classificacao` (155) por segurança. Tudo idempotente. Rollback no fim.
-- ============================================================

-- 1) classificação no plano de contas (garantia; no-op se a 155 já rodou)
alter table plano_contabil_conta add column if not exists classificacao text;

-- 2) contas de passagem (nova tabela)
create table if not exists de_para_conta_passagem (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  conta_gerencial text not null,
  created_at timestamptz default now(),
  unique (as_rede_id, conta_gerencial)
);
create index if not exists idx_de_para_passagem_rede on de_para_conta_passagem(as_rede_id);

alter table de_para_conta_passagem enable row level security;
revoke all on de_para_conta_passagem from anon;
drop policy if exists de_para_passagem_admin on de_para_conta_passagem;
create policy de_para_passagem_admin on de_para_conta_passagem for all using (cci_is_admin()) with check (cci_is_admin());

-- 3) novas colunas nas regras (tipo de lançamento + despesa de origem)
alter table de_para_regra add column if not exists tipo_lancamento text not null default 'provisao';
alter table de_para_regra add column if not exists cond_despesa_origem text;

-- 4) constraints (drop + add p/ idempotência)
alter table de_para_regra drop constraint if exists de_para_regra_tipo_chk;
alter table de_para_regra add constraint de_para_regra_tipo_chk
  check (tipo_lancamento in ('provisao', 'pagamento'));

alter table de_para_regra drop constraint if exists de_para_regra_cond_chk;
alter table de_para_regra add constraint de_para_regra_cond_chk
  check (cond_conta_debitar is not null or cond_conta_creditar is not null or cond_despesa_origem is not null);

-- ============================================================
-- ROLLBACK:
--   alter table de_para_regra drop constraint if exists de_para_regra_tipo_chk;
--   alter table de_para_regra drop column if exists cond_despesa_origem;
--   alter table de_para_regra drop column if exists tipo_lancamento;
--   drop table if exists de_para_conta_passagem;
-- ============================================================
