-- ============================================================
-- Saldo final declarado no arquivo de extrato enviado.
-- Permite comparar o saldo do arquivo com o saldo final
-- calculado pelos movimentos do sistema (conciliacao diaria).
-- ============================================================

alter table extratos_bancarios
  add column if not exists saldo_final numeric(14, 2);

comment on column extratos_bancarios.saldo_final is
  'Saldo final declarado no arquivo de extrato (em reais). Comparado com o saldo calculado a partir de MOVIMENTO_CONTA para a conta + data informadas.';
