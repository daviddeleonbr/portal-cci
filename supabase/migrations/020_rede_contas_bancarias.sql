-- ============================================================
-- As contas bancarias sao disponibilizadas pelo Quality a nivel
-- de REDE (chave_api), nao a nivel de empresa. Este migration
-- altera a granularidade da tabela de classificacao: basta
-- configurar uma vez por rede e vale para todas as empresas dela.
--
-- Dados existentes (se houver) sao descartados pois estavam
-- vinculados a cliente_id (empresa) que nao faz mais sentido.
-- ============================================================

-- Apaga eventuais registros da versao anterior (cliente_id)
delete from cliente_contas_bancarias;

-- Remove a FK/coluna antiga e indice
drop index if exists idx_cli_contas_cliente;
alter table cliente_contas_bancarias drop constraint if exists cliente_contas_bancarias_cliente_id_conta_codigo_key;
alter table cliente_contas_bancarias drop column if exists cliente_id;

-- Adiciona chave_api_id (rede)
alter table cliente_contas_bancarias
  add column chave_api_id uuid not null references chaves_api(id) on delete cascade;

create index if not exists idx_rede_contas_chave on cliente_contas_bancarias(chave_api_id);

-- Nova unique: (chave_api_id, conta_codigo)
alter table cliente_contas_bancarias
  add constraint cliente_contas_bancarias_chave_conta_key unique (chave_api_id, conta_codigo);
