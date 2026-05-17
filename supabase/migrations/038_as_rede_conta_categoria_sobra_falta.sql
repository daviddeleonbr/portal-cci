-- ============================================================
-- Adiciona a categoria 'sobra_falta_caixa' às categorias possíveis
-- de classificação de contas (formas de recebimento) Autosystem.
-- ============================================================

alter table as_rede_conta_categoria
  drop constraint if exists as_rede_conta_categoria_categoria_check;

alter table as_rede_conta_categoria
  add constraint as_rede_conta_categoria_categoria_check
  check (categoria in ('dinheiro', 'cartao_pix', 'cheque', 'a_prazo', 'sobra_falta_caixa', 'outros'));
