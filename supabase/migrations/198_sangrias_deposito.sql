-- 198_sangrias_deposito
-- Sangrias: retiradas em dinheiro antes do depósito + tarefa "Depósito em banco".
--   • fechamento guarda as retiradas (descrição, valor, arquivo/foto) e o valor a
--     depositar = total apresentado − retiradas
--   • ao confirmar, quem tem a permissão 'sangrias_tarefa_deposito' cria a tarefa
--     de depósito (responsável escolhido; criador = quem confirmou; vence no
--     próximo dia útil às 12:00; comprovante obrigatório; CCI valida)
--   • comprovantes das retiradas no bucket privado 'sangrias-retiradas'
--     (caminho {cliente_id}/{data}/{uuid}.ext)
-- Idempotente.

alter table cliente_sangrias_fechamento add column if not exists retiradas jsonb not null default '[]'::jsonb;
alter table cliente_sangrias_fechamento add column if not exists total_retiradas numeric not null default 0;
alter table cliente_sangrias_fechamento add column if not exists valor_deposito numeric;
alter table cliente_sangrias_fechamento add column if not exists tarefa_deposito_id uuid references cci_tarefa(id) on delete set null;
alter table cliente_sangrias_fechamento add column if not exists deposito_responsavel_nome text;

-- ─── Responsáveis possíveis (funcionários da rede com Tarefas e acesso à empresa)
create or replace function cci_sangria_responsaveis(p_cliente uuid)
returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nome
    from cci_usuarios_sistema u
    join clientes c on c.id = p_cliente
   where cci_pode_ver_cliente(p_cliente)
     and u.status = 'ativo'
     and u.tipo = 'cliente'
     and ((c.chave_api_id is not null and u.chave_api_id = c.chave_api_id)
       or (c.as_rede_id is not null and u.as_rede_id = c.as_rede_id))
     and 'tarefas' = any(coalesce(u.permissoes, '{}'))
     and (u.empresas_permitidas is null or cardinality(u.empresas_permitidas) = 0
          or p_cliente = any(u.empresas_permitidas))
   order by u.nome
$$;
revoke all on function cci_sangria_responsaveis(uuid) from public, anon;
grant execute on function cci_sangria_responsaveis(uuid) to authenticated;

-- ─── Cria a tarefa de depósito do fechamento ─────────────────────
create or replace function cci_sangria_criar_tarefa_deposito(p_fechamento uuid, p_responsavel uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  f cliente_sangrias_fechamento;
  v_nome text;
  v_venc date;
  v_tarefa uuid;
  v_desc text;
  r jsonb;
  brl text;
begin
  if not cci_tem_permissao('sangrias_tarefa_deposito') then
    raise exception 'Sem permissão para criar a tarefa de depósito.' using errcode = '42501';
  end if;
  select * into f from cliente_sangrias_fechamento where id = p_fechamento for update;
  if not found or not cci_pode_ver_cliente(f.cliente_id) then
    raise exception 'Fechamento não encontrado.' using errcode = 'P0002';
  end if;
  if f.tarefa_deposito_id is not null then
    raise exception 'A tarefa de depósito deste fechamento já foi criada.' using errcode = 'P0001';
  end if;
  if coalesce(f.valor_deposito, 0) <= 0 then
    raise exception 'Não há valor a depositar neste fechamento.' using errcode = 'P0001';
  end if;
  select x.nome into v_nome from cci_sangria_responsaveis(f.cliente_id) x where x.id = p_responsavel;
  if v_nome is null then
    raise exception 'Responsável inválido para esta empresa (precisa ter acesso a Tarefas).' using errcode = 'P0001';
  end if;

  -- próximo dia útil (seg–sex) a partir de hoje, 12:00 de Brasília
  v_venc := (now() at time zone 'America/Sao_Paulo')::date + 1;
  while extract(isodow from v_venc) > 5 loop v_venc := v_venc + 1; end loop;

  brl := 'R$ ' || replace(replace(replace(to_char(f.valor_deposito, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.');
  v_desc := 'Depósito em banco do dinheiro das sangrias de ' || to_char(f.data, 'DD/MM/YYYY') || E'.\n'
         || 'Total apresentado (contado): R$ ' || replace(to_char(f.total_apresentado, 'FM999999990D00'), '.', ',') || E'\n';
  if jsonb_array_length(f.retiradas) > 0 then
    v_desc := v_desc || E'Retiradas antes do depósito:\n';
    for r in select * from jsonb_array_elements(f.retiradas) loop
      v_desc := v_desc || '  • ' || coalesce(r->>'descricao', '—') || ': R$ '
             || replace(to_char((r->>'valor')::numeric, 'FM999999990D00'), '.', ',') || E'\n';
    end loop;
  end if;
  v_desc := v_desc || 'Valor a depositar: ' || brl || E'\nConfirmado por: ' || coalesce(f.confirmado_por, '—');

  insert into cci_tarefa (cliente_id, responsavel_id, titulo, descricao, prioridade, vence_em,
                          exige_evidencia, documentos, criado_por)
  values (f.cliente_id, p_responsavel,
          'Depósito em banco — ' || brl || ' (sangrias ' || to_char(f.data, 'DD/MM') || ')',
          v_desc, 'alta', ((v_venc + time '12:00') at time zone 'America/Sao_Paulo'),
          true, array['Comprovante de depósito'], cci_jwt_usuario_id())
  returning id into v_tarefa;

  update cliente_sangrias_fechamento
     set tarefa_deposito_id = v_tarefa, deposito_responsavel_nome = v_nome
   where id = f.id;
  return v_tarefa;
end $$;
revoke all on function cci_sangria_criar_tarefa_deposito(uuid, uuid) from public, anon;
grant execute on function cci_sangria_criar_tarefa_deposito(uuid, uuid) to authenticated;

-- ─── Storage: comprovantes das retiradas ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sangrias-retiradas', 'sangrias-retiradas', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function cci_sangria_path_visivel(p_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_cli uuid;
begin
  begin v_cli := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  return cci_pode_ver_cliente(v_cli);
end $$;
revoke all on function cci_sangria_path_visivel(text) from public, anon;
grant execute on function cci_sangria_path_visivel(text) to authenticated;

drop policy if exists sangrias_ret_sel on storage.objects;
create policy sangrias_ret_sel on storage.objects for select to authenticated
  using (bucket_id = 'sangrias-retiradas' and cci_sangria_path_visivel(name));
drop policy if exists sangrias_ret_ins on storage.objects;
create policy sangrias_ret_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'sangrias-retiradas' and cci_sangria_path_visivel(name));
