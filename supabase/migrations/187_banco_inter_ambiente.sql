-- ============================================================
-- 187 — Banco Inter: ambiente da integração (sandbox | producao)
--
-- A sandbox do Inter tem outro host (cdpj-sandbox.partners.uatinter.co) e
-- certificados próprios (vencem em ~30 dias). A Edge Function `inter-api`
-- escolhe o host por esta coluna.
-- ============================================================

alter table cci_inter_conta
  add column if not exists ambiente text not null default 'producao';

alter table cci_inter_conta drop constraint if exists cci_inter_conta_ambiente_check;
alter table cci_inter_conta
  add constraint cci_inter_conta_ambiente_check check (ambiente in ('producao', 'sandbox'));
