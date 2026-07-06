-- Performance + seguranca das RPCs quentes da pagina Vendas (webposto).
--
-- PROBLEMA (net::ERR_CONNECTION_CLOSED / Failed to fetch):
-- A policy RLS destas tabelas e `cci_is_admin() OR chave_api_id =
-- cci_jwt_chave_api_id()`. Como o ramo `admin` poderia casar TODAS as linhas,
-- o planner nao consegue usar o indice em chave_api_id e faz Seq Scan da
-- cci_webposto_venda_item inteira (multi-tenant, `raw` jsonb gordo) — e reavalia
-- isso no anti-join da venda a cada loop. No SQL Editor (role postgres, RLS off)
-- a query e 1,4s; via PostgREST (authenticated, RLS on) estoura 40s+.
--
-- FIX: estas RPCs viram SECURITY DEFINER (rodam como owner → sem o OR da RLS →
-- usam o indice). A seguranca e mantida por um GATE por PARAMETRO:
--   (cci_is_admin() OR p_chave_api_id = cci_jwt_chave_api_id())
-- Diferenca crucial vs a RLS: o gate compara o PARAMETRO (constante) com o JWT,
-- entao e avaliado UMA vez (nao por linha) e nao atrapalha o indice. Um chamador
-- que passe uma chave_api_id que nao e a sua (e nao seja admin) recebe 0 linhas.
--
-- Trava (regra de SECURITY DEFINER): SET search_path = public; REVOKE de public;
-- GRANT so aos roles usados pelo cliente.

-- ─── 1) resumo por periodo ──────────────────────────────────────
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
SECURITY DEFINER SET search_path = public
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
  GROUP BY i.empresa_codigo, i.produto_codigo;
$$;

REVOKE ALL ON FUNCTION cci_webposto_vendas_resumo_periodo(uuid, int[], date, date) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_vendas_resumo_periodo(uuid, int[], date, date) TO anon, authenticated;

-- ─── 2) diario por categoria ────────────────────────────────────
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
SECURITY DEFINER SET search_path = public
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
    COALESCE(SUM(i.quantidade),      0)::numeric,
    COALESCE(SUM(i.total_venda),     0)::numeric,
    COALESCE(SUM(i.total_custo),     0)::numeric,
    COALESCE(SUM(i.total_acrescimo), 0)::numeric,
    COALESCE(SUM(i.total_desconto),  0)::numeric,
    COUNT(DISTINCT i.venda_codigo)::int
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
  GROUP BY i.data, i.empresa_codigo, i.produto_codigo;
$$;

REVOKE ALL ON FUNCTION cci_webposto_dia_produto_categoria(uuid, int[], date, date, bigint[], text[], text) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_dia_produto_categoria(uuid, int[], date, date, bigint[], text[], text) TO anon, authenticated;

-- ─── 3) lucro bruto por categoria mensal (sparklines 12m) ───────
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
SECURITY DEFINER SET search_path = public
SET statement_timeout = '60s'
AS $$
  WITH mapa AS (
    SELECT m.produto_codigo, m.categoria
    FROM unnest(p_produto_codigos, p_categorias) AS m(produto_codigo, categoria)
  )
  SELECT
    to_char(i.data, 'YYYY-MM'),
    COALESCE(m.categoria, 'outros'),
    COALESCE(SUM(i.total_venda), 0)::numeric,
    COALESCE(SUM(i.total_custo), 0)::numeric,
    COALESCE(SUM(i.quantidade),  0)::numeric
  FROM cci_webposto_venda_item i
  LEFT JOIN mapa m ON m.produto_codigo = i.produto_codigo
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

REVOKE ALL ON FUNCTION cci_webposto_lucro_bruto_categoria_mensal(uuid, int[], date, date, bigint[], text[]) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_lucro_bruto_categoria_mensal(uuid, int[], date, date, bigint[], text[]) TO anon, authenticated;
