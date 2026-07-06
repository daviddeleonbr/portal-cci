-- Performance da pagina Vendas: a query do resumo
-- (cci_webposto_vendas_comercial) demora 12-16s em rede movimentada porque,
-- para cada linha de cci_webposto_venda_item no periodo, faz um HEAP FETCH (o
-- indice atual idx_webposto_venda_item_periodo NAO cobre as colunas somadas),
-- e o anti-join checa `cancelada` linha a linha. Multiplique por 3 periodos
-- (atual/MA/AA) e centenas de milhares de linhas.
--
-- 1) Indice de COBERTURA: inclui as colunas usadas na agregacao -> a varredura
--    vira INDEX-ONLY (sem tocar o heap, que ainda carrega o `raw` jsonb gordo).
-- 2) Indice PARCIAL de canceladas (raras ~1%) -> o NOT EXISTS passa a checar um
--    indice minusculo em vez do heap da venda.
--
-- OBS (producao): em tabela grande, `CREATE INDEX` (sem CONCURRENTLY) bloqueia
-- ESCRITAS durante a construcao (leituras seguem). Como o sync roda por cron
-- (nao constante), o bloqueio breve e aceitavel. Se preferir zero bloqueio,
-- rode ANTES no SQL Editor, um de cada vez:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webposto_venda_item_resumo ...
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webposto_venda_cancelada_s ...
-- e entao o `db push` vira no-op (IF NOT EXISTS).

-- Sem limite de tempo durante o build (o SQL Editor estoura por causa do
-- gateway; via `db push` a conexao e direta e isto garante que o statement
-- nao seja cortado numa tabela grande).
SET statement_timeout = 0;

CREATE INDEX IF NOT EXISTS idx_webposto_venda_item_resumo
  ON cci_webposto_venda_item (chave_api_id, empresa_codigo, data)
  INCLUDE (venda_codigo, produto_codigo, quantidade, total_venda, total_custo, total_acrescimo, total_desconto);

CREATE INDEX IF NOT EXISTS idx_webposto_venda_cancelada_s
  ON cci_webposto_venda (chave_api_id, empresa_codigo, venda_codigo)
  WHERE cancelada = 'S';
