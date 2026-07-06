-- ============================================================
-- Segurança por usuário — FUNDAÇÃO + FASE A
--
-- Contexto: o JWT já carrega `cci_permissoes` (array de permissões) e
-- `empresas_permitidas` (uuid[] de clientes/empresas; ausente = todas), mas
-- NENHUMA policy usava esses claims. Ou seja, empresa e permissão por-feature
-- eram impostas só na UI. Um usuário restrito à empresa A conseguia, chamando
-- a API direto, ler dados da empresa B da mesma rede.
--
-- Esta migration:
--   1) FUNDAÇÃO: cria helpers cci_tem_permissao() e cci_empresa_liberada().
--   2) FASE A: faz cci_pode_ver_cliente() TAMBÉM exigir empresas_permitidas.
--      Como todas as tabelas POR_EMPRESA usam esse helper no `using`, isso
--      aperta TODAS de uma vez — o usuário passa a ver no banco só os dados
--      das empresas liberadas pra ele.
--
-- Fases B (cci_tem_permissao nos portões de cada feature: RLS + RPCs definer +
-- edge functions) e C (Quality API/CORS) vêm depois.
-- ============================================================

-- ── FUNDAÇÃO ─────────────────────────────────────────────────

-- Tem a permissão por-feature? admin sempre; senão, o claim cci_permissoes
-- (array) precisa conter a permissão. Claim ausente => sem permissão.
-- INVOKER (só lê auth.jwt(), não toca tabela).
create or replace function cci_tem_permissao(p_perm text)
returns boolean language sql stable
as $$
  select cci_is_admin()
      or coalesce((auth.jwt() -> 'cci_permissoes') ? p_perm, false);
$$;

-- A empresa (cliente_id) está liberada para este usuário?
--   - claim `empresas_permitidas` AUSENTE ou VAZIO => todas as empresas da rede
--   - array não-vazio                              => o cliente_id precisa estar na lista
-- IMPORTANTE: espelha exatamente a regra do loginCliente (src/lib/auth.js:154):
-- `permitidas && permitidas.length > 0 ? filtra : todas`. Tratar vazio como
-- "todas" evita quebrar quem tem [] salvo. Só a restrição por-empresa (a rede é
-- checada no cci_pode_ver_cliente). INVOKER (só lê auth.jwt()).
create or replace function cci_empresa_liberada(p_cliente_id uuid)
returns boolean language sql stable
as $$
  select
    not (auth.jwt() ? 'empresas_permitidas')
    or jsonb_array_length(auth.jwt() -> 'empresas_permitidas') = 0
    or (auth.jwt() -> 'empresas_permitidas') ? p_cliente_id::text;
$$;

-- ── FASE A: empresas_permitidas em toda tabela POR_EMPRESA ───
-- Reescreve cci_pode_ver_cliente: além da rede, exige que a empresa esteja
-- liberada para o usuário. admin continua vendo tudo. Mantém SECURITY DEFINER
-- (lê `clientes` sem depender da RLS dela) + search_path travado.
create or replace function cci_pode_ver_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select cci_is_admin() or (
    exists (
      select 1 from clientes c
      where c.id = p_cliente_id
        and cci_rede_bate(c.chave_api_id, c.as_rede_id)
    )
    and cci_empresa_liberada(p_cliente_id)
  );
$$;
