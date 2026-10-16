-- 200_excluir_rede_purga_cache
-- O cache de vendas do Webposto (cci_webposto_venda / _item) tem milhões de
-- linhas: apagar a rede em cascata dentro da requisição estoura o tempo.
-- Agora cci_excluir_rede (Webposto) apaga na hora empresas, usuários, acessos,
-- pendências, sync e parâmetros da rede, e marca a rede como excluída
-- (chaves_api.excluida_em). Um job (pg_cron, a cada minuto) apaga o cache em
-- lotes e, quando acaba, remove a rede de vez.

alter table chaves_api add column if not exists excluida_em timestamptz;

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
  update cci_pendencias set resolvida_por = null where resolvida_por = any(v_usuarios);
  update cci_pendencias set criada_por = null where criada_por = any(v_usuarios);

  delete from cci_usuarios_sistema where id = any(v_usuarios);
  get diagnostics v_usu = row_count;

  if p_as_rede_id is not null then
    delete from as_rede where id = p_as_rede_id;
  else
    -- para a sincronização e marca; o cache sai em segundo plano
    delete from cci_webposto_sync_config where chave_api_id = p_chave_api_id;
    delete from cci_webposto_sync_config_rede where chave_api_id = p_chave_api_id;
    delete from cci_webposto_sync_job where chave_api_id = p_chave_api_id;
    update chaves_api set excluida_em = now() where id = p_chave_api_id;
    if not exists (select 1 from cci_webposto_venda where chave_api_id = p_chave_api_id) then
      delete from chaves_api where id = p_chave_api_id;
    end if;
  end if;

  return jsonb_build_object('empresas', v_emp, 'usuarios', v_usu);
end $$;
revoke all on function cci_excluir_rede(uuid, uuid) from public, anon;
grant execute on function cci_excluir_rede(uuid, uuid) to authenticated;

-- Purga em lotes o cache das redes excluídas (até ~40s por execução); ao
-- esvaziar, apaga a rede.
create or replace function cci_purgar_redes_excluidas(p_lote int default 20000)
returns int language plpgsql security definer set search_path = public
as $$
declare k uuid; n int; total int := 0; v_ini timestamptz := clock_timestamp();
begin
  for k in select id from chaves_api where excluida_em is not null loop
    loop
      exit when clock_timestamp() - v_ini > interval '40 seconds';
      delete from cci_webposto_venda_item
       where ctid in (select ctid from cci_webposto_venda_item where chave_api_id = k limit p_lote);
      get diagnostics n = row_count;
      if n = 0 then
        delete from cci_webposto_venda
         where ctid in (select ctid from cci_webposto_venda where chave_api_id = k limit p_lote);
        get diagnostics n = row_count;
      end if;
      total := total + n;
      if n = 0 then
        delete from chaves_api where id = k;
        exit;
      end if;
    end loop;
  end loop;
  return total;
end $$;
revoke all on function cci_purgar_redes_excluidas(int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cci-purgar-redes-excluidas') then
    perform cron.unschedule('cci-purgar-redes-excluidas');
  end if;
  perform cron.schedule('cci-purgar-redes-excluidas', '* * * * *', 'select public.cci_purgar_redes_excluidas()');
end $$;
