-- ============================================================
-- Adicionar 'custo' ao enum de grupo contabil em cci_plano_contas
-- ============================================================

alter table cci_plano_contas drop constraint if exists cci_plano_contas_grupo_check;

alter table cci_plano_contas
  add constraint cci_plano_contas_grupo_check
  check (grupo in ('ativo', 'passivo', 'patrimonio', 'receita', 'despesa', 'custo'));
