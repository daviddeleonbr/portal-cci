-- ============================================================
-- 238 — Redes e empresas que cada admin N1 pode acessar
--
-- Nova coluna cci_usuarios_sistema.acesso_redes (jsonb):
--   null  = todas as redes e empresas (padrão — ninguém muda de acesso hoje)
--   { "chaves_api": [uuid], "as_redes": [uuid], "empresas": [uuid] }
--     chaves_api / as_redes = rede inteira (inclusive empresas futuras)
--     empresas              = empresas avulsas (clientes.id) de outras redes
-- Só vale para admin N1. N2/N3 ignoram (veem tudo).
--
-- Aplicação: RLS de SELECT/UPDATE/DELETE em clientes, chaves_api, as_rede e
-- empresas_api (os "catálogos" de onde saem todos os seletores de rede/empresa
-- do admin). Lido do banco a cada consulta (não do JWT) → vale na hora.
-- As policies "_mod" (FOR ALL) foram divididas: FOR ALL também cobre SELECT
-- e liberaria tudo de novo.
--
-- Limite desta fase: tabelas de dados por cliente_id (vendas, tarefas,
-- conciliações...) e as Edge Functions autosystem ainda aceitam qualquer admin
-- — o N1 restrito só não chega nelas pela tela. Ver AUDITORIA_PERMISSOES.md.
-- Idempotente. Rollback no fim.
-- ============================================================

alter table cci_usuarios_sistema add column if not exists acesso_redes jsonb;
comment on column cci_usuarios_sistema.acesso_redes is
  'Admin N1: redes/empresas permitidas. null = todas. {chaves_api:[], as_redes:[], empresas:[]} (migration 238)';

-- Restrição do admin que chama (null = sem restrição). Só N1.
create or replace function cci_admin_acesso()
returns jsonb language sql stable security definer set search_path = public as $$
  select u.acesso_redes
    from cci_usuarios_sistema u
   where u.id = cci_jwt_usuario_id()
     and u.tipo = 'admin'
     and coalesce(u.nivel_admin, 1) = 1
$$;
revoke execute on function cci_admin_acesso() from public;
grant  execute on function cci_admin_acesso() to authenticated, service_role;

-- A empresa entra na restrição? (pura; recebe a restrição já lida)
create or replace function cci_acesso_ve_empresa(p_acesso jsonb, p_cliente uuid, p_chave uuid, p_as uuid)
returns boolean language sql immutable as $$
  select p_acesso is null
      or coalesce(coalesce(p_acesso -> 'empresas', '[]'::jsonb) ? p_cliente::text, false)
      or coalesce(coalesce(p_acesso -> 'chaves_api', '[]'::jsonb) ? p_chave::text, false)
      or coalesce(coalesce(p_acesso -> 'as_redes', '[]'::jsonb) ? p_as::text, false)
$$;
revoke execute on function cci_acesso_ve_empresa(jsonb, uuid, uuid, uuid) from public;
grant  execute on function cci_acesso_ve_empresa(jsonb, uuid, uuid, uuid) to authenticated, service_role;

