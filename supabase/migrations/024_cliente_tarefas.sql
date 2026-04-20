-- ============================================================
-- Gestor de tarefas do cliente (nivel rede).
-- Cada rede tem seu proprio quadro de tarefas para acompanhamento
-- das atividades dos colaboradores (gerentes, responsaveis etc).
-- ============================================================

create table if not exists cliente_tarefas (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid not null references chaves_api(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null, -- opcional: associada a uma empresa
  titulo text not null,
  descricao text,
  responsavel text,                    -- nome livre (sem FK ao cadastro)
  prazo date,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  criado_por text,
  concluida_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cli_tarefas_rede on cliente_tarefas(chave_api_id);
create index if not exists idx_cli_tarefas_cliente on cliente_tarefas(cliente_id);
create index if not exists idx_cli_tarefas_status on cliente_tarefas(status);
create index if not exists idx_cli_tarefas_prazo on cliente_tarefas(prazo);

create trigger trg_cli_tarefas_updated
  before update on cliente_tarefas
  for each row execute function update_updated_at();

alter table cliente_tarefas enable row level security;
create policy "Allow all for cliente_tarefas" on cliente_tarefas for all using (true) with check (true);
