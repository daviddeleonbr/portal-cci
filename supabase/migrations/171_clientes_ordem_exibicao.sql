-- ============================================================
-- 171_clientes_ordem_exibicao
--
-- Numeração/ordem de exibição por empresa. Permite ordenar a DRE "Por Empresa"
-- (e outros relatórios de rede) em ordem crescente/decrescente por esse número,
-- independentemente do nome/apelido. É definida na aba "Apelidos das empresas".
--
-- Escrita via RPC SECURITY DEFINER guardada por cci_pode_ver_cliente (mesmo
-- idiom de cliente_apelido_salvar, migração 150).
-- ============================================================

alter table clientes add column if not exists ordem_exibicao int;

create or replace function cliente_ordem_salvar(p_cliente_id uuid, p_ordem int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not cci_pode_ver_cliente(p_cliente_id) then
    raise exception 'Sem permissão para editar esta empresa';
  end if;
  update clientes
     set ordem_exibicao = p_ordem,
         updated_at     = now()
   where id = p_cliente_id;
end$$;

revoke all    on function cliente_ordem_salvar(uuid, int) from public;
grant execute on function cliente_ordem_salvar(uuid, int) to anon, authenticated;
