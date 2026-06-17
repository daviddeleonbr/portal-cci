-- ============================================================
-- Mascara a URL do túnel HTTPS na resposta da RPC pra anon/authenticated.
-- ============================================================
--
-- Antes: front via URL completa `https://banco-teste.tuneiscci.app.br`
--        (identifica o cliente pelo subdomínio).
-- Agora: front vê `https://ba***te.tuneiscci.app.br` — preserva domínio
--        raiz pra debug, esconde subdomínio. Edges seguem vendo URL completa.

-- ─── Função utilitária: mascara o subdomínio de uma URL ──────────
-- Mantém scheme + domínio raiz, mascara só o primeiro label do host.
-- Subdomínio ≥ 6 chars: revela 2 primeiros + 2 últimos.
-- Subdomínio < 6 chars: todo mascarado.
-- Input vazio/null → null.
create or replace function as_rede_mascarar_url(p_url text)
returns text
language plpgsql
immutable
as $$
declare
  v_scheme text;
  v_host text;
  v_parts text[];
  v_sub text;
  v_resto text;
  v_sub_mask text;
begin
  if p_url is null or p_url = '' then return null; end if;

  v_scheme := substring(p_url from '^([a-z]+://)');
  v_host   := substring(p_url from '^[a-z]+://([^/]+)');
  if v_host is null then return p_url; end if;

  v_parts := string_to_array(v_host, '.');
  if array_length(v_parts, 1) < 2 then return p_url; end if;

  v_sub   := v_parts[1];
  v_resto := array_to_string(v_parts[2:array_length(v_parts, 1)], '.');

  if char_length(v_sub) >= 6 then
    v_sub_mask := substr(v_sub, 1, 2) || '***' || substr(v_sub, char_length(v_sub) - 1, 2);
  else
    v_sub_mask := '***';
  end if;

  return v_scheme || v_sub_mask || '.' || v_resto;
end;
$$;

-- ─── Atualiza a RPC: URL mascarada pra anon, completa pra service_role ─
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
    -- Senha + token: só pra service_role (edges). Outros: null.
    case when auth.role() = 'service_role'
      then as_rede_decrypt(r.conexao_senha_enc)
      else null
    end as conexao_senha,
    -- URL: completa pra service_role; mascarada pros demais.
    case when auth.role() = 'service_role'
      then as_rede_decrypt(r.conexao_https_url_enc)
      else as_rede_mascarar_url(as_rede_decrypt(r.conexao_https_url_enc))
    end as conexao_https_url,
    case when auth.role() = 'service_role'
      then as_rede_decrypt(r.conexao_https_token_enc)
      else null
    end as conexao_https_token
  from as_rede r
  where r.id = p_id
$$;
