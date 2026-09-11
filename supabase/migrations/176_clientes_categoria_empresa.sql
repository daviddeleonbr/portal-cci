-- ============================================================
-- Categoria da empresa (Autosystem): Posto / Conveniência / Outros /
-- Unificado. "Unificado" = empresas em que posto e conveniência estão
-- no mesmo CNPJ (rótulo informativo). Cada empresa é uma linha em
-- `clientes` (as_rede_id preenchido). Coluna opcional (null = sem categoria).
-- Mudança ADITIVA.
-- ============================================================

alter table clientes
  add column if not exists categoria_empresa text;

alter table clientes
  drop constraint if exists clientes_categoria_empresa_check;
alter table clientes
  add constraint clientes_categoria_empresa_check
  check (categoria_empresa is null
    or categoria_empresa in ('posto', 'conveniencia', 'outros', 'unificado'));
