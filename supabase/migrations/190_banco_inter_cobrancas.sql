-- ============================================================
-- 190 — Banco Inter: boletos (Cobrança v3) — Contas a Receber da CCI
--
-- Cópia local dos boletos da conta da CCI no Inter (listagem + emissão
-- pelo portal). Só admin da CCI: N3, ou permissão 'contas_receber' ou
-- 'banco_inter'. Escrita só pela Edge Function `inter-api` (service_role).
-- ============================================================

create or replace function cci_pode_receber_inter()
returns boolean language sql stable
as $$
  select cci_is_admin()
     and (
       coalesce(cci_nivel_admin(), 0) = 3
       or coalesce((auth.jwt() -> 'cci_permissoes') ?| array['contas_receber', 'banco_inter'], false)
     );
$$;

create table if not exists cci_inter_cobranca (
  codigo_solicitacao text primary key,   -- id da cobrança no Inter
  conta_id          uuid not null references cci_inter_conta(id) on delete cascade,
  seu_numero        text,                -- nosso controle (até 15 caracteres)
  cliente_id        uuid references clientes(id) on delete set null, -- quando emitido pelo portal / CNPJ bate
  pagador_nome      text,
  pagador_cpf_cnpj  text,
  data_emissao      date,
  data_vencimento   date,
  valor_nominal     numeric,
  situacao          text,                -- A_RECEBER, RECEBIDO, ATRASADO, CANCELADO, EXPIRADO, MARCADO_RECEBIDO...
  data_situacao     date,                -- data do pagamento quando RECEBIDO
  valor_recebido    numeric,
  nosso_numero      text,
  linha_digitavel   text,
  pix_copia_cola    text,
  detalhes          jsonb,               -- payload bruto do Inter
  emitido_por       uuid,                -- usuário do portal que emitiu (null = emitido fora do portal)
  sincronizado_em   timestamptz not null default now()
);
create index if not exists ix_cci_inter_cobranca_venc on cci_inter_cobranca (conta_id, data_vencimento);
create index if not exists ix_cci_inter_cobranca_cliente on cci_inter_cobranca (cliente_id);

alter table cci_inter_cobranca enable row level security;
drop policy if exists cci_inter_cobranca_sel on cci_inter_cobranca;
create policy cci_inter_cobranca_sel on cci_inter_cobranca
  for select using (cci_pode_receber_inter());
revoke all on cci_inter_cobranca from anon;

-- A tela de Contas a Receber precisa saber se o Inter está configurado
-- (status da conta, sem segredos) — libera o select da conta também.
drop policy if exists cci_inter_conta_sel on cci_inter_conta;
create policy cci_inter_conta_sel on cci_inter_conta
  for select using (cci_pode_banco_inter() or cci_pode_receber_inter());

-- Escopos pedidos ao Inter (informativo): inclui a emissão de boletos.
alter table cci_inter_conta
  alter column escopos set default 'extrato.read boleto-cobranca.read boleto-cobranca.write';
update cci_inter_conta set escopos = 'extrato.read boleto-cobranca.read boleto-cobranca.write'
 where escopos = 'extrato.read boleto-cobranca.read';
