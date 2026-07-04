-- 128_seguranca_definir_senha
-- ============================================================
-- Setter de senha server-side (para as Edge Functions auth-reset e
-- auth-primeiro-acesso). Grava o HASH (bcrypt) e ZERA o texto puro daquele
-- usuário — assim reset/primeiro-acesso já saem sem plaintext.
--
-- SECURITY DEFINER + só service_role. Idempotente.
-- ============================================================

create or replace function cci_definir_senha(p_usuario_id uuid, p_senha text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update cci_usuarios_sistema
     set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         senha = null,
         updated_at = now()
   where id = p_usuario_id;
$$;

revoke execute on function cci_definir_senha(uuid, text) from public;
grant  execute on function cci_definir_senha(uuid, text) to service_role;
