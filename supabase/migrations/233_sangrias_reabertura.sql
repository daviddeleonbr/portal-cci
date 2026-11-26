-- 233_sangrias_reabertura
-- A CCI (admin) pode reabrir a conferência de sangrias de um dia já confirmado.
--   • "travado" no portal = existe linha em cliente_sangrias_fechamento; reabrir
--     apaga a linha e o cliente refaz a contagem e confirma de novo.
--   • antes de apagar, guarda a foto completa do fechamento (snapshot) + motivo,
--     quem reabriu e quando em cliente_sangrias_reabertura (histórico).
--   • tarefa de depósito: se ainda está a fazer / em andamento, é cancelada (o
--     novo fechamento cria outra com o valor certo). Se já foi enviada para
--     validação ou concluída (depósito feito), fica como está e o histórico anota.
--   • arquivos das retiradas ficam no bucket (o snapshot aponta pra eles).
-- Histórico: admin vê tudo; cliente vê o das empresas dele (mesma regra de
-- leitura das sangrias). Só se grava pela RPC.
-- Idempotente.

create table if not exists cliente_sangrias_reabertura (
  id                  uuid primary key default gen_random_uuid(),
  fechamento_id       uuid not null,            -- id da linha apagada (não é FK)
  cliente_id          uuid not null references clientes(id) on delete cascade,
  data                date not null,
  motivo              text not null check (char_length(btrim(motivo)) between 5 and 1000),
  snapshot            jsonb not null,           -- linha inteira do fechamento reaberto
  tarefa_deposito_id  uuid,
  tarefa_acao         text not null default 'sem_tarefa'
                      check (tarefa_acao in ('sem_tarefa', 'cancelada', 'mantida')),
  tarefa_status       text,                     -- status da tarefa no momento da reabertura
  reaberto_por        uuid,
  reaberto_por_nome   text,
  reaberto_em         timestamptz not null default now()
);
create index if not exists ix_sangrias_reab_cliente_data on cliente_sangrias_reabertura (cliente_id, data desc);

alter table cliente_sangrias_reabertura enable row level security;
drop policy if exists sangrias_reab_sel on cliente_sangrias_reabertura;
create policy sangrias_reab_sel on cliente_sangrias_reabertura for select
  using (cci_is_admin()
         or (cci_pode_ver_cliente(cliente_id)
             and (cci_tem_permissao('sangrias') or cci_tem_permissao('sangrias_consultar'))));
-- sem policy de insert/update/delete: só a RPC (security definer) grava
revoke all on cliente_sangrias_reabertura from anon;
grant select on cliente_sangrias_reabertura to authenticated;

create or replace function cci_sangria_reabrir(p_fechamento uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  f cliente_sangrias_fechamento;
  v_status text;
  v_acao text := 'sem_tarefa';
  v_id uuid;
begin
  if not cci_is_admin() then
    raise exception 'Somente a CCI pode reabrir a conferência de sangrias.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da reabertura (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;

  select * into f from cliente_sangrias_fechamento where id = p_fechamento for update;
  if not found then
    raise exception 'Fechamento não encontrado (pode já ter sido reaberto).' using errcode = 'P0002';
  end if;

  if f.tarefa_deposito_id is not null then
    select status into v_status from cci_tarefa where id = f.tarefa_deposito_id for update;
    if v_status in ('a_fazer', 'em_andamento') then
      update cci_tarefa set status = 'cancelada' where id = f.tarefa_deposito_id;
      perform cci_tarefa_log(f.tarefa_deposito_id, 'comentario',
        'Cancelada: a conferência de sangrias de ' || to_char(f.data, 'DD/MM/YYYY')
        || ' foi reaberta pela CCI. Motivo: ' || btrim(p_motivo));
      v_acao := 'cancelada';
    elsif v_status is not null then
      v_acao := 'mantida';
    end if;
  end if;

  insert into cliente_sangrias_reabertura (fechamento_id, cliente_id, data, motivo, snapshot,
                                           tarefa_deposito_id, tarefa_acao, tarefa_status,
                                           reaberto_por, reaberto_por_nome)
  values (f.id, f.cliente_id, f.data, btrim(p_motivo), to_jsonb(f),
          f.tarefa_deposito_id, v_acao, v_status,
          cci_jwt_usuario_id(), cci_usuario_atual_nome())
  returning id into v_id;

  delete from cliente_sangrias_fechamento where id = f.id;
  return v_id;
end $$;
revoke all on function cci_sangria_reabrir(uuid, text) from public, anon;
grant execute on function cci_sangria_reabrir(uuid, text) to authenticated;
