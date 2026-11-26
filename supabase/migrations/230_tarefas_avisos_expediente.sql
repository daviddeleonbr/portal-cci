-- 230_tarefas_avisos_expediente
-- Avisos de TAREFA para o responsável, só dentro do horário de trabalho dele:
--   - "Nova tarefa para você" quando a tarefa nasce (avulsa ou de rotina) ou muda
--     de responsável;
--   - "Tarefa vence em breve" 1 hora antes do vencimento. Se essa hora cai fora do
--     expediente, o aviso vem no fim do expediente anterior (para saber antes de
--     sair); se não há expediente antes do vencimento, não manda.
-- Horário de trabalho: cci_usuarios_sistema.expediente (jsonb), por dia da semana
-- (0 = domingo … 6 = sábado), um ou mais períodos no horário de Brasília:
--   {"1": [["08:00","12:00"], ["13:00","18:00"]], "6": [["08:00","12:00"]]}
-- null (ou sem nenhum período) = recebe a qualquer hora.
-- Quem configura: a CCI (admin N2/N3, como no cadastro) e o gestor da rede, via
-- RPC cci_definir_expediente.
-- Os avisos ficam numa fila (cci_tarefa_aviso); um cron a cada 5 min manda os que
-- venceram, conferindo de novo o expediente. A notificação cai em `notificacoes`
-- (sino + push, migration 219). Idempotente.

-- ─── Horário de trabalho ─────────────────────────────────────
alter table cci_usuarios_sistema add column if not exists expediente jsonb;

-- Períodos de um dia (início/fim como timestamptz)
create or replace function cci_expediente_periodos(p_exp jsonb, p_data date)
returns table (ini timestamptz, fim timestamptz) language sql stable as $$
  select ((p_data + (i->>0)::time) at time zone 'America/Sao_Paulo'),
         ((p_data + (i->>1)::time) at time zone 'America/Sao_Paulo')
    from jsonb_array_elements(
           case when jsonb_typeof(p_exp -> extract(dow from p_data)::int::text) = 'array'
                then p_exp -> extract(dow from p_data)::int::text else '[]'::jsonb end) i
   where (i->>1)::time > (i->>0)::time;
$$;

-- Tem algum período configurado?
create or replace function cci_expediente_tem(p_exp jsonb)
returns boolean language sql immutable as $$
  select p_exp is not null and jsonb_typeof(p_exp) = 'object' and exists (
    select 1 from jsonb_each(p_exp) d
     where jsonb_typeof(d.value) = 'array' and jsonb_array_length(d.value) > 0);
$$;

create or replace function cci_expediente_dentro(p_exp jsonb, p_ts timestamptz)
returns boolean language sql stable as $$
  select not cci_expediente_tem(p_exp) or exists (
    select 1 from cci_expediente_periodos(p_exp, (p_ts at time zone 'America/Sao_Paulo')::date) p
     where p_ts >= p.ini and p_ts < p.fim);
$$;

-- Primeiro instante ≥ p_ts dentro do expediente (até 8 dias à frente)
create or replace function cci_expediente_proximo(p_exp jsonb, p_ts timestamptz)
returns timestamptz language sql stable as $$
  select case when cci_expediente_dentro(p_exp, p_ts) then p_ts
    else coalesce((
      select min(p.ini)
        from generate_series(0, 8) d,
             cci_expediente_periodos(p_exp, (p_ts at time zone 'America/Sao_Paulo')::date + d) p
       where p.ini > p_ts), p_ts) end;
$$;

-- Último instante ≤ p_ts dentro do expediente: o fim do período anterior (15 min
-- antes de acabar). null se não houver nos 8 dias anteriores.
create or replace function cci_expediente_ultimo_antes(p_exp jsonb, p_ts timestamptz)
returns timestamptz language sql stable as $$
  select case when cci_expediente_dentro(p_exp, p_ts) then p_ts
    else (
      select max(greatest(p.ini, p.fim - interval '15 minutes'))
        from generate_series(0, 8) d,
             cci_expediente_periodos(p_exp, (p_ts at time zone 'America/Sao_Paulo')::date - d) p
       where p.fim <= p_ts) end;
$$;

