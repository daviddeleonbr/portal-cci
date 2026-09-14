-- ============================================================
-- Modalidade de cartão vira CATÁLOGO livre (não só crédito/débito): a Equals
-- traz valores como "Crédito à Vista", "Débito à Vista", "Cartão de benefícios",
-- "Pré-Pago Crédito". Passa a ser cadastrada em BPO → Conciliação de caixas e
-- escolhida por dropdown na conta.
-- ============================================================

-- 1) Libera a coluna modalidade (texto livre) nas contas de cartão.
alter table as_rede_conta_cartao
  drop constraint if exists as_rede_conta_cartao_modalidade_check;

-- 2) Catálogo aceita também 'modalidade'.
alter table bpo_cartao_catalogo
  drop constraint if exists bpo_cartao_catalogo_tipo_check;
alter table bpo_cartao_catalogo
  add constraint bpo_cartao_catalogo_tipo_check
  check (tipo in ('adquirente', 'bandeira', 'modalidade'));
