-- 111_seguranca_rls_helpers
-- ============================================================
-- FASE 3 — fundação. Funções que leem os claims do JWT emitido na Fase 2
-- (auth-login) para uso nas policies. Criar estas funções NÃO altera o
-- acesso de NENHUMA tabela — são apenas helpers. 100% seguro aplicar.
--
-- Claims disponíveis no token: cci_tipo, cci_usuario_id, chave_api_id,
-- as_rede_id, empresas_permitidas, cci_permissoes. `auth.jwt()` devolve o
-- payload do JWT atual (jsonb).
-- ============================================================

-- Tipo do usuário logado ('admin' | 'cliente' | null se anon).
create or replace function cci_jwt_tipo()
returns text language sql stable
as $$ select auth.jwt() ->> 'cci_tipo' $$;

-- Admin? (vê tudo — o portal admin gerencia todas as redes).
create or replace function cci_is_admin()
returns boolean language sql stable
as $$ select coalesce(auth.jwt() ->> 'cci_tipo', '') = 'admin' $$;

-- Rede Webposto do cliente logado (uuid) ou null.
create or replace function cci_jwt_chave_api_id()
returns uuid language sql stable
as $$ select nullif(auth.jwt() ->> 'chave_api_id', '')::uuid $$;

-- Rede Autosystem do cliente logado (uuid) ou null.
create or replace function cci_jwt_as_rede_id()
returns uuid language sql stable
as $$ select nullif(auth.jwt() ->> 'as_rede_id', '')::uuid $$;

-- Id do usuário logado (uuid) ou null.
create or replace function cci_jwt_usuario_id()
returns uuid language sql stable
as $$ select nullif(auth.jwt() ->> 'cci_usuario_id', '')::uuid $$;

-- A rede logada bate com uma linha que tem chave_api_id/as_rede_id?
-- Uso: policies de tabelas TENANT_* e TENANT_AMBOS.
--   using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id))
create or replace function cci_rede_bate(p_chave_api_id uuid, p_as_rede_id uuid)
returns boolean language sql stable
as $$
  select
    (cci_jwt_chave_api_id() is not null and p_chave_api_id = cci_jwt_chave_api_id())
    or (cci_jwt_as_rede_id() is not null and p_as_rede_id = cci_jwt_as_rede_id())
$$;

-- Pode ver a empresa (cliente_id)? admin vê tudo; cliente vê se a empresa
-- pertence à sua rede. SECURITY DEFINER pra não depender do RLS de
-- `clientes` (evita recursão/visibilidade). Uso: tabelas POR_EMPRESA.
--   using (cci_pode_ver_cliente(cliente_id))
create or replace function cci_pode_ver_cliente(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select cci_is_admin() or exists (
    select 1 from clientes c
    where c.id = p_cliente_id
      and cci_rede_bate(c.chave_api_id, c.as_rede_id)
  )
$$;
