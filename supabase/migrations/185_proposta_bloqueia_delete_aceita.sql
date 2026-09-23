-- ============================================================
-- 185 — Não permitir excluir proposta ACEITA
--
-- Uma proposta com status 'aceita' só pode ser excluída depois de a aceitação
-- ser removida (o que reverte o status para 'enviada' — ver migration 184).
-- Enforce no servidor via trigger BEFORE DELETE.
-- ============================================================

create or replace function cci_propostas_bloqueia_delete_aceita()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'aceita' then
    raise exception 'Proposta aceita: exclua a aceitação antes de excluir a proposta.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_propostas_bloqueia_delete_aceita on cci_propostas;
create trigger trg_propostas_bloqueia_delete_aceita
  before delete on cci_propostas
  for each row execute function cci_propostas_bloqueia_delete_aceita();
