-- Buracos nos "Ultimos 12 meses": cci_webposto_evolucao_mensal_produto devolve
-- 1 linha por (mes, produto) de TODOS os produtos da rede. 12 meses x milhares
-- de produtos (conveniencia tem muitos) = dezenas de milhares de linhas, e o
-- PostgREST corta a resposta (db-max-rows). Sem ORDER BY, sobram linhas
-- arbitrarias -> meses/produtos aparecem zerados no grafico.
--
-- Fix: parametro opcional p_produto_codigos. O front passa so os produtos da
-- categoria da aba (ex.: combustivel ~ poucos) -> a resposta cabe folgado no
-- limite. NULL = todos (compat. com chamadas antigas).

DROP FUNCTION IF EXISTS cci_webposto_evolucao_mensal_produto(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_evolucao_mensal_produto(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date,
  p_produto_codigos  bigint[] DEFAULT NULL
)
RETURNS TABLE (
  ano_mes        text,
  produto_codigo bigint,
  valor          numeric,
  valor_custo    numeric,
  quantidade     numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
SET statement_timeout = '60s'
AS $$
  SELECT
    to_char(i.data, 'YYYY-MM'),
    i.produto_codigo,
    COALESCE(SUM(i.total_venda), 0)::numeric,
    COALESCE(SUM(i.total_custo), 0)::numeric,
    COALESCE(SUM(i.quantidade),  0)::numeric
  FROM cci_webposto_venda_item i
  WHERE (cci_is_admin() OR p_chave_api_id = cci_jwt_chave_api_id())  -- gate
    AND i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND (p_produto_codigos IS NULL OR i.produto_codigo = ANY(p_produto_codigos))
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo = i.venda_codigo
        AND v.cancelada = 'S'
    )
  GROUP BY 1, 2;
$$;

REVOKE ALL ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date, bigint[]) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date, bigint[]) TO anon, authenticated;
