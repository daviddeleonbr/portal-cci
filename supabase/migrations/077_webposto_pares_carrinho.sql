-- RPC pra análise de Cesta de Compras (Market Basket) — sub-aba
-- "Carrinho de compras" das abas Automotivos/Conveniência.
--
-- Retorna PARES de produtos vendidos na mesma venda (= mesmo
-- venda_codigo, mesma empresa). Cada par retornado:
--   (produto_a, produto_b)  — sempre produto_a < produto_b (sem duplicar)
--   transacoes_juntas       — quantas vendas distintas tiveram os 2
--   valor_juntas            — somatório de total_venda dos itens nas
--                             vendas onde aparecem juntos
--   total_transacoes        — total de vendas distintas no período (mesmo
--                             em todas as rows, pra calcular support)
--
-- Parâmetros:
--   p_produtos_filtro  — opcional. Se passado, restringe pares aos
--                        produtos dessa lista (ex: só conveniência).
--   p_min_transacoes   — descarta pares com menos que N transações.
--
-- Pares podem ser muitos (cresce O(N²) por venda). O LIMIT 1000 evita
-- payload gigante; o front filtra/ordena no client.

DROP FUNCTION IF EXISTS cci_webposto_pares_carrinho(uuid, int[], date, date, bigint[], int);

CREATE OR REPLACE FUNCTION cci_webposto_pares_carrinho(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date,
  p_produtos_filtro  bigint[] DEFAULT NULL,
  p_min_transacoes   int      DEFAULT 2
)
RETURNS TABLE (
  produto_a          bigint,
  produto_b          bigint,
  transacoes_juntas  int,
  valor_juntas       numeric,
  total_transacoes   int
)
LANGUAGE plpgsql STABLE
SET statement_timeout = '180s'
AS $$
DECLARE
  v_total_trans int;
BEGIN
  -- Conta total de vendas distintas (pra support % no front)
  SELECT COUNT(DISTINCT (empresa_codigo, venda_codigo))::int INTO v_total_trans
  FROM v_cci_webposto_vendas_validas
  WHERE chave_api_id   = p_chave_api_id
    AND empresa_codigo = ANY(p_empresas_codigos)
    AND data BETWEEN p_data_de AND p_data_ate
    AND (p_produtos_filtro IS NULL OR produto_codigo = ANY(p_produtos_filtro));

  RETURN QUERY
  WITH itens AS (
    SELECT empresa_codigo, venda_codigo, produto_codigo, total_venda
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN p_data_de AND p_data_ate
      AND (p_produtos_filtro IS NULL OR produto_codigo = ANY(p_produtos_filtro))
  )
  SELECT
    i1.produto_codigo AS produto_a,
    i2.produto_codigo AS produto_b,
    COUNT(DISTINCT (i1.empresa_codigo, i1.venda_codigo))::int  AS transacoes_juntas,
    COALESCE(SUM(i1.total_venda + i2.total_venda), 0)::numeric AS valor_juntas,
    v_total_trans                                              AS total_transacoes
  FROM itens i1
  JOIN itens i2
    ON i1.empresa_codigo = i2.empresa_codigo
   AND i1.venda_codigo   = i2.venda_codigo
   AND i1.produto_codigo < i2.produto_codigo
  GROUP BY i1.produto_codigo, i2.produto_codigo
  HAVING COUNT(DISTINCT (i1.empresa_codigo, i1.venda_codigo)) >= p_min_transacoes
  ORDER BY 3 DESC
  LIMIT 1000;
END;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_pares_carrinho(uuid, int[], date, date, bigint[], int)
  TO anon, authenticated;
