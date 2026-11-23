-- 219_push_notificacoes
-- Push no celular (Web Push / PWA).
--   1) push_inscricoes: aparelhos de cada usuário (endpoint + chaves do navegador).
--   2) Toda linha nova em `notificacoes` (o sino) dispara a Edge Function
--      `push-enviar` via pg_net → push em todos os aparelhos daquele usuário.
--   3) Eventos do BPO criam notificações (e portanto push):
--      - CCI incluiu contas no banco  → cliente: "Contas aguardando sua autorização"
--      - cliente autorizou contas     → CCI (bpo_contas_pagar): "Contas autorizadas"
--      - NF enviada pelo cliente      → CCI (notas_fiscais)
--      - NF devolvida / lançada       → cliente (notas_fiscais)
-- Precisa: secret `service_role_key` no Vault (já usada pelos crons) e a função
-- push-enviar publicada com os secrets VAPID_*. Idempotente.

-- ─── 1) Aparelhos inscritos ──────────────────────────────────
create table if not exists push_inscricoes (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references cci_usuarios_sistema(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint push_inscricoes_unica unique (usuario_id, endpoint)
);
create index if not exists idx_push_inscricoes_usuario on push_inscricoes (usuario_id);

alter table push_inscricoes enable row level security;
revoke all on push_inscricoes from anon;

drop policy if exists push_insc_dono on push_inscricoes;
create policy push_insc_dono on push_inscricoes
  for all using (usuario_id = cci_jwt_usuario_id())
  with check (usuario_id = cci_jwt_usuario_id());

grant select, insert, update, delete on push_inscricoes to authenticated;

-- Sair do portal: remove a inscrição DESTE aparelho mesmo sem sessão (o token
-- já foi descartado). Exige endpoint + usuário — o endpoint só o aparelho tem.
create or replace function push_remover_inscricao(p_endpoint text, p_usuario_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from push_inscricoes where endpoint = p_endpoint and usuario_id = p_usuario_id;
$$;
revoke execute on function push_remover_inscricao(text, uuid) from public;
grant execute on function push_remover_inscricao(text, uuid) to anon, authenticated;

-- ─── 2) notificação nova → push ──────────────────────────────
create or replace function cci_push_disparar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- só chama a função se o usuário tem algum aparelho inscrito
  if exists (select 1 from push_inscricoes where usuario_id = new.usuario_id) then
    perform net.http_post(
      url     := 'https://tyfqqezwekzycfmhehfk.supabase.co/functions/v1/push-enviar',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := jsonb_build_object('notificacao_id', new.id),
      timeout_milliseconds := 15000
    );
  end if;
  return new;
exception when others then
  -- push nunca pode impedir a notificação de ser gravada
  raise warning 'push: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notificacoes_push on notificacoes;
create trigger trg_notificacoes_push
  after insert on notificacoes
  for each row execute function cci_push_disparar();

-- ─── 3) Destinatários ────────────────────────────────────────
-- Usuários do CLIENTE que enxergam a empresa (mesma rede + empresas_permitidas)
-- e têm a permissão (master da rede recebe sempre).
create or replace function cci_usuarios_da_empresa(p_cliente_id uuid, p_permissao text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select u.id
    from cci_usuarios_sistema u
    join clientes c on c.id = p_cliente_id
   where u.tipo = 'cliente' and u.status = 'ativo'
     and ((c.chave_api_id is not null and u.chave_api_id = c.chave_api_id)
       or (c.as_rede_id  is not null and u.as_rede_id  = c.as_rede_id))
     and (u.empresas_permitidas is null or cardinality(u.empresas_permitidas) = 0
       or p_cliente_id = any(u.empresas_permitidas))
     and (p_permissao is null or coalesce(u.is_master, false) or p_permissao = any(u.permissoes));
$$;

-- Admins (CCI) com a permissão; N3 (acesso total) recebe sempre.
create or replace function cci_admins_com_permissao(p_permissao text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select u.id
    from cci_usuarios_sistema u
   where u.tipo = 'admin' and u.status = 'ativo'
     and (coalesce(u.nivel_admin, case when u.is_master then 3 else 1 end) = 3
       or p_permissao = any(u.permissoes));
$$;

create or replace function cci_notificar(p_usuarios uuid[], p_titulo text, p_mensagem text, p_tipo text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notificacoes (usuario_id, titulo, mensagem, tipo, link)
  select distinct u, p_titulo, p_mensagem, p_tipo, p_link from unnest(p_usuarios) u where u is not null;
$$;

revoke execute on function cci_usuarios_da_empresa(uuid, text) from public;
revoke execute on function cci_admins_com_permissao(text) from public;
revoke execute on function cci_notificar(uuid[], text, text, text, text) from public;

create or replace function cci_fmt_brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- prefixo da rota do cliente (webposto | autosystem)
create or replace function cci_prefixo_cliente(p_cliente_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select '/cliente/' || case when c.chave_api_id is not null then 'webposto' else 'autosystem' end
    from clientes c where c.id = p_cliente_id;
$$;

-- ─── 3a) Contas a pagar: CCI incluiu no banco → cliente ──────
-- Por COMANDO (statement): incluir 20 contas de uma vez = 1 notificação.
create or replace function bpo_cp_notificar_inclusao()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select n.cliente_id, count(*) qtd, sum(n.valor) total,
           min(coalesce(n.data_pagamento, n.vencimento)) primeiro, max(c.nome) empresa
      from novos n join clientes c on c.id = n.cliente_id
     where n.status = 'incluida'
     group by n.cliente_id
  loop
    perform cci_notificar(
      array(select cci_usuarios_da_empresa(r.cliente_id, 'bpo_contas_pagar')),
      'Contas aguardando sua autorização',
      format('%s conta(s) incluída(s) no banco pela CCI — %s%s. %s',
             r.qtd, cci_fmt_brl(r.total),
             case when r.primeiro is not null then ', pagamento a partir de ' || to_char(r.primeiro, 'DD/MM') else '' end,
             r.empresa),
      'aviso',
      cci_prefixo_cliente(r.cliente_id) || '/bpo/contas-pagar');
  end loop;
  return null;
exception when others then
  raise warning '%: %', 'bpo_cp_notificar_inclusao', sqlerrm; -- notificar nunca bloqueia a ação
  return null;
end $$;

drop trigger if exists trg_bpo_cp_notificar_inclusao on bpo_contas_pagar_status;
create trigger trg_bpo_cp_notificar_inclusao
  after insert on bpo_contas_pagar_status
  referencing new table as novos
  for each statement execute function bpo_cp_notificar_inclusao();

-- ─── 3b) Contas a pagar: cliente autorizou → CCI ─────────────
create or replace function bpo_cp_notificar_autorizacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if cci_is_admin() then return null; end if; -- a própria CCI marcou: não avisa a si mesma
  for r in
    select n.cliente_id, count(*) qtd, sum(n.valor) total, max(c.nome) empresa, max(n.autorizada_por_nome) quem
      from novos n
      join antigos o on o.id = n.id
      join clientes c on c.id = n.cliente_id
     where n.status = 'autorizada' and o.status is distinct from 'autorizada'
     group by n.cliente_id
  loop
    perform cci_notificar(
      array(select cci_admins_com_permissao('bpo_contas_pagar')),
      'Contas autorizadas pelo cliente',
      format('%s autorizou %s conta(s) no banco — %s%s.', r.empresa, r.qtd, cci_fmt_brl(r.total),
             case when r.quem is not null then ' (' || r.quem || ')' else '' end),
      'sucesso',
      '/admin/bpo/contas-pagar');
  end loop;
  return null;
exception when others then
  raise warning '%: %', 'bpo_cp_notificar_autorizacao', sqlerrm; -- notificar nunca bloqueia a ação
  return null;
end $$;

drop trigger if exists trg_bpo_cp_notificar_autorizacao on bpo_contas_pagar_status;
create trigger trg_bpo_cp_notificar_autorizacao
  after update on bpo_contas_pagar_status
  referencing old table as antigos new table as novos
  for each statement execute function bpo_cp_notificar_autorizacao();

-- ─── 3c) Manifestação de NF: enviada / devolvida / lançada ───
create or replace function nf_notificar_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_num text;
  v_empresa text;
  v_forn text := coalesce(nullif(new.razao_social_fornecedor, ''), 'fornecedor');
begin
  if new.status_portal is not distinct from old.status_portal then return new; end if;
  v_num := case when length(coalesce(new.chave_documento, '')) = 44
                then 'NF ' || ltrim(substr(new.chave_documento, 26, 9), '0') else 'Nota' end;
  select nome into v_empresa from clientes where id = new.cliente_id;

  if new.status_portal = 'enviada' then
    perform cci_notificar(
      array(select cci_admins_com_permissao('notas_fiscais')),
      'Nota enviada pelo cliente',
      format('%s enviou a %s de %s (%s) para lançamento.', coalesce(v_empresa, 'Cliente'), v_num, v_forn, cci_fmt_brl(new.valor)),
      'info',
      '/admin/fiscal/manifestacao/' || new.id);
  elsif new.status_portal = 'devolvida' then
    perform cci_notificar(
      array(select cci_usuarios_da_empresa(new.cliente_id, 'notas_fiscais')),
      'Nota devolvida para correção',
      format('%s de %s: %s', v_num, v_forn, coalesce(nullif(new.motivo_devolucao, ''), 'veja os itens marcados pela CCI.')),
      'aviso',
      cci_prefixo_cliente(new.cliente_id) || '/financeiro/notas-fiscais/' || new.id);
  elsif new.status_portal = 'lancada' then
    perform cci_notificar(
      array(select cci_usuarios_da_empresa(new.cliente_id, 'notas_fiscais')),
      'Nota lançada pela CCI',
      format('%s de %s (%s) foi lançada no sistema.', v_num, v_forn, cci_fmt_brl(new.valor)),
      'sucesso',
      cci_prefixo_cliente(new.cliente_id) || '/financeiro/notas-fiscais/' || new.id);
  end if;
  return new;
exception when others then
  raise warning 'nf_notificar_status: %', sqlerrm; -- notificar nunca bloqueia a nota
  return new;
end $$;

drop trigger if exists trg_nf_notificar_status on nf_manifestacao;
create trigger trg_nf_notificar_status
  after update of status_portal on nf_manifestacao
  for each row execute function nf_notificar_status();
