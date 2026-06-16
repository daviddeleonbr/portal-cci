-- Estende o snapshot de itens da proposta com tipo_valor e unidade,
-- pra preservar como o serviço foi cobrado quando a proposta foi feita.

alter table cci_proposta_itens
  add column if not exists tipo_valor text default 'fixo'
    check (tipo_valor in ('fixo', 'unitario')),
  add column if not exists unidade text;
