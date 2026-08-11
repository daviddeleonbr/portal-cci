-- 155_plano_contabil_classificacao
-- ============================================================
-- Adiciona a classificação (sintética/analítica) às contas do plano contábil.
-- Coluna nova, separada da 154 porque a 154 já foi aplicada — nunca reeditar
-- migração aplicada. `if not exists` mantém idempotente em ambientes novos.
-- ============================================================

alter table plano_contabil_conta
  add column if not exists classificacao text;  -- sintetica/analitica (livre — vem da planilha)

-- ============================================================
-- ROLLBACK:
--   alter table plano_contabil_conta drop column if exists classificacao;
-- ============================================================
