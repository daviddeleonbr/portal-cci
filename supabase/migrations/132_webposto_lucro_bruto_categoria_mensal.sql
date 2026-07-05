-- RPC agregada por categoria para os sparklines 12m da pagina Vendas (webposto).
--
-- Problema: `cci_webposto_evolucao_mensal_produto` devolve 1 linha por
-- (produto, mes) — em rede grande sao milhoes de linhas transferidas ao
-- navegador, que ainda classifica e agrega tudo no cliente. Lento.
--
-- A classificacao produto -> categoria (combustivel/automotivos/conveniencia)
-- vive no catalogo do Quality e so existe no cliente. Entao o cliente envia o
-- mapa (p_produto_codigos[], p_categorias[]) e o BANCO agrega por mes+categoria,
-- devolvendo ~ (meses x categorias) linhas em vez de 1 por produto/mes.
--
-- Seguranca/RLS: LANGUAGE sql (nao SECURITY DEFINER) — roda como o chamador, e
-- a RLS de `cci_webposto_venda_item`/`cci_webposto_venda` (tenant por
-- chave_api_id) filtra as linhas. Mesmo padrao das demais RPCs webposto.

DROP FUNCTION IF EXISTS cci_webposto_lucro_bruto_categoria_mensal(uuid, int[], date, date, bigint[], text[]);

CREATE OR REPLACE FUNCTION cci_webposto_lucro_bruto_categoria_mensal(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date,
  p_produto_codigos  bigint[],
  p_categorias       text[]
)
RETURNS TABLE (
  ano_mes     text,
  categoria   text,
  valor       numeric,
  valor_custo numeric,
  quantidade  numeric
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  WITH mapa AS (
    SELECT m.produto_codigo, m.categoria
    FROM unnest(p_produto_codigos, p_categorias) AS m(produto_codigo, categoria)
  )
  SELECT
    to_char(i.data, 'YYYY-MM')                    AS ano_mes,
    COALESCE(m.categoria, 'outros')               AS categoria,
    COALESCE(SUM(i.total_venda), 0)::numeric      AS valor,
    COALESCE(SUM(i.total_custo), 0)::numeric      AS valor_custo,
    COALESCE(SUM(i.quantidade),  0)::numeric      AS quantidade
  FROM cci_webposto_venda_item i
  LEFT JOIN mapa m ON m.produto_codigo = i.produto_codigo
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    -- Anti-join: vendas canceladas sao raras; NOT EXISTS e mais barato que o
    -- JOIN inteiro da view (mesma otimizacao da 081).
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id   = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo   = i.venda_codigo
        AND v.cancelada      = 'S'
    )
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_lucro_bruto_categoria_mensal(uuid, int[], date, date, bigint[], text[])
  TO anon, authenticated;
