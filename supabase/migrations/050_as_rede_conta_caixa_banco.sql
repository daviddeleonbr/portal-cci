-- ============================================================
-- 050_as_rede_conta_caixa_banco
--
-- Marca quais contas do plano de contas Autosystem representam
-- caixa/banco de uma rede. Essas contas são a "base" do fluxo
-- de caixa: o relatório só considera lançamentos onde uma delas
-- aparece em conta_debitar OU conta_creditar, e usa a contraparte
-- (a outra conta do mesmo lançamento) pra classificar nos grupos
-- da máscara de Fluxo de Caixa.
--
-- Exemplo: recebimento de cartão → debita banco (caixa/banco),
-- credita conta "Cartão de crédito". A conta "Cartão de crédito"
-- é o que precisa estar mapeado na estrutura de fluxo.
--
-- Transferências entre duas contas caixa/banco (ex: banco → caixa)
-- são ignoradas pelo relatório por serem movimento interno.
-- ============================================================

create table if not exists as_rede_conta_caixa_banco (
  as_rede_id  uuid not null references as_rede(id) on delete cascade,
  codigo      text not null,
  nome        text,
  created_at  timestamptz default now(),
  primary key (as_rede_id, codigo)
);

create index if not exists as_rede_conta_caixa_banco_rede_idx
  on as_rede_conta_caixa_banco (as_rede_id);
