-- 115_rls_b1_admin_only
-- ============================================================
-- FASE 3 · LOTE B1 — tabelas ADMIN-ONLY (leitura e escrita só admin).
-- São dados internos da CCI / CRM que o portal do cliente NUNCA lê nem
-- escreve (confirmado por varredura de consumidores no frontend). Risco
-- de quebrar feature de cliente: ~zero. Fecha exposição sensível (anon
-- lia/escrevia financeiro, propostas, contratos, agendamentos de NF).
--
-- Teste (logado como ADMIN): Financeiro (contas a pagar/lançamentos),
-- Propostas/Contratos/Precificação, NF (agendamentos), Asaas. Tudo OK.
-- Cliente: não deve ser afetado (não usa estas telas).
-- Rollback: bloco comentado no fim.
-- ============================================================

-- helper local: cada tabela vira "for all using/​with check cci_is_admin()".

-- cci_contas_pagar
alter table cci_contas_pagar enable row level security;
drop policy if exists "Allow all for cci_contas_pagar" on cci_contas_pagar;
create policy "contas_pagar_admin" on cci_contas_pagar
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_lancamentos_contabeis
alter table cci_lancamentos_contabeis enable row level security;
drop policy if exists "Allow all for cci_lancamentos_contabeis" on cci_lancamentos_contabeis;
create policy "lancamentos_admin" on cci_lancamentos_contabeis
  for all using (cci_is_admin()) with check (cci_is_admin());

-- notas_fiscais_asaas
alter table notas_fiscais_asaas enable row level security;
drop policy if exists "Allow all for notas_fiscais_asaas" on notas_fiscais_asaas;
create policy "nf_asaas_admin" on notas_fiscais_asaas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- asaas_customers
alter table asaas_customers enable row level security;
drop policy if exists "Allow all for asaas_customers" on asaas_customers;
create policy "asaas_customers_admin" on asaas_customers
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_contratos  (tinha grant to anon)
alter table cci_contratos enable row level security;
revoke all on cci_contratos from anon;
drop policy if exists "Allow all for cci_contratos" on cci_contratos;
create policy "contratos_admin" on cci_contratos
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_propostas  (grant anon)
alter table cci_propostas enable row level security;
revoke all on cci_propostas from anon;
drop policy if exists "Allow all for cci_propostas" on cci_propostas;
create policy "propostas_admin" on cci_propostas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_proposta_itens  (grant anon)
alter table cci_proposta_itens enable row level security;
revoke all on cci_proposta_itens from anon;
drop policy if exists "Allow all for cci_proposta_itens" on cci_proposta_itens;
create policy "proposta_itens_admin" on cci_proposta_itens
  for all using (cci_is_admin()) with check (cci_is_admin());

-- agendamentos_nf  (grant anon) — cron usa service_role (bypassa RLS)
alter table agendamentos_nf enable row level security;
revoke all on agendamentos_nf from anon;
drop policy if exists "Allow all for agendamentos_nf" on agendamentos_nf;
create policy "agendamentos_nf_admin" on agendamentos_nf
  for all using (cci_is_admin()) with check (cci_is_admin());

-- nfse_agendamentos  (sem consumidor no frontend; edge usa service_role)
alter table nfse_agendamentos enable row level security;
drop policy if exists "Allow all for nfse_agendamentos" on nfse_agendamentos;
create policy "nfse_agendamentos_admin" on nfse_agendamentos
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_motivos_movimentacao
alter table cci_motivos_movimentacao enable row level security;
drop policy if exists "Allow all for cci_motivos_movimentacao" on cci_motivos_movimentacao;
create policy "motivos_admin" on cci_motivos_movimentacao
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_servicos_oferecidos  (grant anon)
alter table cci_servicos_oferecidos enable row level security;
revoke all on cci_servicos_oferecidos from anon;
drop policy if exists "Allow all for cci_servicos_oferecidos" on cci_servicos_oferecidos;
create policy "servicos_oferecidos_admin" on cci_servicos_oferecidos
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_precificacao_vinculo  (grant anon)
alter table cci_precificacao_vinculo enable row level security;
revoke all on cci_precificacao_vinculo from anon;
drop policy if exists "Allow all for cci_precificacao_vinculo" on cci_precificacao_vinculo;
create policy "precificacao_vinculo_admin" on cci_precificacao_vinculo
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (por tabela, se algo quebrar): trocar a policy "<x>_admin"
-- de volta por  create policy "Allow all for <tabela>" on <tabela>
--   for all using (true) with check (true);
-- e (onde havia) regrantar:  grant all on <tabela> to anon;
-- ============================================================
