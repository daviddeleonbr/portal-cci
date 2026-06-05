-- ============================================================
-- Notas fiscais que vieram sem boleto (pagas em dinheiro, sem cobrança
-- formal etc) podem ser enviadas para a CCI com uma justificativa no
-- lugar do arquivo. Cliente preenche `motivo_sem_boleto`; service exige
-- ao menos UM dos dois (boleto anexado OU motivo preenchido).
-- ============================================================

alter table nf_manifestacao
  add column if not exists motivo_sem_boleto text;
