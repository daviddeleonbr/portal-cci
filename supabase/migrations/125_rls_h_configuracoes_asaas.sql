-- 125_rls_h_configuracoes_asaas
-- ============================================================
-- LOTE H (parcial) / Fase 4b — trava `configuracoes_asaas` (token Asaas)
-- para admin.
--
-- O Asaas (emissão de NFS-e) é usado SÓ pelo admin (páginas /admin/*;
-- NotasFiscais.jsx). Nenhuma página do cliente lê `configuracoes_asaas`.
-- Logo não precisa de proxy: o admin lê o token (autorizado) e o anônimo
-- fica bloqueado. `asaas_customers` e `notas_fiscais_asaas` já são
-- admin-only (migration 115 / B1).
--
-- Idempotente. Rollback: disable RLS.
-- ============================================================

alter table configuracoes_asaas enable row level security;
revoke all on configuracoes_asaas from anon;
drop policy if exists "Allow all for configuracoes_asaas" on configuracoes_asaas;
drop policy if exists "configuracoes_asaas_admin" on configuracoes_asaas;
create policy "configuracoes_asaas_admin" on configuracoes_asaas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "configuracoes_asaas_admin" on configuracoes_asaas;
--   create policy "Allow all for configuracoes_asaas" on configuracoes_asaas
--     for all using (true) with check (true);
-- ============================================================
