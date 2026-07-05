-- 131_seguranca_drop_senha
-- ============================================================
-- Etapa C — remove o texto puro de vez.
--
-- Pré-condição (garantida pelas migrations 108/130): todo usuário com senha
-- tem `senha_hash`; nada mais grava `senha` (usuariosSistemaService e as
-- Edge Functions auth-* usam cci_definir_senha / cci_admin_definir_senha).
--
-- 1) cci_verificar_senha vira HASH-ONLY (remove o fallback de texto puro que
--    a 110 havia adicionado — não é mais necessário).
-- 2) cci_definir_senha para de zerar `senha` (a coluna vai deixar de existir).
-- 3) DROP da coluna `senha`.
--
-- As funções são redefinidas ANTES do drop (para não referenciarem a coluna).
-- ============================================================

-- 1) verificação: só hash.
create or replace function cci_verificar_senha(p_email text, p_senha text)
returns table (id uuid, valido boolean)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select
    u.id,
    (u.senha_hash is not null and u.senha_hash = extensions.crypt(p_senha, u.senha_hash)) as valido
  from cci_usuarios_sistema u
  where u.email = lower(trim(p_email))
  limit 1
$$;

-- 2) setter: só hash (sem tocar em `senha`).
create or replace function cci_definir_senha(p_usuario_id uuid, p_senha text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update cci_usuarios_sistema
     set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario_id;
$$;

-- 3) adeus, texto puro.
alter table cci_usuarios_sistema drop column if exists senha;

-- ============================================================
-- ROLLBACK: não há caminho automático (a coluna foi removida). Se precisar
-- reverter, restaure de backup. Antes de aplicar, confirme que login,
-- criação/edição de usuário, reset e primeiro-acesso funcionam (etapa A+B).
-- ============================================================
