-- RPCs de agregação Webposto — substituem o fetch granular client-side
-- da página de Vendas (4 empresas × maio = ~100k rows) por queries SQL
-- que retornam os dados já pré-agregados.
--
-- Resultado: 100k+ rows pelo wire → ~5-10k rows. Tempo de carregamento
-- cai de 3-5s pra <1s.

-- ─── 1) RESUMO DOS 3 PERÍODOS ───────────────────────────────────────
-- Pra cada (empresa, produto) presente em qualquer dos 3 períodos,
-- devolve totais separados por período (atual/MA/AA) usando SUM+CASE.
-- O front recebe 1 row por produto e monta a árvore.
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
LANGUAGE sql STABLE AS $$
  WITH vendas_validas AS (
    SELECT empresa_codigo, venda_codigo, data
    FROM cci_webposto_venda
    WHERE chave_api_id    = p_chave_api_id
      AND empresa_codigo  = ANY(p_empresas_codigos)
      AND cancelada       = 'N'
      AND (
           (data BETWEEN p_atual_de AND p_atual_ate)
        OR (data BETWEEN p_ma_de    AND p_ma_ate)
        OR (data BETWEEN p_aa_de    AND p_aa_ate)
      )
  )
  SELECT
    i.empresa_codigo,
    i.produto_codigo,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.quantidade      ELSE 0 END), 0)::numeric AS qtd_atual,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.total_venda     ELSE 0 END), 0)::numeric AS fat_atual,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.total_custo     ELSE 0 END), 0)::numeric AS custo_atual,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.total_acrescimo ELSE 0 END), 0)::numeric AS acresc_atual,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.total_desconto  ELSE 0 END), 0)::numeric AS desc_atual,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_ma_de    AND p_ma_ate    THEN i.quantidade      ELSE 0 END), 0)::numeric AS qtd_ma,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_ma_de    AND p_ma_ate    THEN i.total_venda     ELSE 0 END), 0)::numeric AS fat_ma,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_ma_de    AND p_ma_ate    THEN i.total_custo     ELSE 0 END), 0)::numeric AS custo_ma,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_aa_de    AND p_aa_ate    THEN i.quantidade      ELSE 0 END), 0)::numeric AS qtd_aa,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_aa_de    AND p_aa_ate    THEN i.total_venda     ELSE 0 END), 0)::numeric AS fat_aa,
    COALESCE(SUM(CASE WHEN i.data BETWEEN p_aa_de    AND p_aa_ate    THEN i.total_custo     ELSE 0 END), 0)::numeric AS custo_aa
  FROM cci_webposto_venda_item i
  JOIN vendas_validas v
    ON v.empresa_codigo = i.empresa_codigo
   AND v.venda_codigo   = i.venda_codigo
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND (
         (i.data BETWEEN p_atual_de AND p_atual_ate)
      OR (i.data BETWEEN p_ma_de    AND p_ma_ate)
      OR (i.data BETWEEN p_aa_de    AND p_aa_ate)
    )
  GROUP BY i.empresa_codigo, i.produto_codigo
  HAVING
    SUM(CASE WHEN i.data BETWEEN p_atual_de AND p_atual_ate THEN i.quantidade ELSE 0 END) <> 0
    OR SUM(CASE WHEN i.data BETWEEN p_ma_de AND p_ma_ate THEN i.quantidade ELSE 0 END) <> 0
    OR SUM(CASE WHEN i.data BETWEEN p_aa_de AND p_aa_ate THEN i.quantidade ELSE 0 END) <> 0;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_resumo_3periodos(uuid, int[], date, date, date, date, date, date)
  TO anon, authenticated;

-- ─── 2) DIA × PRODUTO (período atual) ────────────────────────────────
-- Pra trees "Realizado dia a dia". Devolve 1 linha por (dia, empresa,
-- produto) com totais. Tipicamente ~30 dias × ~50 produtos × ~4 empresas
-- = 6k rows, vs ~50k vendaItens granulares.
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
LANGUAGE sql STABLE AS $$
  WITH vendas_validas AS (
    SELECT empresa_codigo, venda_codigo
    FROM cci_webposto_venda
    WHERE chave_api_id    = p_chave_api_id
      AND empresa_codigo  = ANY(p_empresas_codigos)
      AND cancelada       = 'N'
      AND data BETWEEN p_data_de AND p_data_ate
  )
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
  JOIN vendas_validas v
    ON v.empresa_codigo = i.empresa_codigo
   AND v.venda_codigo   = i.venda_codigo
  WHERE i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
  GROUP BY i.data, i.empresa_codigo, i.produto_codigo;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_dia_produto(uuid, int[], date, date)
  TO anon, authenticated;
