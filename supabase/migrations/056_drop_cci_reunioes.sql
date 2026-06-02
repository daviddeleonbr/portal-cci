-- ============================================================
-- Reverte a migration 055: a feature de "Reunião" mudou de
-- direção (passou de CRUD de reuniões + KPIs para um dashboard
-- específico de apresentação). As tabelas não serão mais usadas.
--
-- Ordem importante: drop primeiro a tabela filha (kpis), depois
-- a tabela pai (reunioes) — a FK com on delete cascade já cuidaria,
-- mas usar IF EXISTS torna o script idempotente.
-- ============================================================

drop table if exists cci_reunioes_kpis;
drop table if exists cci_reunioes;
