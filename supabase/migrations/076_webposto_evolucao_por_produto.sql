-- Evolução mensal POR PRODUTO — alimenta sparklines de margem nos
-- KPIs da Visão geral (Combustível, Automotivos, Conveniência, Global).
--
-- O front precisa de séries 12m separadas por CATEGORIA, mas categoria
-- é resolvida no client (catálogo Quality). Solução: RPC retorna por
-- (ano_mes, produto_codigo) já agregado em todas as empresas selecio-
-- nadas. O front classifica e monta as 4 séries com poucos KB de dados.
--
-- Volume típico: ~1k produtos × 12 meses = ~12k rows. Aceitável pra
-- uma chamada eventual (cacheada por sessão).

DROP FUNCTION IF EXISTS cci_webposto_evolucao_mensal_produto(uuid, int[], date, date);

CREATE OR REPLACE FUNCTION cci_webposto_evolucao_mensal_produto(
  p_chave_api_id     uuid,
  p_empresas_codigos int[],
  p_data_de          date,
  p_data_ate         date
)
RETURNS TABLE (
  ano_mes        text,
  produto_codigo bigint,
  valor          numeric,
  valor_custo    numeric,
  quantidade     numeric
)
LANGUAGE sql STABLE
SET statement_timeout = '120s'
AS $$
  SELECT
    to_char(x.data, 'YYYY-MM')                  AS ano_mes,
    x.produto_codigo,
    COALESCE(SUM(x.total_venda), 0)::numeric    AS valor,
    COALESCE(SUM(x.total_custo), 0)::numeric    AS valor_custo,
    COALESCE(SUM(x.quantidade),  0)::numeric    AS quantidade
  FROM v_cci_webposto_vendas_validas x
  WHERE x.chave_api_id   = p_chave_api_id
    AND x.empresa_codigo = ANY(p_empresas_codigos)
    AND x.data BETWEEN p_data_de AND p_data_ate
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal_produto(uuid, int[], date, date)
  TO anon, authenticated;
