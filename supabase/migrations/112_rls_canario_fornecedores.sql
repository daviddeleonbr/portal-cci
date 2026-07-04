-- 112_rls_canario_fornecedores
-- ============================================================
-- FASE 3 · CANÁRIO #1 (admin-only) — valida que o token ADMIN chega ao RLS.
--
-- ⚠️ APLICAR SÓ APÓS a Fase 2 estar validada no app rodando (login admin OK).
--    Este é o primeiro teste real de que o token admin é injetado nos
--    requests. Se quebrar, é a Fase 2 (frontend) que tem problema — role o
--    ROLLBACK no fim e investigue antes de seguir.
--
-- Consumidor único: src/services/cciFinanceiroService.js (Financeiro admin).
-- Teste: logado como admin, abrir Financeiro › Fornecedores → listar/CRUD OK.
--        (Ninguém anônimo nem cliente usa esta tabela.)
-- ============================================================

alter table cci_fornecedores enable row level security;         -- idempotente

-- Remove a policy allow-all pelo nome EXATO (senão soma por OR e a nova não vale).
drop policy if exists "Allow all for cci_fornecedores" on cci_fornecedores;

-- Só admin lê/escreve.
create policy "fornecedores_admin_all" on cci_fornecedores
  for all
  using (cci_is_admin())
  with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (se o Financeiro › Fornecedores quebrar):
--   drop policy if exists "fornecedores_admin_all" on cci_fornecedores;
--   create policy "Allow all for cci_fornecedores" on cci_fornecedores
--     for all using (true) with check (true);
-- ============================================================
