-- 216_bpo_contas_pagar_config
-- BPO · Contas a pagar: dias da semana em que o cliente paga (por empresa).
-- dias_pagamento: 0=domingo … 6=sábado. Ex.: {1,3,5} = seg/qua/sex.
-- Vazio = qualquer dia útil. Usado pra navegar entre dias de pagamento e
-- sugerir o "ciclo" de cada pagamento (vencidas + o que vence até o próximo).
-- RLS: ver = quem vê a empresa; alterar = só CCI. Idempotente.

create table if not exists bpo_contas_pagar_config (
  cliente_id          uuid primary key references clientes(id) on delete cascade,
  dias_pagamento      smallint[] not null default '{}',
  atualizado_por_id   uuid,
  updated_at          timestamptz not null default now(),
  constraint bpo_cp_config_dias_validos check (dias_pagamento <@ array[0,1,2,3,4,5,6]::smallint[])
);

create or replace function bpo_contas_pagar_config_carimbo()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  new.atualizado_por_id := cci_jwt_usuario_id();
  return new;
end $$;

drop trigger if exists trg_bpo_cp_config_carimbo on bpo_contas_pagar_config;
create trigger trg_bpo_cp_config_carimbo
  before insert or update on bpo_contas_pagar_config
  for each row execute function bpo_contas_pagar_config_carimbo();

alter table bpo_contas_pagar_config enable row level security;
revoke all on bpo_contas_pagar_config from anon;

drop policy if exists bpo_cp_config_sel on bpo_contas_pagar_config;
create policy bpo_cp_config_sel on bpo_contas_pagar_config
  for select using (cci_pode_ver_cliente(cliente_id));

drop policy if exists bpo_cp_config_ins on bpo_contas_pagar_config;
create policy bpo_cp_config_ins on bpo_contas_pagar_config
  for insert with check (cci_is_admin());

drop policy if exists bpo_cp_config_upd on bpo_contas_pagar_config;
create policy bpo_cp_config_upd on bpo_contas_pagar_config
  for update using (cci_is_admin()) with check (cci_is_admin());

drop policy if exists bpo_cp_config_del on bpo_contas_pagar_config;
create policy bpo_cp_config_del on bpo_contas_pagar_config
  for delete using (cci_is_admin());

grant select, insert, update, delete on bpo_contas_pagar_config to authenticated;
