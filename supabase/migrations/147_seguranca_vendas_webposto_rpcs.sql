-- ============================================================
-- Segurança por usuário — FASE A/B nos RPCs de vendas webposto
--
-- Os RPCs de vendas são SECURITY DEFINER (bypassam RLS) e o gate só checava a
-- REDE. Aqui o gate passa a exigir também:
--   - PERMISSÃO por-feature (cci_tem_permissao)
--   - EMPRESA liberada (empresas_permitidas) — via clientes.empresa_codigo
--
-- IMPORTANTE (RPC compartilhado): cci_webposto_vendas_comercial (138) alimenta
-- o resumo tanto da página de Vendas quanto do DASHBOARD. Por isso seu gate
-- aceita `comercial_vendas` OU `dashboard` — senão o dashboard quebraria para
-- quem só tem `dashboard`. Os RPCs diário/12m (142/143/144) são só da página de
-- Vendas → exigem `comercial_vendas`.
--
-- Perf: o gate referencia só parâmetros (constantes) → é avaliado uma vez e não
-- quebra o index-only scan (mesmo princípio do gate original).
-- ============================================================

-- Toda empresa_codigo pedida está liberada para o usuário?
--   - empresas_permitidas ausente/vazio  => irrestrito (pula o check)
--   - senão                              => cada empresa_codigo precisa mapear
--     a um `clientes` (mesma rede) cujo id esteja em empresas_permitidas.
-- SECURITY DEFINER: lê `clientes` sem depender da RLS dela.
create or replace function cci_webposto_empresas_liberadas(
  p_chave_api_id uuid, p_empresas_codigos int[]
)
returns boolean language sql stable security definer set search_path = public
as $$
  select
    not (auth.jwt() ? 'empresas_permitidas')
    or jsonb_array_length(auth.jwt() -> 'empresas_permitidas') = 0
    or not exists (
      select 1 from unnest(coalesce(p_empresas_codigos, '{}'::int[])) ec
      where not exists (
        select 1 from clientes c
        where c.chave_api_id = p_chave_api_id
          and c.empresa_codigo = ec
          and (auth.jwt() -> 'empresas_permitidas') ? c.id::text
      )
    );
$$;

revoke all on function cci_webposto_empresas_liberadas(uuid, int[]) from public;
grant execute on function cci_webposto_empresas_liberadas(uuid, int[]) to anon, authenticated;

