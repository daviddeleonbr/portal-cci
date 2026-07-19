-- 149_admin_nivel_hierarquia
-- ============================================================
-- Hierarquia de 3 níveis de admin + enforcement no banco.
--
-- Regras:
--   N3 gere N2, N1 e clientes (NUNCA outro N3).
--   N2 gere N1 e clientes (nunca N2/N3).
--   N1 não gere ninguém.
--   Só N3 altera o NÍVEL de alguém (promover/rebaixar).
--   Ninguém se auto-gerencia (evita auto-escalonamento).
--
-- Como o problema atual é que TODO admin tinha read/write direto na tabela
-- (via PostgREST), aqui:
--   1) adiciona `nivel_admin` (1..3);
--   2) claim `cci_nivel_admin` no JWT (feito no auth-jwt.ts / montarClaims);
--   3) REVOGA insert/update/delete direto do `authenticated` — toda escrita
--      passa a ir por RPCs SECURITY DEFINER que validam a matriz;
--   4) helper `cci_pode_gerir_usuario` centraliza o "quem gere quem" (admin por
--      nível + cliente-gerente da própria rede).
-- Idempotente. Rollback no fim.
-- ============================================================

-- ── 1) Coluna nivel_admin ──────────────────────────────────────────
alter table cci_usuarios_sistema add column if not exists nivel_admin smallint;

update cci_usuarios_sistema set nivel_admin = 3
 where tipo = 'admin' and is_master = true and nivel_admin is null;
update cci_usuarios_sistema set nivel_admin = 1
 where tipo = 'admin' and nivel_admin is null;
update cci_usuarios_sistema set nivel_admin = null
 where tipo <> 'admin';

alter table cci_usuarios_sistema drop constraint if exists chk_nivel_admin;
alter table cci_usuarios_sistema add constraint chk_nivel_admin check (
  (tipo = 'admin' and nivel_admin in (1,2,3))
  or (tipo <> 'admin' and nivel_admin is null)
) not valid;
-- `not valid` evita travar se houver linha legada estranha; valida em seguida:
alter table cci_usuarios_sistema validate constraint chk_nivel_admin;

-- ── 2) Helper de nível do ator (lê o claim do JWT) ─────────────────
create or replace function cci_nivel_admin()
returns smallint language sql stable
as $$ select nullif(auth.jwt() ->> 'cci_nivel_admin', '')::smallint $$;

-- ── 3) Helper "posso gerir este alvo?" ─────────────────────────────
-- SECURITY DEFINER pra ler tipo/nível do alvo sem depender do RLS.
create or replace function cci_pode_gerir_usuario(p_alvo uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  a_tipo   text;
  a_nivel  smallint;
  a_chave  uuid;
  a_rede   uuid;
  v_nivel  smallint;
begin
  select tipo, nivel_admin, chave_api_id, as_rede_id
    into a_tipo, a_nivel, a_chave, a_rede
    from cci_usuarios_sistema where id = p_alvo;
  if not found then return false; end if;

  if cci_is_admin() then
    v_nivel := cci_nivel_admin();
    if v_nivel is null or v_nivel < 2 then return false; end if;   -- N1/sem-nível não gere
    if a_tipo = 'cliente' then return true; end if;                -- N2/N3 gerem clientes
    -- alvo é admin:
    if a_nivel = 3 then return false; end if;                      -- ninguém gere N3 (nem self N3)
    if v_nivel = 3 then return true; end if;                       -- N3 gere N1 e N2
    if v_nivel = 2 then return a_nivel = 1; end if;                -- N2 só gere N1
    return false;
  end if;

  -- Ator cliente (gerente da rede): só usuários CLIENTE da própria rede e
  -- com a permissão 'gerenciar_usuarios'.
  return a_tipo = 'cliente'
     and (a_chave = cci_jwt_chave_api_id() or a_rede = cci_jwt_as_rede_id())
     and coalesce((auth.jwt() -> 'cci_permissoes') ? 'gerenciar_usuarios', false);
end
$$;
revoke execute on function cci_pode_gerir_usuario(uuid) from public;
grant  execute on function cci_pode_gerir_usuario(uuid) to authenticated, service_role;

-- ── 4) RPCs de escrita (única via de gravação) ─────────────────────
-- Criar usuário. p_dados = payload sanitizado (sem senha). Retorna o id novo.
create or replace function cci_gerir_criar_usuario(p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin   boolean := cci_is_admin();
  v_nivel   smallint := cci_nivel_admin();
  v_tipo    text := coalesce(p_dados->>'tipo', 'cliente');
  v_chave   uuid := nullif(p_dados->>'chave_api_id','')::uuid;
  v_rede    uuid := nullif(p_dados->>'as_rede_id','')::uuid;
  v_nivelnovo smallint := nullif(p_dados->>'nivel_admin','')::smallint;
  v_perms   text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'permissoes','[]'::jsonb)) x), '{}');
  v_emp     uuid[];
  v_novo    uuid;
