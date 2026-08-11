-- 158_historico_regra
-- ============================================================
-- Históricos padrão da Exportação Contábil (admin nível 3).
--
-- Templates de histórico (narração) com placeholders, escolhidos por regras que
-- reaproveitam o MESMO modelo de condição do de/para (provisão x pagamento +
-- contas de débito/crédito + despesa de origem). O resultado é um TEXTO, não
-- uma conta contábil.
--
-- Placeholders suportados no template (substituídos no motor de exportação):
--   {documento} {pessoa} {valor} {data} {vencto} {obs}
-- Ex.: "PG DOC {documento} {pessoa}"  →  "PG DOC 209231 WAYNE INDUSTRIA LTDA"
--   ({pessoa} = pessoa.nome via join movto.pessoa = pessoa.grid)
--
-- Diferente das regras de conta, aqui a condição é OPCIONAL: uma regra sem
-- condição vira o histórico PADRÃO (menor prioridade). Só admin (RLS).
-- Idempotente. Rollback no fim.
-- ============================================================

create table if not exists historico_regra (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  tipo_lancamento text not null default 'provisao' check (tipo_lancamento in ('provisao', 'pagamento')),
  prioridade int not null default 0,          -- maior = avaliada primeiro
  cond_conta_debitar text,                    -- null = qualquer
  cond_conta_creditar text,                   -- null = qualquer
  cond_despesa_origem text,                   -- pagamento: débito da provisão de origem
  template text not null,                     -- ex.: "PG DOC {documento} {pessoa}"
  descricao text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_historico_regra_rede on historico_regra(as_rede_id, plano_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_historico_regra_updated') then
    create trigger trg_historico_regra_updated before update on historico_regra
      for each row execute function update_updated_at();
  end if;
end $$;

alter table historico_regra enable row level security;
revoke all on historico_regra from anon;
drop policy if exists historico_regra_admin on historico_regra;
create policy historico_regra_admin on historico_regra for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop table if exists historico_regra;
-- ============================================================
