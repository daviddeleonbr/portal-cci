-- 156_de_para_contabil
-- ============================================================
-- De/Para contábil (Exportação Contábil, admin nível 3).
--
-- Mapeia as contas GERENCIAIS do cliente (conta_debitar/conta_creditar da
-- `movto` do Autosystem) → contas CONTÁBEIS do plano importado. Por rede.
--
-- Duas camadas:
--   de_para_mapa  — mapa direto: conta gerencial → conta contábil (o comum).
--   de_para_regra — regras condicionais que SOBREPÕEM o mapa, condicionadas às
--                   contas de débito/crédito (ex.: se débito = FGTS, o crédito
--                   contábil vira "FGTS a recolher").
--
-- A conta contábil é referenciada por CÓDIGO (não por id) para sobreviver à
-- reimportação do plano (que apaga e recria as linhas). Só admin (RLS).
-- Idempotente. Rollback no fim.
-- ============================================================

create table if not exists de_para_mapa (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  conta_gerencial text not null,             -- código gerencial (conta_debitar/creditar)
  conta_contabil_codigo text not null,       -- código da conta contábil do plano
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (as_rede_id, plano_id, conta_gerencial)
);
create index if not exists idx_de_para_mapa_rede on de_para_mapa(as_rede_id, plano_id);

-- Contas de PASSAGEM (ex.: 2.1.1 Contas a Pagar): a conta contábil delas não é
-- fixa — resolve pela despesa de origem (na provisão, mesma linha; no pagamento,
-- rastreando a provisão via movto.child/parent). Marcadas manualmente por rede.
create table if not exists de_para_conta_passagem (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  conta_gerencial text not null,
  created_at timestamptz default now(),
  unique (as_rede_id, conta_gerencial)
);
create index if not exists idx_de_para_passagem_rede on de_para_conta_passagem(as_rede_id);

create table if not exists de_para_regra (
  id uuid default gen_random_uuid() primary key,
  as_rede_id uuid not null references as_rede(id) on delete cascade,
  plano_id uuid not null references plano_contabil(id) on delete cascade,
  -- 'provisao' = condiciona pelas contas da própria linha;
  -- 'pagamento' = condiciona pela conta de passagem + despesa de origem (provisão rastreada).
  tipo_lancamento text not null default 'provisao' check (tipo_lancamento in ('provisao', 'pagamento')),
  prioridade int not null default 0,         -- maior = avaliada primeiro
  cond_conta_debitar text,                   -- null = qualquer (provisão: débito; pagamento: a conta de passagem)
  cond_conta_creditar text,                  -- null = qualquer (provisão: crédito)
  cond_despesa_origem text,                  -- pagamento: débito da provisão de origem (ex.: FGTS)
  lado text not null check (lado in ('debito', 'credito', 'ambos')),
  conta_contabil_codigo text not null,       -- conta contábil resultante
  descricao text,                            -- rótulo opcional da regra
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- regra precisa de ao menos uma condição
  constraint de_para_regra_cond_chk check (
    cond_conta_debitar is not null or cond_conta_creditar is not null or cond_despesa_origem is not null
  )
);
create index if not exists idx_de_para_regra_rede on de_para_regra(as_rede_id, plano_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_de_para_mapa_updated') then
    create trigger trg_de_para_mapa_updated before update on de_para_mapa
      for each row execute function update_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_de_para_regra_updated') then
    create trigger trg_de_para_regra_updated before update on de_para_regra
      for each row execute function update_updated_at();
  end if;
end $$;

alter table de_para_mapa           enable row level security;
alter table de_para_regra          enable row level security;
alter table de_para_conta_passagem enable row level security;
revoke all on de_para_mapa           from anon;
revoke all on de_para_regra          from anon;
revoke all on de_para_conta_passagem from anon;
drop policy if exists de_para_mapa_admin     on de_para_mapa;
drop policy if exists de_para_regra_admin    on de_para_regra;
drop policy if exists de_para_passagem_admin on de_para_conta_passagem;
create policy de_para_mapa_admin     on de_para_mapa           for all using (cci_is_admin()) with check (cci_is_admin());
create policy de_para_regra_admin    on de_para_regra          for all using (cci_is_admin()) with check (cci_is_admin());
create policy de_para_passagem_admin on de_para_conta_passagem for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop table if exists de_para_regra;
--   drop table if exists de_para_conta_passagem;
--   drop table if exists de_para_mapa;
-- ============================================================
