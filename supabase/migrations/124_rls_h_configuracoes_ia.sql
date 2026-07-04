-- 124_rls_h_configuracoes_ia
-- ============================================================
-- LOTE H (parcial) — trava `configuracoes_ia` (chave Anthropic) para admin.
--
-- Possível porque a IA passou a ser chamada via Edge Function `ia-proxy`
-- (Fase 4a): a service_role lê a chave server-side e o navegador não
-- precisa mais dela. A tabela não tinha RLS habilitada (só grant default),
-- então a anon key podia `select api_key from configuracoes_ia`. Fecha isso.
--
-- - ia-proxy (service_role) continua lendo a chave (bypassa RLS).
-- - AdminConfiguracoes / RelatorioAnaliseIA (admin) continuam lendo/gravando.
-- - Cliente não lê mais a config; a IA no portal do cliente vai pelo proxy.
--
-- Idempotente. Rollback: disable RLS (volta ao estado atual).
-- ============================================================

alter table configuracoes_ia enable row level security;
revoke all on configuracoes_ia from anon;
drop policy if exists "Allow all for configuracoes_ia" on configuracoes_ia;
drop policy if exists "configuracoes_ia_admin" on configuracoes_ia;
create policy "configuracoes_ia_admin" on configuracoes_ia
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "configuracoes_ia_admin" on configuracoes_ia;
--   alter table configuracoes_ia disable row level security;
-- ============================================================
