-- 129_rls_h_usuarios_e_reset
-- ============================================================
-- LOTE H (fim) — os 2 achados mais críticos do audit original.
--
-- #2 password_reset_tokens: o fluxo de reset foi para a Edge Function
--    auth-reset (service_role). Ninguém no browser lê/escreve a tabela →
--    trava total (service_role only).
--
-- #1 cci_usuarios_sistema: fecha o dump de senhas por anon e o
--    cross-tenant, com proteção de COLUNA na senha:
--    - anon: nada.
--    - authenticated: NÃO lê `senha`/`senha_hash` (revoke de coluna). Só
--      service_role/definer (auth-login, cci_verificar_senha, cci_definir_senha)
--      leem, por bypass.
--    - SELECT de linha: admin tudo; o próprio usuário; ou usuários da própria
--      rede (gerência de usuários da rede pelo cliente).
--    - ESCRITA: admin qualquer um; cliente só usuários CLIENTE da própria
--      rede (impede criar/escalar admin e cruzar tenant).
--
-- Requer os selects sem senha em usuariosSistemaService (mesmo commit).
-- Idempotente. Rollback no fim.
-- ============================================================

-- ── #2 password_reset_tokens ───────────────────────────────────────
alter table password_reset_tokens enable row level security;
revoke all on password_reset_tokens from anon, authenticated;
drop policy if exists "Allow all for password_reset_tokens" on password_reset_tokens;
-- sem policy => nega anon/authenticated; service_role bypassa.

-- ── #1 cci_usuarios_sistema ────────────────────────────────────────
alter table cci_usuarios_sistema enable row level security;
revoke all on cci_usuarios_sistema from anon;
revoke select (senha, senha_hash) on cci_usuarios_sistema from authenticated;

drop policy if exists "Allow all for cci_usuarios_sistema" on cci_usuarios_sistema;
drop policy if exists "usuarios_sel" on cci_usuarios_sistema;
drop policy if exists "usuarios_ins" on cci_usuarios_sistema;
drop policy if exists "usuarios_upd" on cci_usuarios_sistema;
drop policy if exists "usuarios_del" on cci_usuarios_sistema;

-- SELECT: admin; o próprio; ou usuários da própria rede.
create policy "usuarios_sel" on cci_usuarios_sistema
  for select using (
    cci_is_admin()
    or id = cci_jwt_usuario_id()
    or (chave_api_id is not null and chave_api_id = cci_jwt_chave_api_id())
    or (as_rede_id is not null and as_rede_id = cci_jwt_as_rede_id())
  );

-- ESCRITA (insert/update/delete): admin qualquer um; cliente só usuários
-- CLIENTE da própria rede.
create policy "usuarios_ins" on cci_usuarios_sistema
  for insert with check (
    cci_is_admin()
    or (tipo = 'cliente' and (chave_api_id = cci_jwt_chave_api_id() or as_rede_id = cci_jwt_as_rede_id()))
  );
create policy "usuarios_upd" on cci_usuarios_sistema
  for update
  using (
    cci_is_admin()
    or (tipo = 'cliente' and (chave_api_id = cci_jwt_chave_api_id() or as_rede_id = cci_jwt_as_rede_id()))
  )
  with check (
    cci_is_admin()
    or (tipo = 'cliente' and (chave_api_id = cci_jwt_chave_api_id() or as_rede_id = cci_jwt_as_rede_id()))
  );
create policy "usuarios_del" on cci_usuarios_sistema
  for delete using (
    cci_is_admin()
    or (tipo = 'cliente' and (chave_api_id = cci_jwt_chave_api_id() or as_rede_id = cci_jwt_as_rede_id()))
  );

-- ============================================================
-- ROLLBACK:
--   -- reabre (volta ao estado anterior):
--   grant select (senha, senha_hash) on cci_usuarios_sistema to authenticated;
--   drop policy if exists "usuarios_sel" on cci_usuarios_sistema;
--   drop policy if exists "usuarios_ins" on cci_usuarios_sistema;
--   drop policy if exists "usuarios_upd" on cci_usuarios_sistema;
--   drop policy if exists "usuarios_del" on cci_usuarios_sistema;
--   create policy "Allow all for cci_usuarios_sistema" on cci_usuarios_sistema for all using (true) with check (true);
--   create policy "Allow all for password_reset_tokens" on password_reset_tokens for all using (true) with check (true);
-- ============================================================
