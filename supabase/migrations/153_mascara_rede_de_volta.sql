-- ============================================================
-- 153_mascara_rede_de_volta
--
-- Permissão de máscara volta a ser POR REDE (Webposto = chave_api_id,
-- Autosystem = as_rede_id), aplicando-se a todas as empresas da rede.
-- Substitui as tabelas por empresa (cliente_mascara_*, migração 152).
--
-- Semântica: rede SEM nenhuma linha = todas as máscaras liberadas.
-- ============================================================

drop table if exists cliente_mascara_dre;
drop table if exists cliente_mascara_fluxo;

create table if not exists mascara_dre_rede (
  id           uuid default gen_random_uuid() primary key,
  mascara_id   uuid not null references mascaras_dre(id) on delete cascade,
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id)    on delete cascade,
  created_at   timestamptz default now(),
  check (num_nonnulls(chave_api_id, as_rede_id) = 1)
);
create index  if not exists mascara_dre_rede_mascara_idx on mascara_dre_rede(mascara_id);
create unique index if not exists mascara_dre_rede_wp_uq on mascara_dre_rede(mascara_id, chave_api_id) where chave_api_id is not null;
create unique index if not exists mascara_dre_rede_as_uq on mascara_dre_rede(mascara_id, as_rede_id)   where as_rede_id   is not null;

create table if not exists mascara_fluxo_rede (
  id           uuid default gen_random_uuid() primary key,
  mascara_id   uuid not null references mascaras_fluxo_caixa(id) on delete cascade,
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id)    on delete cascade,
  created_at   timestamptz default now(),
  check (num_nonnulls(chave_api_id, as_rede_id) = 1)
);
create index  if not exists mascara_fluxo_rede_mascara_idx on mascara_fluxo_rede(mascara_id);
create unique index if not exists mascara_fluxo_rede_wp_uq on mascara_fluxo_rede(mascara_id, chave_api_id) where chave_api_id is not null;
create unique index if not exists mascara_fluxo_rede_as_uq on mascara_fluxo_rede(mascara_id, as_rede_id)   where as_rede_id   is not null;

alter table mascara_dre_rede   enable row level security;
alter table mascara_fluxo_rede enable row level security;
create policy "Allow all for mascara_dre_rede"   on mascara_dre_rede   for all using (true) with check (true);
create policy "Allow all for mascara_fluxo_rede" on mascara_fluxo_rede for all using (true) with check (true);
