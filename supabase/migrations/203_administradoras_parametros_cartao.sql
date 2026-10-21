-- 203_administradoras_parametros_cartao
-- Parametrização de cartões do Webposto (equivalente às "Contas de cartão" do
-- Autosystem): cada administradora da Quality recebe adquirente, bandeira e
-- modalidade (valores do catálogo bpo_cartao_catalogo). Usado no diagnóstico
-- de cartões (sistema × Equals/adquirentes). Config por rede (chave_api_id).
alter table cliente_administradoras add column if not exists adquirente text;
alter table cliente_administradoras add column if not exists bandeira text;
alter table cliente_administradoras add column if not exists modalidade text;
