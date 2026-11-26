-- 231_rede_contas_intercompany
-- Contas usadas para TRANSFERÊNCIAS ENTRE FILIAIS de uma rede (ex.: "conta corrente
-- entre empresas", "transferência entre filiais"). Movimento com essa conta como
-- plano/contrapartida é tratado como transferência entre empresas do grupo: o
-- casamento saída × entrada (Fluxo de Caixa, visão da rede) passa a ter evidência
-- forte, sem depender do histórico. codigo = plano gerencial (Webposto) ou conta
-- contábil da contrapartida (Autosystem). Só a CCI (admin) lê e grava.

create table if not exists rede_contas_intercompany (
  id           uuid primary key default gen_random_uuid(),
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id) on delete cascade,
  codigo       text not null check (char_length(trim(codigo)) > 0),
  descricao    text,
  criado_por   text,
  created_at   timestamptz not null default now(),
  check (num_nonnulls(chave_api_id, as_rede_id) = 1)   -- exatamente uma rede
);
create unique index if not exists rede_contas_ic_wp_uq on rede_contas_intercompany (chave_api_id, codigo) where chave_api_id is not null;
create unique index if not exists rede_contas_ic_as_uq on rede_contas_intercompany (as_rede_id, codigo) where as_rede_id is not null;

alter table rede_contas_intercompany enable row level security;
revoke all on rede_contas_intercompany from anon;
drop policy if exists rede_contas_ic_admin on rede_contas_intercompany;
create policy rede_contas_ic_admin on rede_contas_intercompany
  for all using (cci_is_admin()) with check (cci_is_admin());
grant select, insert, update, delete on rede_contas_intercompany to authenticated;
