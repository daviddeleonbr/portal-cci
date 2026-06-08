-- Permite edição de mensagens próprias dentro de uma janela de 5 minutos.
-- Quando editada, `editada_em` é preenchida — a UI mostra um badge.
alter table cci_suporte_mensagem
  add column if not exists editada_em timestamptz;