-- ── 138: resumo (Vendas + Dashboard) → comercial_vendas OU dashboard ─────────
CREATE OR REPLACE FUNCTION cci_webposto_vendas_comercial(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
SET statement_timeout = '60s'
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
  -- Gate: rede + (comercial_vendas OU dashboard) + empresa liberada.
  IF NOT (cci_is_admin() OR (
    p_chave_api_id = cci_jwt_chave_api_id()
    AND (cci_tem_permissao('comercial_vendas') OR cci_tem_permissao('dashboard'))
    AND cci_webposto_empresas_liberadas(p_chave_api_id, p_empresas_codigos)
  )) THEN
    RETURN jsonb_build_object('resumo', '[]'::jsonb, 'dias_periodo', v_dias_periodo, 'dias_mes', v_dias_mes,
      'periodo_atual', jsonb_build_object('de', p_data_de, 'ate', p_data_ate),
      'periodo_ma', jsonb_build_object('de', v_ma_de, 'ate', v_ma_ate),
      'periodo_aa', jsonb_build_object('de', v_aa_de, 'ate', v_aa_ate));
  END IF;

  WITH base AS (
    SELECT i.empresa_codigo, i.produto_codigo, i.quantidade, i.total_venda, i.total_custo,
           i.total_acrescimo, i.total_desconto, 'atual'::text AS periodo
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id = p_chave_api_id AND i.empresa_codigo = ANY(p_empresas_codigos)
      AND i.data BETWEEN p_data_de AND p_data_ate
      AND NOT EXISTS (SELECT 1 FROM cci_webposto_venda v WHERE v.chave_api_id=i.chave_api_id
        AND v.empresa_codigo=i.empresa_codigo AND v.venda_codigo=i.venda_codigo AND v.cancelada='S')
    UNION ALL
    SELECT i.empresa_codigo, i.produto_codigo, i.quantidade, i.total_venda, i.total_custo,
           0::numeric, 0::numeric, 'ma'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id = p_chave_api_id AND i.empresa_codigo = ANY(p_empresas_codigos)
      AND i.data BETWEEN v_ma_de AND v_ma_ate
      AND NOT EXISTS (SELECT 1 FROM cci_webposto_venda v WHERE v.chave_api_id=i.chave_api_id
        AND v.empresa_codigo=i.empresa_codigo AND v.venda_codigo=i.venda_codigo AND v.cancelada='S')
    UNION ALL
    SELECT i.empresa_codigo, i.produto_codigo, i.quantidade, i.total_venda, i.total_custo,
           0::numeric, 0::numeric, 'aa'::text
    FROM cci_webposto_venda_item i
    WHERE i.chave_api_id = p_chave_api_id AND i.empresa_codigo = ANY(p_empresas_codigos)
      AND i.data BETWEEN v_aa_de AND v_aa_ate
      AND NOT EXISTS (SELECT 1 FROM cci_webposto_venda v WHERE v.chave_api_id=i.chave_api_id
        AND v.empresa_codigo=i.empresa_codigo AND v.venda_codigo=i.venda_codigo AND v.cancelada='S')
  ),
  agregado AS (
    SELECT empresa_codigo, produto_codigo,
      COALESCE(SUM(CASE WHEN periodo='atual' THEN quantidade      END),0)::numeric AS qtd_atual,
      COALESCE(SUM(CASE WHEN periodo='atual' THEN total_venda     END),0)::numeric AS fat_atual,
      COALESCE(SUM(CASE WHEN periodo='atual' THEN total_custo     END),0)::numeric AS custo_atual,
      COALESCE(SUM(CASE WHEN periodo='atual' THEN total_acrescimo END),0)::numeric AS acresc_atual,
      COALESCE(SUM(CASE WHEN periodo='atual' THEN total_desconto  END),0)::numeric AS desc_atual,
      COALESCE(SUM(CASE WHEN periodo='ma'    THEN quantidade      END),0)::numeric AS qtd_ma,
      COALESCE(SUM(CASE WHEN periodo='ma'    THEN total_venda     END),0)::numeric AS fat_ma,
      COALESCE(SUM(CASE WHEN periodo='ma'    THEN total_custo     END),0)::numeric AS custo_ma,
      COALESCE(SUM(CASE WHEN periodo='aa'    THEN quantidade      END),0)::numeric AS qtd_aa,
      COALESCE(SUM(CASE WHEN periodo='aa'    THEN total_venda     END),0)::numeric AS fat_aa,
      COALESCE(SUM(CASE WHEN periodo='aa'    THEN total_custo     END),0)::numeric AS custo_aa
    FROM base GROUP BY empresa_codigo, produto_codigo
    HAVING SUM(CASE WHEN periodo='atual' THEN quantidade ELSE 0 END) <> 0
        OR SUM(CASE WHEN periodo='ma'    THEN quantidade ELSE 0 END) <> 0
        OR SUM(CASE WHEN periodo='aa'    THEN quantidade ELSE 0 END) <> 0
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_resumo FROM agregado a;

  RETURN jsonb_build_object('resumo', v_resumo, 'dias_periodo', v_dias_periodo, 'dias_mes', v_dias_mes,
    'periodo_atual', jsonb_build_object('de', p_data_de, 'ate', p_data_ate),
    'periodo_ma', jsonb_build_object('de', v_ma_de, 'ate', v_ma_ate),
    'periodo_aa', jsonb_build_object('de', v_aa_de, 'ate', v_aa_ate));
END;
$$;

-- ── 142: evolução 12m (Vendas) → comercial_vendas ───────────────────────────
CREATE OR REPLACE FUNCTION cci_webposto_evolucao_mensal_produto(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date,
  p_produto_codigos  bigint[] DEFAULT NULL
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
  WHERE (cci_is_admin() OR (p_chave_api_id = cci_jwt_chave_api_id() AND cci_tem_permissao('comercial_vendas') AND cci_webposto_empresas_liberadas(p_chave_api_id, p_empresas_codigos)))  -- gate: rede + permissao + empresa
    AND i.chave_api_id   = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
    AND (p_produto_codigos IS NULL OR i.produto_codigo = ANY(p_produto_codigos))
    AND NOT EXISTS (
      SELECT 1 FROM cci_webposto_venda v
      WHERE v.chave_api_id = i.chave_api_id
        AND v.empresa_codigo = i.empresa_codigo
        AND v.venda_codigo = i.venda_codigo
        AND v.cancelada = 'S'
    )
  GROUP BY 1, 2;
$$;

-- ── 143: diário por produto (Vendas) → comercial_vendas ─────────────────────
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
  total_desconto  numeric
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
    COALESCE(SUM(i.total_desconto),  0)::numeric
  FROM cci_webposto_venda_item i
  JOIN mapa m ON m.produto_codigo = i.produto_codigo
  WHERE (cci_is_admin() OR (p_chave_api_id = cci_jwt_chave_api_id() AND cci_tem_permissao('comercial_vendas') AND cci_webposto_empresas_liberadas(p_chave_api_id, p_empresas_codigos)))  -- gate: rede + permissao + empresa
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

-- ── 144: totais por dia (Vendas) → comercial_vendas ─────────────────────────
CREATE OR REPLACE FUNCTION cci_webposto_dia_totais_categoria(
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
  WITH mapa AS (
    SELECT m.produto_codigo, m.categoria
    FROM unnest(p_produto_codigos, p_categorias) AS m(produto_codigo, categoria)
  )
  SELECT
    i.data::date,
    COALESCE(SUM(i.quantidade),      0)::numeric,
    COALESCE(SUM(i.total_venda),      0)::numeric,
    COALESCE(SUM(i.total_custo),      0)::numeric,
    COALESCE(SUM(i.total_acrescimo),  0)::numeric,
    COALESCE(SUM(i.total_desconto),   0)::numeric
  FROM cci_webposto_venda_item i
  JOIN mapa m ON m.produto_codigo = i.produto_codigo
  WHERE (cci_is_admin() OR (p_chave_api_id = cci_jwt_chave_api_id() AND cci_tem_permissao('comercial_vendas') AND cci_webposto_empresas_liberadas(p_chave_api_id, p_empresas_codigos)))  -- gate: rede + permissao + empresa
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
  GROUP BY i.data;
$$;
