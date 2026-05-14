-- ============================================================
-- Suporte a usuários do portal Autosystem.
--
-- Cada usuário tipo=cliente passa a ter um vínculo EXCLUSIVO com
-- UMA das duas redes:
--   - chave_api_id (rede Webposto/Quality)  → portal Webposto
--   - as_rede_id   (rede Autosystem)        → portal Autosystem
--
-- Admin continua sem nenhum dos dois.
-- ============================================================

alter table cci_usuarios_sistema
  add column if not exists as_rede_id uuid references as_rede(id) on delete set null;

create index if not exists idx_cci_usuarios_as_rede on cci_usuarios_sistema(as_rede_id);

-- Remove constraint antiga (exigia chave_api_id) e cria nova com XOR
alter table cci_usuarios_sistema drop constraint if exists chk_chave_api_vinculo;

alter table cci_usuarios_sistema add constraint chk_rede_vinculo check (
  (
    tipo = 'admin'
    and chave_api_id is null
    and as_rede_id is null
  )
  or (
    tipo = 'cliente'
    and (
      (chave_api_id is not null and as_rede_id is null)
      or (chave_api_id is null and as_rede_id is not null)
    )
  )
);
