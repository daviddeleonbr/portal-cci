-- Fase 1 da otimizacao da pagina Vendas (webposto): buscar o diario "sob
-- demanda por categoria" em vez de trazer TODO o dia_produto no fetch principal.
--
-- 1) Nova RPC `cci_webposto_dia_produto_categoria`: devolve o dia x produto
--    (mesmo shape do antigo `dia_produto`) mas SO dos produtos de UMA categoria.
--    A classificacao produto->categoria vive no catalogo do Quality (so no
--    cliente), entao o cliente envia o mapa (p_produto_codigos[], p_categorias[])
--    e o banco filtra por p_categoria. Chamada so quando o usuario abre uma
--    sub-aba diaria (Combustiveis dia/tipo/semana; Auto/Conv dia/grupo).
--
-- 2) `cci_webposto_vendas_comercial` deixa de calcular/retornar `dia_produto`
--    (o maior payload do fetch principal, baixado sempre mesmo sem abrir as
--    trees diarias). Passa a retornar so `resumo` + dias/periodos.
--
-- Seguranca/RLS: ambas LANGUAGE sql/plpgsql (nao SECURITY DEFINER) — rodam como
-- o chamador; a RLS de tenant da view/tabelas webposto filtra as linhas.

-- ─── 1) RPC diaria por categoria ────────────────────────────────
DROP FUNCTION IF EXISTS cci_webposto_dia_produto_categoria(uuid, int[], date, date, bigint[], text[], text);

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
    v.data::date,
    v.empresa_codigo::int,
    v.produto_codigo::bigint,
    COALESCE(SUM(v.quantidade),      0)::numeric AS quantidade,
    COALESCE(SUM(v.total_venda),     0)::numeric AS total_venda,
    COALESCE(SUM(v.total_custo),     0)::numeric AS total_custo,
    COALESCE(SUM(v.total_acrescimo), 0)::numeric AS total_acrescimo,
    COALESCE(SUM(v.total_desconto),  0)::numeric AS total_desconto,
    COUNT(DISTINCT v.venda_codigo)::int          AS qtd_vendas
  FROM v_cci_webposto_vendas_validas v
  JOIN mapa m ON m.produto_codigo = v.produto_codigo
  WHERE v.chave_api_id   = p_chave_api_id
    AND v.empresa_codigo = ANY(p_empresas_codigos)
    AND v.data BETWEEN p_data_de AND p_data_ate
    AND m.categoria = p_categoria
  GROUP BY v.data, v.empresa_codigo, v.produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_dia_produto_categoria(uuid, int[], date, date, bigint[], text[], text)
  TO anon, authenticated;

-- ─── 2) cci_webposto_vendas_comercial SEM dia_produto ───────────
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
  ----------------------------------------------------------------
  -- Resumo: 1 row por (empresa, produto) c/ totais atual+MA+AA
  ----------------------------------------------------------------
  WITH base AS (
    SELECT empresa_codigo, produto_codigo,
           quantidade, total_venda, total_custo,
           total_acrescimo, total_desconto,
           'atual'::text AS periodo
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN p_data_de AND p_data_ate

    UNION ALL

    SELECT empresa_codigo, produto_codigo,
           quantidade, total_venda, total_custo,
           0::numeric, 0::numeric,
           'ma'::text
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN v_ma_de AND v_ma_ate

    UNION ALL

    SELECT empresa_codigo, produto_codigo,
           quantidade, total_venda, total_custo,
           0::numeric, 0::numeric,
           'aa'::text
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN v_aa_de AND v_aa_ate
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
