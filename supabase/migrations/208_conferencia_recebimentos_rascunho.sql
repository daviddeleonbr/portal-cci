-- 208_conferencia_recebimentos_rascunho
-- Rascunho do Resumo de caixa (portal do cliente): o usuário digita parte do
-- "Conferido", salva e volta depois para terminar. Um rascunho por empresa+dia
-- (compartilhado entre os usuários da empresa com a permissão). Ao CONFIRMAR
-- (insert em cliente_conferencia_recebimentos) o rascunho do dia é apagado.
--   valores: { "<chave da forma>": "<texto digitado>" } — casa por chave na
--   recarga, então se o sistema mudar o valor do dia o digitado continua lá.
create table if not exists cliente_conferencia_recebimentos_rascunho (
  cliente_id        uuid not null references clientes(id) on delete cascade,
  data              date not null,
  valores           jsonb not null default '{}'::jsonb,
  observacoes       text,
  atualizado_em     timestamptz not null default now(),
  atualizado_por    text,
  atualizado_por_id uuid,
  primary key (cliente_id, data)
);

-- Autor = usuário do JWT (não confia no front).
create or replace function cci_conf_receb_rascunho_autor()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.atualizado_por_id := cci_jwt_usuario_id();
  if new.atualizado_por_id is not null then
    new.atualizado_por := coalesce(cci_usuario_atual_nome(), new.atualizado_por);
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke execute on function cci_conf_receb_rascunho_autor() from public;
drop trigger if exists trg_conf_receb_rascunho_autor on cliente_conferencia_recebimentos_rascunho;
create trigger trg_conf_receb_rascunho_autor before insert or update on cliente_conferencia_recebimentos_rascunho
  for each row execute function cci_conf_receb_rascunho_autor();

-- Confirmou o dia → some o rascunho.
create or replace function cci_conf_receb_limpa_rascunho()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from cliente_conferencia_recebimentos_rascunho
   where cliente_id = new.cliente_id and data = new.data;
  return new;
end $$;
revoke execute on function cci_conf_receb_limpa_rascunho() from public;
drop trigger if exists trg_conf_receb_limpa_rascunho on cliente_conferencia_recebimentos;
create trigger trg_conf_receb_limpa_rascunho after insert on cliente_conferencia_recebimentos
  for each row execute function cci_conf_receb_limpa_rascunho();

alter table cliente_conferencia_recebimentos_rascunho enable row level security;
revoke all on cliente_conferencia_recebimentos_rascunho from anon;
grant select, insert, update, delete on cliente_conferencia_recebimentos_rascunho to authenticated;
drop policy if exists conf_receb_rasc_all on cliente_conferencia_recebimentos_rascunho;
create policy conf_receb_rasc_all on cliente_conferencia_recebimentos_rascunho for all
  using (cci_is_admin() or (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('conferencia_recebimentos')))
  with check (cci_is_admin() or (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('conferencia_recebimentos')));
