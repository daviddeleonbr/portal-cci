-- ============================================================
-- 049_mapeamento_vendas_autosystem
--
-- Mapeamento de vendas/custo por CATEGORIA DE GRUPO de produto
-- (combustivel / automotivos / conveniencia) para grupos da máscara
-- DRE (ou Fluxo).
--
-- A categorização dos grupos de produto vem de `as_rede_grupo_produto`
-- (configurada por rede em /cliente/autosystem/configuracoes). Aqui só
-- escolhemos qual grupo da DRE/Fluxo recebe a soma de cada categoria,
-- separadamente para Venda (SUM valor) e Custo (SUM valor_custo) das
-- consultas de `buscarVendasAutosystem`.
--
-- Centralizado por rede (igual mapeamento_manual_contas com as_rede_id):
-- uma configuração serve todas as empresas da rede.
-- ============================================================

create table if not exists mapeamento_vendas_autosystem (
  id              uuid primary key default gen_random_uuid(),
  as_rede_id      uuid not null references as_rede(id) on delete cascade,
  mascara_id      uuid not null,
  categoria       text not null check (categoria in ('combustivel', 'automotivos', 'conveniencia')),
  tipo            text not null check (tipo in ('venda', 'custo')),
  -- Destino: grupo_dre_id quando máscara é DRE; grupo_fluxo_id quando
  -- máscara é Fluxo de Caixa. Apenas um é preenchido por linha.
  grupo_dre_id    uuid references grupos_dre(id) on delete cascade,
  grupo_fluxo_id  uuid references grupos_fluxo_caixa(id) on delete cascade,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (as_rede_id, mascara_id, categoria, tipo),
  check (
    (grupo_dre_id is not null and grupo_fluxo_id is null)
    or (grupo_dre_id is null and grupo_fluxo_id is not null)
  )
);

create index if not exists mapeamento_vendas_as_rede_idx
  on mapeamento_vendas_autosystem (as_rede_id, mascara_id);
