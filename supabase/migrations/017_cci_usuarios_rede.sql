-- ============================================================
-- Migra vinculo do usuario: agora ligado a REDE (chave_api),
-- nao a uma empresa (cliente) especifica. O usuario cliente
-- passa a ter acesso a todas as empresas da sua rede.
-- ============================================================

-- 1. Remove constraint antiga que exigia cliente_id
alter table cci_usuarios_sistema drop constraint if exists chk_cliente_id_vinculo;

-- 2. Adiciona chave_api_id (a "rede")
alter table cci_usuarios_sistema
  add column if not exists chave_api_id uuid references chaves_api(id) on delete set null;

create index if not exists idx_cci_usuarios_chave on cci_usuarios_sistema(chave_api_id);

-- 3. Remove coluna cliente_id (substituida por chave_api_id)
alter table cci_usuarios_sistema drop column if exists cliente_id;

-- 4. Nova constraint: tipo=cliente exige chave_api_id; tipo=admin nao deve ter
alter table cci_usuarios_sistema add constraint chk_chave_api_vinculo check (
  (tipo = 'cliente' and chave_api_id is not null)
  or (tipo = 'admin' and chave_api_id is null)
);
