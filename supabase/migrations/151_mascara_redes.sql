-- ============================================================
-- 151_mascara_redes
--
-- Allowlist de redes por máscara (DRE e Fluxo de Caixa). Cada linha libera
-- UMA máscara para UMA rede (Webposto = chave_api_id, Autosystem = as_rede_id).
--
-- Semântica: máscara SEM nenhuma linha aqui = disponível para TODAS as redes
-- (compatível com o comportamento atual, em que toda máscara é global).
-- Com uma ou mais linhas, só as redes listadas veem a máscara.
-- ============================================================

create table if not exists mascara_dre_rede (
  id           uuid default gen_random_uuid() primary key,
  mascara_id   uuid not null references mascaras_dre(id) on delete cascade,
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id)    on delete cascade,
  created_at   timestamptz default now(),
  check (num_nonnulls(chave_api_id, as_rede_id) = 1)   -- exatamente uma rede
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

-- RLS permissiva (igual às tabelas de máscara/grupos, que o portal do cliente
-- lê direto para montar o relatório).
alter table mascara_dre_rede   enable row level security;
alter table mascara_fluxo_rede enable row level security;
create policy "Allow all for mascara_dre_rede"   on mascara_dre_rede   for all using (true) with check (true);
create policy "Allow all for mascara_fluxo_rede" on mascara_fluxo_rede for all using (true) with check (true);
