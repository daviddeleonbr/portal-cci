-- ============================================================
-- Vínculo entre os itens da calculadora de precificação e os
-- serviços do catálogo (cci_servicos_oferecidos).
--
-- Cada `item_key` (taxa_base, nota_entrada, lmc_litro, lmc_bico,
-- caixa, conta, cartao) aponta pra um serviço. O preço cobrado
-- passa a vir do `valor` do serviço vinculado; sem vínculo, a
-- calculadora usa a constante padrão do código.
-- ============================================================

create table if not exists cci_precificacao_vinculo (
  item_key   text primary key,
  servico_id uuid references cci_servicos_oferecidos(id) on delete set null,
  updated_at timestamptz default now()
);

alter table cci_precificacao_vinculo enable row level security;
create policy "Allow all for cci_precificacao_vinculo"
  on cci_precificacao_vinculo for all using (true) with check (true);

grant all on cci_precificacao_vinculo to anon, authenticated;
