-- 116_rls_b2_config_leitura
-- ============================================================
-- FASE 3 · LOTE B2 — config/referência de DRE e Fluxo de Caixa.
-- São TEMPLATES/mapeamentos (não têm dado sensível de cliente) que podem
-- ser lidos por relatórios do admin E do cliente. Para NÃO arriscar
-- quebrar a DRE/Fluxo de ninguém, mantemos a LEITURA livre e restringimos
-- só a ESCRITA ao admin. Fecha o vetor de escrita anônima.
--
-- Padrão: policy de SELECT `using (true)` + policy `for all` só admin
-- (permissivas somam por OR → SELECT livre; INSERT/UPDATE/DELETE só admin).
--
-- Teste: DRE e Fluxo continuam montando para admin E cliente. Só admin
-- consegue editar máscaras/grupos/mapeamentos (Parâmetros).
-- Rollback: bloco no fim.
-- ============================================================

-- cci_plano_contas
alter table cci_plano_contas enable row level security;
drop policy if exists "Allow all for cci_plano_contas" on cci_plano_contas;
create policy "plano_contas_read" on cci_plano_contas for select using (true);
create policy "plano_contas_write" on cci_plano_contas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mascaras_dre
alter table mascaras_dre enable row level security;
drop policy if exists "Allow all for mascaras_dre" on mascaras_dre;
create policy "mascaras_dre_read" on mascaras_dre for select using (true);
create policy "mascaras_dre_write" on mascaras_dre
  for all using (cci_is_admin()) with check (cci_is_admin());

-- grupos_dre
alter table grupos_dre enable row level security;
drop policy if exists "Allow all for grupos_dre" on grupos_dre;
create policy "grupos_dre_read" on grupos_dre for select using (true);
create policy "grupos_dre_write" on grupos_dre
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_contas
alter table mapeamento_contas enable row level security;
drop policy if exists "Allow all for mapeamento_contas" on mapeamento_contas;
create policy "mapeamento_contas_read" on mapeamento_contas for select using (true);
create policy "mapeamento_contas_write" on mapeamento_contas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_vendas_dre
alter table mapeamento_vendas_dre enable row level security;
drop policy if exists "Allow all for mapeamento_vendas_dre" on mapeamento_vendas_dre;
create policy "mapeamento_vendas_dre_read" on mapeamento_vendas_dre for select using (true);
create policy "mapeamento_vendas_dre_write" on mapeamento_vendas_dre
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mascaras_fluxo_caixa
alter table mascaras_fluxo_caixa enable row level security;
drop policy if exists "Allow all for mascaras_fluxo_caixa" on mascaras_fluxo_caixa;
create policy "mascaras_fluxo_read" on mascaras_fluxo_caixa for select using (true);
create policy "mascaras_fluxo_write" on mascaras_fluxo_caixa
  for all using (cci_is_admin()) with check (cci_is_admin());

-- grupos_fluxo_caixa
alter table grupos_fluxo_caixa enable row level security;
drop policy if exists "Allow all for grupos_fluxo_caixa" on grupos_fluxo_caixa;
create policy "grupos_fluxo_read" on grupos_fluxo_caixa for select using (true);
create policy "grupos_fluxo_write" on grupos_fluxo_caixa
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_contas_fluxo
alter table mapeamento_contas_fluxo enable row level security;
drop policy if exists "Allow all for mapeamento_contas_fluxo" on mapeamento_contas_fluxo;
create policy "mapeamento_contas_fluxo_read" on mapeamento_contas_fluxo for select using (true);
create policy "mapeamento_contas_fluxo_write" on mapeamento_contas_fluxo
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (por tabela): drop das duas policies "<x>_read"/"<x>_write" e
--   create policy "Allow all for <tabela>" on <tabela>
--     for all using (true) with check (true);
-- ============================================================
