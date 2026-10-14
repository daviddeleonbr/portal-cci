-- 196_tarefas_rotina_visor
-- Rotina igual à do Visor360 (cci_v360_as 0128/0129):
--   • recorrência personalizada também por DATAS NO ANO ('MM-DD'): frequencia 'dias_ano' + dias_ano text[]
--     (dias do mês acima do último dia caem no último — mesma regra p/ dias_mes e dias_ano)
--   • "Referente a": a tarefa feita hoje pode se referir a outro período
--       cci_rotina.referencia: mesmo_dia | dia_anterior | dia_util_anterior | mes_anterior
--       cci_tarefa.referencia_tipo ('dia'|'mes') + referencia_data — carimbados na geração
--   • editar a rotina atualiza referência e documentos exigidos das tarefas EM ABERTO
--   • excluir a rotina cancela as tarefas em aberto dela (as demais ficam no histórico)
-- Idempotente.

-- ─── Rotina: datas no ano + referência ───────────────────────────
alter table cci_rotina add column if not exists dias_ano text[] not null default '{}';
alter table cci_rotina add column if not exists referencia text not null default 'mesmo_dia';

do $$
declare c record;
begin
  -- troca o check de frequencia (nome gerado automaticamente na 192)
  for c in select conname from pg_constraint
            where conrelid = 'cci_rotina'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%frequencia%' loop
    execute format('alter table cci_rotina drop constraint %I', c.conname);
  end loop;
end $$;
alter table cci_rotina add constraint cci_rotina_frequencia_chk
  check (frequencia in ('diaria', 'dias_uteis', 'dias_semana', 'dias_mes', 'dias_ano'));