begin
  if p_dados ? 'empresas_permitidas' and jsonb_typeof(p_dados->'empresas_permitidas') = 'array' then
    v_emp := (select array_agg(x::uuid) from jsonb_array_elements_text(p_dados->'empresas_permitidas') x);
  end if;

  if v_admin then
    if v_nivel is null or v_nivel < 2 then raise exception 'Sem permissão para criar usuários.'; end if;
    if v_tipo = 'admin' then
      if v_nivelnovo is null then v_nivelnovo := 1; end if;
      if v_nivelnovo not in (1,2,3) then raise exception 'Nível inválido.'; end if;
      -- N2 só cria admin N1; N3 cria qualquer nível.
      if v_nivel = 2 and v_nivelnovo <> 1 then
        raise exception 'Nível 2 só pode criar admins de nível 1.';
      end if;
      v_chave := null; v_rede := null; v_emp := null;
    else
      v_tipo := 'cliente'; v_nivelnovo := null;
    end if;
  else
    -- Ator cliente-gerente: só cria CLIENTE na própria rede.
    if not coalesce((auth.jwt() -> 'cci_permissoes') ? 'gerenciar_usuarios', false) then
      raise exception 'Sem permissão para criar usuários.';
    end if;
    v_tipo := 'cliente'; v_nivelnovo := null;
    v_chave := cci_jwt_chave_api_id();
    v_rede  := cci_jwt_as_rede_id();
    if v_chave is null and v_rede is null then raise exception 'Rede do gerente não identificada.'; end if;
  end if;

  insert into cci_usuarios_sistema
    (nome, email, tipo, chave_api_id, as_rede_id, permissoes, status, observacoes,
     empresas_permitidas, nivel_admin, criado_por)
  values
    (trim(coalesce(p_dados->>'nome','')), lower(trim(coalesce(p_dados->>'email',''))), v_tipo,
     v_chave, v_rede, v_perms, coalesce(p_dados->>'status','ativo'), p_dados->>'observacoes',
     case when v_emp is not null and array_length(v_emp,1) > 0 then v_emp else null end,
     v_nivelnovo, cci_jwt_usuario_id())
  returning id into v_novo;
  return v_novo;
end
$$;
revoke execute on function cci_gerir_criar_usuario(jsonb) from public;
grant  execute on function cci_gerir_criar_usuario(jsonb) to authenticated;

-- Atualizar usuário. Só campos permitidos; nível só por N3.
create or replace function cci_gerir_atualizar_usuario(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin   boolean := cci_is_admin();
  v_nivel   smallint := cci_nivel_admin();
  a_tipo    text;
  a_nivel   smallint;
  v_tipo    text;
  v_nivelnovo smallint;
  v_perms   text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'permissoes','[]'::jsonb)) x), '{}');
  v_emp     uuid[];
  -- Presença da chave = intenção de definir (array = subconjunto; null/[] = acesso total).
  v_emp_set boolean := (p_dados ? 'empresas_permitidas');
