-- A sub-aba "Ultimos 12 meses" da Vendas usa cci_webposto_evolucao_mensal_produto,
-- que ficou de fora do lote SECURITY DEFINER (137). Sendo LANGUAGE sql sob RLS,
-- a policy `admin OR chave_api_id = jwt` quebra o uso do indice (o ramo admin
-- poderia casar tudo) -> Seq Scan; e ainda varre 12 meses. Lenta.
--
-- Fix: SECURITY DEFINER (roda como owner -> sem o OR da RLS -> usa o indice de
-- cobertura idx_webposto_venda_item_resumo) + gate por parametro. Mesmo padrao
-- da 137/138.

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
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo = i.venda_codigo
        AND v.cancelada = 'S'
    )
  GROUP BY 1, 2;
$$;

REVOKE ALL ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date) TO anon, authenticated;
