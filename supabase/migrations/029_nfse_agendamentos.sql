-- ============================================================
-- Agendamento recorrente de emissao de NFS-e (Asaas).
-- Cada linha representa uma "regra" de emissao automatica para
-- um tomador especifico, em determinados dias do mes.
-- A execucao real e feita por job/cron externo (Edge Function ou
-- equivalente) que le proxima_emissao = hoje e dispara o Asaas.
-- ============================================================

create table if not exists nfse_agendamentos (
  id uuid default gen_random_uuid() primary key,
  asaas_config_id uuid not null references configuracoes_asaas(id) on delete cascade,

  -- Tomador (cliente_id e opcional — se preenchido, vincula ao cadastro)
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_cnpj text not null,
  cliente_email text,

  -- Servico
  descricao_servico text not null,
  observacoes text,
  valor numeric(14, 2) not null,
  deducoes numeric(14, 2) default 0,
  aliquota_iss numeric(6, 4),
  municipio_servico_id text,
  municipio_servico_codigo text,
  municipio_servico_descricao text,

  -- Recorrencia
  -- frequencia: por enquanto suportamos 'mensal' (dispara no dia_do_mes informado)
  frequencia text not null default 'mensal' check (frequencia in ('mensal')),
  dia_do_mes int not null check (dia_do_mes between 1 and 31),
  data_inicio date not null default current_date,    -- a partir de quando comeca
  data_fim date,                                      -- opcional: limite (null = perpetuo)

  -- Estado
  proxima_emissao date,        -- calculado pelo job; UI tambem pode atualizar
  ultima_emissao date,         -- ultima vez que rodou com sucesso
  ultimo_erro text,            -- mensagem de erro da ultima tentativa (se houve)
  ativo boolean not null default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_nfse_agend_config on nfse_agendamentos(asaas_config_id);
create index if not exists idx_nfse_agend_cliente on nfse_agendamentos(cliente_id);
create index if not exists idx_nfse_agend_proxima on nfse_agendamentos(proxima_emissao) where ativo = true;

create trigger trg_nfse_agend_updated
  before update on nfse_agendamentos
  for each row execute function update_updated_at();

alter table nfse_agendamentos enable row level security;
create policy "Allow all for nfse_agendamentos" on nfse_agendamentos
  for all using (true) with check (true);
