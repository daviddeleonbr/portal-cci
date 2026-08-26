-- ============================================================
-- Motivo de devolução POR ITEM (não mais uma nota geral)
-- ============================================================
--
-- Ao devolver uma NF para correção, o admin passa a indicar o motivo em cada
-- produto que precisa de ajuste (em vez de um único motivo geral na nota). O
-- cliente vê a observação colada no item correspondente.
-- A coluna nf_manifestacao.motivo_devolucao continua existindo (compatibilidade),
-- mas passa a ser opcional/legado.

alter table nf_manifestacao_produto
  add column if not exists motivo_devolucao text;
