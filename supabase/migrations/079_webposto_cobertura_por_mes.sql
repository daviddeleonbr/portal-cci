-- RPC `cci_webposto_cobertura_por_mes`
--
-- Devolve qtd de vendas no cache local AGRUPADAS por (ano-mês, empresa)
-- pra uma rede inteira (chave_api_id). Resultado tem ~N_empresas × N_meses
-- linhas (centenas, não milhões) — caía no limite default de 1000 rows
-- do REST do PostgREST quando o front fazia SELECT bruto em
-- cci_webposto_venda, devolvendo cobertura errada (meses parecendo erro
-- ou parcial mesmo com todos os jobs OK no histórico).

DROP FUNCTION IF EXISTS cci_webposto_cobertura_por_mes(uuid);

CREATE OR REPLACE FUNCTION cci_webposto_cobertura_por_mes(
  p_chave_api_id uuid
)
RETURNS TABLE (
  ano_mes        text,
  empresa_codigo int,
  qtd_vendas     bigint
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  SELECT
    to_char(v.data, 'YYYY-MM')   AS ano_mes,
    v.empresa_codigo::int        AS empresa_codigo,
    COUNT(*)::bigint             AS qtd_vendas
  FROM cci_webposto_venda v
  WHERE v.chave_api_id = p_chave_api_id
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_cobertura_por_mes(uuid)
  TO anon, authenticated;

-- Versão single-empresa: usada pela tela legada por empresa (1 cliente)
DROP FUNCTION IF EXISTS cci_webposto_cobertura_por_mes_empresa(uuid, int);

CREATE OR REPLACE FUNCTION cci_webposto_cobertura_por_mes_empresa(
  p_chave_api_id   uuid,
  p_empresa_codigo int
)
RETURNS TABLE (
  ano_mes    text,
  qtd_vendas bigint
)
LANGUAGE sql STABLE
SET statement_timeout = '60s'
AS $$
  SELECT
    to_char(v.data, 'YYYY-MM') AS ano_mes,
    COUNT(*)::bigint           AS qtd_vendas
  FROM cci_webposto_venda v
  WHERE v.chave_api_id   = p_chave_api_id
    AND v.empresa_codigo = p_empresa_codigo
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

GRANT EXECUTE ON FUNCTION cci_webposto_cobertura_por_mes_empresa(uuid, int)
  TO anon, authenticated;
