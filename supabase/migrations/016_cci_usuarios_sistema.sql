-- ============================================================
-- Usuarios do sistema (portal admin e portal cliente).
-- O admin cadastra aqui tanto colaboradores da CCI (tipo=admin)
-- quanto usuarios dos clientes (tipo=cliente).
-- Cada usuario recebe um array de permissoes (itens de menu
-- do portal correspondente) que serao usados ao logar.
--
-- NOTA: a coluna `senha` esta como texto simples porque o login
-- atual e mocado. Quando o login real (supabase auth ou hash
-- bcrypt via pgcrypto) for implementado, migrar para hash.
-- ============================================================

create table if not exists cci_usuarios_sistema (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text not null unique,
  senha text not null,
  tipo text not null check (tipo in ('admin', 'cliente')),
  cliente_id uuid references clientes(id) on delete set null,
  permissoes text[] not null default array[]::text[],
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  ultimo_acesso timestamptz,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- tipo=cliente exige cliente_id; tipo=admin nao deve ter cliente_id
  constraint chk_cliente_id_vinculo check (
    (tipo = 'cliente' and cliente_id is not null)
    or (tipo = 'admin' and cliente_id is null)
  )
);

create index if not exists idx_cci_usuarios_email on cci_usuarios_sistema(email);
create index if not exists idx_cci_usuarios_tipo on cci_usuarios_sistema(tipo);
create index if not exists idx_cci_usuarios_cliente on cci_usuarios_sistema(cliente_id);
create index if not exists idx_cci_usuarios_status on cci_usuarios_sistema(status);

create trigger trg_cci_usuarios_updated
  before update on cci_usuarios_sistema
  for each row execute function update_updated_at();

alter table cci_usuarios_sistema enable row level security;
create policy "Allow all for cci_usuarios_sistema" on cci_usuarios_sistema for all using (true) with check (true);

-- Seed: usuario admin master (David Deleon)
insert into cci_usuarios_sistema (nome, email, senha, tipo, permissoes, status)
values (
  'David Deleon',
  'daviddeleondossantos@gmail.com',
  'admin123',
  'admin',
  array[
    'dashboard',
    'clientes',
    'colaboradores',
    'usuarios',
    'parametros',
    'plano_contas',
    'fornecedores',
    'motivos',
    'contas_pagar',
    'contas_receber',
    'fiscal',
    'relatorios_cliente',
    'conciliacao_bancaria',
    'conciliacao_caixas'
  ],
  'ativo'
)
on conflict (email) do nothing;
