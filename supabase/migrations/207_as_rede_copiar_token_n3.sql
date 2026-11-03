-- ============================================================
-- 207 — Admin N3 pode copiar o token do túnel HTTPS da rede
--
-- O token (Bearer) é cadastrado uma única vez e nunca volta ao navegador
-- (as_rede_get_credenciais devolve null fora do service_role). Para
-- configurar outros sistemas que falam com o mesmo túnel, o admin N3
-- precisa recuperá-lo. Esta RPC devolve SÓ o token, e SÓ para quem tem o
-- claim cci_tipo = 'admin' e cci_nivel_admin = 3 (checado aqui, no banco —
-- o botão na tela é apenas conveniência).
-- ============================================================

create or replace function as_rede_get_https_token(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not (cci_is_admin() and coalesce(cci_nivel_admin(), 0) = 3) then
    raise exception 'Apenas administradores N3 podem copiar o token.'
      using errcode = '42501';
  end if;

  select as_rede_decrypt(r.conexao_https_token_enc)
    into v_token
    from as_rede r
   where r.id = p_id;

  return v_token;
end;
$$;

revoke all on function as_rede_get_https_token(uuid) from public, anon;
grant execute on function as_rede_get_https_token(uuid) to authenticated;
