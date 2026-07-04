-- 127_rls_h_as_rede
-- ============================================================
-- LOTE H — RLS por tenant em `as_rede` (rede Autosystem + credenciais
-- cifradas do Postgres do cliente).
--
-- Análogo à chaves_api (126): cada as_rede é a rede daquele cliente. O
-- buraco era anon ler as_rede de TODAS as redes (ciphertext + IP/banco/
-- usuário). Fecha isso.
--
--   SELECT: admin (gestão de redes/BPO — vê tudo) OU a própria rede
--           (id = as_rede_id do JWT). O cliente já usa a asRede da sessão
--           (auth-login via service_role); se ler a tabela, vê só a própria
--           (e o ciphertext é inútil — as_rede_decrypt já foi revogado de
--           anon/authenticated na migration 107; só service_role decripta).
--   INSERT/UPDATE/DELETE: só admin.
--   anon: nada (revoke).
--
-- RPCs (as_rede_get_credenciais/set/create_full) e Edge Functions leem via
-- SECURITY DEFINER / service_role → bypassam RLS. Login/credenciais intactos.
-- Idempotente. Rollback no fim.
-- ============================================================

alter table as_rede enable row level security;
revoke all on as_rede from anon;
drop policy if exists "Allow all for as_rede" on as_rede;
drop policy if exists "as_rede_sel" on as_rede;
drop policy if exists "as_rede_mod" on as_rede;
create policy "as_rede_sel" on as_rede
  for select using (cci_is_admin() or id = cci_jwt_as_rede_id());
create policy "as_rede_mod" on as_rede
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "as_rede_sel" on as_rede;
--   drop policy if exists "as_rede_mod" on as_rede;
--   create policy "Allow all for as_rede" on as_rede for all using (true) with check (true);
-- ============================================================
