-- Corrige o conceito de "aplicação financeira" no fluxo Autosystem.
--
-- A aplicação NÃO é uma conta caixa/banco — é a CONTRAPARTIDA do lançamento
-- caixa/banco (o outro lado, classificado na máscara de fluxo). Ex.: uma
-- "transferência para aplicação" tem o banco de um lado (caixa/banco) e a conta
-- de aplicação do outro (contrapartida). Na Evolução do Caixa o usuário quer
-- poder excluir os lançamentos cuja contrapartida é uma conta de aplicação.
--
-- Por isso: (1) remove a coluna aplicacao_financeira adicionada na 172 (que
-- marcava contas caixa/banco — conceito errado) e (2) cria uma tabela própria
-- pras contas de contrapartida marcadas como aplicação.

alter table as_rede_conta_caixa_banco drop column if exists aplicacao_financeira;

create table if not exists as_rede_conta_aplicacao (
  as_rede_id  uuid not null references as_rede(id) on delete cascade,
  codigo      text not null,
  nome        text,
  created_at  timestamptz default now(),
  primary key (as_rede_id, codigo)
);

create index if not exists idx_as_rede_conta_aplicacao_rede
  on as_rede_conta_aplicacao(as_rede_id);

-- RLS: mesmo padrão de as_rede_conta_caixa_banco (migration 120).
alter table as_rede_conta_aplicacao enable row level security;
drop policy if exists "as_conta_aplicacao_sel" on as_rede_conta_aplicacao;
drop policy if exists "as_conta_aplicacao_mod" on as_rede_conta_aplicacao;
create policy "as_conta_aplicacao_sel" on as_rede_conta_aplicacao
  for select using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());
create policy "as_conta_aplicacao_mod" on as_rede_conta_aplicacao
  for all using (cci_is_admin()) with check (cci_is_admin());
