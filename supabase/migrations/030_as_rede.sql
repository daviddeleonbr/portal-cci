-- ============================================================
-- Tabela as_rede (Redes Autosystem)
-- Armazena credenciais de conexão (IP, porta, banco, usuário, senha)
-- com a senha criptografada via pgcrypto/pgp_sym_encrypt.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists as_rede (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  slug text not null unique,

  -- Conexão com o servidor Autosystem (banco remoto)
  conexao_ip text,
  conexao_porta integer,
  conexao_banco text,
  conexao_usuario text,
  -- Senha armazenada criptografada (pgp_sym_encrypt) em base64.
  -- Nunca trafega ou é exibida em texto puro fora das RPCs dedicadas.
  conexao_senha_enc text,

  ativo boolean default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_as_rede_slug on as_rede(slug);
create index if not exists idx_as_rede_ativo on as_rede(ativo);

create trigger trg_as_rede_updated
  before update on as_rede
  for each row execute function update_updated_at();

alter table as_rede enable row level security;
create policy "Allow all for as_rede" on as_rede for all using (true) with check (true);

-- ============================================================
-- Funções de criptografia
-- ============================================================
-- A chave fica embutida na função (security definer impede leitura
-- por usuários comuns). Para rotação em produção: atualizar a chave
-- e re-encrypt dos valores existentes.
create or replace function as_rede_crypto_key()
returns text
language sql
immutable
security definer
as $$
  select 'cci-as-rede-encryption-key-v1-change-in-prod'::text
$$;

create or replace function as_rede_encrypt(plaintext text)
returns text
language sql
volatile
security definer
as $$
  select case
    when plaintext is null or plaintext = '' then null
    else encode(pgp_sym_encrypt(plaintext, as_rede_crypto_key()), 'base64')
  end
$$;

create or replace function as_rede_decrypt(ciphertext text)
returns text
language sql
volatile
security definer
as $$
  select case
    when ciphertext is null or ciphertext = '' then null
    else pgp_sym_decrypt(decode(ciphertext, 'base64'), as_rede_crypto_key())
  end
$$;

-- ============================================================
-- RPC para atualizar a senha (recebe plaintext, armazena cifrado)
-- ============================================================
create or replace function as_rede_set_senha(p_id uuid, p_senha text)
returns void
language plpgsql
security definer
as $$
begin
  update as_rede
  set conexao_senha_enc = as_rede_encrypt(p_senha),
      updated_at = now()
  where id = p_id;
end;
$$;

-- ============================================================
-- RPC para recuperar as credenciais completas (com senha em plaintext).
-- Use apenas no momento de conectar ao Autosystem.
-- ============================================================
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
as $$
  select
    r.id,
    r.nome,
    r.slug,
    r.conexao_ip,
    r.conexao_porta,
    r.conexao_banco,
    r.conexao_usuario,
    as_rede_decrypt(r.conexao_senha_enc) as conexao_senha
  from as_rede r
  where r.id = p_id
$$;
