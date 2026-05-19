-- ============================================================
-- Sistema de notificações in-app para admin e cliente.
--
-- Cada notificação é endereçada a um único usuário. Ao criar uma
-- notificação para vários destinatários, inserimos uma linha por
-- destinatário (simplifica leitura: "minhas notificações").
-- ============================================================

create table if not exists notificacoes (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references cci_usuarios_sistema(id) on delete cascade,
  remetente_id uuid references cci_usuarios_sistema(id) on delete set null,
  titulo text not null,
  mensagem text,
  tipo text not null default 'info' check (tipo in ('info', 'sucesso', 'aviso', 'erro')),
  link text,
  lida_em timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_notif_usuario on notificacoes(usuario_id);
create index if not exists idx_notif_lida on notificacoes(usuario_id, lida_em);
create index if not exists idx_notif_created on notificacoes(created_at desc);

alter table notificacoes enable row level security;
create policy "Allow all for notificacoes" on notificacoes
  for all using (true) with check (true);
