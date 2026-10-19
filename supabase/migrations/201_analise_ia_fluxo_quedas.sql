-- 201_analise_ia_fluxo_quedas
-- Nova aba de análise de IA: "fluxo_quedas" — investigação das quedas do
-- fluxo de caixa (saldo, entradas, saídas), por empresa, gerada no admin.
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
  check (aba in ('vendas', 'dre', 'fluxo', 'geral', 'fluxo_quedas'));
