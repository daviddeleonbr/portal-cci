-- ============================================================
-- Hierarquia de admins por permissões (sem nível numérico).
-- ============================================================
-- Regra: admin só pode atribuir/ver permissões que ele próprio tem.
-- Admin master (is_master=true) tem TODAS as permissões automaticamente,
-- independente do array `permissoes`.
--
-- `criado_por` aponta pro admin que cadastrou esse usuário. Usado pra
-- propagar revogações: se A perde a permissão X, todos os admins criados
-- por A (recursivamente) que dependiam dela perdem X também.

alter table cci_usuarios_sistema
  add column if not exists is_master   boolean default false,
  add column if not exists criado_por  uuid references cci_usuarios_sistema(id) on delete set null;

create index if not exists idx_cci_usuarios_criado_por on cci_usuarios_sistema(criado_por);
create index if not exists idx_cci_usuarios_is_master  on cci_usuarios_sistema(is_master);

-- ─── Seed: David Deleon vira master ─────────────────────────────
update cci_usuarios_sistema
   set is_master = true
 where email = 'daviddeleondossantos@gmail.com';

-- ─── Função: cascata de revogação ───────────────────────────────
-- Quando um admin perde permissões, propaga removendo das mesmas
-- permissões em TODOS os admins que ele criou (recursivamente).
-- Master não é afetado (sempre tem tudo).
create or replace function cascata_revogar_permissoes(
  p_admin_id uuid,
  p_permissoes_removidas text[]
) returns int language plpgsql as $$
declare
  v_afetados int := 0;
  v_subordinado record;
begin
  if array_length(p_permissoes_removidas, 1) is null then
    return 0;
  end if;

  -- Caminha pela árvore de subordinados (BFS via with recursive)
  for v_subordinado in
    with recursive descendentes as (
      select id from cci_usuarios_sistema where criado_por = p_admin_id
      union all
      select u.id from cci_usuarios_sistema u
        join descendentes d on u.criado_por = d.id
    )
    select id from descendentes
  loop
    update cci_usuarios_sistema
       set permissoes = array(
             select unnest(permissoes)
             except
             select unnest(p_permissoes_removidas)
           )
     where id = v_subordinado.id
       and not is_master;   -- master nunca perde
    if found then v_afetados := v_afetados + 1; end if;
  end loop;

  return v_afetados;
end;
$$;
