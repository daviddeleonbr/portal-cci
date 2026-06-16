-- Adiciona suporte a cobrança "por unidade" no catálogo de serviços.
--
-- tipo_valor = 'fixo'    → valor é o total no período (ex: consultoria
--                          mensal R$ 2.500/mês — quantidade sempre 1)
-- tipo_valor = 'unitario' → valor é por unidade (ex: R$ 5/nota fiscal —
--                           quantidade na proposta multiplica o valor)
--
-- `unidade` é texto livre pra exibição ("nota", "hora", "lançamento"...)
-- e só é relevante quando tipo_valor='unitario'.

alter table cci_servicos_oferecidos
  add column if not exists tipo_valor text default 'fixo'
    check (tipo_valor in ('fixo', 'unitario')),
  add column if not exists unidade text;

-- Backfill explícito (idempotente)
update cci_servicos_oferecidos set tipo_valor = 'fixo' where tipo_valor is null;