-- (check não aceita subconsulta: validação em função imutável)
create or replace function cci_dias_ano_validos(p text[])
returns boolean language sql immutable as $$
  select not exists (select 1 from unnest(coalesce(p, '{}')) d
                      where d !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
$$;
do $$ begin
  alter table cci_rotina add constraint cci_rotina_dias_ano_chk check (cci_dias_ano_validos(dias_ano));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table cci_rotina add constraint cci_rotina_referencia_chk
    check (referencia in ('mesmo_dia', 'dia_anterior', 'dia_util_anterior', 'mes_anterior'));
exception when duplicate_object then null; end $$;

-- ─── Tarefa: período de referência ──────────────────────────────
alter table cci_tarefa add column if not exists referencia_tipo text;
alter table cci_tarefa add column if not exists referencia_data date;
do $$ begin
  alter table cci_tarefa add constraint cci_tarefa_referencia_chk
    check ((referencia_tipo is null and referencia_data is null)
        or (referencia_tipo in ('dia', 'mes') and referencia_data is not null));
exception when duplicate_object then null; end $$;

-- Referência de uma rotina numa data de execução (null/null = o próprio dia).
create or replace function cci_rotina_referencia(p_ref text, d date, out tipo text, out data date)
language sql immutable as $$
  select case p_ref when 'mes_anterior' then 'mes'
                    when 'dia_anterior' then 'dia'
                    when 'dia_util_anterior' then 'dia' end,
         case p_ref
           when 'dia_anterior'      then d - 1
           -- dia útil anterior (seg → sex; dom → sex; sáb → sex; demais → véspera)
           when 'dia_util_anterior' then d - case extract(isodow from d)::int when 1 then 3 when 7 then 2 else 1 end
           when 'mes_anterior'      then (date_trunc('month', d) - interval '1 month')::date
         end
$$;

-- ─── Recorrência ────────────────────────────────────────────────
create or replace function cci_rotina_no_dia(r cci_rotina, p_data date)
returns boolean language sql immutable
as $$
  select case r.frequencia
    when 'diaria' then true
    when 'dias_uteis' then extract(isodow from p_data) between 1 and 5
    when 'dias_semana' then extract(isodow from p_data)::smallint = any(r.dias_semana)
    -- 29/30/31 em mês mais curto: cai no último dia do mês
    when 'dias_mes' then exists (
      select 1 from unnest(r.dias_mes) md
       where least(md, extract(day from (date_trunc('month', p_data) + interval '1 month - 1 day'))::int)
             = extract(day from p_data)::int)
    when 'dias_ano' then exists (
      select 1 from unnest(r.dias_ano) yd
       where split_part(yd, '-', 1)::int = extract(month from p_data)::int
         and least(split_part(yd, '-', 2)::int, extract(day from (date_trunc('month', p_data) + interval '1 month - 1 day'))::int)
             = extract(day from p_data)::int)
    else false
  end
$$;

-- Geração diária: igual à 192, agora carimbando a referência.
create or replace function cci_tarefas_gerar(
  p_data date default ((now() at time zone 'America/Sao_Paulo')::date),
  p_rotina uuid default null
) returns int language plpgsql security definer set search_path = public
as $$
declare v_qtd int;
begin
  insert into cci_tarefa (cliente_id, setor_id, rotina_id, responsavel_id, titulo, descricao,
                          prioridade, vence_em, dia_rotina, exige_evidencia, documentos, criado_por,
                          referencia_tipo, referencia_data)
  select r.cliente_id, r.setor_id, r.id, r.responsavel_id, r.nome, r.descricao,
         r.prioridade, ((p_data + r.horario) at time zone 'America/Sao_Paulo'), p_data,
         r.exige_evidencia, r.documentos, r.criado_por,
         ref.tipo, ref.data
    from cci_rotina r
    join cci_usuarios_sistema u on u.id = r.responsavel_id and u.status = 'ativo'
    cross join lateral cci_rotina_referencia(r.referencia, p_data) ref
   where r.ativa
     and r.data_inicio <= p_data
     and (p_rotina is null or r.id = p_rotina)
     and cci_rotina_no_dia(r, p_data)
  on conflict (rotina_id, dia_rotina) do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;
revoke all on function cci_tarefas_gerar(date, uuid) from public, anon, authenticated;
grant execute on function cci_tarefas_gerar(date, uuid) to service_role;

-- ─── Editar rotina → corrige as tarefas dela ainda em aberto ────
-- (referência e documentos exigidos; o resto vale para as próximas)
create or replace function cci_rotina_sync_abertas()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.referencia is distinct from old.referencia
     or new.documentos is distinct from old.documentos
     or new.exige_evidencia is distinct from old.exige_evidencia then
    update cci_tarefa t
       set referencia_tipo = (cci_rotina_referencia(new.referencia, t.dia_rotina)).tipo,
           referencia_data = (cci_rotina_referencia(new.referencia, t.dia_rotina)).data,
           documentos = new.documentos,
           exige_evidencia = new.exige_evidencia
     where t.rotina_id = new.id and t.status in ('a_fazer', 'em_andamento') and t.dia_rotina is not null;
  end if;
  return new;
end $$;
drop trigger if exists trg_cci_rotina_sync_abertas on cci_rotina;
create trigger trg_cci_rotina_sync_abertas after update on cci_rotina
  for each row execute function cci_rotina_sync_abertas();

-- ─── Excluir rotina → cancela as tarefas dela em aberto ─────────
create or replace function cci_rotina_cancelar_abertas()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update cci_tarefa set status = 'cancelada'
   where rotina_id = old.id and status in ('a_fazer', 'em_andamento');
  return old;
end $$;
drop trigger if exists trg_cci_rotina_cancelar_abertas on cci_rotina;
create trigger trg_cci_rotina_cancelar_abertas before delete on cci_rotina
  for each row execute function cci_rotina_cancelar_abertas();

-- ─── Funcionário não altera a referência da tarefa ──────────────
create or replace function cci_tarefa_guard_referencia()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not cci_is_admin()
     and (new.referencia_tipo, new.referencia_data) is distinct from (old.referencia_tipo, old.referencia_data) then
    raise exception 'Somente a CCI pode editar a tarefa.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_cci_tarefa_guard_referencia on cci_tarefa;
create trigger trg_cci_tarefa_guard_referencia before update on cci_tarefa
  for each row execute function cci_tarefa_guard_referencia();
