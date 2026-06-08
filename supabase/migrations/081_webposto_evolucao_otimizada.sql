-- Otimização da RPC `cci_webposto_evolucao_mensal_produto`:
--   - Substitui o JOIN com cci_webposto_venda por NOT EXISTS de cancelada='S'
--     (planner usa o índice da PK do item + lookup por cancelada = MUITO
--     mais barato que o JOIN da view)
--   - Aumenta statement_timeout pra dar margem em redes maiores
--
-- O front também passou a particionar a chamada em 12 meses paralelos
-- (cada chunk ~1/12 do volume), então essa RPC raramente recebe 12 meses
-- de uma vez. Combinado, deve eliminar os timeouts.

DROP FUNCTION IF EXISTS cci_webposto_evolucao_mensal_produto(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_evolucao_mensal_produto(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS TABLE (
  ano_mes        text,
  produto_codigo bigint,
  valor          numeric,
  valor_custo    numeric,
  quantidade     numeric
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  SELECT
    to_char(i.data, 'YYYY-MM')                  AS ano_mes,
    i.produto_codigo,
    COALESCE(SUM(i.total_venda), 0)::numeric    AS valor,
    COALESCE(SUM(i.total_custo), 0)::numeric    AS valor_custo,
    COALESCE(SUM(i.quantidade),  0)::numeric    AS quantidade
  FROM cci_webposto_venda_item i
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    -- Anti-join: vendas canceladas são raras (~1%), então NOT EXISTS é
    -- mais barato que o JOIN inteiro da view.
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id   = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo   = i.venda_codigo
        AND v.cancelada      = 'S'
    )
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date)
  TO anon, authenticated;
