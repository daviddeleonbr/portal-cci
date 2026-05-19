-- ============================================================
-- Suporte a redes Autosystem em cliente_relatorios_bi + controle
-- de acesso granular por usuário (cci_usuarios_sistema).
--
-- Antes: chave_api_id era NOT NULL (só Webposto) e cliente_id opcional
--        definia visibilidade por empresa.
--
-- Agora:
--   - Relatório pode ser de UMA das duas redes (chave_api_id XOR as_rede_id)
--   - cliente_id continua existindo para compat, mas o controle "quem
--     vê" passa a ser por cci_usuarios_sistema via tabela ponte.
--   - Se a tabela ponte estiver vazia para um relatório, ele é visível
--     a TODOS os usuários da rede (default permissivo).
-- ============================================================

-- 1) Permite as_rede_id como alternativa a chave_api_id
alter table cliente_relatorios_bi
  add column if not exists as_rede_id uuid references as_rede(id) on delete cascade;
create index if not exists idx_rel_bi_as_rede on cliente_relatorios_bi(as_rede_id);

-- chave_api_id passa a ser nullable
alter table cliente_relatorios_bi alter column chave_api_id drop not null;

-- XOR: exatamente uma das duas redes
alter table cliente_relatorios_bi drop constraint if exists chk_rel_bi_rede;
alter table cliente_relatorios_bi add constraint chk_rel_bi_rede check (
  (chave_api_id is not null and as_rede_id is null) or
  (chave_api_id is null and as_rede_id is not null)
);

-- 2) Tabela ponte: quais usuários têm acesso a quais relatórios
create table if not exists cliente_relatorios_bi_usuario (
  relatorio_id uuid not null references cliente_relatorios_bi(id) on delete cascade,
  usuario_id  uuid not null references cci_usuarios_sistema(id)  on delete cascade,
  created_at  timestamptz default now(),
  primary key (relatorio_id, usuario_id)
);

create index if not exists idx_rel_bi_user_rel on cliente_relatorios_bi_usuario(relatorio_id);
create index if not exists idx_rel_bi_user_usr on cliente_relatorios_bi_usuario(usuario_id);

alter table cliente_relatorios_bi_usuario enable row level security;
drop policy if exists "Allow all for rel_bi_usuario" on cliente_relatorios_bi_usuario;
create policy "Allow all for rel_bi_usuario" on cliente_relatorios_bi_usuario
  for all using (true) with check (true);
