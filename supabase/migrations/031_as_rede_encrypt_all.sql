-- ============================================================
-- Tabela as_rede (Redes Autosystem) + criptografia COMPLETA das
-- credenciais de conexão (IP, porta, banco, usuário, senha) usando
-- Supabase Vault para armazenar a chave de criptografia.
--
-- Migration self-contained e idempotente: cria a tabela se não existir,
-- configura Vault, encripta todos os campos e migra dados plain → enc
-- caso a tabela já tenha sido criada com schema antigo (migration 030).
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists supabase_vault;

-- ============================================================
-- 1) Tabela base (compatível com schema antigo da 030)
-- ============================================================
create table if not exists as_rede (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  slug text not null unique,
  -- Colunas plain antigas (migration 030) — serão dropadas no final
  conexao_ip text,
  conexao_porta integer,
  conexao_banco text,
  conexao_usuario text,
  -- Sempre encriptada
  conexao_senha_enc text,
  ativo boolean default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_as_rede_slug on as_rede(slug);
create index if not exists idx_as_rede_ativo on as_rede(ativo);

-- Trigger de updated_at
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_as_rede_updated') then
    create trigger trg_as_rede_updated
      before update on as_rede
      for each row execute function update_updated_at();
  end if;
end$$;

alter table as_rede enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'as_rede' and policyname = 'Allow all for as_rede'
  ) then
    create policy "Allow all for as_rede" on as_rede for all using (true) with check (true);
  end if;
end$$;

-- ============================================================
-- 2) Chave de criptografia no Supabase Vault
-- ============================================================
do $$
declare v_count int;
begin
  select count(*) into v_count from vault.secrets where name = 'as_rede_encryption_key';
  if v_count = 0 then
    -- ~256 bits de entropia (dois UUIDs sem hífens). gen_random_uuid()
    -- é nativa do Postgres, não depende de schema de extensão.
    perform vault.create_secret(
      'cci-as-rede-key-'
        || replace(gen_random_uuid()::text, '-', '')
        || replace(gen_random_uuid()::text, '-', ''),
      'as_rede_encryption_key',
      'Chave de criptografia para credenciais Autosystem (as_rede)'
    );
  end if;
end$$;

-- ============================================================
-- 3) Funções de criptografia (lê chave do Vault)
-- ============================================================
create or replace function as_rede_crypto_key()
returns text
language sql
security definer
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'as_rede_encryption_key' limit 1
$$;

-- Nota: pgcrypto fica no schema `extensions` no Supabase — qualificamos
-- explicitamente pgp_sym_encrypt/pgp_sym_decrypt para evitar problema
-- de search_path em funções SECURITY DEFINER.
create or replace function as_rede_encrypt(plaintext text)
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select case
    when plaintext is null or plaintext = '' then null
    else encode(extensions.pgp_sym_encrypt(plaintext, as_rede_crypto_key()), 'base64')
  end
$$;

create or replace function as_rede_decrypt(ciphertext text)
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select case
    when ciphertext is null or ciphertext = '' then null
    else extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), as_rede_crypto_key())
  end
$$;

-- ============================================================
-- 4) Novas colunas encriptadas
-- ============================================================
alter table as_rede
  add column if not exists conexao_ip_enc text,
  add column if not exists conexao_porta_enc text,
  add column if not exists conexao_banco_enc text,
  add column if not exists conexao_usuario_enc text;

-- ============================================================
-- 5) Migra dados plaintext existentes para *_enc
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'as_rede' and column_name = 'conexao_ip'
  ) then
    execute $sql$
      update as_rede set
        conexao_ip_enc      = coalesce(conexao_ip_enc,      as_rede_encrypt(conexao_ip)),
        conexao_porta_enc   = coalesce(conexao_porta_enc,   as_rede_encrypt(conexao_porta::text)),
        conexao_banco_enc   = coalesce(conexao_banco_enc,   as_rede_encrypt(conexao_banco)),
        conexao_usuario_enc = coalesce(conexao_usuario_enc, as_rede_encrypt(conexao_usuario))
      where conexao_ip is not null or conexao_porta is not null
         or conexao_banco is not null or conexao_usuario is not null
    $sql$;
  end if;
end$$;

-- ============================================================
-- 6) Dropa colunas plaintext
-- ============================================================
alter table as_rede
  drop column if exists conexao_ip,
  drop column if exists conexao_porta,
  drop column if exists conexao_banco,
  drop column if exists conexao_usuario;

-- ============================================================
-- 7) RPC partial-update: NULL = mantém valor atual; '' = limpa
-- ============================================================
create or replace function as_rede_set_credenciais(
  p_id uuid,
  p_ip text default null,
  p_porta integer default null,
  p_banco text default null,
  p_usuario text default null,
  p_senha text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update as_rede set
    conexao_ip_enc      = case when p_ip      is null then conexao_ip_enc      else as_rede_encrypt(p_ip) end,
    conexao_porta_enc   = case when p_porta   is null then conexao_porta_enc   else as_rede_encrypt(p_porta::text) end,
    conexao_banco_enc   = case when p_banco   is null then conexao_banco_enc   else as_rede_encrypt(p_banco) end,
    conexao_usuario_enc = case when p_usuario is null then conexao_usuario_enc else as_rede_encrypt(p_usuario) end,
    conexao_senha_enc   = case when p_senha   is null then conexao_senha_enc   else as_rede_encrypt(p_senha) end,
    updated_at = now()
  where id = p_id;
end$$;

-- ============================================================
-- 8) RPC atômica: cria a rede e seta as credenciais em uma chamada
-- ============================================================
create or replace function as_rede_create_full(
  p_nome text,
  p_slug text,
  p_ativo boolean default true,
  p_ip text default null,
  p_porta integer default null,
  p_banco text default null,
  p_usuario text default null,
  p_senha text default null
)
returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  insert into as_rede (nome, slug, ativo)
    values (p_nome, p_slug, coalesce(p_ativo, true))
    returning id into v_id;
  perform as_rede_set_credenciais(v_id, p_ip, p_porta, p_banco, p_usuario, p_senha);
  return v_id;
end$$;

-- ============================================================
-- 9) RPC para obter credenciais decryptadas
-- ============================================================
-- Drop antes para evitar conflito caso retornem assinaturas diferentes
drop function if exists as_rede_get_senha(uuid);
drop function if exists as_rede_set_senha(uuid, text);
drop function if exists as_rede_get_credenciais(uuid);

create or replace function as_rede_get_credenciais(p_id uuid)
returns table (
  id uuid,
  nome text,
  slug text,
  conexao_ip text,
  conexao_porta integer,
  conexao_banco text,
  conexao_usuario text,
  conexao_senha text
)
language sql
security definer
stable
as $$
  select
    r.id,
    r.nome,
    r.slug,
    as_rede_decrypt(r.conexao_ip_enc) as conexao_ip,
    nullif(as_rede_decrypt(r.conexao_porta_enc), '')::integer as conexao_porta,
    as_rede_decrypt(r.conexao_banco_enc) as conexao_banco,
    as_rede_decrypt(r.conexao_usuario_enc) as conexao_usuario,
    as_rede_decrypt(r.conexao_senha_enc) as conexao_senha
  from as_rede r
  where r.id = p_id
$$;
