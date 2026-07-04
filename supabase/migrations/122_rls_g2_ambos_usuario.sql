-- 122_rls_g2_ambos_usuario
-- ============================================================
-- FASE 3 · LOTE G2 (fecha a Fase 3, exceto segredos/H) — tabelas TENANT
-- AMBOS e PER-USUÁRIO, várias ESCRITAS pelo cliente.
--
-- Padrões:
--   - rede (chave_api_id/as_rede_id): cci_is_admin() or cci_rede_bate(...)
--   - per-usuário (usuario_id): cci_is_admin() or usuario_id = cci_jwt_usuario_id()
--   - filhas: helper cci_pode_ver_<pai>()
-- Escrita do cliente → tenant no using E no with check.
-- Idempotente. Rollback: allow-all de volta (nomes originais no fim).
-- ============================================================

-- ── Helpers de visibilidade por pai ────────────────────────────────
create or replace function cci_pode_ver_melhoria(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from cci_melhorias m where m.id = p_id and cci_rede_bate(m.chave_api_id, m.as_rede_id)
  )
$$;

create or replace function cci_pode_ver_conversa(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from cci_suporte_conversa c
    where c.id = p_id
      and (c.usuario_cliente_id = cci_jwt_usuario_id() or cci_rede_bate(c.chave_api_id, c.as_rede_id))
  )
$$;

-- ── Melhorias (cliente cria) ───────────────────────────────────────
alter table cci_melhorias enable row level security;
drop policy if exists "Allow all for cci_melhorias" on cci_melhorias;
drop policy if exists "melhorias_tenant" on cci_melhorias;
create policy "melhorias_tenant" on cci_melhorias
  for all using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id))
  with check (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));

alter table cci_melhorias_comentarios enable row level security;
drop policy if exists "Allow all for cci_melhorias_comentarios" on cci_melhorias_comentarios;
drop policy if exists "melhorias_coment_tenant" on cci_melhorias_comentarios;
create policy "melhorias_coment_tenant" on cci_melhorias_comentarios
  for all using (cci_pode_ver_melhoria(melhoria_id))
  with check (cci_pode_ver_melhoria(melhoria_id));

alter table cci_melhorias_anexos enable row level security;
drop policy if exists "Allow all for cci_melhorias_anexos" on cci_melhorias_anexos;
drop policy if exists "melhorias_anexos_tenant" on cci_melhorias_anexos;
create policy "melhorias_anexos_tenant" on cci_melhorias_anexos
  for all using (cci_pode_ver_melhoria(melhoria_id))
  with check (cci_pode_ver_melhoria(melhoria_id));

-- ── Suporte/chat (cliente conversa) ────────────────────────────────
alter table cci_suporte_conversa enable row level security;
drop policy if exists "p_suporte_conversa_all" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_tenant" on cci_suporte_conversa;
create policy "suporte_conversa_tenant" on cci_suporte_conversa
  for all using (cci_is_admin() or usuario_cliente_id = cci_jwt_usuario_id() or cci_rede_bate(chave_api_id, as_rede_id))
  with check (cci_is_admin() or usuario_cliente_id = cci_jwt_usuario_id() or cci_rede_bate(chave_api_id, as_rede_id));

alter table cci_suporte_mensagem enable row level security;
drop policy if exists "p_suporte_mensagem_all" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_tenant" on cci_suporte_mensagem;
create policy "suporte_mensagem_tenant" on cci_suporte_mensagem
  for all using (cci_pode_ver_conversa(conversa_id))
  with check (cci_pode_ver_conversa(conversa_id));

-- ── Telemetria de uso (cliente insere pageview) ────────────────────
alter table cci_uso_portal enable row level security;
drop policy if exists "Insert allowed for cci_uso_portal" on cci_uso_portal;
drop policy if exists "Select allowed for cci_uso_portal" on cci_uso_portal;
drop policy if exists "uso_portal_ins" on cci_uso_portal;
drop policy if exists "uso_portal_sel" on cci_uso_portal;
create policy "uso_portal_ins" on cci_uso_portal
  for insert with check (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));
create policy "uso_portal_sel" on cci_uso_portal
  for select using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));

-- ── Notificações (cliente marca como lida = update do próprio) ─────
alter table notificacoes enable row level security;
drop policy if exists "Allow all for notificacoes" on notificacoes;
drop policy if exists "notificacoes_owner" on notificacoes;
create policy "notificacoes_owner" on notificacoes
  for all using (cci_is_admin() or usuario_id = cci_jwt_usuario_id())
  with check (cci_is_admin() or usuario_id = cci_jwt_usuario_id());

-- ── Mensagens iniciais (cliente lê; registra visualização) ─────────
alter table cci_mensagens_iniciais enable row level security;
drop policy if exists "Allow all for cci_mensagens_iniciais" on cci_mensagens_iniciais;
drop policy if exists "mensagens_iniciais_read" on cci_mensagens_iniciais;
drop policy if exists "mensagens_iniciais_write" on cci_mensagens_iniciais;
create policy "mensagens_iniciais_read" on cci_mensagens_iniciais for select using (true);
create policy "mensagens_iniciais_write" on cci_mensagens_iniciais
  for all using (cci_is_admin()) with check (cci_is_admin());

alter table cci_mensagens_iniciais_views enable row level security;
drop policy if exists "Allow all for cci_mensagens_iniciais_views" on cci_mensagens_iniciais_views;
drop policy if exists "mensagens_views_owner" on cci_mensagens_iniciais_views;
create policy "mensagens_views_owner" on cci_mensagens_iniciais_views
  for all using (cci_is_admin() or usuario_id = cci_jwt_usuario_id())
  with check (cci_is_admin() or usuario_id = cci_jwt_usuario_id());

-- ── Relatórios BI (rede) + bridge por usuário ──────────────────────
alter table cliente_relatorios_bi enable row level security;
drop policy if exists "Allow all for cliente_relatorios_bi" on cliente_relatorios_bi;
drop policy if exists "rel_bi_sel" on cliente_relatorios_bi;
drop policy if exists "rel_bi_mod" on cliente_relatorios_bi;
create policy "rel_bi_sel" on cliente_relatorios_bi
  for select using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));
create policy "rel_bi_mod" on cliente_relatorios_bi
  for all using (cci_is_admin()) with check (cci_is_admin());

alter table cliente_relatorios_bi_usuario enable row level security;
drop policy if exists "Allow all for rel_bi_usuario" on cliente_relatorios_bi_usuario;
drop policy if exists "rel_bi_usuario_sel" on cliente_relatorios_bi_usuario;
drop policy if exists "rel_bi_usuario_mod" on cliente_relatorios_bi_usuario;
create policy "rel_bi_usuario_sel" on cliente_relatorios_bi_usuario
  for select using (cci_is_admin() or usuario_id = cci_jwt_usuario_id());
create policy "rel_bi_usuario_mod" on cliente_relatorios_bi_usuario
  for all using (cci_is_admin()) with check (cci_is_admin());

-- Nota: cci_reunioes / cci_reunioes_kpis (migr. 055) NÃO existem no banco
-- (dropadas/nunca aplicadas; sem uso no frontend) — removidas deste lote.

-- ============================================================
-- ROLLBACK (por tabela): drop das policies novas e recriar allow-all com
-- o nome ORIGINAL (ver comentários acima: "p_suporte_*_all",
-- "Insert/Select allowed for cci_uso_portal", "Allow all for rel_bi_usuario",
-- "Allow all for <tabela>" nas demais). for all using(true) with check(true).
-- ============================================================
