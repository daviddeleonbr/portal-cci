-- RPC pra agregar evolução mensal de vendas Webposto direto no banco.
--
-- Motivação: o dashboard cliente Webposto precisa de 12 meses de evolução
-- (litros + lucro por litro). Fazer isso via PostgREST SELECT + agregação
-- client-side estoura o limite de 1000 rows por query — pra 4 empresas ×
-- 12 meses pode haver 100k+ rows de venda_item.
--
-- Esta RPC faz a agregação no servidor (group by ano_mes) e retorna 1
-- linha por mês, independente do volume.

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
LANGUAGE sql STABLE AS $$
  WITH vendas_validas AS (
    SELECT empresa_codigo, venda_codigo
    FROM cci_webposto_venda
    WHERE chave_api_id = p_chave_api_id
      AND empresa_codigo = ANY(p_empresas_codigos)
      AND cancelada = 'N'
      AND data BETWEEN p_data_de AND p_data_ate
  )
  SELECT
    to_char(i.data, 'YYYY-MM')                  AS ano_mes,
    COALESCE(SUM(i.total_venda), 0)::numeric    AS valor,
    COALESCE(SUM(i.total_custo), 0)::numeric    AS valor_custo,
    COALESCE(SUM(i.quantidade),  0)::numeric    AS quantidade,
    COUNT(DISTINCT i.venda_codigo)::int         AS qtd_vendas
  FROM cci_webposto_venda_item i
  JOIN vendas_validas v
    ON v.empresa_codigo = i.empresa_codigo
   AND v.venda_codigo   = i.venda_codigo
  WHERE i.chave_api_id = p_chave_api_id
    AND i.empresa_codigo = ANY(p_empresas_codigos)
    AND i.data BETWEEN p_data_de AND p_data_ate
  GROUP BY to_char(i.data, 'YYYY-MM')
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_evolucao_mensal(uuid, int[], date, date)
  TO anon, authenticated;
