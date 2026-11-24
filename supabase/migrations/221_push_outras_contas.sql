-- 221_push_outras_contas
-- Outras contas a pagar → notificação no sino (e push no celular, via o
-- gatilho de `notificacoes` da 219):
--   cliente enviou uma conta        → CCI com 'outras_contas' (ou N3)
--   CCI lançou / devolveu a conta   → usuários da empresa com 'outras_contas'
-- Helpers (cci_notificar, cci_admins_com_permissao, cci_usuarios_da_empresa,
-- cci_fmt_brl) vêm da 219. Notificar nunca bloqueia a ação. Idempotente.

create or replace function oc_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_empresa text;
  v_desc text := coalesce(nullif(new.descricao, ''), 'Conta');
begin
  select nome into v_empresa from clientes where id = new.cliente_id;

  if tg_op = 'INSERT' and new.status = 'enviada' then
    perform cci_notificar(
      array(select cci_admins_com_permissao('outras_contas')),
      'Nova conta a pagar (sem NF)',
      format('%s enviou "%s" — %s%s.', coalesce(v_empresa, 'Cliente'), v_desc, cci_fmt_brl(new.valor),
             case when new.data_pagamento is not null then ', pagar em ' || to_char(new.data_pagamento, 'DD/MM') else '' end),
      'info',
      '/admin/bpo/outras-contas');

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'lancada' then
      perform cci_notificar(
        array(select cci_usuarios_da_empresa(new.cliente_id, 'outras_contas')),
        'Conta lançada pela CCI',
        format('"%s" (%s) foi lançada.', v_desc, cci_fmt_brl(new.valor)),
        'sucesso',
        '/cliente/webposto/bpo/outras-contas');
    elsif new.status = 'devolvida' then
      perform cci_notificar(
        array(select cci_usuarios_da_empresa(new.cliente_id, 'outras_contas')),
        'Conta devolvida para correção',
        format('"%s" (%s): %s', v_desc, cci_fmt_brl(new.valor), coalesce(nullif(new.motivo_devolucao, ''), 'veja o motivo no portal.')),
        'aviso',
        '/cliente/webposto/bpo/outras-contas');
    elsif new.status = 'enviada' and old.status = 'devolvida' then
      -- cliente corrigiu e reenviou
      perform cci_notificar(
        array(select cci_admins_com_permissao('outras_contas')),
        'Conta reenviada pelo cliente',
        format('%s reenviou "%s" — %s.', coalesce(v_empresa, 'Cliente'), v_desc, cci_fmt_brl(new.valor)),
        'info',
        '/admin/bpo/outras-contas');
    end if;
  end if;
  return new;
exception when others then
  raise warning 'oc_notificar: %', sqlerrm; -- notificar nunca bloqueia a conta
  return new;
end $$;

drop trigger if exists trg_oc_notificar on outra_conta_pagar;
create trigger trg_oc_notificar
  after insert or update of status on outra_conta_pagar
  for each row execute function oc_notificar();
