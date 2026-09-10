-- ============================================================
-- Adiciona a categoria 'servicos' às classificações de grupo de
-- produto (Autosystem). Aparece na tela de Classificação de grupos
-- (/cliente/autosystem/configuracoes) e no mapeamento de vendas da
-- DRE/Fluxo (mapeamento_vendas_autosystem).
-- Mudança ADITIVA: só amplia o CHECK, não altera dados existentes.
-- ============================================================

-- 1) Classificação de grupos de produto por rede
alter table as_rede_grupo_produto
  drop constraint if exists as_rede_grupo_produto_categoria_check;
alter table as_rede_grupo_produto
  add constraint as_rede_grupo_produto_categoria_check
  check (categoria in ('combustivel', 'automotivos', 'conveniencia', 'servicos', 'outros'));

-- 2) Mapeamento de vendas (categoria → grupo da máscara DRE/Fluxo)
alter table mapeamento_vendas_autosystem
  drop constraint if exists mapeamento_vendas_autosystem_categoria_check;
alter table mapeamento_vendas_autosystem
  add constraint mapeamento_vendas_autosystem_categoria_check
  check (categoria in ('combustivel', 'automotivos', 'conveniencia', 'servicos'));
