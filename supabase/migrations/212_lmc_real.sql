-- 212_lmc_real
-- LMC REAL (gerencial), separado do oficial (Webposto/fisco).
-- O oficial vem da API do Webposto e não é tocado. Aqui ficam só os AJUSTES:
-- o estoque escritural real digitado (por tanque, ou do combustível quando o
-- LMC não tem detalhe por tanque) e o motivo da diferença. A medição de
-- fechamento continua sendo a do Webposto; perda/sobra e % reais são
-- calculadas na tela (medido − escritural real). Sem linha aqui = usa o oficial.
--
-- Uma linha por empresa + dia + combustível (produto_chave = produtoLmcCodigo
-- da API, ou os produtoCodigo unidos por "+").
--
-- RLS: ver = quem pode ver a empresa; gravar = CCI ou cliente com a
-- permissão 'lmc_editar' (cci_tem_permissao já devolve true p/ admin).
-- Idempotente.

create table if not exists lmc_real (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  data                 date not null,
  produto_chave        text not null,
  -- { "<tanqueCodigo>": <escritural real em litros>, ... }
  escritural_tanques   jsonb not null default '{}'::jsonb,
  -- escritural real do combustível quando o LMC não tem tanques (senão = soma dos tanques)
  escritural_produto   numeric,
  motivo               text,
  atualizado_por_id    uuid,
  atualizado_por_nome  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lmc_real_unico unique (cliente_id, data, produto_chave),
  constraint lmc_real_motivo_tamanho check (motivo is null or char_length(motivo) <= 1000)
);

create index if not exists idx_lmc_real_cliente_data on lmc_real (cliente_id, data);

-- Quem alterou e quando: sempre do JWT (não confia no que vem do navegador)
create or replace function lmc_real_carimbo()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  new.atualizado_por_id := cci_jwt_usuario_id();
  return new;
end $$;

drop trigger if exists trg_lmc_real_carimbo on lmc_real;
create trigger trg_lmc_real_carimbo
  before insert or update on lmc_real
  for each row execute function lmc_real_carimbo();

alter table lmc_real enable row level security;
revoke all on lmc_real from anon;

drop policy if exists lmc_real_sel on lmc_real;
create policy lmc_real_sel on lmc_real
  for select using (cci_pode_ver_cliente(cliente_id));

drop policy if exists lmc_real_ins on lmc_real;
create policy lmc_real_ins on lmc_real
  for insert with check (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('lmc_editar'));

drop policy if exists lmc_real_upd on lmc_real;
create policy lmc_real_upd on lmc_real
  for update using (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('lmc_editar'))
  with check (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('lmc_editar'));

drop policy if exists lmc_real_del on lmc_real;
create policy lmc_real_del on lmc_real
  for delete using (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('lmc_editar'));

grant select, insert, update, delete on lmc_real to authenticated;
