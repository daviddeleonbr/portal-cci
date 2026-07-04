-- 117_rls_c_tenant_webposto
-- ============================================================
-- FASE 3 · LOTE C — tabelas TENANT WEBPOSTO (chave_api_id).
-- Todas são LEITURA do cliente / ESCRITA admin (ou Edge worker via
-- service_role, que passa por cima do RLS). Padrão:
--   SELECT: admin OU a própria rede (chave_api_id = claim)
--   INSERT/UPDATE/DELETE: só admin
-- Cliente vê só a própria rede; admin vê tudo. Teste negativo: cliente da
-- rede A não vê vendas/contas/mapeamentos da rede B.
-- Rollback: bloco no fim.
-- ============================================================

-- cliente_contas_bancarias
alter table cliente_contas_bancarias enable row level security;
drop policy if exists "Allow all for cliente_contas_bancarias" on cliente_contas_bancarias;
create policy "contas_bancarias_sel" on cliente_contas_bancarias
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "contas_bancarias_mod" on cliente_contas_bancarias
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_webposto_venda  (escrita via Edge worker / service_role)
alter table cci_webposto_venda enable row level security;
drop policy if exists "p_webposto_venda_all" on cci_webposto_venda;
create policy "webposto_venda_sel" on cci_webposto_venda
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "webposto_venda_mod" on cci_webposto_venda
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_webposto_venda_item  (chave_api_id denormalizado)
alter table cci_webposto_venda_item enable row level security;
drop policy if exists "p_webposto_venda_item_all" on cci_webposto_venda_item;
create policy "webposto_venda_item_sel" on cci_webposto_venda_item
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "webposto_venda_item_mod" on cci_webposto_venda_item
  for all using (cci_is_admin()) with check (cci_is_admin());

-- extratos_bancarios  (leitura admin; policy de storage é separada, não mexer)
alter table extratos_bancarios enable row level security;
drop policy if exists "Allow all for extratos_bancarios" on extratos_bancarios;
create policy "extratos_sel" on extratos_bancarios
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "extratos_mod" on extratos_bancarios
  for all using (cci_is_admin()) with check (cci_is_admin());

-- empresas_api
alter table empresas_api enable row level security;
drop policy if exists "Allow all for empresas_api" on empresas_api;
create policy "empresas_api_sel" on empresas_api
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "empresas_api_mod" on empresas_api
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_empresa_contas
alter table mapeamento_empresa_contas enable row level security;
drop policy if exists "Allow all for mapeamento_empresa_contas" on mapeamento_empresa_contas;
create policy "map_emp_contas_sel" on mapeamento_empresa_contas
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "map_emp_contas_mod" on mapeamento_empresa_contas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_empresa_contas_fluxo
alter table mapeamento_empresa_contas_fluxo enable row level security;
drop policy if exists "Allow all for mapeamento_empresa_contas_fluxo" on mapeamento_empresa_contas_fluxo;
create policy "map_emp_contas_fluxo_sel" on mapeamento_empresa_contas_fluxo
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "map_emp_contas_fluxo_mod" on mapeamento_empresa_contas_fluxo
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_pendencias  (grant anon; tenant por chave_api_id OU cliente_id) — cliente só lê
alter table cci_pendencias enable row level security;
revoke all on cci_pendencias from anon;
drop policy if exists "p_pendencias_all" on cci_pendencias;
create policy "pendencias_sel" on cci_pendencias
  for select using (
    cci_is_admin()
    or chave_api_id = cci_jwt_chave_api_id()
    or cci_pode_ver_cliente(cliente_id)
  );
create policy "pendencias_mod" on cci_pendencias
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_webposto_sync_config  (admin/worker)
alter table cci_webposto_sync_config enable row level security;
drop policy if exists "p_webposto_sync_config_all" on cci_webposto_sync_config;
create policy "webposto_sync_config_sel" on cci_webposto_sync_config
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "webposto_sync_config_mod" on cci_webposto_sync_config
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_webposto_sync_job  (admin/worker)
alter table cci_webposto_sync_job enable row level security;
drop policy if exists "p_webposto_sync_job_all" on cci_webposto_sync_job;
create policy "webposto_sync_job_sel" on cci_webposto_sync_job
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "webposto_sync_job_mod" on cci_webposto_sync_job
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_webposto_sync_config_rede  (admin/worker)
alter table cci_webposto_sync_config_rede enable row level security;
drop policy if exists "p_webposto_sync_config_rede_all" on cci_webposto_sync_config_rede;
create policy "webposto_sync_config_rede_sel" on cci_webposto_sync_config_rede
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "webposto_sync_config_rede_mod" on cci_webposto_sync_config_rede
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (por tabela): drop das policies "<x>_sel"/"<x>_mod" e
--   create policy "<nome original>" on <tabela> for all using (true) with check (true);
-- (nomes originais: p_webposto_venda_all, p_webposto_venda_item_all,
--  p_webposto_sync_config_all, p_webposto_sync_job_all,
--  p_webposto_sync_config_rede_all, p_pendencias_all, e "Allow all for <t>"
--  nas demais). Onde havia grant anon: grant all on cci_pendencias to anon;
-- ============================================================
