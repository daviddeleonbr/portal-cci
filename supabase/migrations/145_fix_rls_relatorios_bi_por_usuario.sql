-- FIX DE SEGURANÇA: relatórios de BI restritos a usuários específicos estavam
-- aparecendo para TODOS os usuários da rede (fail-open).
--
-- Causa (dois problemas somados):
--   1) A policy de SELECT de cliente_relatorios_bi (rel_bi_sel, migr. 122) filtrava
--      só por REDE (cci_rede_bate), nunca por usuário. O banco entregava todos os
--      relatórios da rede a qualquer usuário dela.
--   2) A restrição por-usuário só era tentada no client (relatoriosBiService
--      .listarParaCliente): "relatório sem linha na ponte = público". Mas a policy
--      de SELECT da ponte (rel_bi_usuario_sel) só deixa o usuário ver as PRÓPRIAS
--      linhas (usuario_id = cci_jwt_usuario_id()). Para um relatório restrito a
--      OUTRO usuário, o client via zero linhas -> tratava como público -> mostrava.
--
-- Fix: impõe a visibilidade por-usuário no PRÓPRIO SELECT de cliente_relatorios_bi,
-- via helper SECURITY DEFINER que lê a ponte inteira (sem depender da RLS dela).
-- A regra de negócio é a mesma do service: sem linhas na ponte = visível pra rede;
-- com linhas = só para os usuários listados.

create or replace function cci_pode_ver_relatorio_bi(p_relatorio_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  -- SECURITY DEFINER: lê a ponte inteira, ignorando a RLS por-usuário dela.
  -- auth.jwt() continua sendo o do chamador (claim da requisição), então
  -- cci_jwt_usuario_id() identifica o usuário logado normalmente.
  select
    not exists (
      select 1 from cliente_relatorios_bi_usuario u
      where u.relatorio_id = p_relatorio_id
    )
    or exists (
      select 1 from cliente_relatorios_bi_usuario u
      where u.relatorio_id = p_relatorio_id
        and u.usuario_id = cci_jwt_usuario_id()
    );
$$;

revoke all on function cci_pode_ver_relatorio_bi(uuid) from public;
grant execute on function cci_pode_ver_relatorio_bi(uuid) to anon, authenticated;

-- Refaz o SELECT: admin vê tudo; cliente vê da sua rede E (sem restrição OU
-- estando autorizado no relatório).
drop policy if exists "rel_bi_sel" on cliente_relatorios_bi;
create policy "rel_bi_sel" on cliente_relatorios_bi
  for select using (
    cci_is_admin()
    or (cci_rede_bate(chave_api_id, as_rede_id) and cci_pode_ver_relatorio_bi(id))
  );
