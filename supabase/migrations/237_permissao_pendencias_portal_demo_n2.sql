-- ============================================================
-- 237 — Permissões 'pendencias' e 'portal_demo' (admin)
-- Pendências (categoria Consultoria) e Portal cliente · Demo (Gestão interna)
-- passaram a exigir permissão no menu e na rota (antes abertos a todo admin).
-- Como em Contratos (236): N2 mantêm; N1 deixam de ver; N3 tem tudo.
-- Backup antes: backup_permissoes_admins_n2_2026-11-26_b.json (scratchpad).
-- ============================================================
update cci_usuarios_sistema
   set permissoes = (select array_agg(distinct k) from unnest(coalesce(permissoes, '{}') || array['pendencias', 'portal_demo']) k),
       updated_at = now()
 where tipo = 'admin'
   and nivel_admin = 2
   and not (coalesce(permissoes, '{}') @> array['pendencias', 'portal_demo']);

-- ROLLBACK: update cci_usuarios_sistema
--   set permissoes = array_remove(array_remove(permissoes, 'pendencias'), 'portal_demo')
--   where tipo = 'admin' and nivel_admin = 2;
