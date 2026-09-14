-- ============================================================
-- Contas de CARTÃO do plano de contas (Autosystem) marcadas para o
-- diagnóstico de cartões (movto × Equals). Por REDE (o plano de contas é
-- da rede). Cada conta marcada carrega adquirente, bandeira e modalidade,
-- que o lançamento herda pela conta; a autorização vem de movto.documento.
-- ============================================================

create table if not exists as_rede_conta_cartao (
  id            uuid primary key default gen_random_uuid(),
  as_rede_id    uuid not null references as_rede(id) on delete cascade,
  codigo        text not null,
  nome          text,
  adquirente    text,
  bandeira      text,
  modalidade    text check (modalidade is null or modalidade in ('credito', 'debito')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (as_rede_id, codigo)
);

create index if not exists idx_as_rede_conta_cartao_rede on as_rede_conta_cartao (as_rede_id);

alter table as_rede_conta_cartao enable row level security;

drop policy if exists as_rede_conta_cartao_tenant on as_rede_conta_cartao;
create policy as_rede_conta_cartao_tenant on as_rede_conta_cartao
  for all
  using (cci_is_admin() or cci_rede_bate(null, as_rede_id))
  with check (cci_is_admin() or cci_rede_bate(null, as_rede_id));
