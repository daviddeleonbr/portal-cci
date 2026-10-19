-- 202_alterar_minha_senha
-- O próprio usuário troca a senha (modal "Meu perfil"): confere a senha atual
-- no servidor (hash bcrypt) e grava a nova como hash. Identidade vem do JWT.
create or replace function cci_alterar_minha_senha(p_atual text, p_nova text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid := cci_jwt_usuario_id();
  v_hash text;
begin
  if v_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_nova is null or length(p_nova) < 6 then
    raise exception 'A nova senha precisa ter ao menos 6 caracteres.' using errcode = '22023';
  end if;
  select senha_hash into v_hash from cci_usuarios_sistema where id = v_id and status = 'ativo';
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if v_hash is null or v_hash <> extensions.crypt(coalesce(p_atual, ''), v_hash) then
    raise exception 'Senha atual incorreta.' using errcode = '28P01';
  end if;
  if p_nova = p_atual then
    raise exception 'A nova senha precisa ser diferente da atual.' using errcode = '22023';
  end if;
  update cci_usuarios_sistema
     set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_id;
end $$;
revoke all on function cci_alterar_minha_senha(text, text) from public, anon;
grant execute on function cci_alterar_minha_senha(text, text) to authenticated;
