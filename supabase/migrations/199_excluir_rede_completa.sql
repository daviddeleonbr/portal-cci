-- 199_excluir_rede_completa
-- Excluir uma rede apaga TUDO dela, numa transação só (antes as empresas
-- ficavam em "Sem rede" e a exclusão podia parar no meio):
--   1. acessos da rede toda (cci_acesso sem empresa — não têm FK)
--   2. empresas da rede (clientes) → cascade: tarefas, rotinas, sangrias,
--      extratos, conciliações, mapeamentos, pendências por empresa, etc.
--      (contratos/propostas/cobranças da CCI ficam, sem o vínculo)
--   3. pendências da rede
--   4. usuários da rede (usuário de cliente precisa de rede — chk_rede_vinculo)
--   5. a rede (chaves_api | as_rede) → cascade das parametrizações da rede
-- Só admin. Retorna o que foi apagado.

create or replace function cci_excluir_rede(p_chave_api_id uuid default null, p_as_rede_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_emp int; v_usu int; v_usuarios uuid[];
begin
  if not cci_is_admin() then
    raise exception 'Somente a CCI pode excluir redes.' using errcode = '42501';
  end if;
  if num_nonnulls(p_chave_api_id, p_as_rede_id) <> 1 then
    raise exception 'Informe uma rede (Webposto ou Autosystem).' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}') into v_usuarios from cci_usuarios_sistema
   where tipo = 'cliente'
     and ((p_chave_api_id is not null and chave_api_id = p_chave_api_id)
       or (p_as_rede_id is not null and as_rede_id = p_as_rede_id));

  delete from cci_acesso
   where cliente_id is null
     and ((p_chave_api_id is not null and chave_api_id = p_chave_api_id)
       or (p_as_rede_id is not null and as_rede_id = p_as_rede_id));

  delete from clientes
   where (p_chave_api_id is not null and chave_api_id = p_chave_api_id)
      or (p_as_rede_id is not null and as_rede_id = p_as_rede_id);
  get diagnostics v_emp = row_count;

  if p_chave_api_id is not null then
    delete from cci_pendencias where chave_api_id = p_chave_api_id;
  end if;
  -- referências desses usuários em registros de outras redes não impedem a exclusão
  update cci_pendencias set resolvida_por = null where resolvida_por = any(v_usuarios);
  update cci_pendencias set criada_por = null where criada_por = any(v_usuarios);

  delete from cci_usuarios_sistema where id = any(v_usuarios);
  get diagnostics v_usu = row_count;

  if p_chave_api_id is not null then
    delete from chaves_api where id = p_chave_api_id;
  else
    delete from as_rede where id = p_as_rede_id;
  end if;

  return jsonb_build_object('empresas', v_emp, 'usuarios', v_usu);
end $$;
revoke all on function cci_excluir_rede(uuid, uuid) from public, anon;
grant execute on function cci_excluir_rede(uuid, uuid) to authenticated;