begin
  if not cci_pode_gerir_usuario(p_id) then
    raise exception 'Sem permissão para editar este usuário.';
  end if;
  select tipo, nivel_admin into a_tipo, a_nivel from cci_usuarios_sistema where id = p_id;

  if v_emp_set and jsonb_typeof(p_dados->'empresas_permitidas') = 'array' then
    v_emp := (select array_agg(x::uuid) from jsonb_array_elements_text(p_dados->'empresas_permitidas') x);
  end if;

  -- Nível: só N3 muda, e nunca para/entre N3 alheio (alvo N3 já barrado no pode_gerir).
  v_tipo := a_tipo;                                  -- troca de tipo: só N3
  if p_dados ? 'tipo' and (p_dados->>'tipo') <> a_tipo then
    if not v_admin or v_nivel <> 3 then raise exception 'Só nível 3 altera o tipo do usuário.'; end if;
    v_tipo := p_dados->>'tipo';
  end if;

  v_nivelnovo := a_nivel;
  if v_tipo = 'admin' then
    if p_dados ? 'nivel_admin' and coalesce(nullif(p_dados->>'nivel_admin','')::smallint, a_nivel) <> coalesce(a_nivel,-1) then
      if not v_admin or v_nivel <> 3 then raise exception 'Só nível 3 altera o nível de um admin.'; end if;
      v_nivelnovo := nullif(p_dados->>'nivel_admin','')::smallint;
      if v_nivelnovo not in (1,2,3) then raise exception 'Nível inválido.'; end if;
    end if;
    if v_nivelnovo is null then v_nivelnovo := 1; end if;
  else
    v_nivelnovo := null;
  end if;

  update cci_usuarios_sistema set
    nome        = coalesce(nullif(trim(p_dados->>'nome'),''), nome),
    email       = coalesce(nullif(lower(trim(p_dados->>'email')),''), email),
    tipo        = v_tipo,
    permissoes  = v_perms,
    status      = coalesce(p_dados->>'status', status),
    observacoes = case when p_dados ? 'observacoes' then p_dados->>'observacoes' else observacoes end,
    nivel_admin = v_nivelnovo,
    -- vínculo de rede: admin não tem; cliente mantém/define
    chave_api_id = case when v_tipo = 'admin' then null
                        when p_dados ? 'chave_api_id' then nullif(p_dados->>'chave_api_id','')::uuid
                        else chave_api_id end,
    as_rede_id   = case when v_tipo = 'admin' then null
                        when p_dados ? 'as_rede_id' then nullif(p_dados->>'as_rede_id','')::uuid
                        else as_rede_id end,
    empresas_permitidas = case
      when v_tipo = 'admin' then null
      when v_emp_set then (case when v_emp is not null and array_length(v_emp,1) > 0 then v_emp else null end)
      else empresas_permitidas end,
    updated_at  = now()
  where id = p_id;
  return p_id;
end
$$;
revoke execute on function cci_gerir_atualizar_usuario(uuid, jsonb) from public;
grant  execute on function cci_gerir_atualizar_usuario(uuid, jsonb) to authenticated;

-- Excluir usuário (sem self-delete).
create or replace function cci_gerir_excluir_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id = cci_jwt_usuario_id() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  if not cci_pode_gerir_usuario(p_id) then raise exception 'Sem permissão para excluir este usuário.'; end if;
  delete from cci_usuarios_sistema where id = p_id;
end
$$;
revoke execute on function cci_gerir_excluir_usuario(uuid) from public;
grant  execute on function cci_gerir_excluir_usuario(uuid) to authenticated;

-- ── 5) Fecha a escrita direta: só as RPCs (definer) gravam ─────────
revoke insert, update, delete on cci_usuarios_sistema from authenticated;
drop policy if exists "usuarios_ins" on cci_usuarios_sistema;
drop policy if exists "usuarios_upd" on cci_usuarios_sistema;
drop policy if exists "usuarios_del" on cci_usuarios_sistema;
-- SELECT (usuarios_sel de 129) permanece: admin/próprio/rede.

-- ============================================================
-- ROLLBACK:
--   grant insert, update, delete on cci_usuarios_sistema to authenticated;
--   -- recriar usuarios_ins/upd/del de 129 (admin OR cliente-rede);
--   drop function if exists cci_gerir_criar_usuario(jsonb);
--   drop function if exists cci_gerir_atualizar_usuario(uuid, jsonb);
--   drop function if exists cci_gerir_excluir_usuario(uuid);
--   drop function if exists cci_pode_gerir_usuario(uuid);
--   drop function if exists cci_nivel_admin();
--   alter table cci_usuarios_sistema drop constraint if exists chk_nivel_admin;
--   alter table cci_usuarios_sistema drop column if exists nivel_admin;
-- ============================================================
