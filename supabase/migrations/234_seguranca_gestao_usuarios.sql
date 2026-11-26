-- ============================================================
-- 234 — Segurança na gestão de usuários (auditoria de permissões, S1–S8)
-- Ver docs/seguranca/AUDITORIA_PERMISSOES.md.
--
-- S1/S2  cci_admin_definir_senha: antes, qualquer cliente trocava a senha de
--        qualquer cliente da rede (sem gerenciar_usuarios) e qualquer admin,
--        até N1, trocava a de qualquer um (inclusive N3). Agora só quem pode
--        gerir o alvo (cci_pode_gerir_usuario) — ou quem acabou de criá-lo
--        (criado_por = eu e ainda sem senha), p/ o N3 criar outro N3.
-- S3     Quem não é N3 só ACRESCENTA permissões que ele próprio tem. O que o
--        usuário já tinha continua valendo e pode ser removido (compatível com
--        os cadastros atuais). Admin N2 gerindo cliente não entra na regra
--        (chaves de admin e de cliente são catálogos diferentes).
-- S4     Gerente restrito a algumas empresas só libera empresas dele, e não
--        pode dar "todas as empresas" (null). Só vale quando o valor muda.
-- S5     Gerente do cliente não edita a si mesmo (admin já não editava).
-- S6     Cliente não troca a rede do usuário (payload chave_api_id/as_rede_id
--        ignorado quando quem chama é cliente).
-- S7     Sem 'permissoes' no payload = mantém as atuais (antes zerava).
-- S8     cascata_revogar_permissoes: sem uso no front, sem checagem → fechada.
-- Idempotente (create or replace). Rollback no fim.
-- ============================================================

-- Empresas liberadas para quem chama (null = sem restrição).
create or replace function cci_jwt_empresas()
returns uuid[] language sql stable as $$
  select case
    when not (auth.jwt() ? 'empresas_permitidas')
      or jsonb_typeof(auth.jwt() -> 'empresas_permitidas') <> 'array'
      or jsonb_array_length(auth.jwt() -> 'empresas_permitidas') = 0 then null
    else (select array_agg(x::uuid) from jsonb_array_elements_text(auth.jwt() -> 'empresas_permitidas') x)
  end;
$$;
revoke execute on function cci_jwt_empresas() from public;
grant  execute on function cci_jwt_empresas() to authenticated, service_role;

-- Valida o que está sendo CONCEDIDO por quem chama (S3/S4). Levanta exceção.
--   p_novas/p_antigas: permissões depois/antes; p_emp_nova/p_emp_antiga: empresas
--   (null = todas); p_alvo_tipo: 'admin'|'cliente'; p_emp_mudou: o payload mexe nas empresas.
create or replace function cci_validar_concessao(
  p_novas text[], p_antigas text[], p_alvo_tipo text,
  p_emp_nova uuid[], p_emp_antiga uuid[], p_emp_mudou boolean)
returns void language plpgsql stable set search_path = public as $$
declare
  v_admin boolean := cci_is_admin();
  v_nivel smallint := cci_nivel_admin();
  v_minhas jsonb := coalesce(auth.jwt() -> 'cci_permissoes', '[]'::jsonb);
  v_minhas_emp uuid[] := cci_jwt_empresas();
  v_falta text[];
begin
  -- Permissões acrescentadas que quem chama não tem.
  -- N3 tem tudo; admin gerindo cliente concede do catálogo de cliente.
  if not (v_admin and (v_nivel = 3 or p_alvo_tipo = 'cliente')) then
    select array_agg(k) into v_falta
      from unnest(coalesce(p_novas, '{}')) k
     where not (k = any(coalesce(p_antigas, '{}')))
       and not (v_minhas ? k);
    if v_falta is not null then
      raise exception 'Você não pode conceder permissões que não tem: %', array_to_string(v_falta, ', ');
    end if;
  end if;

  -- Empresas: só para cliente restrito (admin vê todas).
  if not v_admin and v_minhas_emp is not null and p_emp_mudou
     and p_emp_nova is distinct from p_emp_antiga then
    if p_emp_nova is null then
      raise exception 'Você só pode liberar as empresas a que tem acesso.';
    end if;
    if exists (select 1 from unnest(p_emp_nova) e
                where not (e = any(v_minhas_emp))
                  and not (e = any(coalesce(p_emp_antiga, '{}')))) then
      raise exception 'Você só pode liberar as empresas a que tem acesso.';
    end if;
  end if;
