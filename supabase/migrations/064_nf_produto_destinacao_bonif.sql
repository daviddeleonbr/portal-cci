-- ============================================================
-- A destinação (estoque / uso e consumo) é POR PRODUTO, não pela nota
-- inteira — porque a mesma NF pode trazer itens para revenda misturados
-- com material de consumo.
--
-- Também marcamos quando um item é bonificação (vem com qtd > 0 e valor
-- unitário zero — não soma no total da NF). A CCI lança como bonificação
-- ao fechar.
-- ============================================================

alter table nf_manifestacao_produto
  add column if not exists tipo_destinacao text
    check (tipo_destinacao in ('estoque', 'uso_consumo')),
  add column if not exists bonificacao boolean not null default false;

create index if not exists idx_nf_manif_produto_destinacao
  on nf_manifestacao_produto(nf_manifestacao_id, tipo_destinacao);

-- A coluna nf_manifestacao.tipo_destinacao é deprecated. Não dropamos
-- para preservar histórico de notas já preenchidas; só paramos de usar.
