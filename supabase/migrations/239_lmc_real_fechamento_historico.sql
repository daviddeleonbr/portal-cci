-- 239_lmc_real_fechamento_historico
-- LMC gerencial ("Lançar medições"): o dia TRAVA depois de salvo e tudo fica
-- num histórico.
--   • lmc_real_dia = dia fechado (empresa + data). Existe linha = travado: o
--     lmc_real daquele dia não aceita insert/update/delete (trigger), nem pela
--     API. Salvar agora é só pela RPC lmc_real_salvar_dia, que grava o dia
--     inteiro E fecha, numa transação só.
--   • reabrir: só a CCI (admin), com motivo, pela RPC lmc_real_reabrir_dia.
--     Apaga a linha de lmc_real_dia; os lançamentos continuam lá e podem ser
--     editados e salvos de novo (o que fecha de novo).
--   • lmc_real_historico: cada lançamento/alteração/remoção (trigger em
--     lmc_real, com antes/depois), cada fechamento e cada reabertura (com
--     motivo e a foto do dia). Quem e quando = JWT. Só se grava por trigger/RPC.
-- Ver = quem pode ver a empresa. Idempotente.

-- ── Dia fechado ──────────────────────────────────────────────────────────
create table if not exists lmc_real_dia (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete cascade,
  data             date not null,
  fechado_por_id   uuid,
  fechado_por_nome text,
  fechado_em       timestamptz not null default now(),
  constraint lmc_real_dia_unico unique (cliente_id, data)
);

alter table lmc_real_dia enable row level security;
revoke all on lmc_real_dia from anon;
drop policy if exists lmc_real_dia_sel on lmc_real_dia;
create policy lmc_real_dia_sel on lmc_real_dia
  for select using (cci_pode_ver_cliente(cliente_id));
-- sem policy de insert/update/delete: só as RPCs (security definer) gravam
revoke insert, update, delete on lmc_real_dia from authenticated;
grant select on lmc_real_dia to authenticated;

-- ── Histórico ────────────────────────────────────────────────────────────
-- Sem FK em cliente_id de propósito: o histórico sobrevive (e o trigger do
-- delete em cascata não quebra).
create table if not exists lmc_real_historico (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null,
  data          date not null,
  acao          text not null check (acao in ('lancado', 'alterado', 'removido', 'fechado', 'reaberto')),
  produto_chave text,                 -- null nos eventos do dia (fechado/reaberto)
  antes         jsonb,                -- lançamento antes (alterado/removido) ou foto do dia (reaberto)
  depois        jsonb,                -- lançamento depois (lancado/alterado)
  motivo        text,                 -- motivo da reabertura
  usuario_id    uuid,
  usuario_nome  text,
  em            timestamptz not null default now()
);
create index if not exists ix_lmc_real_hist_cliente_data on lmc_real_historico (cliente_id, data desc, em desc);

alter table lmc_real_historico enable row level security;
revoke all on lmc_real_historico from anon;
drop policy if exists lmc_real_hist_sel on lmc_real_historico;
create policy lmc_real_hist_sel on lmc_real_historico
  for select using (cci_pode_ver_cliente(cliente_id));
revoke insert, update, delete on lmc_real_historico from authenticated;
grant select on lmc_real_historico to authenticated;

-- só o que interessa do lançamento (sem ids/carimbos)
create or replace function lmc_real_json(r lmc_real)
returns jsonb language sql immutable
as $$ select jsonb_build_object(
  'escritural_tanques', r.escritural_tanques, 'motivos_tanques', r.motivos_tanques,
  'escritural_produto', r.escritural_produto, 'motivo', r.motivo) $$;

