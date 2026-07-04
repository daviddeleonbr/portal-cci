-- 114_rls_canario_grupo_produto
-- ============================================================
-- FASE 3 · CANÁRIO #3 (Autosystem) — valida o token de CLIENTE AUTOSYSTEM.
--
-- Consumidores de as_rede_grupo_produto:
--   - admin: Mapeamento.jsx, RelatorioDRE.jsx, autosystemService.js, Clientes.jsx
--   - cliente autosystem: ClienteComercialVendas.jsx, ClienteConfiguracoes.jsx
--
-- Policy: admin vê tudo; cliente autosystem vê só a própria rede (as_rede_id).
--
-- Teste:
--   - admin → Parâmetros/Mapeamento Autosystem: grupos de produto OK.
--   - cliente autosystem → Comercial › Vendas / Configurações: grupos OK.
--   - NEGATIVO: cliente da rede A não enxerga grupos da rede B.
-- ============================================================

alter table as_rede_grupo_produto enable row level security;     -- idempotente

drop policy if exists "Allow all for as_rede_grupo_produto" on as_rede_grupo_produto;

create policy "grupo_produto_admin_ou_rede" on as_rede_grupo_produto
  for all
  using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id())
  with check (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());

-- ============================================================
-- ROLLBACK:
--   drop policy if exists "grupo_produto_admin_ou_rede" on as_rede_grupo_produto;
--   create policy "Allow all for as_rede_grupo_produto" on as_rede_grupo_produto
--     for all using (true) with check (true);
-- ============================================================
