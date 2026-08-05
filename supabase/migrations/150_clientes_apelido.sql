-- ============================================================
-- 150_clientes_apelido
--
-- Apelido (nome curto) por empresa, definível pelo próprio cliente.
-- Ex.: "Complexo Costa Azul" → "Costa Azul". O site pode exibir a razão
-- social/nome OU o apelido (toggle global no portal).
--
-- Escrita: RLS de `clientes` é admin-only (clientes_mod, migração 119), então
-- o cliente grava via RPC SECURITY DEFINER guardada por cci_pode_ver_cliente
-- (mesmo idiom das RPCs de self-service do cliente).
-- ============================================================

alter table clientes add column if not exists apelido text;

-- Grava/limpa o apelido de UMA empresa. Autoriza pelo cci_pode_ver_cliente
-- (admin OU dono da rede com a empresa liberada). String vazia → NULL.
create or replace function cliente_apelido_salvar(p_cliente_id uuid, p_apelido text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not cci_pode_ver_cliente(p_cliente_id) then
    raise exception 'Sem permissão para editar esta empresa';
  end if;
  update clientes
     set apelido    = nullif(btrim(p_apelido), ''),
         updated_at = now()
   where id = p_cliente_id;
end$$;

revoke all    on function cliente_apelido_salvar(uuid, text) from public;
grant execute on function cliente_apelido_salvar(uuid, text) to anon, authenticated;
