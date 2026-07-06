-- O idx_webposto_venda_item_resumo ficou INVALIDO (indisvalid=false): o
-- CREATE INDEX CONCURRENTLY rodado no SQL Editor foi abortado pelo timeout do
-- gateway, deixando o indice quebrado (o planner nao usa). O `db push` da 139
-- viu que "ja existia" (IF NOT EXISTS) e pulou, entao continuou invalido.
--
-- Aqui dropamos o invalido e recriamos valido. Via `db push` a conexao e
-- DIRETA (sem o gateway que estoura) e o statement_timeout=0 garante o build
-- ate o fim. CREATE INDEX (sem CONCURRENTLY) bloqueia ESCRITAS durante o build
-- (leituras seguem) — rodar em horario sem sync.

SET statement_timeout = 0;

DROP INDEX IF EXISTS idx_webposto_venda_item_resumo;

CREATE INDEX IF NOT EXISTS idx_webposto_venda_item_resumo
  ON cci_webposto_venda_item (chave_api_id, empresa_codigo, data)
  INCLUDE (venda_codigo, produto_codigo, quantidade, total_venda, total_custo, total_acrescimo, total_desconto);
