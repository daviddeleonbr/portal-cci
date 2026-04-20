-- ============================================================
-- Remove o tipo "conta" da mascara DRE
-- Razao: o nivel de "conta" vira do plano de contas mapeado
-- (Webposto ou manual), nao da mascara.
-- Converte todas as linhas tipo="conta" para tipo="grupo".
-- ============================================================

-- 1. Converte existentes
update grupos_dre set tipo = 'grupo' where tipo = 'conta';

-- 2. Atualiza o check constraint para nao aceitar mais "conta"
alter table grupos_dre drop constraint if exists grupos_dre_tipo_check;
alter table grupos_dre add constraint grupos_dre_tipo_check
  check (tipo in ('grupo', 'receita', 'deducao', 'custo', 'despesa', 'subtotal', 'resultado'));
