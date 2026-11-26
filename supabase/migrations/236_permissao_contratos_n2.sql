-- ============================================================
-- 236 — Permissão 'contratos' (admin)
-- Contratos passou a exigir a permissão 'contratos' no menu e na rota (antes
-- era aberto a todo admin). Decisão: admins N2 mantêm o acesso; N1 deixam de
-- ver (a CCI libera pela tela de acessos). N3 tem tudo automaticamente.
-- Backup antes: backup_permissoes_admins_n2_2026-11-26.json (scratchpad).
-- ============================================================
update cci_usuarios_sistema
   set permissoes = array_append(coalesce(permissoes, '{}'), 'contratos'),
       updated_at = now()
 where tipo = 'admin'
   and nivel_admin = 2
   and not ('contratos' = any(coalesce(permissoes, '{}')));

-- ROLLBACK: update cci_usuarios_sistema set permissoes = array_remove(permissoes, 'contratos')
--           where tipo = 'admin' and nivel_admin = 2;
