-- ============================================================
-- 188 — Banco Inter: admin N3 tem acesso total
--
-- Regra do portal: admin nível 3 tem TODAS as permissões de admin (não
-- depende da lista marcada — ninguém gere um N3, nem ele mesmo). Aqui o
-- acesso às tabelas do Inter passa a aceitar N3 além da permissão explícita.
-- ============================================================

create or replace function cci_pode_banco_inter()
returns boolean language sql stable
as $$
  select cci_is_admin()
     and (
       coalesce(cci_nivel_admin(), 0) = 3
       or coalesce((auth.jwt() -> 'cci_permissoes') ? 'banco_inter', false)
     );
$$;
