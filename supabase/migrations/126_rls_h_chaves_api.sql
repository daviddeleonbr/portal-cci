-- 126_rls_h_chaves_api
-- ============================================================
-- LOTE H / Fase 4c (Opção A) — RLS por tenant em `chaves_api` (rede Webposto
-- + a chave da Quality API).
--
-- Diferente das chaves Anthropic/Asaas (segredo compartilhado da CCI), cada
-- `chaves_api.chave` é a chave DA REDE — o dono do posto tem direito aos
-- próprios dados. O buraco era: anon lia a chave de TODAS as redes.
--
--   SELECT: admin (BPO/mapeamento/demo — vê tudo) OU a própria rede
--           (id = chave_api_id do JWT). O cliente já usa a chave da sessão
--           (preenchida pelo auth-login via service_role), então não depende
--           deste SELECT no dia a dia, mas fica coerente.
--   INSERT/UPDATE/DELETE: só admin (gestão de redes).
--   anon: nada (revoke).
--
-- auth-login lê chaves_api via service_role (bypassa RLS) — login intacto.
-- Idempotente. Rollback no fim.
-- ============================================================

alter table chaves_api enable row level security;
revoke all on chaves_api from anon;
drop policy if exists "Allow all for chaves_api" on chaves_api;
drop policy if exists "chaves_api_sel" on chaves_api;
drop policy if exists "chaves_api_mod" on chaves_api;
create policy "chaves_api_sel" on chaves_api
  for select using (cci_is_admin() or id = cci_jwt_chave_api_id());
create policy "chaves_api_mod" on chaves_api
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "chaves_api_sel" on chaves_api;
--   drop policy if exists "chaves_api_mod" on chaves_api;
--   create policy "Allow all for chaves_api" on chaves_api for all using (true) with check (true);
-- ============================================================
