-- ============================================================
-- Cache de Vendas Webposto (Quality API) no Supabase.
--
-- Por que: a API Quality é lenta pra períodos grandes (12-24k linhas
-- de VENDA_ITEM por mês × paginação). Espelhamos as vendas localmente
-- e o front passa a consultar o cache pra qualquer dia > 2 dias atrás.
-- Últimos 2 dias continuam vindo da Quality (cancelamentos tardios).
--
-- Idempotência: PK composta (chave_api_id, empresa_codigo, venda_codigo[,
-- item_sequencia]) + UPSERT via ON CONFLICT. Re-rodar o mesmo período N
-- vezes produz o mesmo resultado.
-- ============================================================

-- ─── 1) Espelho das vendas (cabeçalho) ──────────────────────
create table if not exists cci_webposto_venda (
  chave_api_id     uuid not null references chaves_api(id) on delete cascade,
  empresa_codigo   integer not null,
  venda_codigo     bigint  not null,    -- VENDA.vendaCodigo (Quality)
  data             date    not null,    -- COALESCE(dataVenda, dataEmissao, dataMovimento)
  cancelada        char(1) not null default 'N' check (cancelada in ('N','S')),
  raw              jsonb   not null,    -- objeto VENDA inteiro
  atualizada_em    timestamptz not null default now(),
  primary key (chave_api_id, empresa_codigo, venda_codigo)
);

create index if not exists idx_webposto_venda_periodo
  on cci_webposto_venda (chave_api_id, empresa_codigo, data);

-- ─── 2) Espelho dos itens de venda ──────────────────────────
create table if not exists cci_webposto_venda_item (
  chave_api_id     uuid    not null,
  empresa_codigo   integer not null,
  venda_codigo     bigint  not null,
  item_sequencia   integer not null,
  produto_codigo   bigint,
  data             date    not null,          -- denormalizada pra index por período
  quantidade       numeric(14, 4),
  total_venda      numeric(14, 4),
  total_custo      numeric(14, 4),
  total_desconto   numeric(14, 4),
  total_acrescimo  numeric(14, 4),
  icms_valor       numeric(14, 4),
  valor_pis        numeric(14, 4),
  valor_cofins     numeric(14, 4),
  valor_cbs        numeric(14, 4),
  valor_ibs        numeric(14, 4),
  raw              jsonb   not null,
  atualizada_em    timestamptz not null default now(),
  primary key (chave_api_id, empresa_codigo, venda_codigo, item_sequencia),
  foreign key (chave_api_id, empresa_codigo, venda_codigo)
    references cci_webposto_venda(chave_api_id, empresa_codigo, venda_codigo)
    on delete cascade
);

create index if not exists idx_webposto_venda_item_periodo
  on cci_webposto_venda_item (chave_api_id, empresa_codigo, data, produto_codigo);

-- ─── 3) Configuração de sync por empresa ────────────────────
create table if not exists cci_webposto_sync_config (
  chave_api_id      uuid    not null references chaves_api(id) on delete cascade,
  empresa_codigo    integer not null,
  ativo             boolean not null default false,   -- sync diária automática
  ultima_sync_em    timestamptz,
  ultima_data_sync  date,                              -- até onde está coberto
  status            text not null default 'pendente'
    check (status in ('pendente','em_progresso','ok','erro')),
  erro_mensagem     text,
  primary key (chave_api_id, empresa_codigo)
);

-- ─── 4) Log de jobs de sincronização ────────────────────────
create table if not exists cci_webposto_sync_job (
  id                uuid    not null default gen_random_uuid() primary key,
  chave_api_id      uuid    not null references chaves_api(id) on delete cascade,
  empresa_codigo    integer not null,
  tipo              text    not null
    check (tipo in ('backfill_mensal','cron_diario','manual','ad_hoc')),
  data_de           date    not null,
  data_ate          date    not null,
  status            text    not null default 'aguardando'
    check (status in ('aguardando','rodando','ok','erro')),
  vendas_inseridas  integer not null default 0,
  itens_inseridos   integer not null default 0,
  vendas_atualizadas integer not null default 0,
  vendas_canceladas_marcadas integer not null default 0,
  iniciado_em       timestamptz,
  concluido_em      timestamptz,
  erro_mensagem     text,
  disparado_por     uuid references cci_usuarios_sistema(id) on delete set null,
  criado_em         timestamptz not null default now()
);

create index if not exists idx_webposto_sync_job_empresa
  on cci_webposto_sync_job (chave_api_id, empresa_codigo, criado_em desc);
create index if not exists idx_webposto_sync_job_status
  on cci_webposto_sync_job (status, criado_em desc);

-- ─── Realtime ──────────────────────────────────────────────
-- A tela admin escuta updates de cci_webposto_sync_job pra mostrar
-- progresso em tempo real (assim como Suporte).
alter publication supabase_realtime add table cci_webposto_sync_job;
alter publication supabase_realtime add table cci_webposto_sync_config;

-- ─── RLS permissivo (padrão do projeto) ────────────────────
alter table cci_webposto_venda          enable row level security;
alter table cci_webposto_venda_item     enable row level security;
alter table cci_webposto_sync_config    enable row level security;
alter table cci_webposto_sync_job       enable row level security;

drop policy if exists p_webposto_venda_all       on cci_webposto_venda;
drop policy if exists p_webposto_venda_item_all  on cci_webposto_venda_item;
drop policy if exists p_webposto_sync_config_all on cci_webposto_sync_config;
drop policy if exists p_webposto_sync_job_all    on cci_webposto_sync_job;

create policy p_webposto_venda_all       on cci_webposto_venda       for all using (true) with check (true);
create policy p_webposto_venda_item_all  on cci_webposto_venda_item  for all using (true) with check (true);
create policy p_webposto_sync_config_all on cci_webposto_sync_config for all using (true) with check (true);
create policy p_webposto_sync_job_all    on cci_webposto_sync_job    for all using (true) with check (true);
