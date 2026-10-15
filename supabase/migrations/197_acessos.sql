-- 197_acessos
-- Acessos: login, senha e contrassenha de adquirentes e outras plataformas do
-- cliente, para controle dentro do portal (CCI e cliente).
--   • vale para UMA empresa (cliente_id) ou para a REDE toda (cliente_id null)
--   • CCI: tudo. Cliente (permissão 'acessos'): vê/cadastra/edita os da própria
--     rede (por empresa, só as empresas liberadas para ele). Excluir: só a CCI.
--   • senhas em texto (decisão do negócio) — protegidas pelo RLS por rede.
-- Idempotente.

create table if not exists cci_acesso (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid references clientes(id) on delete cascade,  -- null = rede toda
  chave_api_id       uuid,
  as_rede_id         uuid,
  plataforma         text not null check (char_length(trim(plataforma)) between 2 and 120),
  categoria          text not null default 'adquirente'
                     check (categoria in ('adquirente', 'banco', 'sistema', 'fornecedor', 'governo', 'outro')),
  url                text,
  login              text,
  senha              text,
  contrassenha       text,
  observacao         text,
  atualizado_por_nome text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint cci_acesso_rede_chk check (num_nonnulls(chave_api_id, as_rede_id) = 1)
);
create index if not exists ix_cci_acesso_cliente on cci_acesso (cliente_id);
create index if not exists ix_cci_acesso_rede on cci_acesso (chave_api_id, as_rede_id);

-- Empresa informada → rede vem dela. Rede toda → rede informada (o RLS confere).
create or replace function cci_acesso_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.cliente_id is not null then
    select c.chave_api_id, c.as_rede_id into new.chave_api_id, new.as_rede_id
      from clientes c where c.id = new.cliente_id;
  end if;
  new.plataforma := trim(new.plataforma);
  new.atualizado_por_nome := cci_usuario_atual_nome();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_cci_acesso_tenant on cci_acesso;
create trigger trg_cci_acesso_tenant before insert or update on cci_acesso
  for each row execute function cci_acesso_tenant();

-- Cliente enxerga: acessos da rede toda + das empresas liberadas para ele.
create or replace function cci_acesso_visivel(p_cliente_id uuid, p_chave_api_id uuid, p_as_rede_id uuid)
returns boolean language sql stable
as $$
  select cci_is_admin()
      or (cci_tem_permissao('acessos')
          and cci_rede_bate(p_chave_api_id, p_as_rede_id)
          and (p_cliente_id is null or cci_pode_ver_cliente(p_cliente_id)))
$$;

alter table cci_acesso enable row level security;
revoke all on cci_acesso from anon;

drop policy if exists cci_acesso_sel on cci_acesso;
create policy cci_acesso_sel on cci_acesso for select
  using (cci_acesso_visivel(cliente_id, chave_api_id, as_rede_id));
drop policy if exists cci_acesso_ins on cci_acesso;
create policy cci_acesso_ins on cci_acesso for insert
  with check (cci_acesso_visivel(cliente_id, chave_api_id, as_rede_id));
drop policy if exists cci_acesso_upd on cci_acesso;
create policy cci_acesso_upd on cci_acesso for update
  using (cci_acesso_visivel(cliente_id, chave_api_id, as_rede_id))
  with check (cci_acesso_visivel(cliente_id, chave_api_id, as_rede_id));
drop policy if exists cci_acesso_del on cci_acesso;
create policy cci_acesso_del on cci_acesso for delete using (cci_is_admin());
