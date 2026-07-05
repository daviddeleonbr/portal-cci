-- 130_seguranca_hash_only_prep
-- ============================================================
-- Etapa A/B da remoção do texto puro: para de ALIMENTAR a coluna `senha`.
--
-- - Torna `senha` nullable (a criação de usuário deixa de gravá-la).
-- - Re-backfill: garante `senha_hash` para quem ainda tiver só texto puro.
-- - Cria `cci_admin_definir_senha`: setter de senha com HASH, chamável pelo
--   admin (ou gerente da rede) — autorização espelha a policy de escrita de
--   usuários (admin qualquer; cliente só usuários CLIENTE da própria rede).
--
-- A coluna `senha` e o fallback de texto puro (110) CONTINUAM existindo aqui
-- — nada quebra. A remoção definitiva é a etapa C (migration 131).
-- Idempotente.
-- ============================================================

alter table cci_usuarios_sistema alter column senha drop not null;

update cci_usuarios_sistema
   set senha_hash = extensions.crypt(senha, extensions.gen_salt('bf', 10))
 where senha_hash is null and senha is not null and senha <> '';

create or replace function cci_admin_definir_senha(p_usuario_id uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chave uuid;
  v_rede  uuid;
  v_tipo  text;
begin
  if p_senha is null or length(p_senha) < 6 then
    raise exception 'Senha inválida (mínimo 6 caracteres).';
  end if;

  select chave_api_id, as_rede_id, tipo
    into v_chave, v_rede, v_tipo
  from cci_usuarios_sistema
  where id = p_usuario_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  -- Autorização: admin qualquer usuário; cliente só usuários CLIENTE da
  -- própria rede (mesma regra da policy usuarios_ins/upd).
  if not (
    cci_is_admin()
    or (v_tipo = 'cliente' and (v_chave = cci_jwt_chave_api_id() or v_rede = cci_jwt_as_rede_id()))
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
