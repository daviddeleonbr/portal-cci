-- ============================================================
-- 189 — Banco Inter: valor do extrato sem limite de dígitos
--
-- A sandbox do Inter devolve transações fictícias com valores acima de
-- numeric(14,2) ("numeric field overflow"), o que travava a sincronização
-- inteira. Valor passa a numeric sem precisão fixa (centavos arredondados
-- na Edge Function).
-- ============================================================

alter table cci_inter_extrato alter column valor type numeric;
