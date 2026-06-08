-- View unificada da página Vendas (Webposto · Comercial · Vendas).
--
-- Substitui as 3 RPCs existentes (resumo_3periodos + dia_produto +
-- combustiveis_overview) por UMA chamada que devolve tudo num único
-- JSONB. O front passa só (chave_api, empresas[], data_de, data_ate) —
-- a RPC calcula MA/AA + projeção automaticamente.
--
-- Layout da resposta:
-- {
--   "resumo":      [{empresa_codigo, produto_codigo, qtd_atual, fat_atual,
--                    custo_atual, acresc_atual, desc_atual, qtd_ma, fat_ma,
--                    custo_ma, qtd_aa, fat_aa, custo_aa}],
--   "dia_produto": [{data, empresa_codigo, produto_codigo, quantidade,
--                    total_venda, total_custo, total_acrescimo,
--                    total_desconto, qtd_vendas}],
--   "dias_periodo": int,
--   "dias_mes":     int
-- }
--
-- Aplicações por aba:
--   - Visão geral / Auto / Conv → consomem `resumo` (3 períodos)
--   - Combustíveis              → consome `resumo` (filtrando categoria)
--   - Trees "Realizado dia-a-dia" → consomem `dia_produto`
--   - KPIs com projeção         → multiplicam por dias_mes/dias_periodo

DROP FUNCTION IF EXISTS cci_webposto_vendas_comercial(uuid, int[], date, date);

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
  -- Janelas MA (mês anterior) e AA (ano anterior) — mesmo número de dias
  v_ma_de  date := (p_data_de  - INTERVAL '1 month')::date;
  v_ma_ate date := (p_data_ate - INTERVAL '1 month')::date;
  v_aa_de  date := (p_data_de  - INTERVAL '1 year')::date;
  v_aa_ate date := (p_data_ate - INTERVAL '1 year')::date;

  -- Métricas de projeção
  v_dias_periodo int := (p_data_ate - p_data_de) + 1;
  v_dias_mes     int := EXTRACT(DAY FROM (date_trunc('month', p_data_de) + INTERVAL '1 month - 1 day'))::int;

  -- Resultados parciais
  v_resumo      jsonb;
  v_dia_produto jsonb;
BEGIN
  ----------------------------------------------------------------
  -- 1) Resumo: 1 row por (empresa, produto) c/ totais atual+MA+AA
  ----------------------------------------------------------------
  WITH base AS (
    -- Atual
    SELECT empresa_codigo, produto_codigo,
           quantidade, total_venda, total_custo,
           total_acrescimo, total_desconto,
           'atual'::text AS periodo
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN p_data_de AND p_data_ate

    UNION ALL

    -- Mês anterior
    SELECT empresa_codigo, produto_codigo,
           quantidade, total_venda, total_custo,
           0::numeric, 0::numeric,
           'ma'::text
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN v_ma_de AND v_ma_ate

    UNION ALL

    -- Ano anterior
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

  ----------------------------------------------------------------
  -- 2) Dia × produto: só do período atual, pras trees Realizado dia
  ----------------------------------------------------------------
  WITH agregado AS (
    SELECT
      data,
      empresa_codigo,
      produto_codigo,
      COALESCE(SUM(quantidade),      0)::numeric AS quantidade,
      COALESCE(SUM(total_venda),     0)::numeric AS total_venda,
      COALESCE(SUM(total_custo),     0)::numeric AS total_custo,
      COALESCE(SUM(total_acrescimo), 0)::numeric AS total_acrescimo,
      COALESCE(SUM(total_desconto),  0)::numeric AS total_desconto,
      COUNT(DISTINCT venda_codigo)::int          AS qtd_vendas
    FROM v_cci_webposto_vendas_validas
    WHERE chave_api_id   = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND data BETWEEN p_data_de AND p_data_ate
    GROUP BY data, empresa_codigo, produto_codigo
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_dia_produto FROM agregado a;

  ----------------------------------------------------------------
  -- 3) Monta resposta final
  ----------------------------------------------------------------
  RETURN jsonb_build_object(
    'resumo',       v_resumo,
    'dia_produto',  v_dia_produto,
    'dias_periodo', v_dias_periodo,
    'dias_mes',     v_dias_mes,
    'periodo_atual', jsonb_build_object('de', p_data_de, 'ate', p_data_ate),
    'periodo_ma',    jsonb_build_object('de', v_ma_de,   'ate', v_ma_ate),
    'periodo_aa',    jsonb_build_object('de', v_aa_de,   'ate', v_aa_ate)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_vendas_comercial(uuid, int[], date, date)
  TO anon, authenticated;
