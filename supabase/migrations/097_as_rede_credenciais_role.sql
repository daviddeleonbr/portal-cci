-- ============================================================
-- Limita exposição de senha do Postgres e token HTTPS na RPC
-- `as_rede_get_credenciais`.
-- ============================================================
--
-- Antes:
--   Qualquer cliente com `anon_key` (visível no JS do front) podia
--   chamar a RPC e receber senha + token em texto plano. Vetor de
--   ataque: console do browser de qualquer visitante.
--
-- Agora:
--   - Front (anon / authenticated) recebe IP, porta, banco, usuário,
--     URL HTTPS, tipo_conexao — campos não-secretos usados no modal de
--     edição da rede. Senha e token vêm `null`.
--   - Edges (service_role) recebem TUDO, incluindo senha e token.
--
-- Implementação: usa `auth.role()` (helper Supabase que lê o role do JWT)
-- pra decidir se devolve o segredo decifrado ou `null`.
--
-- Compat: a API permanece a mesma; o front já não usa senha/token
-- (ele só preenche IP mascarado, usuário, URL pra exibir no modal).
-- Edges continuam funcionando porque autenticam com service_role.

drop function if exists as_rede_get_credenciais(uuid);

create or replace function as_rede_get_credenciais(p_id uuid)
returns table (
  id uuid,
  nome text,
  slug text,
  tipo_conexao text,
  conexao_ip text,
  conexao_porta integer,
  conexao_banco text,
  conexao_usuario text,
  conexao_senha text,
  conexao_https_url text,
  conexao_https_token text
)
language sql
security definer
stable
as $$
  select
    r.id,
    r.nome,
    r.slug,
    coalesce(r.tipo_conexao, 'tcp') as tipo_conexao,
    as_rede_decrypt(r.conexao_ip_enc) as conexao_ip,
    nullif(as_rede_decrypt(r.conexao_porta_enc), '')::integer as conexao_porta,
    as_rede_decrypt(r.conexao_banco_enc) as conexao_banco,
    as_rede_decrypt(r.conexao_usuario_enc) as conexao_usuario,
    -- Segredos: só service_role recebe. anon/authenticated recebem null.
    case when auth.role() = 'service_role'
      then as_rede_decrypt(r.conexao_senha_enc)
      else null
    end as conexao_senha,
    as_rede_decrypt(r.conexao_https_url_enc) as conexao_https_url,
    case when auth.role() = 'service_role'
      then as_rede_decrypt(r.conexao_https_token_enc)
      else null
    end as conexao_https_token
  from as_rede r
  where r.id = p_id
$$;
