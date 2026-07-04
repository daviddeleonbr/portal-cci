-- 119_rls_e_por_empresa
-- ============================================================
-- FASE 3 · LOTE E — tabelas POR EMPRESA (cliente_id → clientes), várias
-- ESCRITAS pelo portal do cliente. A policy usa cci_pode_ver_cliente()
-- (SECURITY DEFINER → enxerga `clientes` mesmo com RLS ligado) no `using`
-- E no `with check`, então o cliente lê e grava só nas empresas da própria
-- rede; admin vê/edita tudo.
--
-- ⚠️ Estas mexem em ESCRITA do cliente. Testar salvando de verdade:
--   - webposto: NF manifestação (editar), Outras Contas (criar/editar),
--     Sangrias (salvar fechamento), Pendências (marcar visualização).
--   - admin: as mesmas telas + gestão de clientes.
--   - NEGATIVO: cliente da rede A não lê nem grava dados da empresa de B.
--
-- Idempotente (dropa nomes novos antes de criar). Rollback no fim.
-- ============================================================

-- clientes  (raiz do tenant; cliente lê a própria rede, escrita só admin)
alter table clientes enable row level security;
drop policy if exists "Allow all for clientes" on clientes;
drop policy if exists "clientes_sel" on clientes;
drop policy if exists "clientes_mod" on clientes;
create policy "clientes_sel" on clientes
  for select using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));
create policy "clientes_mod" on clientes
  for all using (cci_is_admin()) with check (cci_is_admin());

-- cliente_sangrias_fechamento  (cliente grava)
alter table cliente_sangrias_fechamento enable row level security;
drop policy if exists "Allow all for cliente_sangrias_fechamento" on cliente_sangrias_fechamento;
drop policy if exists "sangrias_tenant" on cliente_sangrias_fechamento;
create policy "sangrias_tenant" on cliente_sangrias_fechamento
  for all using (cci_pode_ver_cliente(cliente_id))
  with check (cci_pode_ver_cliente(cliente_id));

-- nf_manifestacao  (cliente webposto grava)
alter table nf_manifestacao enable row level security;
drop policy if exists "Allow all for nf_manifestacao" on nf_manifestacao;
drop policy if exists "nf_manifestacao_tenant" on nf_manifestacao;
create policy "nf_manifestacao_tenant" on nf_manifestacao
  for all using (cci_pode_ver_cliente(cliente_id))
  with check (cci_pode_ver_cliente(cliente_id));

-- outra_conta_pagar  (cliente webposto grava)
alter table outra_conta_pagar enable row level security;
drop policy if exists "Allow all for outra_conta_pagar" on outra_conta_pagar;
drop policy if exists "outra_conta_tenant" on outra_conta_pagar;
create policy "outra_conta_tenant" on outra_conta_pagar
  for all using (cci_pode_ver_cliente(cliente_id))
  with check (cci_pode_ver_cliente(cliente_id));

-- cci_pendencia_visualizacao  (cliente grava upsert; tinha grant anon)
alter table cci_pendencia_visualizacao enable row level security;
revoke all on cci_pendencia_visualizacao from anon;
drop policy if exists "p_pendencia_visualiz_all" on cci_pendencia_visualizacao;
drop policy if exists "pendencia_visualiz_tenant" on cci_pendencia_visualizacao;
create policy "pendencia_visualiz_tenant" on cci_pendencia_visualizacao
  for all using (cci_pode_ver_cliente(cliente_id))
  with check (cci_pode_ver_cliente(cliente_id));

-- mapeamento_manual_contas  (leitura tenant p/ não travar DRE do cliente; escrita admin)
--   tem cliente_id E as_rede_id → cobre webposto (via cliente) e autosystem (via rede)
alter table mapeamento_manual_contas enable row level security;
drop policy if exists "Allow all for mapeamento_manual_contas" on mapeamento_manual_contas;
drop policy if exists "map_manual_sel" on mapeamento_manual_contas;
drop policy if exists "map_manual_mod" on mapeamento_manual_contas;
create policy "map_manual_sel" on mapeamento_manual_contas
  for select using (
    cci_is_admin()
    or (as_rede_id is not null and as_rede_id = cci_jwt_as_rede_id())
    or cci_pode_ver_cliente(cliente_id)
  );
create policy "map_manual_mod" on mapeamento_manual_contas
  for all using (cci_is_admin()) with check (cci_is_admin());

-- mapeamento_manual_contas_fluxo  (idem)
alter table mapeamento_manual_contas_fluxo enable row level security;
drop policy if exists "Allow all for mapeamento_manual_contas_fluxo" on mapeamento_manual_contas_fluxo;
drop policy if exists "map_manual_fluxo_sel" on mapeamento_manual_contas_fluxo;
drop policy if exists "map_manual_fluxo_mod" on mapeamento_manual_contas_fluxo;
create policy "map_manual_fluxo_sel" on mapeamento_manual_contas_fluxo
  for select using (
    cci_is_admin()
    or (as_rede_id is not null and as_rede_id = cci_jwt_as_rede_id())
    or cci_pode_ver_cliente(cliente_id)
  );
create policy "map_manual_fluxo_mod" on mapeamento_manual_contas_fluxo
  for all using (cci_is_admin()) with check (cci_is_admin());

-- ============================================================
-- ROLLBACK (por tabela): drop das policies novas e recriar allow-all:
--   create policy "Allow all for <tabela>" on <tabela> for all using (true) with check (true);
-- (cci_pendencia_visualizacao original: "p_pendencia_visualiz_all"; e
--  grant all on cci_pendencia_visualizacao to anon;)
-- ============================================================
