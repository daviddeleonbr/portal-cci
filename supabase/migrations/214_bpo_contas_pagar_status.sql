-- 214_bpo_contas_pagar_status
-- BPO · Contas a pagar: acompanhamento da autorização no banco.
-- Os títulos vêm do ERP do cliente (Webposto TITULO_PAGAR / Autosystem movto),
-- lançados lá pela CCI. Aqui fica só o STATUS de cada título:
--   sem linha       → a incluir no banco
--   'incluida'      → a CCI incluiu no banco do cliente, aguardando autorização
--   'autorizada'    → o cliente (ou a CCI) marcou como autorizada no banco
-- Pago = o título sai do ERP como pendente (não precisa de status aqui).
--
-- titulo_chave: webposto = tituloPagarCodigo; autosystem = movto.grid.
-- valor/vencimento/fornecedor/documento = foto do título NA INCLUSÃO, para a
-- tela avisar se o título mudou no ERP depois de ir pro banco.
--
-- RLS: ver = quem pode ver a empresa. Incluir/excluir = só CCI (admin).
-- Alterar = CCI, ou cliente com 'bpo_contas_pagar_autorizar' — e o cliente
-- só mexe no status incluida↔autorizada (trigger trava o resto). Idempotente.

create table if not exists bpo_contas_pagar_status (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  titulo_chave         text not null,
  status               text not null default 'incluida',
  vencimento           date,
  valor                numeric,
  fornecedor           text,
  documento            text,
  observacao           text,
  incluida_em          timestamptz not null default now(),
  incluida_por_id      uuid,
  incluida_por_nome    text,
  autorizada_em        timestamptz,
  autorizada_por_id    uuid,
  autorizada_por_nome  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bpo_cp_status_unico unique (cliente_id, titulo_chave),
  constraint bpo_cp_status_valido check (status in ('incluida', 'autorizada')),
  constraint bpo_cp_obs_tamanho check (observacao is null or char_length(observacao) <= 500)
);

create index if not exists idx_bpo_cp_status_cliente on bpo_contas_pagar_status (cliente_id);

-- Carimbos sempre do JWT; cliente só muda status/autorização.
create or replace function bpo_contas_pagar_status_carimbo()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.incluida_em := now();
    new.incluida_por_id := cci_jwt_usuario_id();
  else
    if not cci_is_admin() then
      new.cliente_id        := old.cliente_id;
      new.titulo_chave      := old.titulo_chave;
      new.vencimento        := old.vencimento;
      new.valor             := old.valor;
      new.fornecedor        := old.fornecedor;
      new.documento         := old.documento;
      new.observacao        := old.observacao;
      new.incluida_em       := old.incluida_em;
      new.incluida_por_id   := old.incluida_por_id;
      new.incluida_por_nome := old.incluida_por_nome;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.status = 'autorizada' then
    if tg_op = 'INSERT' or old.status is distinct from 'autorizada' then
      new.autorizada_em := now();
      new.autorizada_por_id := cci_jwt_usuario_id();
    else
      new.autorizada_em := old.autorizada_em;
      new.autorizada_por_id := old.autorizada_por_id;
      new.autorizada_por_nome := old.autorizada_por_nome;
    end if;
  else
    new.autorizada_em := null;
    new.autorizada_por_id := null;
    new.autorizada_por_nome := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_bpo_cp_status_carimbo on bpo_contas_pagar_status;
create trigger trg_bpo_cp_status_carimbo
  before insert or update on bpo_contas_pagar_status
  for each row execute function bpo_contas_pagar_status_carimbo();

alter table bpo_contas_pagar_status enable row level security;
revoke all on bpo_contas_pagar_status from anon;

drop policy if exists bpo_cp_status_sel on bpo_contas_pagar_status;
create policy bpo_cp_status_sel on bpo_contas_pagar_status
  for select using (cci_pode_ver_cliente(cliente_id));

drop policy if exists bpo_cp_status_ins on bpo_contas_pagar_status;
create policy bpo_cp_status_ins on bpo_contas_pagar_status
  for insert with check (cci_is_admin());

drop policy if exists bpo_cp_status_upd on bpo_contas_pagar_status;
create policy bpo_cp_status_upd on bpo_contas_pagar_status
  for update using (cci_is_admin() or (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('bpo_contas_pagar_autorizar')))
  with check (cci_is_admin() or (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('bpo_contas_pagar_autorizar')));

drop policy if exists bpo_cp_status_del on bpo_contas_pagar_status;
create policy bpo_cp_status_del on bpo_contas_pagar_status
  for delete using (cci_is_admin());

grant select, insert, update, delete on bpo_contas_pagar_status to authenticated;

-- Tempo real: o cliente vê na hora quando a CCI inclui no banco (e vice-versa)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bpo_contas_pagar_status'
  ) then
    alter publication supabase_realtime add table public.bpo_contas_pagar_status;
  end if;
end $$;
