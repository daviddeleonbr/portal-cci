-- 118_rls_d_tenant_autosystem
-- ============================================================
-- FASE 3 · LOTE D — tabelas TENANT AUTOSYSTEM (as_rede_id).
-- Config de categorias/prefixo por rede Autosystem. Leitura admin (e
-- eventualmente o cliente autosystem da própria rede); escrita só admin.
--   SELECT: admin OU a própria rede (as_rede_id = claim)
--   INSERT/UPDATE/DELETE: só admin
--
-- Nota: `as_rede_conta_receber_categoria` (migr. 059) foi DROPADA pela
-- migr. 060 (substituída por as_rede_categoria_prefixo) — não existe mais,
-- por isso não aparece aqui.
--
-- Idempotente: dropa também os nomes novos antes de criar (permite re-run
-- caso um push anterior tenha aplicado parte deste arquivo).
-- Rollback: bloco no fim.
-- ============================================================

-- as_rede_conta_categoria
alter table as_rede_conta_categoria enable row level security;
drop policy if exists "Allow all for as_rede_conta_categoria" on as_rede_conta_categoria;
drop policy if exists "as_conta_cat_sel" on as_rede_conta_categoria;
drop policy if exists "as_conta_cat_mod" on as_rede_conta_categoria;
create policy "as_conta_cat_sel" on as_rede_conta_categoria
  for select using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());
create policy "as_conta_cat_mod" on as_rede_conta_categoria
  for all using (cci_is_admin()) with check (cci_is_admin());

-- as_rede_categoria_prefixo
alter table as_rede_categoria_prefixo enable row level security;
drop policy if exists "Allow all for as_rede_categoria_prefixo" on as_rede_categoria_prefixo;
drop policy if exists "as_cat_prefixo_sel" on as_rede_categoria_prefixo;
drop policy if exists "as_cat_prefixo_mod" on as_rede_categoria_prefixo;
create policy "as_cat_prefixo_sel" on as_rede_categoria_prefixo
  for select using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());
create policy "as_cat_prefixo_mod" on as_rede_categoria_prefixo
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (por tabela): drop das policies "<x>_sel"/"<x>_mod" e
--   create policy "Allow all for <tabela>" on <tabela> for all using (true) with check (true);
-- ============================================================
