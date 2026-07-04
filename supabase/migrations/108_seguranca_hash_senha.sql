-- 108_seguranca_hash_senha
-- ============================================================
-- FASE 1 do plano de segurança (opção 2) — hash de senha com DUAL-READ.
--
-- Adiciona `senha_hash` (bcrypt via pgcrypto) e gera o hash a partir do
-- texto puro existente. MANTÉM a coluna `senha` por enquanto: o login
-- atual continua comparando o texto puro no cliente até a Fase 2 trocar
-- para a Edge Function `auth-login`. Ou seja, esta migration NÃO muda o
-- comportamento de login — só prepara o terreno e é 100% reversível
-- (basta ignorar/soltar `senha_hash`). O drop de `senha` fica na Fase 7.
--
-- Reversível: sim. Ponto de não-retorno: nenhum.
-- ============================================================

-- pgcrypto vive no schema `extensions` no Supabase.
create extension if not exists pgcrypto with schema extensions;

-- 1) Coluna de hash (idempotente).
alter table cci_usuarios_sistema
  add column if not exists senha_hash text;

-- 2) Backfill: bcrypt do texto puro, só onde ainda não há hash e há senha.
--    Custo 10 (gen_salt('bf', 10)) — equilíbrio padrão.
update cci_usuarios_sistema
   set senha_hash = extensions.crypt(senha, extensions.gen_salt('bf', 10))
 where senha_hash is null
   and senha is not null
   and senha <> '';

-- 3) Verificação server-side (usada pela Edge Function auth-login na Fase 2).
--    SECURITY DEFINER e NÃO exposta ao anon — nunca retorna o hash, só um
--    booleano. Compara re-hasheando a senha informada com o salt embutido
--    no hash armazenado (crypt(p_senha, hash) == hash).
create or replace function cci_verificar_senha(p_email text, p_senha text)
returns table (id uuid, valido boolean)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select
    u.id,
    (u.senha_hash is not null
      and u.senha_hash = extensions.crypt(p_senha, u.senha_hash)) as valido
  from cci_usuarios_sistema u
  where u.email = lower(trim(p_email))
  limit 1
$$;

-- Só a service_role (Edge Function auth-login) pode chamar. Fecha para
-- anon/authenticated/public — o navegador não verifica senha direto.
revoke execute on function cci_verificar_senha(text, text) from public;
grant  execute on function cci_verificar_senha(text, text) to service_role;

-- Nota Fase 2/7: quando o auth-login estiver ativo e validado, criar uma
-- migration para (a) definir `senha_hash` como fonte única e (b) dropar a
-- coluna `senha` em texto puro.
