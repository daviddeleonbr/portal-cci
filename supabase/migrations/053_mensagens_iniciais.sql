-- ============================================================
-- Mensagens iniciais para clientes.
--
-- Admin posta mensagens (atualização de funcionalidade, manutenção,
-- aviso etc.) que aparecem em um modal centralizado a cada usuário
-- cliente ao logar — UMA vez por usuário. Após fechar, a visualização
-- é registrada e a mensagem não aparece mais para esse usuário.
--
-- Difere de `notificacoes` (sino do header, transitória): é um
-- canal "What's new" intrusivo, sem polling, focado em comunicar
-- novidades de produto.
-- ============================================================

create table if not exists cci_mensagens_iniciais (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  conteudo text not null,
  categoria text not null default 'novidade'
    check (categoria in ('novidade', 'atualizacao', 'manutencao', 'aviso')),
  publico_alvo text not null default 'ambos'
    check (publico_alvo in ('webposto', 'autosystem', 'ambos')),
  ativa boolean not null default true,
  publicada_em timestamptz default now(),
  expira_em timestamptz,
  created_by uuid references cci_usuarios_sistema(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_msg_inic_ativa on cci_mensagens_iniciais(ativa);
create index if not exists idx_msg_inic_publico on cci_mensagens_iniciais(publico_alvo);
create index if not exists idx_msg_inic_publicada on cci_mensagens_iniciais(publicada_em desc);

create trigger trg_msg_inic_updated
  before update on cci_mensagens_iniciais
  for each row execute function update_updated_at();

alter table cci_mensagens_iniciais enable row level security;
create policy "Allow all for cci_mensagens_iniciais" on cci_mensagens_iniciais
  for all using (true) with check (true);

-- Tabela ponte: marca quais mensagens cada usuário cliente já visualizou
create table if not exists cci_mensagens_iniciais_views (
  mensagem_id uuid not null references cci_mensagens_iniciais(id) on delete cascade,
  usuario_id  uuid not null references cci_usuarios_sistema(id)   on delete cascade,
  visualizada_em timestamptz default now(),
  primary key (mensagem_id, usuario_id)
);

create index if not exists idx_msg_views_usuario on cci_mensagens_iniciais_views(usuario_id);

alter table cci_mensagens_iniciais_views enable row level security;
create policy "Allow all for cci_mensagens_iniciais_views" on cci_mensagens_iniciais_views
  for all using (true) with check (true);
