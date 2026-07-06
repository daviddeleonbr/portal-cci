-- Resumo de vendas por PERIODO UNICO (webposto · Vendas comercial).
--
-- `cci_webposto_vendas_comercial` (plpgsql, 3x UNION agrupando por produto +
-- jsonb_agg) continuava estourando o timeout do gateway em redes grandes,
-- mesmo lendo venda_item direto. Fato: o sparkline (RPC 132) roda UMA chamada
-- `venda_item` de 12 meses tranquilo — o problema e a estrutura combinada.
--
-- Fix: esta RPC agrega UM periodo por (empresa, produto) e devolve RETURNS
-- TABLE (sem jsonb). O cliente chama 3x em PARALELO (atual / mes anterior / ano
-- anterior) e mescla — cada chamada e leve e bem abaixo do timeout, como as
-- chamadas do sparkline.
--
-- Seguranca/RLS: LANGUAGE sql (nao SECURITY DEFINER); RLS de tenant filtra.

CREATE OR REPLACE FUNCTION cci_webposto_vendas_resumo_periodo(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS TABLE (
  empresa_codigo  int,
  produto_codigo  bigint,
  quantidade      numeric,
  total_venda     numeric,
  total_custo     numeric,
  total_acrescimo numeric,
  total_desconto  numeric
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  SELECT
    i.empresa_codigo::int,
    i.produto_codigo::bigint,
    COALESCE(SUM(i.quantidade),      0)::numeric,
    COALESCE(SUM(i.total_venda),     0)::numeric,
    COALESCE(SUM(i.total_custo),     0)::numeric,
    COALESCE(SUM(i.total_acrescimo), 0)::numeric,
    COALESCE(SUM(i.total_desconto),  0)::numeric
  FROM cci_webposto_venda_item i
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo = i.venda_codigo
        AND v.cancelada = 'S'
    )
  GROUP BY i.empresa_codigo, i.produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_vendas_resumo_periodo(uuid, int[], date, date)
  TO anon, authenticated;
