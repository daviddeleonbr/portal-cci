-- 113_rls_canario_administradoras
-- ============================================================
-- FASE 3 · CANÁRIO #2 (Webposto) — valida o token de CLIENTE WEBPOSTO no RLS.
--
-- Consumidores: src/services/clienteAdministradorasService.js
--   - admin: modal de administradoras/frota em Clientes.jsx
--   - cliente webposto: visão de frota da própria rede
--
-- Policy: admin vê tudo; cliente vê só a própria rede (chave_api_id).
--
-- Teste:
--   - admin → Clientes › (rede webposto) › administradoras/frota: lista OK.
--   - cliente webposto → visão de frota: vê só a própria rede.
--   - NEGATIVO: cliente da rede A não enxerga administradoras da rede B.
-- ============================================================

alter table cliente_administradoras enable row level security;   -- idempotente

-- Higiene: tira o acesso direto do papel anon (RLS já filtraria, mas fecha).
revoke all on cliente_administradoras from anon;

drop policy if exists "Allow all for cliente_administradoras" on cliente_administradoras;

create policy "administradoras_admin_ou_rede" on cliente_administradoras
  for all
  using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id())
  with check (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "administradoras_admin_ou_rede" on cliente_administradoras;
--   create policy "Allow all for cliente_administradoras" on cliente_administradoras
--     for all using (true) with check (true);
--   grant all on cliente_administradoras to anon;
-- ============================================================
