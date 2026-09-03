-- Marca contas caixa/banco (Autosystem) que são "aplicação financeira".
-- Assim, na Evolução do Caixa, o usuário pode excluir essas contas da análise
-- do fluxo (aplicações distorcem o giro operacional com grandes aportes/resgates).
-- As policies RLS já existentes em as_rede_conta_caixa_banco (for select / for all)
-- cobrem a nova coluna — não é preciso recriá-las.

alter table as_rede_conta_caixa_banco
  add column if not exists aplicacao_financeira boolean not null default false;
