-- 123_rls_publico
-- ============================================================
-- FASE 3 · tabelas de ESCRITA/LEITURA PÚBLICA da landing (não-segredo).
-- Fecha a Fase 3 para tudo que não é segredo (segredos = Lote H, após Fase 4).
--
--   cci_orcamento_solicitacoes: qualquer visitante INSERE (form de orçamento);
--     só admin LÊ/gerencia os leads.
--   cci_contato: singleton de contato exibido na landing → leitura pública;
--     escrita só admin.
-- Idempotente. Rollback no fim.
-- ============================================================

-- cci_orcamento_solicitacoes  (policy original: "todos")
alter table cci_orcamento_solicitacoes enable row level security;
drop policy if exists "todos" on cci_orcamento_solicitacoes;
drop policy if exists "orcamento_insert_publico" on cci_orcamento_solicitacoes;
drop policy if exists "orcamento_admin" on cci_orcamento_solicitacoes;
create policy "orcamento_insert_publico" on cci_orcamento_solicitacoes
  for insert with check (true);
create policy "orcamento_admin" on cci_orcamento_solicitacoes
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cci_contato  (singleton lido pela landing)
alter table cci_contato enable row level security;
drop policy if exists "Allow all for cci_contato" on cci_contato;
drop policy if exists "contato_read" on cci_contato;
drop policy if exists "contato_write" on cci_contato;
create policy "contato_read" on cci_contato for select using (true);
create policy "contato_write" on cci_contato
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK:
--   cci_orcamento_solicitacoes: drop das 2 policies; create policy "todos"
--     on cci_orcamento_solicitacoes for all using(true) with check(true);
--   cci_contato: drop das 2 policies; create policy "Allow all for cci_contato"
--     on cci_contato for all using(true) with check(true);
-- ============================================================
