-- ============================================================
-- Os códigos do Autosystem podem exceder o limite de `integer`
-- (2^31-1 = 2.147.483.647). Sobe `codigo` e `grid` para `bigint`.
-- ============================================================

alter table as_rede_grupo_produto
  alter column codigo type bigint using codigo::bigint;

alter table as_rede_grupo_produto
  alter column grid type bigint using grid::bigint;
