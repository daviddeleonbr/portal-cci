-- Fix: adicionar 'grupo' e 'conta' nos tipos permitidos
alter table grupos_dre drop constraint if exists grupos_dre_tipo_check;
alter table grupos_dre add constraint grupos_dre_tipo_check
  check (tipo in ('grupo', 'conta', 'receita', 'deducao', 'custo', 'despesa', 'subtotal', 'resultado'));
