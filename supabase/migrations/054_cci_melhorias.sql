-- ============================================================
-- Solicitações de melhoria / falhas enviadas pelos clientes.
--
-- Cliente envia via /cliente/<tipo>/melhorias; admin acompanha
-- em /admin/melhorias e responde mudando o status com comentário.
-- Cada melhoria tem uma timeline de comentários (cliente + admin).
--
-- Snapshot de rede/empresa no momento do envio facilita a vida
-- do admin (saber a qual rede pertence) mesmo se o usuário
-- trocar de empresa ativa depois.
-- ============================================================

create table if not exists cci_melhorias (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references cci_usuarios_sistema(id) on delete cascade,

  -- snapshot do contexto do usuário no momento do envio
  chave_api_id uuid references chaves_api(id) on delete set null,
  as_rede_id   uuid references as_rede(id)   on delete set null,
  empresa_id   uuid references clientes(id)  on delete set null,

  tipo  text not null check (tipo in ('melhoria', 'falha')),
  titulo text not null,
  descricao text not null,
  status text not null default 'em_analise' check (status in (
    'em_analise', 'aprovada', 'nao_aprovada', 'em_andamento', 'concluida'
  )),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_melhorias_usuario on cci_melhorias(usuario_id);
create index if not exists idx_melhorias_status  on cci_melhorias(status);
create index if not exists idx_melhorias_tipo    on cci_melhorias(tipo);
create index if not exists idx_melhorias_chave   on cci_melhorias(chave_api_id);
create index if not exists idx_melhorias_asrede  on cci_melhorias(as_rede_id);

create trigger trg_melhorias_updated
  before update on cci_melhorias
  for each row execute function update_updated_at();

alter table cci_melhorias enable row level security;
create policy "Allow all for cci_melhorias" on cci_melhorias
  for all using (true) with check (true);

-- Histórico/timeline de comentários por melhoria.
-- Quando autor (admin) muda status, registra status_anterior/status_novo
-- para o cliente entender porquê a mudança ocorreu.
create table if not exists cci_melhorias_comentarios (
  id uuid default gen_random_uuid() primary key,
  melhoria_id uuid not null references cci_melhorias(id) on delete cascade,
  autor_id   uuid references cci_usuarios_sistema(id) on delete set null,
  autor_nome text,      -- snapshot, sobrevive a delete do autor
  autor_tipo text not null check (autor_tipo in ('cliente', 'admin')),
  texto text not null,
  status_anterior text,
  status_novo     text,
  created_at timestamptz default now()
);

create index if not exists idx_melh_coment_melhoria on cci_melhorias_comentarios(melhoria_id, created_at);

alter table cci_melhorias_comentarios enable row level security;
create policy "Allow all for cci_melhorias_comentarios" on cci_melhorias_comentarios
  for all using (true) with check (true);