end
$$;
revoke execute on function cci_validar_concessao(text[], text[], text, uuid[], uuid[], boolean) from public;

-- S5: gerente do cliente não gere a si mesmo.
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
    if a_nivel = 3 then return false; end if;                      -- ninguém gere N3 (nem self N3)
    if v_nivel = 3 then return true; end if;                       -- N3 gere N1 e N2
    if v_nivel = 2 then return a_nivel = 1; end if;                -- N2 só gere N1
    return false;
  end if;

  -- Gerente da rede: só OUTROS usuários cliente da própria rede, com gerenciar_usuarios.
  return a_tipo = 'cliente'
     and p_alvo is distinct from cci_jwt_usuario_id()
     and (a_chave = cci_jwt_chave_api_id() or a_rede = cci_jwt_as_rede_id())
     and coalesce((auth.jwt() -> 'cci_permissoes') ? 'gerenciar_usuarios', false);
end
$$;
revoke execute on function cci_pode_gerir_usuario(uuid) from public;
grant  execute on function cci_pode_gerir_usuario(uuid) to authenticated, service_role;

-- Criar usuário (149 + S3/S4).
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
  if v_emp is not null and array_length(v_emp, 1) is null then v_emp := null; end if;

  if v_admin then
    if v_nivel is null or v_nivel < 2 then raise exception 'Sem permissão para criar usuários.'; end if;
    if v_tipo = 'admin' then
      if v_nivelnovo is null then v_nivelnovo := 1; end if;
      if v_nivelnovo not in (1,2,3) then raise exception 'Nível inválido.'; end if;
      if v_nivel = 2 and v_nivelnovo <> 1 then
        raise exception 'Nível 2 só pode criar admins de nível 1.';
      end if;
      v_chave := null; v_rede := null; v_emp := null;
    else
      v_tipo := 'cliente'; v_nivelnovo := null;
    end if;
  else
    if not coalesce((auth.jwt() -> 'cci_permissoes') ? 'gerenciar_usuarios', false) then
      raise exception 'Sem permissão para criar usuários.';
    end if;
    v_tipo := 'cliente'; v_nivelnovo := null;
    v_chave := cci_jwt_chave_api_id();
    v_rede  := cci_jwt_as_rede_id();
    if v_chave is null and v_rede is null then raise exception 'Rede do gerente não identificada.'; end if;
  end if;

  perform cci_validar_concessao(v_perms, '{}', v_tipo, v_emp, null, true);

  insert into cci_usuarios_sistema
    (nome, email, tipo, chave_api_id, as_rede_id, permissoes, status, observacoes,
     empresas_permitidas, nivel_admin, criado_por)
  values
    (trim(coalesce(p_dados->>'nome','')), lower(trim(coalesce(p_dados->>'email',''))), v_tipo,
     v_chave, v_rede, v_perms, coalesce(p_dados->>'status','ativo'), p_dados->>'observacoes',
     v_emp, v_nivelnovo, cci_jwt_usuario_id())
  returning id into v_novo;
  return v_novo;
end
$$;
revoke execute on function cci_gerir_criar_usuario(jsonb) from public;
grant  execute on function cci_gerir_criar_usuario(jsonb) to authenticated;

