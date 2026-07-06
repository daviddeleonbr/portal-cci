-- Performance: `cci_webposto_vendas_comercial` (resumo) e
-- `cci_webposto_dia_produto_categoria` estavam batendo no timeout do gateway
-- (net::ERR_CONNECTION_CLOSED) em redes/periodos grandes.
--
-- Causa: ambas liam de `v_cci_webposto_vendas_validas`, que faz JOIN item x
-- venda (cancelada='N') e ainda extrai `v.raw->>'funcionarioCodigo'` (JSONB por
-- linha). Caro.
--
-- Fix: ler `cci_webposto_venda_item` DIRETO com anti-join `NOT EXISTS
-- (cancelada='S')` — mesma otimizacao ja usada na 081 (evolucao). Vendas
-- canceladas sao raras (~1%), entao o anti-join e muito mais barato que o JOIN
-- da view, e o item usa o indice (chave_api_id, empresa_codigo, data,
-- produto_codigo) da 068. Semantica identica (todo item tem venda; cancelada in
-- {N,S}).

-- ─── 1) resumo (3 periodos) sem a view ──────────────────────────
CREATE OR REPLACE FUNCTION cci_webposto_vendas_comercial(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET statement_timeout = '120s'
AS $$
DECLARE
  v_ma_de  date := (p_data_de  - INTERVAL '1 month')::date;
  v_ma_ate date := (p_data_ate - INTERVAL '1 month')::date;
  v_aa_de  date := (p_data_de  - INTERVAL '1 year')::date;
  v_aa_ate date := (p_data_ate - INTERVAL '1 year')::date;

  v_dias_periodo int := (p_data_ate - p_data_de) + 1;
  v_dias_mes     int := EXTRACT(DAY FROM (date_trunc('month', p_data_de) + INTERVAL '1 month - 1 day'))::int;

  v_resumo jsonb;
BEGIN
  WITH base AS (
    SELECT i.empresa_codigo, i.produto_codigo,
           i.quantidade, i.total_venda, i.total_custo,
           i.total_acrescimo, i.total_desconto,
           'atual'::text AS periodo
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

    UNION ALL

    SELECT i.empresa_codigo, i.produto_codigo,
           i.quantidade, i.total_venda, i.total_custo,
           0::numeric, 0::numeric,
           'ma'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id   = p_chave_api_id
      AND i.empresa_codigo = ANY(p_empresas_codigos)
      AND i.data BETWEEN v_ma_de AND v_ma_ate
      AND NOT EXISTS (
        SELECT 1 FROM cci_webposto_venda v
        WHERE v.chave_api_id = i.chave_api_id
          AND v.empresa_codigo = i.empresa_codigo
          AND v.venda_codigo = i.venda_codigo
          AND v.cancelada = 'S'
      )

    UNION ALL

    SELECT i.empresa_codigo, i.produto_codigo,
           i.quantidade, i.total_venda, i.total_custo,
           0::numeric, 0::numeric,
           'aa'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id   = p_chave_api_id
      AND i.empresa_codigo = ANY(p_empresas_codigos)
      AND i.data BETWEEN v_aa_de AND v_aa_ate
      AND NOT EXISTS (
        SELECT 1 FROM cci_webposto_venda v
        WHERE v.chave_api_id = i.chave_api_id
          AND v.empresa_codigo = i.empresa_codigo
          AND v.venda_codigo = i.venda_codigo
          AND v.cancelada = 'S'
      )
  ),
  agregado AS (
    SELECT
      empresa_codigo,
      produto_codigo,
      COALESCE(SUM(CASE WHEN periodo = 'atual' THEN quantidade      END), 0)::numeric AS qtd_atual,
      COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_venda     END), 0)::numeric AS fat_atual,
      COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_custo     END), 0)::numeric AS custo_atual,
      COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_acrescimo END), 0)::numeric AS acresc_atual,
      COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_desconto  END), 0)::numeric AS desc_atual,
      COALESCE(SUM(CASE WHEN periodo = 'ma'    THEN quantidade      END), 0)::numeric AS qtd_ma,
      COALESCE(SUM(CASE WHEN periodo = 'ma'    THEN total_venda     END), 0)::numeric AS fat_ma,
      COALESCE(SUM(CASE WHEN periodo = 'ma'    THEN total_custo     END), 0)::numeric AS custo_ma,
      COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN quantidade      END), 0)::numeric AS qtd_aa,
      COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN total_venda     END), 0)::numeric AS fat_aa,
      COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN total_custo     END), 0)::numeric AS custo_aa
    FROM base
    GROUP BY empresa_codigo, produto_codigo
    HAVING
         SUM(CASE WHEN periodo = 'atual' THEN quantidade ELSE 0 END) <> 0
      OR SUM(CASE WHEN periodo = 'ma'    THEN quantidade ELSE 0 END) <> 0
      OR SUM(CASE WHEN periodo = 'aa'    THEN quantidade ELSE 0 END) <> 0
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_resumo FROM agregado a;

  RETURN jsonb_build_object(
    'resumo',        v_resumo,
    'dias_periodo',  v_dias_periodo,
    'dias_mes',      v_dias_mes,
    'periodo_atual', jsonb_build_object('de', p_data_de, 'ate', p_data_ate),
    'periodo_ma',    jsonb_build_object('de', v_ma_de,   'ate', v_ma_ate),
    'periodo_aa',    jsonb_build_object('de', v_aa_de,   'ate', v_aa_ate)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_vendas_comercial(uuid, int[], date, date)
  TO anon, authenticated;

-- ─── 2) diario por categoria sem a view ─────────────────────────
CREATE OR REPLACE FUNCTION cci_webposto_dia_produto_categoria(
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
  empresa_codigo  int,
  produto_codigo  bigint,
  quantidade      numeric,
  total_venda     numeric,
  total_custo     numeric,
  total_acrescimo numeric,
  total_desconto  numeric,
  qtd_vendas      int
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  WITH mapa AS (
    SELECT m.produto_codigo, m.categoria
    FROM unnest(p_produto_codigos, p_categorias) AS m(produto_codigo, categoria)
  )
  SELECT
    i.data::date,
    i.empresa_codigo::int,
    i.produto_codigo::bigint,
    COALESCE(SUM(i.quantidade),      0)::numeric AS quantidade,
    COALESCE(SUM(i.total_venda),     0)::numeric AS total_venda,
    COALESCE(SUM(i.total_custo),     0)::numeric AS total_custo,
    COALESCE(SUM(i.total_acrescimo), 0)::numeric AS total_acrescimo,
    COALESCE(SUM(i.total_desconto),  0)::numeric AS total_desconto,
    COUNT(DISTINCT i.venda_codigo)::int          AS qtd_vendas
  FROM cci_webposto_venda_item i
  JOIN mapa m ON m.produto_codigo = i.produto_codigo
  WHERE i.chave_api_id   = p_chave_api_id
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
  GROUP BY i.data, i.empresa_codigo, i.produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_dia_produto_categoria(uuid, int[], date, date, bigint[], text[], text)
  TO anon, authenticated;
