-- Índice parcial: 99%+ das vendas têm cancelada='N'. O índice parcial
-- cobre exatamente o filtro do EXISTS das RPCs, e é menor (mais cache-
-- friendly) que indexar tudo.
CREATE INDEX IF NOT EXISTS idx_webposto_venda_validas
  ON cci_webposto_venda (chave_api_id, empresa_codigo, venda_codigo)
  WHERE cancelada = 'N';

-- Otimização das RPCs de resumo Webposto (substitui as da migration 072).
--
-- Causa do timeout anterior: o WHERE com OR de 3 ranges de data impedia
-- o planner de usar o índice (chave_api_id, empresa_codigo, data) — caía
-- em seq scan + filter, processando milhões de rows.
--
-- Solução: UNION ALL de 3 queries (1 por período). Cada SELECT usa o
-- índice de data isoladamente. O JOIN com `cci_webposto_venda` vira
-- EXISTS — mais barato que JOIN quando filtramos cancelada='N'.
--
-- Também adiciona `SET statement_timeout = '120s'` no nível da função
-- pra evitar o limite default de 8s do anon role do Supabase.

DROP FUNCTION IF EXISTS cci_webposto_resumo_3periodos(uuid, int[], date, date, date, date, date, date);

CREATE OR REPLACE FUNCTION cci_webposto_resumo_3periodos(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_atual_de  date, p_atual_ate date,
  p_ma_de     date, p_ma_ate    date,
  p_aa_de     date, p_aa_ate    date
)
RETURNS TABLE (
  empresa_codigo  int,
  produto_codigo  bigint,
  qtd_atual    numeric, fat_atual   numeric, custo_atual numeric,
  acresc_atual numeric, desc_atual  numeric,
  qtd_ma       numeric, fat_ma      numeric, custo_ma    numeric,
  qtd_aa       numeric, fat_aa      numeric, custo_aa    numeric
)
LANGUAGE sql STABLE
SET statement_timeout = '120s'
AS $$
  WITH itens_periodo AS (
    -- Período ATUAL
    SELECT
      i.empresa_codigo, i.produto_codigo,
      i.quantidade, i.total_venda, i.total_custo,
      i.total_acrescimo, i.total_desconto,
      'atual'::text AS periodo
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id    = p_chave_api_id
      AND i.empresa_codigo  = ANY(p_empresas_codigos)
      AND i.data            BETWEEN p_atual_de AND p_atual_ate
      AND EXISTS (
        SELECT 1 FROM cci_webposto_venda v
        WHERE v.chave_api_id    = i.chave_api_id
          AND v.empresa_codigo  = i.empresa_codigo
          AND v.venda_codigo    = i.venda_codigo
          AND v.cancelada       = 'N'
      )

    UNION ALL

    -- Mês ANTERIOR (acrésc/desc não precisamos)
    SELECT
      i.empresa_codigo, i.produto_codigo,
      i.quantidade, i.total_venda, i.total_custo,
      0::numeric, 0::numeric,
      'ma'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id    = p_chave_api_id
      AND i.empresa_codigo  = ANY(p_empresas_codigos)
      AND i.data            BETWEEN p_ma_de AND p_ma_ate
      AND EXISTS (
        SELECT 1 FROM cci_webposto_venda v
        WHERE v.chave_api_id    = i.chave_api_id
          AND v.empresa_codigo  = i.empresa_codigo
          AND v.venda_codigo    = i.venda_codigo
          AND v.cancelada       = 'N'
      )

    UNION ALL

    -- Ano ANTERIOR
    SELECT
      i.empresa_codigo, i.produto_codigo,
      i.quantidade, i.total_venda, i.total_custo,
      0::numeric, 0::numeric,
      'aa'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id    = p_chave_api_id
      AND i.empresa_codigo  = ANY(p_empresas_codigos)
      AND i.data            BETWEEN p_aa_de AND p_aa_ate
      AND EXISTS (
        SELECT 1 FROM cci_webposto_venda v
        WHERE v.chave_api_id    = i.chave_api_id
          AND v.empresa_codigo  = i.empresa_codigo
          AND v.venda_codigo    = i.venda_codigo
          AND v.cancelada       = 'N'
      )
  )
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
  FROM itens_periodo
  GROUP BY empresa_codigo, produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_resumo_3periodos(uuid, int[], date, date, date, date, date, date)
  TO anon, authenticated;

-- Mesmo tratamento pra a RPC dia × produto.
DROP FUNCTION IF EXISTS cci_webposto_dia_produto(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_dia_produto(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
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
SET statement_timeout = '120s'
AS $$
  SELECT
    i.data,
    i.empresa_codigo,
    i.produto_codigo,
    COALESCE(SUM(i.quantidade),     0)::numeric AS quantidade,
    COALESCE(SUM(i.total_venda),    0)::numeric AS total_venda,
    COALESCE(SUM(i.total_custo),    0)::numeric AS total_custo,
    COALESCE(SUM(i.total_acrescimo),0)::numeric AS total_acrescimo,
    COALESCE(SUM(i.total_desconto), 0)::numeric AS total_desconto,
    COUNT(DISTINCT i.venda_codigo)::int         AS qtd_vendas
  FROM cci_webposto_venda_item i
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id    = i.chave_api_id
        AND v.empresa_codigo  = i.empresa_codigo
        AND v.venda_codigo    = i.venda_codigo
        AND v.cancelada       = 'N'
    )
  GROUP BY i.data, i.empresa_codigo, i.produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_dia_produto(uuid, int[], date, date)
  TO anon, authenticated;

-- ─── Mesmo tratamento pra evolução 12m ──────────────────────────
DROP FUNCTION IF EXISTS cci_webposto_evolucao_mensal(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_evolucao_mensal(
  p_chave_api_id   uuid,
  p_empresas_codigos int[],
  p_data_de        date,
  p_data_ate       date
)
RETURNS TABLE (
  ano_mes      text,
  valor        numeric,
  valor_custo  numeric,
  quantidade   numeric,
  qtd_vendas   int
)
LANGUAGE sql STABLE
SET statement_timeout = '120s'
AS $$
  SELECT
    to_char(i.data, 'YYYY-MM')                  AS ano_mes,
    COALESCE(SUM(i.total_venda), 0)::numeric    AS valor,
    COALESCE(SUM(i.total_custo), 0)::numeric    AS valor_custo,
    COALESCE(SUM(i.quantidade),  0)::numeric    AS quantidade,
    COUNT(DISTINCT i.venda_codigo)::int         AS qtd_vendas
  FROM cci_webposto_venda_item i
  WHERE i.chave_api_id = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id    = i.chave_api_id
        AND v.empresa_codigo  = i.empresa_codigo
        AND v.venda_codigo    = i.venda_codigo
        AND v.cancelada       = 'N'
    )
  GROUP BY to_char(i.data, 'YYYY-MM')
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal(uuid, int[], date, date)
  TO anon, authenticated;
