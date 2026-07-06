-- Consolida o resumo de vendas em UMA chamada (reduz concorrencia).
--
-- O front fazia 3 chamadas paralelas (cci_webposto_vendas_resumo_periodo:
-- atual/mes-anterior/ano-anterior). Cada troca de periodo abria 3 conexoes; com
-- o pool do Supabase saturado, isso ajudava a estourar os streams HTTP/2 e
-- disparar a cascata de retry. Voltar a 1 chamada combinada corta isso em 3x.
--
-- `cci_webposto_vendas_comercial` ja le venda_item direto (134); aqui viramos
-- SECURITY DEFINER (roda como owner -> sem o OR da RLS que quebra o indice ->
-- rapido) + gate por parametro (autoriza sem quebrar o indice). Mesmo padrao da
-- 137. RETURNS jsonb {resumo, dias, periodos}.

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
  -- Autorizacao (gate por parametro, constante -> nao quebra o indice).
  IF NOT (cci_is_admin() OR p_chave_api_id = cci_jwt_chave_api_id()) THEN
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

REVOKE ALL ON FUNCTION cci_webposto_vendas_comercial(uuid, int[], date, date) FROM public;
GRANT EXECUTE ON FUNCTION cci_webposto_vendas_comercial(uuid, int[], date, date) TO anon, authenticated;
