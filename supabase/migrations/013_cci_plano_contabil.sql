-- ============================================================
-- Refatoracao: Plano de Contas CONTABIL + Motivos de Movimentacao
-- ============================================================

-- ─── Atualizar cci_plano_contas ──────────────────────────────
-- Semantica nova:
--   classificacao: 'A' (Analitica, recebe lancamento) | 'S' (Sintetica, agrupa)
--   natureza: 'devedora' | 'credora'
--   grupo: 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa'

-- 1) Remover constraints antigos
alter table cci_plano_contas drop constraint if exists cci_plano_contas_tipo_check;
alter table cci_plano_contas drop constraint if exists cci_plano_contas_natureza_check;

-- 2) Migrar valores antigos antes de trocar os constraints
update cci_plano_contas set tipo = 'A' where tipo = 'analitica';
update cci_plano_contas set tipo = 'S' where tipo = 'sintetica';
update cci_plano_contas set natureza = 'credora' where natureza = 'receita';
update cci_plano_contas set natureza = 'devedora' where natureza = 'despesa';

-- 3) Renomear 'tipo' para 'classificacao' e adicionar novos constraints
alter table cci_plano_contas rename column tipo to classificacao;
alter table cci_plano_contas
  add constraint cci_plano_contas_classificacao_check
  check (classificacao in ('A', 'S'));

alter table cci_plano_contas
  add constraint cci_plano_contas_natureza_check
  check (natureza in ('devedora', 'credora'));

-- 4) Nova coluna 'grupo' (grupo contabil)
alter table cci_plano_contas
  add column if not exists grupo text not null default 'despesa';

alter table cci_plano_contas
  add constraint cci_plano_contas_grupo_check
  check (grupo in ('ativo', 'passivo', 'patrimonio', 'receita', 'despesa'));

-- 5) Mapeamento default entre natureza antiga e grupo (best-effort)
update cci_plano_contas set grupo = 'receita' where natureza = 'credora' and grupo = 'despesa';
-- Outras contas (passivo, ativo, patrimonio) precisarao ser ajustadas manualmente

-- ─── Motivos de Movimentacao ─────────────────────────────────
-- Cada motivo define AUTOMATICAMENTE o par Debito/Credito a ser usado
-- quando uma operacao financeira do tipo correspondente for lancada.

create table if not exists cci_motivos_movimentacao (
  id uuid default gen_random_uuid() primary key,
  codigo text not null unique,
  nome text not null,
  descricao text,
  tipo_operacao text not null default 'outro' check (tipo_operacao in (
    'lancamento_pagar',  -- gerar conta a pagar (provisao)
    'pagamento_pagar',   -- baixa de conta a pagar
    'lancamento_receber',
    'recebimento',
    'transferencia',
    'ajuste',
    'outro'
  )),
  conta_debito_id uuid references cci_plano_contas(id) on delete restrict,
  conta_credito_id uuid references cci_plano_contas(id) on delete restrict,
  ativo boolean default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_motivos_tipo on cci_motivos_movimentacao(tipo_operacao);
create index if not exists idx_motivos_debito on cci_motivos_movimentacao(conta_debito_id);
create index if not exists idx_motivos_credito on cci_motivos_movimentacao(conta_credito_id);

create trigger trg_cci_motivos_updated
  before update on cci_motivos_movimentacao
  for each row execute function update_updated_at();

alter table cci_motivos_movimentacao enable row level security;
create policy "Allow all for cci_motivos_movimentacao" on cci_motivos_movimentacao for all using (true) with check (true);

-- ─── Contas a Pagar: referenciar motivos ─────────────────────
-- motivo_lancamento: usado na PROVISAO (criacao da obrigacao)
-- motivo_pagamento: usado na BAIXA (registro de pagamento)
alter table cci_contas_pagar
  add column if not exists motivo_lancamento_id uuid references cci_motivos_movimentacao(id) on delete set null;

alter table cci_contas_pagar
  add column if not exists motivo_pagamento_id uuid references cci_motivos_movimentacao(id) on delete set null;

-- ─── Tabela de lancamentos contabeis (partidas dobradas) ─────
-- Cada movimentacao gera uma linha aqui com D/C.
create table if not exists cci_lancamentos_contabeis (
  id uuid default gen_random_uuid() primary key,
  data_competencia date not null,
  data_lancamento timestamptz default now(),
  motivo_id uuid references cci_motivos_movimentacao(id) on delete set null,
  conta_debito_id uuid not null references cci_plano_contas(id) on delete restrict,
  conta_credito_id uuid not null references cci_plano_contas(id) on delete restrict,
  valor numeric(14, 2) not null,
  historico text not null,
  origem_tipo text check (origem_tipo in ('conta_pagar', 'conta_receber', 'pagamento', 'ajuste', 'manual')),
  origem_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_lanc_data on cci_lancamentos_contabeis(data_competencia);
create index if not exists idx_lanc_debito on cci_lancamentos_contabeis(conta_debito_id);
create index if not exists idx_lanc_credito on cci_lancamentos_contabeis(conta_credito_id);
create index if not exists idx_lanc_origem on cci_lancamentos_contabeis(origem_tipo, origem_id);

alter table cci_lancamentos_contabeis enable row level security;
create policy "Allow all for cci_lancamentos_contabeis" on cci_lancamentos_contabeis for all using (true) with check (true);
