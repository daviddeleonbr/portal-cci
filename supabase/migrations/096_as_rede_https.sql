-- ============================================================
-- Suporte a conexão HTTPS (Cloudflare Tunnel) na rede Autosystem.
-- ============================================================
--
-- Cada rede agora pode usar 1 de 2 modos:
--   tipo_conexao='tcp'   → conexão TCP direta no Postgres do cliente
--                          (modo atual: IP externo, porta, banco, etc).
--   tipo_conexao='https' → as edge functions enviam POST `/query`
--                          (sql + params) pro proxy HTTPS no servidor
--                          do cliente, exposto via Cloudflare Tunnel.
--                          Sem porta aberta no firewall do cliente.
--
-- A URL e o token Bearer também ficam cifrados via Vault (mesma chave
-- usada pra senha do PG).

alter table as_rede
  add column if not exists tipo_conexao text default 'tcp'
    check (tipo_conexao in ('tcp', 'https')),
  add column if not exists conexao_https_url_enc   text,
  add column if not exists conexao_https_token_enc text;

-- ─── RPC: set_credenciais expandido ──────────────────────────────
-- Mantém a regra anterior: NULL = não mexer; '' = limpa.
-- Os parâmetros HTTPS são opcionais — só fazem sentido em tipo='https'.
drop function if exists as_rede_set_credenciais(uuid, text, integer, text, text, text);

create or replace function as_rede_set_credenciais(
  p_id uuid,
  p_ip text default null,
  p_porta integer default null,
  p_banco text default null,
  p_usuario text default null,
  p_senha text default null,
  p_tipo text default null,                -- 'tcp' | 'https'
  p_https_url text default null,
  p_https_token text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update as_rede set
    conexao_ip_enc          = case when p_ip          is null then conexao_ip_enc          else as_rede_encrypt(p_ip) end,
    conexao_porta_enc       = case when p_porta       is null then conexao_porta_enc       else as_rede_encrypt(p_porta::text) end,
    conexao_banco_enc       = case when p_banco       is null then conexao_banco_enc       else as_rede_encrypt(p_banco) end,
    conexao_usuario_enc     = case when p_usuario     is null then conexao_usuario_enc     else as_rede_encrypt(p_usuario) end,
    conexao_senha_enc       = case when p_senha       is null then conexao_senha_enc       else as_rede_encrypt(p_senha) end,
    conexao_https_url_enc   = case when p_https_url   is null then conexao_https_url_enc   else as_rede_encrypt(p_https_url) end,
    conexao_https_token_enc = case when p_https_token is null then conexao_https_token_enc else as_rede_encrypt(p_https_token) end,
    tipo_conexao            = coalesce(p_tipo, tipo_conexao),
    updated_at              = now()
  where id = p_id;
end$$;

-- ─── RPC: get_credenciais retorna também os campos HTTPS ──────────
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
    as_rede_decrypt(r.conexao_senha_enc) as conexao_senha,
    as_rede_decrypt(r.conexao_https_url_enc) as conexao_https_url,
    as_rede_decrypt(r.conexao_https_token_enc) as conexao_https_token
  from as_rede r
  where r.id = p_id
$$;

-- ─── RPC: create_full agora aceita tipo + campos HTTPS ────────────
drop function if exists as_rede_create_full(text, text, boolean, text, integer, text, text, text);

create or replace function as_rede_create_full(
  p_nome text,
  p_slug text,
  p_ativo boolean default true,
  p_ip text default null,
  p_porta integer default null,
  p_banco text default null,
  p_usuario text default null,
  p_senha text default null,
  p_tipo text default 'tcp',
  p_https_url text default null,
  p_https_token text default null
)
returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  insert into as_rede (nome, slug, ativo, tipo_conexao)
    values (p_nome, p_slug, coalesce(p_ativo, true), coalesce(p_tipo, 'tcp'))
    returning id into v_id;
  perform as_rede_set_credenciais(
    v_id, p_ip, p_porta, p_banco, p_usuario, p_senha,
    p_tipo, p_https_url, p_https_token
  );
  return v_id;
end$$;
