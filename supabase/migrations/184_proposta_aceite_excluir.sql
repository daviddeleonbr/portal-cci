-- ============================================================
-- 184 — Admin pode EXCLUIR a aceitação de uma proposta
--
-- Remove os comprovantes (cci_proposta_aceites) e reverte a proposta de
-- 'aceita' para 'enviada' (limpando aceita_em). Útil p/ testes ou correção.
-- RPC SECURITY DEFINER com checagem cci_is_admin() (a tabela é admin-only).
-- ============================================================

create or replace function cci_proposta_aceite_excluir(p_proposta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not cci_is_admin() then
    raise exception 'nao autorizado';
  end if;

  delete from cci_proposta_aceites where proposta_id = p_proposta_id;

  update cci_propostas
     set status = 'enviada', aceita_em = null
   where id = p_proposta_id and status = 'aceita';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function cci_proposta_aceite_excluir(uuid) from public;
grant execute on function cci_proposta_aceite_excluir(uuid) to authenticated;
