-- Solicitações de orçamento vindas da landing page.
-- Cliente potencial preenche wizard (dados pessoais + estrutura + simulador
-- BPO) → admin visualiza, analisa e envia proposta.

create table if not exists cci_orcamento_solicitacoes (
  id                  uuid primary key default gen_random_uuid(),

  -- Passo 1: Dados do solicitante
  nome                text not null,
  whatsapp            text not null,
  email               text,
  empresa             text,

  -- Passo 2: Sobre a estrutura e o desejo (texto livre)
  estrutura           text,
  desejo              text,

  -- Passo 3: Simulador BPO (todos numericos)
  notas_fiscais_mes           int  default 0,
  litros_vendidos_mes         int  default 0,
  caixas_pdv_mes              int  default 0,
  contas_bancarias            int  default 0,
  transacoes_cartao_frota_mes int  default 0,
  bicos_bombas                int  default 0,
  funcionarios_internos       int  default 0,
  custo_medio_funcionario     numeric(12, 2) default 0,

  -- Resultados calculados (salvos pra historico mesmo se a formula mudar)
  valor_mensal_estimado       numeric(12, 2),
  custo_interno_atual         numeric(12, 2),
  economia_mensal             numeric(12, 2),
  economia_anual              numeric(12, 2),

  -- Status do funil de propostas
  status              text not null default 'nova', -- nova | em_analise | proposta_enviada | aceita | recusada | arquivada
  observacoes_admin   text,

  criada_em           timestamptz default now(),
  atualizada_em       timestamptz default now()
);

create index if not exists idx_cci_orcamento_status      on cci_orcamento_solicitacoes(status);
create index if not exists idx_cci_orcamento_criada_em   on cci_orcamento_solicitacoes(criada_em desc);

alter table cci_orcamento_solicitacoes enable row level security;
create policy "todos" on cci_orcamento_solicitacoes for all using (true) with check (true);

-- Trigger atualizada_em
create or replace function cci_orcamento_set_atualizada_em()
returns trigger as $$
begin
  new.atualizada_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_cci_orcamento_atualizada_em
  before update on cci_orcamento_solicitacoes
  for each row execute function cci_orcamento_set_atualizada_em();
