-- 121_rls_g1_filhas
-- ============================================================
-- FASE 3 · LOTE G1 — filhas indiretas (visibilidade via FK do pai) +
-- cci_pedidos_compra(_item) (adiado do Lote C; escrita do cliente autosystem).
--
-- Helpers SECURITY DEFINER resolvem "posso ver o pai?" ignorando o RLS do
-- pai (evita recursão); auth.jwt() dentro deles ainda lê os claims do
-- chamador. Várias destas são ESCRITAS pelo cliente (produtos/arquivos de
-- NF, resposta de pendência, itens de pedido) → tenant no using E no check.
--
-- Idempotente. Rollback: allow-all de volta (nomes originais no fim).
-- ============================================================

-- ── Helpers de visibilidade por pai ────────────────────────────────
create or replace function cci_pode_ver_manifestacao(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from nf_manifestacao m where m.id = p_id and cci_pode_ver_cliente(m.cliente_id)
  )
$$;

create or replace function cci_pode_ver_outra_conta(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from outra_conta_pagar o where o.id = p_id and cci_pode_ver_cliente(o.cliente_id)
  )
$$;

create or replace function cci_pode_ver_pendencia(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from cci_pendencias p
    where p.id = p_id
      and (p.chave_api_id = cci_jwt_chave_api_id() or cci_pode_ver_cliente(p.cliente_id))
  )
$$;

create or replace function cci_pode_ver_pedido_compra(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from cci_pedidos_compra pc
    where pc.id = p_id
      and (pc.chave_api_id = cci_jwt_chave_api_id() or cci_pode_ver_cliente(pc.cliente_id))
  )
$$;

-- ── Pai adiado do Lote C: cci_pedidos_compra (autosystem grava) ─────
alter table cci_pedidos_compra enable row level security;
drop policy if exists "todos" on cci_pedidos_compra;
drop policy if exists "pedidos_compra_tenant" on cci_pedidos_compra;
create policy "pedidos_compra_tenant" on cci_pedidos_compra
  for all using (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id() or cci_pode_ver_cliente(cliente_id))
  with check (cci_is_admin() or chave_api_id = cci_jwt_chave_api_id() or cci_pode_ver_cliente(cliente_id));

-- cci_pedidos_compra_item  (filha; autosystem grava)
alter table cci_pedidos_compra_item enable row level security;
drop policy if exists "todos" on cci_pedidos_compra_item;
drop policy if exists "pedidos_compra_item_tenant" on cci_pedidos_compra_item;
create policy "pedidos_compra_item_tenant" on cci_pedidos_compra_item
  for all using (cci_pode_ver_pedido_compra(pedido_id))
  with check (cci_pode_ver_pedido_compra(pedido_id));

-- ── Filhas de nf_manifestacao (webposto grava) ─────────────────────
alter table nf_manifestacao_produto enable row level security;
drop policy if exists "Allow all for nf_manifestacao_produto" on nf_manifestacao_produto;
drop policy if exists "nf_produto_tenant" on nf_manifestacao_produto;
create policy "nf_produto_tenant" on nf_manifestacao_produto
  for all using (cci_pode_ver_manifestacao(nf_manifestacao_id))
  with check (cci_pode_ver_manifestacao(nf_manifestacao_id));

alter table nf_manifestacao_arquivo enable row level security;
drop policy if exists "Allow all for nf_manifestacao_arquivo" on nf_manifestacao_arquivo;
drop policy if exists "nf_arquivo_tenant" on nf_manifestacao_arquivo;
create policy "nf_arquivo_tenant" on nf_manifestacao_arquivo
  for all using (cci_pode_ver_manifestacao(nf_manifestacao_id))
  with check (cci_pode_ver_manifestacao(nf_manifestacao_id));

-- ── Filha de outra_conta_pagar (webposto grava) ────────────────────
alter table outra_conta_arquivo enable row level security;
drop policy if exists "Allow all for outra_conta_arquivo" on outra_conta_arquivo;
drop policy if exists "outra_conta_arquivo_tenant" on outra_conta_arquivo;
create policy "outra_conta_arquivo_tenant" on outra_conta_arquivo
  for all using (cci_pode_ver_outra_conta(outra_conta_id))
  with check (cci_pode_ver_outra_conta(outra_conta_id));

-- ── Filha de cci_pendencias (webposto responde; tinha grant anon) ──
alter table cci_pendencia_resposta enable row level security;
revoke all on cci_pendencia_resposta from anon;
drop policy if exists "p_pendencia_resp_all" on cci_pendencia_resposta;
drop policy if exists "pendencia_resp_tenant" on cci_pendencia_resposta;
create policy "pendencia_resp_tenant" on cci_pendencia_resposta
  for all using (cci_pode_ver_pendencia(pendencia_id))
  with check (cci_pode_ver_pendencia(pendencia_id));

-- ============================================================
-- ROLLBACK (por tabela): drop da policy nova e recriar allow-all com o
-- nome ORIGINAL:  cci_pedidos_compra/_item → "todos";
-- cci_pendencia_resposta → "p_pendencia_resp_all" (+ grant all ... to anon);
-- demais → "Allow all for <tabela>".  for all using(true) with check(true).
-- ============================================================