-- O admin que chama vê a rede? Rede inteira liberada OU alguma empresa dela.
create or replace function cci_admin_ve_rede(p_chave uuid, p_as uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  a jsonb := cci_admin_acesso();
begin
  if a is null then return true; end if;
  if p_chave is not null and coalesce(a -> 'chaves_api', '[]'::jsonb) ? p_chave::text then return true; end if;
  if p_as    is not null and coalesce(a -> 'as_redes',   '[]'::jsonb) ? p_as::text    then return true; end if;
  return exists (
    select 1 from clientes c
     where coalesce(a -> 'empresas', '[]'::jsonb) ? c.id::text
       and ((p_chave is not null and c.chave_api_id = p_chave)
         or (p_as    is not null and c.as_rede_id   = p_as)));
end
$$;
revoke execute on function cci_admin_ve_rede(uuid, uuid) from public;
grant  execute on function cci_admin_ve_rede(uuid, uuid) to authenticated, service_role;

-- ── clientes ─────────────────────────────────────────────────
drop policy if exists clientes_sel on clientes;
drop policy if exists clientes_mod on clientes;
drop policy if exists clientes_ins on clientes;
drop policy if exists clientes_upd on clientes;
drop policy if exists clientes_del on clientes;
create policy clientes_sel on clientes for select using (
  (cci_is_admin() and cci_acesso_ve_empresa((select cci_admin_acesso()), id, chave_api_id, as_rede_id))
  or cci_rede_bate(chave_api_id, as_rede_id));
create policy clientes_ins on clientes for insert with check (cci_is_admin());
create policy clientes_upd on clientes for update
  using (cci_is_admin() and cci_acesso_ve_empresa((select cci_admin_acesso()), id, chave_api_id, as_rede_id))
  with check (cci_is_admin());
create policy clientes_del on clientes for delete
  using (cci_is_admin() and cci_acesso_ve_empresa((select cci_admin_acesso()), id, chave_api_id, as_rede_id));

-- ── chaves_api (redes Webposto) ──────────────────────────────
drop policy if exists chaves_api_sel on chaves_api;
drop policy if exists chaves_api_mod on chaves_api;
drop policy if exists chaves_api_ins on chaves_api;
drop policy if exists chaves_api_upd on chaves_api;
drop policy if exists chaves_api_del on chaves_api;
create policy chaves_api_sel on chaves_api for select using (
  (cci_is_admin() and cci_admin_ve_rede(id, null)) or id = cci_jwt_chave_api_id());
create policy chaves_api_ins on chaves_api for insert with check (cci_is_admin());
create policy chaves_api_upd on chaves_api for update
  using (cci_is_admin() and cci_admin_ve_rede(id, null)) with check (cci_is_admin());
create policy chaves_api_del on chaves_api for delete
  using (cci_is_admin() and cci_admin_ve_rede(id, null));

-- ── as_rede (redes Autosystem) ───────────────────────────────
drop policy if exists as_rede_sel on as_rede;
drop policy if exists as_rede_mod on as_rede;
drop policy if exists as_rede_ins on as_rede;
drop policy if exists as_rede_upd on as_rede;
drop policy if exists as_rede_del on as_rede;
create policy as_rede_sel on as_rede for select using (
  (cci_is_admin() and cci_admin_ve_rede(null, id)) or id = cci_jwt_as_rede_id());
create policy as_rede_ins on as_rede for insert with check (cci_is_admin());
create policy as_rede_upd on as_rede for update
  using (cci_is_admin() and cci_admin_ve_rede(null, id)) with check (cci_is_admin());
create policy as_rede_del on as_rede for delete
  using (cci_is_admin() and cci_admin_ve_rede(null, id));

-- ── empresas_api (empresas Webposto da Quality, por chave) ───
drop policy if exists empresas_api_sel on empresas_api;
drop policy if exists empresas_api_mod on empresas_api;
drop policy if exists empresas_api_ins on empresas_api;
drop policy if exists empresas_api_upd on empresas_api;
drop policy if exists empresas_api_del on empresas_api;
create policy empresas_api_sel on empresas_api for select using (
  (cci_is_admin() and cci_admin_ve_rede(chave_api_id, null)) or chave_api_id = cci_jwt_chave_api_id());
create policy empresas_api_ins on empresas_api for insert with check (cci_is_admin());
create policy empresas_api_upd on empresas_api for update
  using (cci_is_admin() and cci_admin_ve_rede(chave_api_id, null)) with check (cci_is_admin());
create policy empresas_api_del on empresas_api for delete
  using (cci_is_admin() and cci_admin_ve_rede(chave_api_id, null));

-- ── definir o acesso (N2 gere N1; N3 gere N1/N2) ─────────────
create or replace function cci_definir_acesso_redes(p_id uuid, p_acesso jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  a_tipo text;
  v      jsonb;
  lista  text;
begin
  if not cci_is_admin() or not cci_pode_gerir_usuario(p_id) then
    raise exception 'Sem permissão para alterar o acesso deste usuário.';
  end if;
  select tipo into a_tipo from cci_usuarios_sistema where id = p_id;
  if a_tipo is distinct from 'admin' then
    raise exception 'Redes e empresas por admin valem só para usuários admin.';
  end if;

  if p_acesso is null or jsonb_typeof(p_acesso) = 'null' then
    v := null;
  else
    if jsonb_typeof(p_acesso) <> 'object' then raise exception 'Formato de acesso inválido.'; end if;
    v := '{}'::jsonb;
    foreach lista in array array['chaves_api', 'as_redes', 'empresas'] loop
      if p_acesso ? lista and jsonb_typeof(p_acesso -> lista) <> 'array' then
        raise exception 'Formato de acesso inválido (%).', lista;
      end if;
      v := v || jsonb_build_object(lista, coalesce(
        (select jsonb_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p_acesso -> lista, '[]'::jsonb)) x),
        '[]'::jsonb));
    end loop;
  end if;

  update cci_usuarios_sistema set acesso_redes = v, updated_at = now() where id = p_id;
end
$$;
revoke execute on function cci_definir_acesso_redes(uuid, jsonb) from public;
grant  execute on function cci_definir_acesso_redes(uuid, jsonb) to authenticated;

-- ============================================================
-- ROLLBACK:
--   recriar as policies originais (111):
--     clientes_sel   select using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id))
--     clientes_mod   all using (cci_is_admin()) with check (cci_is_admin())
--     chaves_api_sel select using (cci_is_admin() or id = cci_jwt_chave_api_id())
--     chaves_api_mod all using (cci_is_admin()) with check (cci_is_admin())
--     as_rede_sel    select using (cci_is_admin() or id = cci_jwt_as_rede_id())
--     as_rede_mod    all using (cci_is_admin()) with check (cci_is_admin())
--     empresas_api_sel select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id())
--     empresas_api_mod all using (cci_is_admin()) with check (cci_is_admin())
--   e dropar *_ins/_upd/_del; drop function cci_definir_acesso_redes(uuid, jsonb),
--   cci_admin_ve_rede(uuid, uuid), cci_acesso_ve_empresa(jsonb, uuid, uuid, uuid),
--   cci_admin_acesso(); alter table cci_usuarios_sistema drop column acesso_redes.
-- ============================================================
