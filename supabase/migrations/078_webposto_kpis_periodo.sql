-- RPC compacta pros KPIs do Dashboard (Visão Geral) — Webposto.
--
-- O dashboard precisa de 3 chamadas (atual + MA + AA) só pros 4 KPIs
-- do topo. Antes usávamos `cci_webposto_vendas_comercial`, que devolve
-- resumo por produto + dia_produto + outros campos pesados (~5-10MB
-- pra rede grande). Pros KPIs do dashboard só precisamos de 3 números
-- por período: fat, custo, litros (qtd combustível).
--
-- Esta RPC retorna 1 linha com exatamente isso, com `quantidade_combustivel`
-- já filtrada pelos produto_codigos passados em `p_produtos_combustivel`
-- (lista resolvida pelo front a partir do catálogo Quality).
--
-- Ganho: ~30-50x menos payload + 3-5x mais rápido (sem agrupamento por
-- produto/dia).

DROP FUNCTION IF EXISTS cci_webposto_kpis_periodo(uuid, int[], date, date, bigint[]);

CREATE OR REPLACE FUNCTION cci_webposto_kpis_periodo(
  p_chave_api_id          uuid,
  p_empresas_codigos      int[],
  p_data_de               date,
  p_data_ate              date,
  p_produtos_combustivel  bigint[] DEFAULT NULL
)
RETURNS TABLE (
  valor_total             numeric,
  custo_total             numeric,
  quantidade_combustivel  numeric,
  qtd_vendas              int
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  SELECT
    COALESCE(SUM(x.total_venda),  0)::numeric AS valor_total,
    COALESCE(SUM(x.total_custo),  0)::numeric AS custo_total,
    COALESCE(SUM(CASE
      WHEN p_produtos_combustivel IS NULL OR x.produto_codigo = ANY(p_produtos_combustivel)
        THEN x.quantidade
      ELSE 0
    END), 0)::numeric AS quantidade_combustivel,
    COUNT(DISTINCT x.venda_codigo)::int AS qtd_vendas
  FROM v_cci_webposto_vendas_validas x
  WHERE x.chave_api_id   = p_chave_api_id
    AND x.empresa_codigo = ANY(p_empresas_codigos)
    AND x.data BETWEEN p_data_de AND p_data_ate;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_kpis_periodo(uuid, int[], date, date, bigint[])
  TO anon, authenticated;
