-- ============================================================
-- Adiciona a categoria 'outros' à tabela de classificação de
-- grupos de produto do Autosystem.
-- ============================================================

alter table as_rede_grupo_produto
  drop constraint if exists as_rede_grupo_produto_categoria_check;

alter table as_rede_grupo_produto
  add constraint as_rede_grupo_produto_categoria_check
  check (categoria in ('combustivel', 'automotivos', 'conveniencia', 'outros'));
