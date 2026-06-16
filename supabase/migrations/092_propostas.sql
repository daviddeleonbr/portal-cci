-- ============================================================
-- Propostas comerciais
-- ============================================================
--
-- Uma proposta é um conjunto de serviços oferecidos a um cliente
-- (ou prospect) com valor, validade e status. Quando aceita, pode
-- ser convertida num Contrato (futuro).
--
-- Os itens carregam SNAPSHOT do serviço (nome, descrição, valor) pra
-- que mudanças no catálogo não afetem propostas já enviadas.

create table if not exists cci_propostas (
  id uuid default gen_random_uuid() primary key,

  -- Tomador — preferimos cliente cadastrado, mas aceitamos prospect.
  cliente_id    uuid references clientes(id) on delete set null,
  cliente_nome  text not null,
  cliente_cnpj  text,
  cliente_email text,

  -- Conteúdo
  titulo      text not null,
  descricao   text,
  observacoes text,

  -- Datas
  data_proposta date not null default current_date,
  valida_ate    date,

  -- Totais (calculados a partir dos itens, replicados aqui pra listagem rápida)
  valor_subtotal       numeric(14,2) default 0,  -- soma dos itens
  desconto_valor       numeric(14,2) default 0,  -- desconto em R$ (sobrescreve %)
  desconto_percentual  numeric(5,2)  default 0,  -- desconto em %
  valor_total          numeric(14,2) default 0,  -- subtotal − desconto

  -- Workflow
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'aceita', 'rejeitada', 'expirada', 'convertida')),
  enviada_em    timestamptz,
  aceita_em     timestamptz,
  rejeitada_em  timestamptz,

  criada_por uuid,  -- usuário admin que criou (FK opcional)

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_propostas_status        on cci_propostas(status);
create index if not exists idx_propostas_cliente       on cci_propostas(cliente_id);
create index if not exists idx_propostas_data          on cci_propostas(data_proposta desc);

create trigger trg_propostas_updated
  before update on cci_propostas
  for each row execute function update_updated_at();

-- ─── Itens da proposta ───────────────────────────────────────
create table if not exists cci_proposta_itens (
  id uuid default gen_random_uuid() primary key,
  proposta_id uuid not null references cci_propostas(id) on delete cascade,

  -- Ref opcional ao catálogo. Item pode ser "avulso" (sem servico_id) —
  -- nesse caso vale só o snapshot abaixo.
  servico_id uuid references cci_servicos_oferecidos(id) on delete set null,

  -- Snapshot do serviço no momento da proposta (preserva histórico)
  nome           text not null,
  descricao      text,
  categoria      text,
  periodicidade  text default 'mensal',

  -- Quantidade e valor (valor unitário pode ser sobrescrito do catálogo)
  quantidade      numeric(12,4) default 1,
  valor_unitario  numeric(14,2) default 0,
  valor_total     numeric(14,2) default 0,  -- quantidade * valor_unitario

  ordem int default 0,

  created_at timestamptz default now()
);

create index if not exists idx_proposta_itens_proposta on cci_proposta_itens(proposta_id);

-- ─── RLS ─────────────────────────────────────────────────────
alter table cci_propostas      enable row level security;
alter table cci_proposta_itens enable row level security;
create policy "Allow all for cci_propostas"      on cci_propostas      for all using (true) with check (true);
create policy "Allow all for cci_proposta_itens" on cci_proposta_itens for all using (true) with check (true);

grant all on cci_propostas      to anon, authenticated;
grant all on cci_proposta_itens to anon, authenticated;