-- Atualizar usuário (149 + S3/S4/S6/S7).
create or replace function cci_gerir_atualizar_usuario(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin   boolean := cci_is_admin();
  v_nivel   smallint := cci_nivel_admin();
  a_tipo    text;
  a_nivel   smallint;
  a_perms   text[];
  a_emp     uuid[];
  v_tipo    text;
  v_nivelnovo smallint;
  v_perms   text[];
  v_emp     uuid[];
  v_emp_set boolean := (p_dados ? 'empresas_permitidas');
begin
  if not cci_pode_gerir_usuario(p_id) then
    raise exception 'Sem permissão para editar este usuário.';
  end if;
  select tipo, nivel_admin, permissoes, empresas_permitidas
    into a_tipo, a_nivel, a_perms, a_emp
    from cci_usuarios_sistema where id = p_id;

  -- S7: sem a chave no payload, mantém.
  v_perms := case when p_dados ? 'permissoes'
    then coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'permissoes','[]'::jsonb)) x), '{}')
    else a_perms end;

  if v_emp_set and jsonb_typeof(p_dados->'empresas_permitidas') = 'array' then
    v_emp := (select array_agg(x::uuid) from jsonb_array_elements_text(p_dados->'empresas_permitidas') x);
  end if;
  if v_emp is not null and array_length(v_emp, 1) is null then v_emp := null; end if;
  if not v_emp_set then v_emp := a_emp; end if;

  v_tipo := a_tipo;
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

  perform cci_validar_concessao(v_perms, a_perms, v_tipo, v_emp, a_emp, v_emp_set);

  update cci_usuarios_sistema set
    nome        = coalesce(nullif(trim(p_dados->>'nome'),''), nome),
    email       = coalesce(nullif(lower(trim(p_dados->>'email')),''), email),
    tipo        = v_tipo,
    permissoes  = v_perms,
    status      = coalesce(p_dados->>'status', status),
    observacoes = case when p_dados ? 'observacoes' then p_dados->>'observacoes' else observacoes end,
    nivel_admin = v_nivelnovo,
    -- S6: só admin define a rede; cliente mantém a atual.
    chave_api_id = case when v_tipo = 'admin' then null
                        when v_admin and p_dados ? 'chave_api_id' then nullif(p_dados->>'chave_api_id','')::uuid
                        else chave_api_id end,
    as_rede_id   = case when v_tipo = 'admin' then null
                        when v_admin and p_dados ? 'as_rede_id' then nullif(p_dados->>'as_rede_id','')::uuid
                        else as_rede_id end,
    empresas_permitidas = case when v_tipo = 'admin' then null else v_emp end,
    updated_at  = now()
  where id = p_id;
  return p_id;
end
$$;
revoke execute on function cci_gerir_atualizar_usuario(uuid, jsonb) from public;
grant  execute on function cci_gerir_atualizar_usuario(uuid, jsonb) to authenticated;

-- S1/S2: troca de senha só por quem gere o alvo (ou o criador, antes da 1ª senha).
create or replace function cci_admin_definir_senha(p_usuario_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_criador uuid;
  v_hash    text;
begin
  if p_senha is null or length(p_senha) < 6 then
    raise exception 'Senha inválida (mínimo 6 caracteres).';
  end if;
  select criado_por, senha_hash into v_criador, v_hash
    from cci_usuarios_sistema where id = p_usuario_id;
  if not found then raise exception 'Usuário não encontrado.'; end if;

  if not (
    cci_pode_gerir_usuario(p_usuario_id)
    or (v_hash is null and v_criador is not null and v_criador = cci_jwt_usuario_id())
  ) then
    raise exception 'Sem permissão para alterar a senha deste usuário.';
  end if;

  update cci_usuarios_sistema
     set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario_id;
end
$$;
revoke execute on function cci_admin_definir_senha(uuid, text) from public;
grant  execute on function cci_admin_definir_senha(uuid, text) to authenticated;

-- S8: sem uso no front e sem checagem de quem chama.
revoke execute on function cascata_revogar_permissoes(uuid, text[]) from public, anon, authenticated;

-- ============================================================
-- ROLLBACK: reaplicar as definições de 149 (cci_pode_gerir_usuario,
--   cci_gerir_criar_usuario, cci_gerir_atualizar_usuario) e de 130
--   (cci_admin_definir_senha); drop function cci_validar_concessao(...),
--   cci_jwt_empresas(); grant execute on function cascata_revogar_permissoes
--   (uuid, text[]) to public.
-- ============================================================