-- Gravar (CCI ou gestor da rede). Valida e normaliza: {"<dia>": [["HH:MM","HH:MM"], …]}
create or replace function cci_definir_expediente(p_usuario uuid, p_expediente jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_norm jsonb := '{}'::jsonb;
  d record;
  i jsonb;
  v_lista jsonb;
begin
  if not (cci_pode_gerir_usuario(p_usuario) or (cci_is_admin() and cci_nivel_admin() = 3)) then
    raise exception 'Sem permissão para alterar o horário deste usuário.';
  end if;
  if p_expediente is not null and jsonb_typeof(p_expediente) <> 'null' then
    if jsonb_typeof(p_expediente) <> 'object' then raise exception 'Horário inválido.'; end if;
    for d in select key, value from jsonb_each(p_expediente) loop
      if d.key !~ '^[0-6]$' or jsonb_typeof(d.value) <> 'array' then raise exception 'Dia inválido: %', d.key; end if;
      v_lista := '[]'::jsonb;
      for i in select value from jsonb_array_elements(d.value) loop
        if jsonb_typeof(i) <> 'array' or jsonb_array_length(i) <> 2
           or (i->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (i->>1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           or (i->>1)::time <= (i->>0)::time then
          raise exception 'Período inválido no dia %: início e fim no formato HH:MM, fim depois do início.', d.key;
        end if;
        v_lista := v_lista || jsonb_build_array(i);
      end loop;
      if jsonb_array_length(v_lista) > 0 then v_norm := v_norm || jsonb_build_object(d.key, v_lista); end if;
    end loop;
  end if;
  update cci_usuarios_sistema
     set expediente = case when v_norm = '{}'::jsonb then null else v_norm end, updated_at = now()
   where id = p_usuario;
end $$;
revoke execute on function cci_definir_expediente(uuid, jsonb) from public;
grant execute on function cci_definir_expediente(uuid, jsonb) to authenticated;

-- ─── Fila de avisos ──────────────────────────────────────────
create table if not exists cci_tarefa_aviso (
  id          bigint generated always as identity primary key,
  tarefa_id   uuid not null references cci_tarefa(id) on delete cascade,
  usuario_id  uuid not null references cci_usuarios_sistema(id) on delete cascade,
  tipo        text not null check (tipo in ('criada', 'vencendo')),
  enviar_em   timestamptz not null,
  enviado_em  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ix_cci_tarefa_aviso_pendente on cci_tarefa_aviso (enviar_em) where enviado_em is null;
create index if not exists ix_cci_tarefa_aviso_tarefa on cci_tarefa_aviso (tarefa_id);
alter table cci_tarefa_aviso enable row level security;   -- sem políticas: só as funções (definer) mexem
revoke all on cci_tarefa_aviso from anon, authenticated;

-- (Re)agenda os avisos de uma tarefa. p_criada: também o "nova tarefa".
create or replace function cci_tarefa_agendar_avisos(p_tarefa uuid, p_criada boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  v_criada timestamptz;
  v_venc timestamptz;
begin
  delete from cci_tarefa_aviso
   where tarefa_id = p_tarefa and enviado_em is null and (p_criada or tipo = 'vencendo');
  select tf.id, tf.status, tf.vence_em, tf.responsavel_id, tf.criado_por, u.expediente
    into t
    from cci_tarefa tf join cci_usuarios_sistema u on u.id = tf.responsavel_id and u.status = 'ativo'
   where tf.id = p_tarefa;
  if not found or t.status not in ('a_fazer', 'em_andamento') then return; end if;

  -- Quem criou a tarefa para si mesmo não precisa do aviso de criação
  if p_criada and t.responsavel_id is distinct from t.criado_por then
    v_criada := cci_expediente_proximo(t.expediente, now());
    insert into cci_tarefa_aviso (tarefa_id, usuario_id, tipo, enviar_em) values (t.id, t.responsavel_id, 'criada', v_criada);
  end if;

  if t.vence_em > now() then
    v_venc := cci_expediente_ultimo_antes(t.expediente, t.vence_em - interval '1 hour');
    if v_venc is null or v_venc < now() then v_venc := cci_expediente_proximo(t.expediente, now()); end if;
    -- Só se der antes do vencimento e não colar no aviso de criação (que já diz o prazo)
    if v_venc < t.vence_em and (v_criada is null or v_venc > v_criada + interval '15 minutes') then
      insert into cci_tarefa_aviso (tarefa_id, usuario_id, tipo, enviar_em) values (t.id, t.responsavel_id, 'vencendo', v_venc);
    end if;
  end if;
end $$;
revoke execute on function cci_tarefa_agendar_avisos(uuid, boolean) from public, anon, authenticated;

create or replace function cci_tarefa_avisos_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform cci_tarefa_agendar_avisos(new.id, true);
  elsif new.responsavel_id is distinct from old.responsavel_id then
    perform cci_tarefa_agendar_avisos(new.id, true);
  elsif new.vence_em is distinct from old.vence_em or new.status is distinct from old.status then
    if new.status in ('a_fazer', 'em_andamento') then
      perform cci_tarefa_agendar_avisos(new.id, false);
    else
      delete from cci_tarefa_aviso where tarefa_id = new.id and enviado_em is null;
    end if;
  end if;
  return null;
exception when others then
  raise warning 'cci_tarefa_avisos_trg: %', sqlerrm; -- aviso nunca bloqueia a tarefa
  return null;
end $$;
drop trigger if exists trg_cci_tarefa_avisos on cci_tarefa;
create trigger trg_cci_tarefa_avisos
  after insert or update of responsavel_id, vence_em, status on cci_tarefa
  for each row execute function cci_tarefa_avisos_trg();

-- Mudou o horário de alguém: refaz o "vence em breve" das tarefas abertas dele
create or replace function cci_expediente_reagendar_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from cci_tarefa
            where responsavel_id = new.id and status in ('a_fazer', 'em_andamento') and vence_em > now()
  loop
    perform cci_tarefa_agendar_avisos(r.id, false);
  end loop;
  return null;
exception when others then
  raise warning 'cci_expediente_reagendar_trg: %', sqlerrm;
  return null;
end $$;
drop trigger if exists trg_cci_expediente_reagendar on cci_usuarios_sistema;
create trigger trg_cci_expediente_reagendar
  after update of expediente on cci_usuarios_sistema
  for each row when (new.expediente is distinct from old.expediente)
  execute function cci_expediente_reagendar_trg();

-- ─── Envio (cron a cada 5 min) ───────────────────────────────
create or replace function cci_tarefas_avisos_enviar()
returns int language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_novo timestamptz;
  v_quando text;
  v_link text;
  v_qtd int := 0;
begin
  for a in
    select av.id, av.tipo, av.usuario_id, t.id tarefa_id, t.titulo, t.status, t.vence_em, t.responsavel_id,
           t.cliente_id, c.nome empresa, u.tipo usuario_tipo, u.status usuario_status, u.expediente
      from cci_tarefa_aviso av
      join cci_tarefa t on t.id = av.tarefa_id
      join cci_usuarios_sistema u on u.id = av.usuario_id
      left join clientes c on c.id = t.cliente_id
     where av.enviado_em is null and av.enviar_em <= now()
     order by av.enviar_em
     limit 500
  loop
    if a.status not in ('a_fazer', 'em_andamento') or a.responsavel_id is distinct from a.usuario_id
       or a.usuario_status <> 'ativo' or (a.tipo = 'vencendo' and a.vence_em <= now()) then
      delete from cci_tarefa_aviso where id = a.id;
      continue;
    end if;
    -- O horário pode ter mudado: fora do expediente, espera o próximo período
    if not cci_expediente_dentro(a.expediente, now()) then
      v_novo := cci_expediente_proximo(a.expediente, now());
      if a.tipo = 'vencendo' and v_novo >= a.vence_em then
        delete from cci_tarefa_aviso where id = a.id;
      else
        update cci_tarefa_aviso set enviar_em = v_novo where id = a.id;
      end if;
      continue;
    end if;

    v_quando := case
      when (a.vence_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
        then 'hoje às ' || to_char(a.vence_em at time zone 'America/Sao_Paulo', 'HH24:MI')
      else to_char(a.vence_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end;
    v_link := case when a.usuario_tipo = 'admin' then '/admin/tarefas'
                   else coalesce(cci_prefixo_cliente(a.cliente_id), '/cliente/webposto') || '/tarefas' end
              || '?tarefa=' || a.tarefa_id;
    perform cci_notificar(
      array[a.usuario_id],
      case a.tipo when 'criada' then 'Nova tarefa para você' else 'Tarefa vence em breve' end,
      format('%s%s · vence %s', a.titulo, case when a.empresa is not null then ' — ' || a.empresa else '' end, v_quando),
      case a.tipo when 'criada' then 'info' else 'aviso' end,
      v_link);
    update cci_tarefa_aviso set enviado_em = now() where id = a.id;
    v_qtd := v_qtd + 1;
  end loop;
  delete from cci_tarefa_aviso where enviado_em < now() - interval '30 days';
  return v_qtd;
end $$;
revoke execute on function cci_tarefas_avisos_enviar() from public, anon, authenticated;
grant execute on function cci_tarefas_avisos_enviar() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cci-tarefas-avisos') then
    perform cron.unschedule('cci-tarefas-avisos');
  end if;
  perform cron.schedule('cci-tarefas-avisos', '*/5 * * * *', 'select public.cci_tarefas_avisos_enviar()');
end $$;

-- ─── Tarefas já abertas: agenda só o "vence em breve" ────────
do $$
declare r record;
begin
  for r in select id from cci_tarefa
            where status in ('a_fazer', 'em_andamento') and vence_em > now() and responsavel_id is not null
  loop
    perform cci_tarefa_agendar_avisos(r.id, false);
  end loop;
end $$;
