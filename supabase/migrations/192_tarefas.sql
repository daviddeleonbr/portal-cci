-- ============================================================
-- 192 — Tarefas: rotinas de trabalho dos funcionários dos clientes
--
-- Inspirado no módulo de Tarefas do Visor360, adaptado ao portal:
--   - GESTOR = só a CCI (admin): cria rotinas e tarefas, edita, cancela,
--     VALIDA a conclusão (aprova ou devolve para refazer).
--   - FUNCIONÁRIO = usuário do portal do cliente (permissão 'tarefas'): vê e
--     executa só as tarefas em que é responsável (checklist, evidências,
--     comentários) e envia para validação.
--
-- Status: a_fazer → em_andamento → aguardando_validacao → concluida
--         (devolvida: aguardando_validacao → em_andamento) | cancelada
-- "Atrasada" é calculada (aberta e vence_em < agora), não gravada.
-- Rotinas recorrentes geram tarefas todo dia (pg_cron 00:05 Brasília).
-- ============================================================

-- ─── Setores (lista única, gerida pela CCI) ─────────────────────
create table if not exists cci_tarefa_setor (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (char_length(nome) between 2 and 60),
  ordem      int not null default 100,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
insert into cci_tarefa_setor (nome, ordem) values
  ('Operacional', 10), ('Financeiro', 20), ('Fiscal', 30), ('Estoque', 40),
  ('Compras', 50), ('RH', 60), ('Administrativo', 70), ('Caixa', 80)
on conflict (nome) do nothing;

-- ─── Rotinas (modelos recorrentes) ───────────────────────────────
create table if not exists cci_rotina (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  chave_api_id    uuid,                 -- tenant (preenchido do cliente)
  as_rede_id      uuid,
  setor_id        uuid references cci_tarefa_setor(id) on delete set null,
  responsavel_id  uuid references cci_usuarios_sistema(id) on delete set null, -- null = não gera
  nome            text not null check (char_length(nome) between 3 and 160),
  descricao       text,
  -- diaria | dias_uteis | dias_semana (1=seg … 7=dom) | dias_mes (31 = último dia em mês curto)
  frequencia      text not null default 'diaria'
                  check (frequencia in ('diaria', 'dias_uteis', 'dias_semana', 'dias_mes')),
  dias_semana     smallint[] not null default '{}',
  dias_mes        smallint[] not null default '{}',
  horario         time not null default '18:00',
  prioridade      text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  exige_evidencia boolean not null default false,
  checklist       text[] not null default '{}',
  documentos      text[] not null default '{}',  -- evidências nomeadas obrigatórias
  ativa           boolean not null default true,
  data_inicio     date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  criado_por      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_cci_rotina_cliente on cci_rotina (cliente_id);

-- ─── Tarefas ─────────────────────────────────────────────────────
create table if not exists cci_tarefa (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id) on delete cascade,
  chave_api_id      uuid,
  as_rede_id        uuid,
  setor_id          uuid references cci_tarefa_setor(id) on delete set null,
  rotina_id         uuid references cci_rotina(id) on delete set null, -- null = avulsa
  responsavel_id    uuid references cci_usuarios_sistema(id) on delete set null,
  titulo            text not null check (char_length(titulo) between 2 and 200),
  descricao         text,
  status            text not null default 'a_fazer'
                    check (status in ('a_fazer', 'em_andamento', 'aguardando_validacao', 'concluida', 'cancelada')),
  prioridade        text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  vence_em          timestamptz not null,
  dia_rotina        date,                       -- dia gerado pela rotina (evita duplicar)
  exige_evidencia   boolean not null default false,
  documentos        text[] not null default '{}',
  iniciada_em       timestamptz,
  enviada_em        timestamptz,                -- enviada para validação (mede o prazo)
  concluida_em      timestamptz,                -- aprovada pela CCI
  validada_por      uuid,
  validada_por_nome text,
  criado_por        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists ux_cci_tarefa_rotina_dia on cci_tarefa (rotina_id, dia_rotina);
create index if not exists ix_cci_tarefa_resp on cci_tarefa (responsavel_id, status);
create index if not exists ix_cci_tarefa_venc on cci_tarefa (vence_em);
create index if not exists ix_cci_tarefa_cliente on cci_tarefa (cliente_id);

create table if not exists cci_tarefa_checklist (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid not null references cci_tarefa(id) on delete cascade,
  rotulo         text not null,
  ordem          int not null default 0,
  feito          boolean not null default false,
  feito_em       timestamptz,
  feito_por      uuid,
  feito_por_nome text
);
create index if not exists ix_cci_tarefa_checklist on cci_tarefa_checklist (tarefa_id, ordem);

-- Evidências (foto/documento) e comentários.
create table if not exists cci_tarefa_evidencia (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references cci_tarefa(id) on delete cascade,
  tipo         text not null check (tipo in ('foto', 'documento', 'comentario')),
  nome         text,
  conteudo     text,                -- texto do comentário
  storage_path text,                -- bucket tarefas-evidencias: {tarefa_id}/{uuid}.ext
  tamanho      bigint,
  documento    text,                -- qual documento exigido este anexo atende
  usuario_id   uuid,
  usuario_nome text,
  criado_em    timestamptz not null default now()
);
create index if not exists ix_cci_tarefa_evidencia on cci_tarefa_evidencia (tarefa_id, criado_em);

-- Histórico (gravado só pelos gatilhos/RPCs).
create table if not exists cci_tarefa_evento (
  id           bigserial primary key,
  tarefa_id    uuid not null references cci_tarefa(id) on delete cascade,
  tipo         text not null,
  descricao    text,
  usuario_id   uuid,
  usuario_nome text,
  criado_em    timestamptz not null default now()
);
create index if not exists ix_cci_tarefa_evento on cci_tarefa_evento (tarefa_id, criado_em);

-- ─── Helpers ─────────────────────────────────────────────────────
-- Nome do usuário logado (para histórico/autoria).
create or replace function cci_usuario_atual_nome()
returns text language sql stable security definer set search_path = public
as $$ select nome from cci_usuarios_sistema where id = cci_jwt_usuario_id() $$;

-- A tarefa é visível para o usuário logado? admin: todas; cliente: só as dele.
create or replace function cci_tarefa_visivel(p_tarefa uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select cci_is_admin() or exists (
    select 1 from cci_tarefa t
    where t.id = p_tarefa and t.responsavel_id is not null and t.responsavel_id = cci_jwt_usuario_id()
  )
$$;

create or replace function cci_tarefa_log(p_tarefa uuid, p_tipo text, p_descricao text)
returns void language sql security definer set search_path = public
as $$
  insert into cci_tarefa_evento (tarefa_id, tipo, descricao, usuario_id, usuario_nome)
  values (p_tarefa, p_tipo, p_descricao, cci_jwt_usuario_id(), coalesce(cci_usuario_atual_nome(), 'Sistema'))
$$;

-- ─── Tenant (rede) preenchido a partir do cliente ───────────────
create or replace function cci_tarefa_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  select c.chave_api_id, c.as_rede_id into new.chave_api_id, new.as_rede_id
    from clientes c where c.id = new.cliente_id;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_cci_rotina_tenant on cci_rotina;
create trigger trg_cci_rotina_tenant before insert or update of cliente_id on cci_rotina
  for each row execute function cci_tarefa_tenant();
drop trigger if exists trg_cci_tarefa_tenant on cci_tarefa;
create trigger trg_cci_tarefa_tenant before insert or update of cliente_id on cci_tarefa
  for each row execute function cci_tarefa_tenant();

drop trigger if exists trg_cci_rotina_updated on cci_rotina;
create trigger trg_cci_rotina_updated before update on cci_rotina
  for each row execute function update_updated_at();

-- ─── Regras de status / guarda do funcionário ────────────────────
-- Funcionário (não-admin) só muda o STATUS, e só para frente:
--   a_fazer → em_andamento | aguardando_validacao ; em_andamento → aguardando_validacao.
-- Envio para validação exige checklist completo e as evidências exigidas.
create or replace function cci_tarefa_regras()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_pend int;
  v_doc text;
begin
  if tg_op = 'UPDATE' and not cci_is_admin() then
    if (new.titulo, new.descricao, new.vence_em, new.responsavel_id, new.prioridade, new.setor_id,
        new.cliente_id, new.exige_evidencia, new.documentos, new.rotina_id)
       is distinct from
       (old.titulo, old.descricao, old.vence_em, old.responsavel_id, old.prioridade, old.setor_id,
        old.cliente_id, old.exige_evidencia, old.documentos, old.rotina_id) then
      raise exception 'Somente a CCI pode editar a tarefa.' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'a_fazer' and new.status in ('em_andamento', 'aguardando_validacao'))
      or (old.status = 'em_andamento' and new.status = 'aguardando_validacao')
    ) then
      raise exception 'Mudança de situação não permitida.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'em_andamento' and new.iniciada_em is null then
      new.iniciada_em := now();
    end if;

    if new.status = 'aguardando_validacao' then
      select count(*) into v_pend from cci_tarefa_checklist where tarefa_id = new.id and not feito;
      if v_pend > 0 then
        raise exception 'Conclua todos os itens do checklist antes de enviar (% pendente(s)).', v_pend using errcode = 'P0001';
      end if;
      if new.exige_evidencia then
        if coalesce(array_length(new.documentos, 1), 0) > 0 then
          foreach v_doc in array new.documentos loop
            if not exists (select 1 from cci_tarefa_evidencia e
                           where e.tarefa_id = new.id and e.tipo <> 'comentario' and e.documento = v_doc) then
              raise exception 'Falta anexar a evidência: %.', v_doc using errcode = 'P0001';
            end if;
          end loop;
        elsif not exists (select 1 from cci_tarefa_evidencia e where e.tarefa_id = new.id and e.tipo <> 'comentario') then
          raise exception 'Anexe ao menos uma foto ou documento como evidência.' using errcode = 'P0001';
        end if;
      end if;
      new.enviada_em := now();
      if new.iniciada_em is null then new.iniciada_em := now(); end if;
    end if;

    if new.status = 'concluida' then
      new.concluida_em := now();
      new.validada_por := cci_jwt_usuario_id();
      new.validada_por_nome := cci_usuario_atual_nome();
      if new.enviada_em is null then new.enviada_em := now(); end if;
    end if;

    -- Voltou a ficar aberta (devolvida/reaberta): limpa a conclusão.
    if new.status in ('a_fazer', 'em_andamento') and old.status in ('aguardando_validacao', 'concluida', 'cancelada') then
      new.concluida_em := null;
      new.validada_por := null;
      new.validada_por_nome := null;
      new.enviada_em := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cci_tarefa_regras on cci_tarefa;
create trigger trg_cci_tarefa_regras before update on cci_tarefa
  for each row execute function cci_tarefa_regras();

-- Histórico automático + checklist da rotina na criação.
create or replace function cci_tarefa_eventos()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r cci_rotina;
begin
  if tg_op = 'INSERT' then
    perform cci_tarefa_log(new.id, 'criada',
      case when new.rotina_id is null then 'Tarefa criada' else 'Gerada pela rotina' end);
    if new.rotina_id is not null then
      select * into r from cci_rotina where id = new.rotina_id;
      insert into cci_tarefa_checklist (tarefa_id, rotulo, ordem)
        select new.id, x.rotulo, x.ord::int from unnest(r.checklist) with ordinality as x(rotulo, ord);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Devolução é registrada pela RPC (com o motivo).
    if not (old.status = 'aguardando_validacao' and new.status = 'em_andamento') then
      perform cci_tarefa_log(new.id,
        case new.status
          when 'em_andamento' then case when old.status in ('concluida', 'cancelada') then 'reaberta' else 'iniciada' end
          when 'aguardando_validacao' then 'enviada'
          when 'concluida' then 'aprovada'
          when 'cancelada' then 'cancelada'
          when 'a_fazer' then 'reaberta'
        end,
        case new.status
          when 'em_andamento' then case when old.status in ('concluida', 'cancelada') then 'Tarefa reaberta' else 'Tarefa iniciada' end
          when 'aguardando_validacao' then 'Enviada para validação da CCI'
          when 'concluida' then 'Conclusão aprovada pela CCI'
          when 'cancelada' then 'Tarefa cancelada'
          when 'a_fazer' then 'Tarefa reaberta'
        end);
    end if;
  end if;
  if (new.titulo, new.vence_em, new.responsavel_id, new.prioridade) is distinct from
     (old.titulo, old.vence_em, old.responsavel_id, old.prioridade) then
    perform cci_tarefa_log(new.id, 'editada', 'Tarefa editada pela CCI');
  end if;
  return new;
end $$;

drop trigger if exists trg_cci_tarefa_eventos on cci_tarefa;
create trigger trg_cci_tarefa_eventos after insert or update on cci_tarefa
  for each row execute function cci_tarefa_eventos();

-- Checklist: funcionário só marca/desmarca; marcar inicia a tarefa.
create or replace function cci_tarefa_checklist_regras()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from cci_tarefa where id = coalesce(new.tarefa_id, old.tarefa_id);
  if tg_op = 'UPDATE' then
    if not cci_is_admin() and (new.rotulo, new.ordem, new.tarefa_id) is distinct from (old.rotulo, old.ordem, old.tarefa_id) then
      raise exception 'Somente a CCI pode editar o checklist.' using errcode = 'P0001';
    end if;
    if not cci_is_admin() and v_status not in ('a_fazer', 'em_andamento') then
      raise exception 'A tarefa não está em execução.' using errcode = 'P0001';
    end if;
    if new.feito is distinct from old.feito then
      new.feito_em := case when new.feito then now() end;
      new.feito_por := case when new.feito then cci_jwt_usuario_id() end;
      new.feito_por_nome := case when new.feito then cci_usuario_atual_nome() end;
      perform cci_tarefa_log(new.tarefa_id, 'checklist',
        (case when new.feito then 'Marcou: ' else 'Desmarcou: ' end) || new.rotulo);
      if new.feito and v_status = 'a_fazer' then
        update cci_tarefa set status = 'em_andamento' where id = new.tarefa_id;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cci_tarefa_checklist_regras on cci_tarefa_checklist;
create trigger trg_cci_tarefa_checklist_regras before update on cci_tarefa_checklist
  for each row execute function cci_tarefa_checklist_regras();

-- Evidência/comentário: autoria do servidor + histórico.
create or replace function cci_tarefa_evidencia_regras()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from cci_tarefa where id = new.tarefa_id;
  if not cci_is_admin() and new.tipo <> 'comentario' and v_status not in ('a_fazer', 'em_andamento') then
    raise exception 'Só é possível anexar evidências com a tarefa em execução.' using errcode = 'P0001';
  end if;
  new.usuario_id := cci_jwt_usuario_id();
  new.usuario_nome := coalesce(cci_usuario_atual_nome(), new.usuario_nome);
  perform cci_tarefa_log(new.tarefa_id, case when new.tipo = 'comentario' then 'comentario' else 'evidencia' end,
    case when new.tipo = 'comentario' then 'Comentou' else 'Anexou: ' || coalesce(new.documento, new.nome, 'arquivo') end);
  return new;
end $$;

drop trigger if exists trg_cci_tarefa_evidencia_regras on cci_tarefa_evidencia;
create trigger trg_cci_tarefa_evidencia_regras before insert on cci_tarefa_evidencia
  for each row execute function cci_tarefa_evidencia_regras();

-- ─── Validação pela CCI (aprovar / devolver com motivo) ──────────
create or replace function cci_tarefa_validar(p_tarefa uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not cci_is_admin() then raise exception 'Somente a CCI valida tarefas.' using errcode = 'P0001'; end if;
  select status into v_status from cci_tarefa where id = p_tarefa;
  if v_status is distinct from 'aguardando_validacao' then
    raise exception 'A tarefa não está aguardando validação.' using errcode = 'P0001';
  end if;
  if p_aprovar then
    update cci_tarefa set status = 'concluida' where id = p_tarefa;
  else
    if coalesce(char_length(trim(p_motivo)), 0) < 5 then
      raise exception 'Informe o motivo da devolução.' using errcode = 'P0001';
    end if;
    update cci_tarefa set status = 'em_andamento' where id = p_tarefa;
    perform cci_tarefa_log(p_tarefa, 'devolvida', 'Devolvida para refazer: ' || trim(p_motivo));
  end if;
end $$;
revoke all on function cci_tarefa_validar(uuid, boolean, text) from public, anon;
grant execute on function cci_tarefa_validar(uuid, boolean, text) to authenticated;

-- ─── Recorrência + geração diária ────────────────────────────────
create or replace function cci_rotina_no_dia(r cci_rotina, p_data date)
returns boolean language sql immutable
as $$
  select case r.frequencia
    when 'diaria' then true
    when 'dias_uteis' then extract(isodow from p_data) between 1 and 5
    when 'dias_semana' then extract(isodow from p_data)::smallint = any(r.dias_semana)
    when 'dias_mes' then
      extract(day from p_data)::smallint = any(r.dias_mes)
      -- 29/30/31 em mês mais curto: cai no último dia do mês
      or (p_data = (date_trunc('month', p_data) + interval '1 month - 1 day')::date
          and exists (select 1 from unnest(r.dias_mes) d where d > extract(day from p_data)))
    else false
  end
$$;

-- Gera as tarefas do dia (sem duplicar). p_rotina = só uma rotina.
create or replace function cci_tarefas_gerar(
  p_data date default ((now() at time zone 'America/Sao_Paulo')::date),
  p_rotina uuid default null
) returns int language plpgsql security definer set search_path = public
as $$
declare v_qtd int;
begin
  insert into cci_tarefa (cliente_id, setor_id, rotina_id, responsavel_id, titulo, descricao,
                          prioridade, vence_em, dia_rotina, exige_evidencia, documentos, criado_por)
  select r.cliente_id, r.setor_id, r.id, r.responsavel_id, r.nome, r.descricao,
         r.prioridade, ((p_data + r.horario) at time zone 'America/Sao_Paulo'), p_data,
         r.exige_evidencia, r.documentos, r.criado_por
    from cci_rotina r
    join cci_usuarios_sistema u on u.id = r.responsavel_id and u.status = 'ativo'
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

-- Rotina criada/alterada (ativa) já gera a tarefa de hoje.
create or replace function cci_rotina_gerar_hoje()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.ativa then perform cci_tarefas_gerar((now() at time zone 'America/Sao_Paulo')::date, new.id); end if;
  return new;
end $$;
drop trigger if exists trg_cci_rotina_gerar_hoje on cci_rotina;
create trigger trg_cci_rotina_gerar_hoje after insert or update on cci_rotina
  for each row execute function cci_rotina_gerar_hoje();

-- pg_cron: todo dia 00:05 de Brasília (03:05 UTC).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cci-tarefas-gerar-diario') then
    perform cron.unschedule('cci-tarefas-gerar-diario');
  end if;
  perform cron.schedule('cci-tarefas-gerar-diario', '5 3 * * *', 'select public.cci_tarefas_gerar()');
end $$;

-- ─── RLS ─────────────────────────────────────────────────────────
alter table cci_tarefa_setor enable row level security;
alter table cci_rotina enable row level security;
alter table cci_tarefa enable row level security;
alter table cci_tarefa_checklist enable row level security;
alter table cci_tarefa_evidencia enable row level security;
alter table cci_tarefa_evento enable row level security;

-- Setores: todos leem (rótulo); só a CCI altera.
drop policy if exists cci_tarefa_setor_sel on cci_tarefa_setor;
create policy cci_tarefa_setor_sel on cci_tarefa_setor for select using (cci_jwt_tipo() is not null);
drop policy if exists cci_tarefa_setor_adm on cci_tarefa_setor;
create policy cci_tarefa_setor_adm on cci_tarefa_setor for all using (cci_is_admin()) with check (cci_is_admin());

-- Rotinas: só a CCI.
drop policy if exists cci_rotina_adm on cci_rotina;
create policy cci_rotina_adm on cci_rotina for all using (cci_is_admin()) with check (cci_is_admin());

-- Tarefas: CCI tudo; funcionário vê/atualiza só as dele (regras no gatilho).
drop policy if exists cci_tarefa_sel on cci_tarefa;
create policy cci_tarefa_sel on cci_tarefa for select
  using (cci_is_admin() or (responsavel_id is not null and responsavel_id = cci_jwt_usuario_id()));
drop policy if exists cci_tarefa_upd on cci_tarefa;
create policy cci_tarefa_upd on cci_tarefa for update
  using (cci_is_admin() or (responsavel_id is not null and responsavel_id = cci_jwt_usuario_id()))
  with check (cci_is_admin() or (responsavel_id is not null and responsavel_id = cci_jwt_usuario_id()));
drop policy if exists cci_tarefa_ins on cci_tarefa;
create policy cci_tarefa_ins on cci_tarefa for insert with check (cci_is_admin());
-- Sem DELETE: tarefa se cancela, não se exclui.

drop policy if exists cci_tarefa_checklist_sel on cci_tarefa_checklist;
create policy cci_tarefa_checklist_sel on cci_tarefa_checklist for select using (cci_tarefa_visivel(tarefa_id));
drop policy if exists cci_tarefa_checklist_upd on cci_tarefa_checklist;
create policy cci_tarefa_checklist_upd on cci_tarefa_checklist for update
  using (cci_tarefa_visivel(tarefa_id)) with check (cci_tarefa_visivel(tarefa_id));
drop policy if exists cci_tarefa_checklist_ins on cci_tarefa_checklist;
create policy cci_tarefa_checklist_ins on cci_tarefa_checklist for insert with check (cci_is_admin());
drop policy if exists cci_tarefa_checklist_del on cci_tarefa_checklist;
create policy cci_tarefa_checklist_del on cci_tarefa_checklist for delete using (cci_is_admin());

drop policy if exists cci_tarefa_evidencia_sel on cci_tarefa_evidencia;
create policy cci_tarefa_evidencia_sel on cci_tarefa_evidencia for select using (cci_tarefa_visivel(tarefa_id));
drop policy if exists cci_tarefa_evidencia_ins on cci_tarefa_evidencia;
create policy cci_tarefa_evidencia_ins on cci_tarefa_evidencia for insert with check (cci_tarefa_visivel(tarefa_id));
drop policy if exists cci_tarefa_evidencia_del on cci_tarefa_evidencia;
create policy cci_tarefa_evidencia_del on cci_tarefa_evidencia for delete
  using (cci_is_admin() or (cci_tarefa_visivel(tarefa_id) and usuario_id = cci_jwt_usuario_id()));

drop policy if exists cci_tarefa_evento_sel on cci_tarefa_evento;
create policy cci_tarefa_evento_sel on cci_tarefa_evento for select using (cci_tarefa_visivel(tarefa_id));

revoke all on cci_tarefa_setor, cci_rotina, cci_tarefa, cci_tarefa_checklist, cci_tarefa_evidencia, cci_tarefa_evento from anon;
revoke execute on function cci_tarefa_log(uuid, text, text) from public, anon, authenticated;

-- ─── Storage: evidências (bucket privado, por tarefa) ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tarefas-evidencias', 'tarefas-evidencias', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Caminho {tarefa_id}/{arquivo}: só quem vê a tarefa lê/grava.
create or replace function cci_tarefa_visivel_path(p_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from cci_tarefa t
                 where t.id::text = split_part(p_name, '/', 1) and cci_tarefa_visivel(t.id))
$$;

drop policy if exists tarefas_evid_sel on storage.objects;
create policy tarefas_evid_sel on storage.objects for select
  using (bucket_id = 'tarefas-evidencias' and cci_tarefa_visivel_path(name));
drop policy if exists tarefas_evid_ins on storage.objects;
create policy tarefas_evid_ins on storage.objects for insert
  with check (bucket_id = 'tarefas-evidencias' and cci_tarefa_visivel_path(name));
drop policy if exists tarefas_evid_del on storage.objects;
create policy tarefas_evid_del on storage.objects for delete
  using (bucket_id = 'tarefas-evidencias' and cci_tarefa_visivel_path(name));
