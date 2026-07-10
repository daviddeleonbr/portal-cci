-- 148_suporte_rls_por_usuario
-- ============================================================
-- Suporte/chat: leitura por REDE, escrita por DONO.
--
-- Regras (pedido do produto):
--   1) Isolamento por tenant (rede): já garantido por cci_rede_bate.
--   2) O usuário VÊ todas as conversas da rede (pode filtrar as próprias no front).
--   3) O usuário só INTERAGE (posta/edita) nas conversas que ELE iniciou.
--      Admin continua podendo tudo.
--
-- Antes (122): as políticas eram FOR ALL com `cci_pode_ver_conversa` no with
-- check → qualquer membro da rede podia ESCREVER em conversa alheia. Aqui
-- separamos leitura (rede) de escrita (dono/admin) por comando.
--
-- "Marcar como lido" (zera contadores + lida_em das msgs do outro lado) mexe em
-- mensagens de OUTRO autor, então não cabe na policy de update (autor-only) —
-- vira uma RPC SECURITY DEFINER autorizada (dono da conversa ou admin).
-- Idempotente.
-- ============================================================

-- ── Helper: sou o dono da conversa (ou admin)? ─────────────────────
create or replace function cci_e_dono_conversa(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cci_is_admin() or exists (
    select 1 from cci_suporte_conversa c
    where c.id = p_id and c.usuario_cliente_id = cci_jwt_usuario_id()
  )
$$;

-- ── RPC: marcar conversa como lida (contadores + lida_em) ──────────
-- Autoriza: admin (qualquer lado) OU dono da conversa (lado 'cliente').
create or replace function cci_suporte_marcar_lido(p_conversa_id uuid, p_lado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lado not in ('cliente', 'admin') then
    raise exception 'lado invalido';
  end if;
  if not (
    cci_is_admin()
    or (p_lado = 'cliente' and exists (
      select 1 from cci_suporte_conversa c
      where c.id = p_conversa_id and c.usuario_cliente_id = cci_jwt_usuario_id()
    ))
  ) then
    raise exception 'nao autorizado';
  end if;

  update cci_suporte_conversa
     set nao_lidas_cliente = case when p_lado = 'cliente' then 0 else nao_lidas_cliente end,
         nao_lidas_admin   = case when p_lado = 'admin'   then 0 else nao_lidas_admin end
   where id = p_conversa_id;

  update cci_suporte_mensagem
     set lida_em = now()
   where conversa_id = p_conversa_id
     and autor_tipo = case when p_lado = 'cliente' then 'admin' else 'cliente' end
     and lida_em is null;
end;
$$;
revoke execute on function cci_suporte_marcar_lido(uuid, text) from public;
grant execute on function cci_suporte_marcar_lido(uuid, text) to anon, authenticated, service_role;

-- ── Conversa: SELECT por rede; escrita por dono/admin ──────────────
alter table cci_suporte_conversa enable row level security;
drop policy if exists "p_suporte_conversa_all" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_tenant" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_sel" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_ins" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_upd" on cci_suporte_conversa;
drop policy if exists "suporte_conversa_del" on cci_suporte_conversa;

create policy "suporte_conversa_sel" on cci_suporte_conversa
  for select using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));

create policy "suporte_conversa_ins" on cci_suporte_conversa
  for insert with check (
    cci_is_admin() or (
      usuario_cliente_id = cci_jwt_usuario_id()
      and cci_rede_bate(chave_api_id, as_rede_id)
    )
  );

create policy "suporte_conversa_upd" on cci_suporte_conversa
  for update using (cci_is_admin() or usuario_cliente_id = cci_jwt_usuario_id())
  with check (cci_is_admin() or usuario_cliente_id = cci_jwt_usuario_id());

create policy "suporte_conversa_del" on cci_suporte_conversa
  for delete using (cci_is_admin());

-- ── Mensagem: SELECT por rede; INSERT só do dono; UPDATE só do autor ──
alter table cci_suporte_mensagem enable row level security;
drop policy if exists "p_suporte_mensagem_all" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_tenant" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_sel" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_ins" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_upd" on cci_suporte_mensagem;
drop policy if exists "suporte_mensagem_del" on cci_suporte_mensagem;

create policy "suporte_mensagem_sel" on cci_suporte_mensagem
  for select using (cci_pode_ver_conversa(conversa_id));

-- Só o dono da conversa (ou admin) posta. Fecha a Regra 3: ninguém escreve
-- em conversa de outro usuário, mesmo enxergando-a.
create policy "suporte_mensagem_ins" on cci_suporte_mensagem
  for insert with check (cci_e_dono_conversa(conversa_id));

-- Edição de texto: só o autor (ou admin). A janela de 5 min é validada no app.
-- (marcar-lido não passa por aqui — usa a RPC acima.)
create policy "suporte_mensagem_upd" on cci_suporte_mensagem
  for update using (cci_is_admin() or autor_id = cci_jwt_usuario_id())
  with check (cci_is_admin() or autor_id = cci_jwt_usuario_id());

create policy "suporte_mensagem_del" on cci_suporte_mensagem
  for delete using (cci_is_admin());

-- ============================================================
-- ROLLBACK: recriar as policies FOR ALL de 122 (using/with check com
-- cci_pode_ver_conversa / usuario_cliente_id = cci_jwt_usuario_id() or
-- cci_rede_bate) e dropar as por-comando + cci_e_dono_conversa +
-- cci_suporte_marcar_lido.
-- ============================================================
