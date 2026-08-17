-- ============================================================
-- Remove a tabela de vínculos da calculadora de Precificação
-- ============================================================
--
-- A feature "Precificação" (calculadora por esforço) foi removida do produto.
-- A tabela cci_precificacao_vinculo (migration 103) guardava o vínculo
-- "item da calculadora → serviço do catálogo" e ficou órfã — nada mais a lê
-- ou escreve. Dropada a pedido.

drop table if exists cci_precificacao_vinculo;
