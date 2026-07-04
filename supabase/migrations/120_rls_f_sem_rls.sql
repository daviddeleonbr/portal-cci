-- 120_rls_f_sem_rls
-- ============================================================
-- FASE 3 · LOTE F — tabelas que HOJE NÃO TÊM RLS (abertas via grant
-- default do schema public). Habilita RLS + policy na mesma migration.
--
-- Maioria é ferramenta admin (BPO/mapeamento), lida direto ou via RPC:
--   SELECT: admin OU a própria rede · escrita: admin.
-- Exceção: bpo_conciliacoes_caixas é ESCRITA pelo cliente (ClienteBPO
-- webposto+autosystem) → tenant por cliente_id no using E no with check.
--
-- Atenção ao nome da coluna: as_rede_produto_mix usa `rede_id` (não as_rede_id).
-- Idempotente. Rollback: desabilitar RLS (volta ao estado atual).
-- ============================================================

-- ofx_correlacao  (ferramenta admin BPO; leitura via RPC)
alter table ofx_correlacao enable row level security;
drop policy if exists "ofx_correlacao_sel" on ofx_correlacao;
drop policy if exists "ofx_correlacao_mod" on ofx_correlacao;
create policy "ofx_correlacao_sel" on ofx_correlacao
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "ofx_correlacao_mod" on ofx_correlacao
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ofx_correlacao_item  (filha; ferramenta admin) — admin-only (nenhum cliente lê)
alter table ofx_correlacao_item enable row level security;
drop policy if exists "ofx_correlacao_item_all" on ofx_correlacao_item;
create policy "ofx_correlacao_item_all" on ofx_correlacao_item
  for all using (cci_is_admin()) with check (cci_is_admin());

-- chave_api_produto_mix  (webposto; leitura via RPC)
alter table chave_api_produto_mix enable row level security;
drop policy if exists "produto_mix_sel" on chave_api_produto_mix;
drop policy if exists "produto_mix_mod" on chave_api_produto_mix;
create policy "produto_mix_sel" on chave_api_produto_mix
  for select using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id());
create policy "produto_mix_mod" on chave_api_produto_mix
  for all using (cci_is_admin()) with check (cci_is_admin());

-- as_rede_conta_caixa_banco  (autosystem; admin BPO)
alter table as_rede_conta_caixa_banco enable row level security;
drop policy if exists "as_caixa_banco_sel" on as_rede_conta_caixa_banco;
drop policy if exists "as_caixa_banco_mod" on as_rede_conta_caixa_banco;
create policy "as_caixa_banco_sel" on as_rede_conta_caixa_banco
  for select using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());
create policy "as_caixa_banco_mod" on as_rede_conta_caixa_banco
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_vendas_autosystem  (autosystem; leitura tenant p/ DRE do cliente)
alter table mapeamento_vendas_autosystem enable row level security;
drop policy if exists "map_vendas_as_sel" on mapeamento_vendas_autosystem;
drop policy if exists "map_vendas_as_mod" on mapeamento_vendas_autosystem;
create policy "map_vendas_as_sel" on mapeamento_vendas_autosystem
  for select using (cci_is_admin() or as_rede_id = cci_jwt_as_rede_id());
create policy "map_vendas_as_mod" on mapeamento_vendas_autosystem
  for all using (cci_is_admin()) with check (cci_is_admin());

-- as_rede_produto_mix  (autosystem; coluna rede_id!)
alter table as_rede_produto_mix enable row level security;
drop policy if exists "as_produto_mix_sel" on as_rede_produto_mix;
drop policy if exists "as_produto_mix_mod" on as_rede_produto_mix;
create policy "as_produto_mix_sel" on as_rede_produto_mix
  for select using (cci_is_admin() or rede_id = cci_jwt_as_rede_id());
create policy "as_produto_mix_mod" on as_rede_produto_mix
  for all using (cci_is_admin()) with check (cci_is_admin());

-- bpo_conciliacoes_caixas  (ESCRITA pelo cliente webposto+autosystem)
alter table bpo_conciliacoes_caixas enable row level security;
drop policy if exists "bpo_concil_tenant" on bpo_conciliacoes_caixas;
create policy "bpo_concil_tenant" on bpo_conciliacoes_caixas
  for all using (cci_pode_ver_cliente(cliente_id))
  with check (cci_pode_ver_cliente(cliente_id));

-- ============================================================
-- ROLLBACK (por tabela): volta ao estado atual (sem RLS):
--   drop policy if exists "<policies>" on <tabela>;
--   alter table <tabela> disable row level security;
-- ============================================================
