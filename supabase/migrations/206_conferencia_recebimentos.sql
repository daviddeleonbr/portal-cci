-- 206_conferencia_recebimentos
-- Conferência de recebimentos (portal do cliente): por empresa + dia, o total
-- recebido no sistema por forma de pagamento (dinheiro, cada administradora,
-- cheque, PIX…), o valor CONFERIDO pelo usuário (portais/extratos) e a
-- diferença. Ao confirmar, fica travada (como Sangrias) e a CCI vê no admin.
--   permissões: 'conferencia_recebimentos' (confere e salva) e
--               'conferencia_recebimentos_consultar' (só visualiza)
create table if not exists cliente_conferencia_recebimentos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete cascade,
  empresa_codigo   integer,
  data             date not null,
  itens            jsonb not null default '[]'::jsonb,  -- [{ chave, rotulo, tipo, sistema, conferido, diferenca }]
  total_sistema    numeric not null default 0,
  total_conferido  numeric not null default 0,
  total_diferenca  numeric not null default 0,
  observacoes      text,
  confirmado_em    timestamptz not null default now(),
  confirmado_por   text,
  confirmado_por_id uuid,
  created_at       timestamptz not null default now(),
  unique (cliente_id, data)
);
create index if not exists ix_conf_receb_cliente_data on cliente_conferencia_recebimentos (cliente_id, data desc);

-- Quem confirmou = usuário do JWT (não confia no front).
create or replace function cci_conf_receb_autor()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.confirmado_por_id := cci_jwt_usuario_id();
  if new.confirmado_por_id is not null then
    new.confirmado_por := coalesce(cci_usuario_atual_nome(), new.confirmado_por);
  end if;
  new.confirmado_em := now();
  return new;
end $$;
drop trigger if exists trg_conf_receb_autor on cliente_conferencia_recebimentos;
create trigger trg_conf_receb_autor before insert on cliente_conferencia_recebimentos
  for each row execute function cci_conf_receb_autor();

alter table cliente_conferencia_recebimentos enable row level security;
revoke all on cliente_conferencia_recebimentos from anon;
drop policy if exists conf_receb_sel on cliente_conferencia_recebimentos;
create policy conf_receb_sel on cliente_conferencia_recebimentos for select
  using (cci_pode_ver_cliente(cliente_id)
         and (cci_tem_permissao('conferencia_recebimentos') or cci_tem_permissao('conferencia_recebimentos_consultar')));
-- Cliente só INSERE (travado depois de confirmado); a CCI pode corrigir/excluir.
drop policy if exists conf_receb_ins on cliente_conferencia_recebimentos;
create policy conf_receb_ins on cliente_conferencia_recebimentos for insert
  with check (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('conferencia_recebimentos'));
drop policy if exists conf_receb_adm on cliente_conferencia_recebimentos;
create policy conf_receb_adm on cliente_conferencia_recebimentos for update
  using (cci_is_admin()) with check (cci_is_admin());
drop policy if exists conf_receb_del on cliente_conferencia_recebimentos;
create policy conf_receb_del on cliente_conferencia_recebimentos for delete using (cci_is_admin());
