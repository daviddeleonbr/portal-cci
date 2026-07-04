-- 109_seguranca_refresh_tokens
-- ============================================================
-- FASE 2 (backend) — armazenamento de refresh tokens para o fluxo
-- access-curto (~1h) + refresh emitido pela Edge Function `auth-login`.
--
-- Guardamos apenas o SHA-256 do refresh token (nunca o valor cru). A
-- rotação (revoga o antigo, emite um novo) acontece em `auth-refresh`.
-- Tabela é acessada SOMENTE pela service_role (Edge Functions): RLS
-- habilitada sem policy => nega anon/authenticated; service_role faz bypass.
--
-- Inerte para o app atual — nada lê/escreve isso até a Fase 2 do frontend.
-- Reversível: sim.
-- ============================================================

create table if not exists cci_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references cci_usuarios_sistema(id) on delete cascade,
  token_hash   text not null,                -- sha-256 hex do refresh token cru
  portal       text not null,                -- 'admin' | 'cliente'
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  user_agent   text
);

create index if not exists idx_cci_refresh_tokens_hash
  on cci_refresh_tokens (token_hash);
create index if not exists idx_cci_refresh_tokens_usuario
  on cci_refresh_tokens (usuario_id);

-- RLS on + sem policy => ninguém além da service_role acessa.
alter table cci_refresh_tokens enable row level security;
revoke all on cci_refresh_tokens from anon, authenticated;