-- ── Trava: dia fechado não aceita mudança em lmc_real ────────────────────
-- pg_trigger_depth() > 1 = veio de cascata (ex.: empresa excluída) → deixa passar.
create or replace function lmc_real_trava()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r lmc_real := coalesce(new, old);
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if exists (select 1 from lmc_real_dia d where d.cliente_id = r.cliente_id and d.data = r.data)
     or (tg_op = 'UPDATE' and exists (select 1 from lmc_real_dia d where d.cliente_id = old.cliente_id and d.data = old.data)) then
    raise exception 'As medições de % já foram salvas e o dia está fechado. Peça à CCI para reabrir o dia.',
      to_char(r.data, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_lmc_real_trava on lmc_real;
create trigger trg_lmc_real_trava
  before insert or update or delete on lmc_real
  for each row execute function lmc_real_trava();

-- ── Histórico automático de lmc_real ─────────────────────────────────────
create or replace function lmc_real_log()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into lmc_real_historico (cliente_id, data, acao, produto_chave, depois, usuario_id, usuario_nome)
    values (new.cliente_id, new.data, 'lancado', new.produto_chave, lmc_real_json(new), cci_jwt_usuario_id(), cci_usuario_atual_nome());
  elsif tg_op = 'UPDATE' then
    if lmc_real_json(new) is distinct from lmc_real_json(old) then
      insert into lmc_real_historico (cliente_id, data, acao, produto_chave, antes, depois, usuario_id, usuario_nome)
      values (new.cliente_id, new.data, 'alterado', new.produto_chave, lmc_real_json(old), lmc_real_json(new), cci_jwt_usuario_id(), cci_usuario_atual_nome());
    end if;
  else
    if pg_trigger_depth() = 1 then  -- cascata (empresa excluída) não registra
      insert into lmc_real_historico (cliente_id, data, acao, produto_chave, antes, usuario_id, usuario_nome)
      values (old.cliente_id, old.data, 'removido', old.produto_chave, lmc_real_json(old), cci_jwt_usuario_id(), cci_usuario_atual_nome());
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_lmc_real_log on lmc_real;
create trigger trg_lmc_real_log
  after insert or update or delete on lmc_real
  for each row execute function lmc_real_log();

-- Escrita direta em lmc_real deixa de existir: só pela RPC abaixo.
revoke insert, update, delete on lmc_real from authenticated;

-- ── Salvar o dia (e fechar) ──────────────────────────────────────────────
-- p_itens: [{ produto_chave, escritural_tanques: {tq: litros}, motivos_tanques:
-- {tq: texto}, escritural_produto, motivo }]. Item sem nada = remove o
-- lançamento do combustível. Precisa de ao menos um item preenchido.
create or replace function lmc_real_salvar_dia(p_cliente_id uuid, p_data date, p_itens jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  it jsonb;
  v_et jsonb; v_mt jsonb; v_ep numeric; v_mot text;
  v_algum boolean := false;
begin
  if not (cci_pode_ver_cliente(p_cliente_id) and cci_tem_permissao('lmc_editar')) then
    raise exception 'Sem permissão para lançar medições nesta empresa.' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('lmc_real_dia:' || p_cliente_id || ':' || p_data));
  if exists (select 1 from lmc_real_dia where cliente_id = p_cliente_id and data = p_data) then
    raise exception 'As medições de % já foram salvas e o dia está fechado. Peça à CCI para reabrir o dia.',
      to_char(p_data, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_et  := coalesce(it->'escritural_tanques', '{}'::jsonb);
    v_mt  := coalesce(it->'motivos_tanques', '{}'::jsonb);
    v_ep  := nullif(it->>'escritural_produto', '')::numeric;
    v_mot := nullif(btrim(coalesce(it->>'motivo', '')), '');
    if coalesce(btrim(it->>'produto_chave'), '') = '' then continue; end if;

    if v_et = '{}'::jsonb and v_mt = '{}'::jsonb and v_ep is null and v_mot is null then
      delete from lmc_real where cliente_id = p_cliente_id and data = p_data and produto_chave = it->>'produto_chave';
    else
      v_algum := true;
      insert into lmc_real (cliente_id, data, produto_chave, escritural_tanques, motivos_tanques, escritural_produto, motivo, atualizado_por_nome)
      values (p_cliente_id, p_data, it->>'produto_chave', v_et, v_mt, v_ep, left(v_mot, 1000), cci_usuario_atual_nome())
      on conflict (cliente_id, data, produto_chave) do update set
        escritural_tanques = excluded.escritural_tanques, motivos_tanques = excluded.motivos_tanques,
        escritural_produto = excluded.escritural_produto, motivo = excluded.motivo,
        atualizado_por_nome = excluded.atualizado_por_nome;
    end if;
  end loop;

  if not v_algum then
    raise exception 'Preencha o escritural real de ao menos um tanque antes de salvar.' using errcode = 'P0001';
  end if;

  insert into lmc_real_dia (cliente_id, data, fechado_por_id, fechado_por_nome)
  values (p_cliente_id, p_data, cci_jwt_usuario_id(), cci_usuario_atual_nome());
  insert into lmc_real_historico (cliente_id, data, acao, usuario_id, usuario_nome)
  values (p_cliente_id, p_data, 'fechado', cci_jwt_usuario_id(), cci_usuario_atual_nome());
end $$;
revoke all on function lmc_real_salvar_dia(uuid, date, jsonb) from public, anon;
grant execute on function lmc_real_salvar_dia(uuid, date, jsonb) to authenticated;

-- ── Reabrir o dia (só CCI) ───────────────────────────────────────────────
create or replace function lmc_real_reabrir_dia(p_cliente_id uuid, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_foto jsonb;
begin
  if not cci_is_admin() or not cci_pode_ver_cliente(p_cliente_id) then
    raise exception 'Somente a CCI pode reabrir o dia.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da reabertura (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('lmc_real_dia:' || p_cliente_id || ':' || p_data));
  if not exists (select 1 from lmc_real_dia where cliente_id = p_cliente_id and data = p_data) then
    raise exception 'O dia não está fechado (pode já ter sido reaberto).' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_object_agg(r.produto_chave, lmc_real_json(r)), '{}'::jsonb) into v_foto
  from lmc_real r where r.cliente_id = p_cliente_id and r.data = p_data;

  delete from lmc_real_dia where cliente_id = p_cliente_id and data = p_data;
  insert into lmc_real_historico (cliente_id, data, acao, antes, motivo, usuario_id, usuario_nome)
  values (p_cliente_id, p_data, 'reaberto', v_foto, left(btrim(p_motivo), 1000), cci_jwt_usuario_id(), cci_usuario_atual_nome());
end $$;
revoke all on function lmc_real_reabrir_dia(uuid, date, text) from public, anon;
grant execute on function lmc_real_reabrir_dia(uuid, date, text) to authenticated;

-- ── Dias já lançados antes desta migração: ficam fechados ────────────────
insert into lmc_real_dia (cliente_id, data, fechado_por_id, fechado_por_nome, fechado_em)
select distinct on (cliente_id, data) cliente_id, data, atualizado_por_id, atualizado_por_nome, updated_at
from lmc_real
order by cliente_id, data, updated_at desc
on conflict (cliente_id, data) do nothing;
