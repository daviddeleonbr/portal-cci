-- Lazy loading do "Realizado dia a dia": em vez de trazer o detalhe de TODOS os
-- produtos de todos os dias de uma vez (pesado em automotivos/conveniencia),
-- carregamos primeiro so os TOTAIS por dia (nivel 1) e, ao expandir um dia,
-- buscamos o detalhe daquele dia (cci_webposto_dia_produto_categoria com
-- data_de = data_ate = o dia).
--
-- Esta RPC devolve 1 linha por dia (SUM da categoria) — ~30 linhas, rapidissimo.

CREATE OR REPLACE FUNCTION cci_webposto_dia_totais_categoria(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date,
  p_produto_codigos  bigint[],
  p_categorias       text[],
  p_categoria        text
)
RETURNS TABLE (
  data            date,
  quantidade      numeric,
  total_venda     numeric,
  total_custo     numeric,
  total_acrescimo numeric,
  total_desconto  numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
SET statement_timeout = '60s'
AS $$
  WITH mapa AS (
    SELECT m.produto_codigo, m.categoria
    FROM unnest(p_produto_codigos, p_categorias) AS m(produto_codigo, categoria)
  )
  SELECT
    i.data::date,
    COALESCE(SUM(i.quantidade),      0)::numeric,
    COALESCE(SUM(i.total_venda),      0)::numeric,
    COALESCE(SUM(i.total_custo),      0)::numeric,
    COALESCE(SUM(i.total_acrescimo),  0)::numeric,
    COALESCE(SUM(i.total_desconto),   0)::numeric
  FROM cci_webposto_venda_item i
  JOIN mapa m ON m.produto_codigo = i.produto_codigo
  WHERE (cci_is_admin() OR p_chave_api_id = cci_jwt_chave_api_id())  -- gate
    AND i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND m.categoria = p_categoria
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo = i.venda_codigo
        AND v.cancelada = 'S'
    )
  GROUP BY i.data;
$$;

REVOKE ALL ON FUNCTION cci_webposto_dia_totais_categoria(uuid, int[], date, date, bigint[], text[], text) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_dia_totais_categoria(uuid, int[], date, date, bigint[], text[], text) TO anon, authenticated;
