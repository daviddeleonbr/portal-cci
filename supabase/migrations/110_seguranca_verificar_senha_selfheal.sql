-- 110_seguranca_verificar_senha_selfheal
-- ============================================================
-- FASE 2 — torna o cutover de login não-quebrável durante a transição.
--
-- Problema: após a 108, o login passa a validar contra `senha_hash`. Mas
-- vários fluxos ainda gravam só `senha` em texto puro (criação de usuário
-- pelo admin, reset de senha, primeiro acesso do cliente). Esses usuários
-- ficariam com `senha_hash` nulo e não conseguiriam logar.
--
-- Solução: `cci_verificar_senha` valida por hash; se não houver hash, cai
-- para o texto puro e, dando certo, GERA o hash na hora (self-heal). Assim
-- ninguém fica travado e a base migra sozinha conforme cada um loga.
--
-- Reversível: sim (é só substituir a função). O fallback de texto puro sai
-- na Fase 7, junto com o drop da coluna `senha`.
-- ============================================================

create or replace function cci_verificar_senha(p_email text, p_senha text)
returns table (id uuid, valido boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_hash text;
  v_pass text;
  v_ok   boolean := false;
begin
  select u.id, u.senha_hash, u.senha
    into v_id, v_hash, v_pass
  from cci_usuarios_sistema u
  where u.email = lower(trim(p_email))
  limit 1;

  if v_id is null then
    return query select null::uuid, false;
    return;
  end if;

  if v_hash is not null and v_hash <> '' then
    -- Caminho normal: compara com o bcrypt armazenado.
    v_ok := (v_hash = extensions.crypt(p_senha, v_hash));
  elsif v_pass is not null and v_pass = p_senha then
    -- Transição: valida por texto puro e faz self-heal do hash.
    v_ok := true;
    update cci_usuarios_sistema
       set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10))
     where cci_usuarios_sistema.id = v_id;
  end if;

  return query select v_id, v_ok;
end
$$;

revoke execute on function cci_verificar_senha(text, text) from public;
grant  execute on function cci_verificar_senha(text, text) to service_role;
