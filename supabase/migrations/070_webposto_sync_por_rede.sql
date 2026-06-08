-- ============================================================
-- Sync Webposto: passa do nível "empresa" para "rede".
-- O cron e a UI agora controlam a sincronização por chave_api_id
-- (rede inteira). Internamente o worker ainda roda 1 vez por empresa
-- — só o disparo e o status agregado é por rede.
--
-- `cci_webposto_sync_config` (por empresa) continua existindo pra
-- guardar ultima_sync_em e status individual de cada empresa, mas a
-- coluna `ativo` lá deixa de ser usada — quem decide é a rede.
-- ============================================================

create table if not exists cci_webposto_sync_config_rede (
  chave_api_id     uuid primary key references chaves_api(id) on delete cascade,
  ativo            boolean not null default false,
  ultima_sync_em   timestamptz,
  status           text not null default 'pendente'
    check (status in ('pendente','em_progresso','ok','erro','parcial')),
  erro_mensagem    text
);

-- Realtime na config_rede pra a UI refletir o toggle em tempo real.
alter publication supabase_realtime add table cci_webposto_sync_config_rede;

alter table cci_webposto_sync_config_rede enable row level security;
drop policy if exists p_webposto_sync_config_rede_all on cci_webposto_sync_config_rede;
create policy p_webposto_sync_config_rede_all on cci_webposto_sync_config_rede
  for all using (true) with check (true);
