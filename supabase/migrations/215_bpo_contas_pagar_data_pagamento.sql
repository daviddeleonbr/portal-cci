-- 215_bpo_contas_pagar_data_pagamento
-- BPO · Contas a pagar: data de PAGAMENTO programada (≠ vencimento).
-- A CCI pode incluir no banco um título vencido para pagar num dia posterior,
-- ou antecipar o pagamento. null = paga no vencimento (efetivo).
-- A agenda usa data_pagamento quando existe. Só a CCI altera (trigger).
-- Idempotente.

alter table bpo_contas_pagar_status add column if not exists data_pagamento date;

create or replace function bpo_contas_pagar_status_carimbo()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.incluida_em := now();
    new.incluida_por_id := cci_jwt_usuario_id();
  else
    if not cci_is_admin() then
      new.cliente_id        := old.cliente_id;
      new.titulo_chave      := old.titulo_chave;
      new.vencimento        := old.vencimento;
      new.valor             := old.valor;
      new.fornecedor        := old.fornecedor;
      new.documento         := old.documento;
      new.observacao        := old.observacao;
      new.data_pagamento    := old.data_pagamento;
      new.incluida_em       := old.incluida_em;
      new.incluida_por_id   := old.incluida_por_id;
      new.incluida_por_nome := old.incluida_por_nome;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.status = 'autorizada' then
    if tg_op = 'INSERT' or old.status is distinct from 'autorizada' then
      new.autorizada_em := now();
      new.autorizada_por_id := cci_jwt_usuario_id();
    else
      new.autorizada_em := old.autorizada_em;
      new.autorizada_por_id := old.autorizada_por_id;
      new.autorizada_por_nome := old.autorizada_por_nome;
    end if;
  else
    new.autorizada_em := null;
    new.autorizada_por_id := null;
    new.autorizada_por_nome := null;
  end if;
  return new;
end $$;
