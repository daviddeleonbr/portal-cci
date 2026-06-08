-- View base + RPC dedicada pra a tela Combustíveis (Webposto · Vendas).
--
-- A view encapsula o JOIN entre cci_webposto_venda_item e cci_webposto_venda
-- com filtro cancelada='N'. Toda RPC que precise de itens válidos deve
-- consultar a view, não as tabelas brutas — fica mais legível, mais
-- difícil de esquecer o cancelado.
--
-- A RPC `cci_webposto_combustiveis_overview` atende exatamente a tela
-- Vendas › Combustíveis: recebe (chave_api, empresas[], data_de, data_ate)
-- — o front passa o período do filtro e o conjunto de empresas marcadas
-- (default: todas). Retorna 1 row por produto com totais do período atual
-- e do mesmo período no ano anterior — o front monta KPIs e tabela
-- projeção/realizado direto.

-- ─── 1) View base ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_cci_webposto_vendas_validas AS
SELECT
  i.chave_api_id,
  i.empresa_codigo,
  i.venda_codigo,
  i.item_sequencia,
  i.produto_codigo,
  i.data,
  i.quantidade,
  i.total_venda,
  i.total_custo,
  i.total_acrescimo,
  i.total_desconto,
  i.icms_valor,
  i.valor_pis,
  i.valor_cofins,
  i.valor_cbs,
  i.valor_ibs,
  v.raw->>'funcionarioCodigo' AS funcionario_codigo
FROM cci_webposto_venda_item i
JOIN cci_webposto_venda v
  ON v.chave_api_id    = i.chave_api_id
 AND v.empresa_codigo  = i.empresa_codigo
 AND v.venda_codigo    = i.venda_codigo
WHERE v.cancelada = 'N';

GRANT SELECT ON v_cci_webposto_vendas_validas TO anon, authenticated;

-- ─── 2) RPC: overview Combustíveis ──────────────────────────────
-- Recebe um período (data_de, data_ate). Internamente calcula o mesmo
-- período do ano anterior (subtrair 1 ano, clampando 29/02 quando bissexto).
-- Retorna 1 row por (empresa, produto) com totais atual + AA.
DROP FUNCTION IF EXISTS cci_webposto_combustiveis_overview(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_combustiveis_overview(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS TABLE (
  empresa_codigo  int,
  produto_codigo  bigint,
  litros_atual    numeric,
  fat_atual       numeric,
  custo_atual     numeric,
  lucro_atual     numeric,
  acresc_atual    numeric,
  desc_atual      numeric,
  litros_aa       numeric,
  fat_aa          numeric,
  custo_aa        numeric,
  lucro_aa        numeric,
  dias_periodo    int,
  dias_mes        int
)
LANGUAGE plpgsql STABLE
SET statement_timeout = '120s'
AS $$
DECLARE
  v_aa_de  date := (p_data_de  - INTERVAL '1 year')::date;
  v_aa_ate date := (p_data_ate - INTERVAL '1 year')::date;
  v_dias_periodo int := (p_data_ate - p_data_de) + 1;
  v_dias_mes int := EXTRACT(DAY FROM (date_trunc('month', p_data_de) + INTERVAL '1 month - 1 day'))::int;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      x.empresa_codigo, x.produto_codigo,
      x.quantidade, x.total_venda, x.total_custo,
      x.total_acrescimo, x.total_desconto,
      'atual'::text AS periodo
    FROM v_cci_webposto_vendas_validas x
    WHERE x.chave_api_id    = p_chave_api_id
      AND x.empresa_codigo  = ANY(p_empresas_codigos)
      AND x.data            BETWEEN p_data_de AND p_data_ate

    UNION ALL

    SELECT
      x.empresa_codigo, x.produto_codigo,
      x.quantidade, x.total_venda, x.total_custo,
      0::numeric, 0::numeric,
      'aa'::text
    FROM v_cci_webposto_vendas_validas x
    WHERE x.chave_api_id    = p_chave_api_id
      AND x.empresa_codigo  = ANY(p_empresas_codigos)
      AND x.data            BETWEEN v_aa_de AND v_aa_ate
  )
  SELECT
    b.empresa_codigo,
    b.produto_codigo,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN quantidade      END), 0)::numeric AS litros_atual,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_venda     END), 0)::numeric AS fat_atual,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_custo     END), 0)::numeric AS custo_atual,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_venda - total_custo END), 0)::numeric AS lucro_atual,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_acrescimo END), 0)::numeric AS acresc_atual,
    COALESCE(SUM(CASE WHEN periodo = 'atual' THEN total_desconto  END), 0)::numeric AS desc_atual,
    COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN quantidade      END), 0)::numeric AS litros_aa,
    COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN total_venda     END), 0)::numeric AS fat_aa,
    COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN total_custo     END), 0)::numeric AS custo_aa,
    COALESCE(SUM(CASE WHEN periodo = 'aa'    THEN total_venda - total_custo END), 0)::numeric AS lucro_aa,
    v_dias_periodo AS dias_periodo,
    v_dias_mes     AS dias_mes
  FROM base b
  GROUP BY b.empresa_codigo, b.produto_codigo
  HAVING
       SUM(CASE WHEN periodo = 'atual' THEN quantidade ELSE 0 END) <> 0
    OR SUM(CASE WHEN periodo = 'aa'    THEN quantidade ELSE 0 END) <> 0;
END;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_combustiveis_overview(uuid, int[], date, date)
  TO anon, authenticated;
