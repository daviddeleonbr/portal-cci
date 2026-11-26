-- 232_analise_ia_controller
-- Análise "controller" (Análise de IA): investigação das causas da variação do
-- caixa com o pacote de evidências (fluxo × DRE × transferências entre empresas ×
-- capital de giro × combustíveis). Salva na mesma tabela, aba 'controller'.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'analise_ia_relatorios'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%aba%' loop
    execute format('alter table analise_ia_relatorios drop constraint %I', c.conname);
  end loop;
end $$;
alter table analise_ia_relatorios add constraint analise_ia_relatorios_aba_check
  check (aba in ('vendas', 'dre', 'fluxo', 'geral', 'fluxo_quedas', 'controller'));
