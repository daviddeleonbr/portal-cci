-- ============================================================
-- Adiciona 'recebimento' ao enum de tipos de conta bancaria.
-- Usado para contas de adquirentes (PagPix, Cielo, Rede), transportadoras
-- de valores (Brinks), maquininhas etc. Os movimentos dessas contas
-- representam recebimento real de cliente, entao entram no fluxo de caixa.
-- O repasse delas para conta bancaria vem marcado como transferencia=S
-- no MOVIMENTO_CONTA e e filtrado para evitar duplicidade.
-- ============================================================

alter table cliente_contas_bancarias drop constraint if exists cliente_contas_bancarias_tipo_check;
alter table cliente_contas_bancarias add constraint cliente_contas_bancarias_tipo_check
  check (tipo in ('bancaria', 'aplicacao', 'caixa', 'recebimento', 'outras'));
