-- Pedidos de compra (cliente Autosystem)
-- Fluxo: solicitante (usuário cliente) cria pedido com itens → envia pra
-- liberação → liberador aprova integralmente ou parcialmente → registro
-- fica disponível pra acompanhamento e geração futura de OC efetiva.

-- Cabeçalho
create table if not exists cci_pedidos_compra (
  id                  uuid primary key default gen_random_uuid(),

  -- Escopo
  chave_api_id        uuid references chaves_api(id) on delete cascade,
  cliente_id          uuid references clientes(id) on delete set null, -- empresa
  empresa_codigo      int,
  fornecedor          text,

  -- Texto livre
  observacoes         text,

  -- Status do funil
  -- rascunho: ainda sendo montado pelo solicitante
  -- aguardando_liberacao: enviado pro liberador
  -- liberado_parcial: parcialmente liberado
  -- liberado_total: totalmente liberado
  -- recusado: rejeitado por completo
  -- concluido: compra efetivada
  status              text not null default 'rascunho',

  -- Totais (atualizados via service quando itens mudam)
  total_solicitado    numeric(12, 2) default 0,
  total_liberado      numeric(12, 2) default 0,

  -- Auditoria
  criado_por          uuid references cci_usuarios_sistema(id) on delete set null,
  criado_em           timestamptz default now(),
  atualizado_em       timestamptz default now(),
  enviado_em          timestamptz,
  liberado_em         timestamptz,
  liberado_por        uuid references cci_usuarios_sistema(id) on delete set null
);

create index if not exists idx_pedidos_compra_chave   on cci_pedidos_compra(chave_api_id);
create index if not exists idx_pedidos_compra_cliente on cci_pedidos_compra(cliente_id);
create index if not exists idx_pedidos_compra_status  on cci_pedidos_compra(status);
create index if not exists idx_pedidos_compra_criado  on cci_pedidos_compra(criado_em desc);

-- Itens do pedido
create table if not exists cci_pedidos_compra_item (
  id                       uuid primary key default gen_random_uuid(),
  pedido_id                uuid not null references cci_pedidos_compra(id) on delete cascade,

  -- Produto (snapshot — não depende de tabela espelho)
  produto_codigo           text not null,
  produto_nome             text,
  grupo                    text,
  subgrupo                 text,

  -- Quantidades + preços
  quantidade_solicitada    numeric(14, 4) not null default 0,
  quantidade_liberada      numeric(14, 4) default 0,
  custo_unitario           numeric(12, 4) default 0,
  preco_unitario           numeric(12, 4) default 0,

  -- Estado da análise de estoque no momento do pedido (snapshot pra histórico)
  estoque_atual            numeric(14, 4),
  status_estoque           text, -- 'ruptura' | 'critico' | 'baixo' | 'ok' | 'excesso' | 'parado' | 'inativo'
  cobertura_dias           numeric(8, 2),

  -- Status do item: pendente | liberado | recusado
  status                   text not null default 'pendente',

  observacao_solicitante   text,
  observacao_liberador     text,

  criado_em                timestamptz default now(),
  atualizado_em            timestamptz default now()
);

create index if not exists idx_pedidos_compra_item_pedido on cci_pedidos_compra_item(pedido_id);

-- RLS permissivo (compatível com padrão do projeto)
alter table cci_pedidos_compra      enable row level security;
alter table cci_pedidos_compra_item enable row level security;
create policy "todos" on cci_pedidos_compra      for all using (true) with check (true);
create policy "todos" on cci_pedidos_compra_item for all using (true) with check (true);

-- Triggers atualizada_em
create or replace function cci_pedidos_set_atualizada_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_cci_pedidos_compra_atualizada_em
  before update on cci_pedidos_compra
  for each row execute function cci_pedidos_set_atualizada_em();

create trigger trg_cci_pedidos_compra_item_atualizada_em
  before update on cci_pedidos_compra_item
  for each row execute function cci_pedidos_set_atualizada_em();
