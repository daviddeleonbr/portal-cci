-- ============================================================
-- Tokens de redefinição de senha (cci_usuarios_sistema).
--
-- Fluxo:
--   1. Usuário pede reset na tela de login → registramos um token
--      aleatório com TTL curto (1h) vinculado ao usuário.
--   2. Usuário acessa /cliente/redefinir-senha?token=...
--   3. Após troca da senha o token é marcado como usado (consumed_at)
--      pra que não possa ser reutilizado.
-- ============================================================

create table if not exists password_reset_tokens (
  id uuid default gen_random_uuid() primary key,
  token text not null unique,
  usuario_id uuid not null references cci_usuarios_sistema(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_prt_token on password_reset_tokens(token);
create index if not exists idx_prt_usuario on password_reset_tokens(usuario_id);
create index if not exists idx_prt_expires on password_reset_tokens(expires_at);

alter table password_reset_tokens enable row level security;
create policy "Allow all for password_reset_tokens" on password_reset_tokens
  for all using (true) with check (true);
