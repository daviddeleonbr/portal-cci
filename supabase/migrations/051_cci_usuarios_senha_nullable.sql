-- ============================================================
-- Permite cci_usuarios_sistema.senha NULL.
--
-- Motivo: usuários importados em lote do portal antigo (Bubble)
-- entram sem senha. No primeiro acesso, /cliente/login detecta
-- senha NULL e redireciona o usuário para /cliente/criar-senha,
-- onde ele define a própria senha (auto-detect, sem e-mail).
-- ============================================================

alter table cci_usuarios_sistema alter column senha drop not null;
