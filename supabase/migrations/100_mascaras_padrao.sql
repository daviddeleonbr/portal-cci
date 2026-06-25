-- Marca uma máscara como "padrão" por tipo (DRE e Fluxo de Caixa).
-- Os relatórios passam a vir com a máscara padrão pré-selecionada por default.
-- O índice único parcial garante que exista no máximo UMA padrão por tabela.

alter table mascaras_dre
  add column if not exists padrao boolean not null default false;

alter table mascaras_fluxo_caixa
  add column if not exists padrao boolean not null default false;

create unique index if not exists uq_mascaras_dre_padrao
  on mascaras_dre (padrao) where padrao;

create unique index if not exists uq_mascaras_fluxo_caixa_padrao
  on mascaras_fluxo_caixa (padrao) where padrao;
