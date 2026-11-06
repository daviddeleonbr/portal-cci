-- 209_conferencia_recebimentos_ocorrencias
-- Ocorrências do Resumo de caixa (como as retiradas da Sangria): abaixo da
-- tabela o usuário registra "o que houve" escolhendo a forma de recebimento.
--   [{ chave, rotulo, descricao }]
-- Ficam no rascunho enquanto não confirma e vão para a conferência ao confirmar.
alter table cliente_conferencia_recebimentos
  add column if not exists ocorrencias jsonb not null default '[]'::jsonb;
alter table cliente_conferencia_recebimentos_rascunho
  add column if not exists ocorrencias jsonb not null default '[]'::jsonb;
