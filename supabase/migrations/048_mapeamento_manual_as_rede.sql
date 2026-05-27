-- ============================================================
-- 048_mapeamento_manual_as_rede
--
-- Adiciona suporte a mapeamento manual no nível da REDE AUTOSYSTEM
-- (uma configuração por rede serve todas as empresas dela), espelhando
-- o padrão do Webposto onde o mapeamento é por `chave_api_id`.
--
-- Antes: cada empresa Autosystem tinha sua própria configuração
-- (`mapeamento_manual_contas.cliente_id`). Agora a configuração vive
-- em `as_rede_id` e é compartilhada.
--
-- Backfill: para cada linha existente, preenche `as_rede_id` a partir
-- da empresa correspondente. `cliente_id` fica nullable e segue
-- existindo apenas como fallback de leitura (legado).
-- ============================================================

-- ─── DRE: mapeamento_manual_contas ─────────────────────────
alter table mapeamento_manual_contas
  add column if not exists as_rede_id uuid references as_rede(id) on delete cascade;

update mapeamento_manual_contas mmc
   set as_rede_id = c.as_rede_id
  from clientes c
 where mmc.cliente_id = c.id
   and mmc.as_rede_id is null
   and c.as_rede_id is not null;

alter table mapeamento_manual_contas
  alter column cliente_id drop not null;

create index if not exists idx_map_manual_as_rede
  on mapeamento_manual_contas(as_rede_id);


-- ─── Fluxo de caixa: mapeamento_manual_contas_fluxo ────────
alter table mapeamento_manual_contas_fluxo
  add column if not exists as_rede_id uuid references as_rede(id) on delete cascade;

update mapeamento_manual_contas_fluxo mmcf
   set as_rede_id = c.as_rede_id
  from clientes c
 where mmcf.cliente_id = c.id
   and mmcf.as_rede_id is null
   and c.as_rede_id is not null;

alter table mapeamento_manual_contas_fluxo
  alter column cliente_id drop not null;

create index if not exists idx_map_manual_fluxo_as_rede
  on mapeamento_manual_contas_fluxo(as_rede_id);
