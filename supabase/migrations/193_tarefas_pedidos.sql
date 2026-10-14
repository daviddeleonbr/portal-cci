-- ============================================================
-- 193 — Tarefas: pedidos de MAIS PRAZO e de REABERTURA
--
-- O funcionário (responsável) pede com motivo; só a CCI (admin) decide.
--   - prorrogacao: tarefa em aberto; novo prazo até 90 dias. Aprovada → a
--     CCI pode ajustar a data concedida e o vence_em é atualizado.
--   - reabertura: tarefa enviada (aguardando validação) ou concluída.
--     Aprovada → volta para "em andamento".
-- Um pedido pendente por tarefa e tipo. Tudo vai para o histórico.
-- ============================================================

create table if not exists cci_tarefa_pedido (
  id                uuid primary key default gen_random_uuid(),
  tarefa_id         uuid not null references cci_tarefa(id) on delete cascade,
  tipo              text not null check (tipo in ('prorrogacao', 'reabertura')),
  solicitante_id    uuid,
  solicitante_nome  text,
  motivo            text not null check (char_length(trim(motivo)) between 10 and 1000),
  prazo_anterior    timestamptz,
  prazo_solicitado  timestamptz,
  prazo_concedido   timestamptz,
  status            text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  decidido_por      uuid,
  decidido_por_nome text,
  decidido_em       timestamptz,
  resposta          text,
  criado_em         timestamptz not null default now()
);
create unique index if not exists ux_cci_tarefa_pedido_pendente
  on cci_tarefa_pedido (tarefa_id, tipo) where status = 'pendente';
create index if not exists ix_cci_tarefa_pedido_status on cci_tarefa_pedido (status, criado_em);

alter table cci_tarefa_pedido enable row level security;
drop policy if exists cci_tarefa_pedido_sel on cci_tarefa_pedido;
create policy cci_tarefa_pedido_sel on cci_tarefa_pedido for select using (cci_tarefa_visivel(tarefa_id));
-- Escrita só pelas RPCs abaixo (SECURITY DEFINER).
revoke all on cci_tarefa_pedido from anon;

-- Funcionário pede (só o responsável pela tarefa).
create or replace function cci_tarefa_solicitar(p_tarefa uuid, p_tipo text, p_motivo text, p_prazo timestamptz default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  t cci_tarefa;
  v_id uuid;
begin
  select * into t from cci_tarefa where id = p_tarefa;
  if t.id is null or t.responsavel_id is distinct from cci_jwt_usuario_id() then
    raise exception 'Só o responsável pela tarefa pode fazer este pedido.' using errcode = 'P0001';
  end if;
  if coalesce(char_length(trim(p_motivo)), 0) < 10 then
    raise exception 'Explique o motivo (mínimo 10 caracteres).' using errcode = 'P0001';
  end if;
  if exists (select 1 from cci_tarefa_pedido where tarefa_id = p_tarefa and tipo = p_tipo and status = 'pendente') then
    raise exception 'Já existe um pedido aguardando a decisão da CCI.' using errcode = 'P0001';
  end if;

  if p_tipo = 'prorrogacao' then
    if t.status not in ('a_fazer', 'em_andamento') then
      raise exception 'Só é possível pedir mais prazo para tarefa em aberto.' using errcode = 'P0001';
    end if;
    if p_prazo is null or p_prazo <= now() or p_prazo > now() + interval '90 days' then
      raise exception 'Informe um novo prazo futuro (até 90 dias).' using errcode = 'P0001';
    end if;
  elsif p_tipo = 'reabertura' then
    if t.status not in ('aguardando_validacao', 'concluida') then
      raise exception 'Só é possível pedir reabertura de tarefa enviada ou concluída.' using errcode = 'P0001';
    end if;
    p_prazo := null;
  else
    raise exception 'Tipo de pedido inválido.' using errcode = 'P0001';
  end if;

  insert into cci_tarefa_pedido (tarefa_id, tipo, solicitante_id, solicitante_nome, motivo, prazo_anterior, prazo_solicitado)
  values (p_tarefa, p_tipo, cci_jwt_usuario_id(), cci_usuario_atual_nome(), trim(p_motivo), t.vence_em, p_prazo)
  returning id into v_id;

  perform cci_tarefa_log(p_tarefa, p_tipo,
    case p_tipo when 'prorrogacao'
      then 'Pediu mais prazo (até ' || to_char(p_prazo at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '): ' || trim(p_motivo)
      else 'Pediu reabertura: ' || trim(p_motivo) end);
  return v_id;
end $$;
revoke all on function cci_tarefa_solicitar(uuid, text, text, timestamptz) from public, anon;
grant execute on function cci_tarefa_solicitar(uuid, text, text, timestamptz) to authenticated;

-- CCI decide.
create or replace function cci_tarefa_decidir_pedido(p_pedido uuid, p_aprovar boolean, p_resposta text default null, p_prazo timestamptz default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  pd cci_tarefa_pedido;
  v_prazo timestamptz;
begin
  if not cci_is_admin() then raise exception 'Somente a CCI decide os pedidos.' using errcode = 'P0001'; end if;
  select * into pd from cci_tarefa_pedido where id = p_pedido;
  if pd.id is null or pd.status <> 'pendente' then
    raise exception 'Pedido não encontrado ou já decidido.' using errcode = 'P0001';
  end if;
  if not p_aprovar and coalesce(char_length(trim(p_resposta)), 0) < 5 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;

  v_prazo := case when pd.tipo = 'prorrogacao' and p_aprovar then coalesce(p_prazo, pd.prazo_solicitado) end;
  update cci_tarefa_pedido
     set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_por = cci_jwt_usuario_id(), decidido_por_nome = cci_usuario_atual_nome(),
         decidido_em = now(), resposta = nullif(trim(coalesce(p_resposta, '')), ''),
         prazo_concedido = v_prazo
   where id = p_pedido;

  if p_aprovar then
    if pd.tipo = 'prorrogacao' then
      update cci_tarefa set vence_em = v_prazo where id = pd.tarefa_id;
      perform cci_tarefa_log(pd.tarefa_id, 'prorrogacao',
        'Mais prazo aprovado: até ' || to_char(v_prazo at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
    else
      update cci_tarefa set status = 'em_andamento' where id = pd.tarefa_id;
      perform cci_tarefa_log(pd.tarefa_id, 'reabertura', 'Reabertura aprovada pela CCI');
    end if;
  else
    perform cci_tarefa_log(pd.tarefa_id, pd.tipo,
      case pd.tipo when 'prorrogacao' then 'Pedido de prazo recusado: ' else 'Pedido de reabertura recusado: ' end || trim(p_resposta));
  end if;
end $$;
revoke all on function cci_tarefa_decidir_pedido(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function cci_tarefa_decidir_pedido(uuid, boolean, text, timestamptz) to authenticated;
