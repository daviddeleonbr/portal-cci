-- Guarda o detalhamento POR EMPRESA de uma proposta de rede, para permitir
-- gerar um contrato separado por empresa na conversão.
-- Estrutura: [{ nome, cnpj, cliente_id, total, itens: [...] }]

alter table cci_propostas
  add column if not exists empresas jsonb;
