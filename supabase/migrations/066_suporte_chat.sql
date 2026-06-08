-- ============================================================
-- Suporte por chat — conversas entre cliente (Autosystem/Webposto)
-- e admin CCI, com timeline de mensagens, anexos e status.
--
-- Tabelas:
--   cci_suporte_conversa  — uma conversa = um "ticket" com assunto.
--   cci_suporte_mensagem  — mensagens da timeline (texto e/ou anexo).
--
-- Realtime: o cliente Supabase escuta `postgres_changes` em ambas
-- tabelas pra refletir novas mensagens / mudanças de status em tempo
-- real, sem polling. Realtime já vem habilitado por publicação default.
--
-- Bucket Storage: `suporte-anexos` (privado, 10 MB por arquivo) —
-- criado no fim deste arquivo.
-- ============================================================

create table if not exists cci_suporte_conversa (
  id                   uuid primary key default gen_random_uuid(),
  -- Quem abriu a conversa (sempre um usuário tipo 'cliente').
  usuario_cliente_id   uuid not null references cci_usuarios_sistema(id) on delete cascade,
  -- Contexto da rede / cliente no momento da abertura — snapshot,
  -- não muda se o usuário trocar de empresa depois.
  as_rede_id           uuid references as_rede(id)      on delete set null,
  chave_api_id         uuid references chaves_api(id)    on delete set null,
  cliente_id           uuid references clientes(id)      on delete set null,

  assunto              text not null,
  categoria            text not null default 'geral'
    check (categoria in ('geral','financeiro','comercial','tecnico','bpo')),
  prioridade           text not null default 'normal'
    check (prioridade in ('normal','alta','urgente')),
  status               text not null default 'aberta'
    check (status in ('aberta','em_andamento','aguardando_cliente','resolvida','fechada')),

  -- Admin responsável (atribuição opcional)
  admin_atribuido_id   uuid references cci_usuarios_sistema(id) on delete set null,

  -- Contagem de não-lidas (mantidas via trigger ao inserir mensagem
  -- e zeradas ao marcar como lida).
  nao_lidas_cliente    int not null default 0,
  nao_lidas_admin      int not null default 0,

  criada_em            timestamptz not null default now(),
  atualizada_em        timestamptz not null default now(),
  ultima_mensagem_em   timestamptz not null default now(),
  resolvida_em         timestamptz,
  resolvida_por_id     uuid references cci_usuarios_sistema(id) on delete set null,
  fechada_em           timestamptz
);

create index if not exists idx_suporte_conversa_cliente
  on cci_suporte_conversa(usuario_cliente_id, ultima_mensagem_em desc);
create index if not exists idx_suporte_conversa_status
  on cci_suporte_conversa(status, ultima_mensagem_em desc);
create index if not exists idx_suporte_conversa_admin
  on cci_suporte_conversa(admin_atribuido_id);

create table if not exists cci_suporte_mensagem (
  id              uuid primary key default gen_random_uuid(),
  conversa_id     uuid not null references cci_suporte_conversa(id) on delete cascade,
  autor_id        uuid not null references cci_usuarios_sistema(id),
  autor_tipo      text not null check (autor_tipo in ('cliente','admin','sistema')),

  texto           text,                 -- mensagem texto (pode ser null se for só anexo)
  arquivo_path    text,                 -- path no bucket suporte-anexos
  arquivo_nome    text,                 -- nome original
  arquivo_tipo    text,                 -- mime
  arquivo_tamanho int,                  -- bytes

  -- Eventos de sistema (mudança de status etc) — texto interpretado pela UI.
  evento          text,                 -- 'status_alterado'|'atribuido'|'resolvida'|'reaberta' (opcional)
  meta            jsonb,                -- payload livre pra eventos

  lida_em         timestamptz,          -- quando o "outro lado" leu

  created_at      timestamptz not null default now(),

  -- Garante que toda mensagem tenha pelo menos texto OU anexo OU evento.
  check (texto is not null or arquivo_path is not null or evento is not null)
);

create index if not exists idx_suporte_mensagem_conversa
  on cci_suporte_mensagem(conversa_id, created_at);
create index if not exists idx_suporte_mensagem_nao_lida
  on cci_suporte_mensagem(conversa_id, lida_em) where lida_em is null;

-- ── Trigger: atualiza ultima_mensagem_em + contadores ao inserir ──
create or replace function f_suporte_mensagem_inserida()
returns trigger language plpgsql as $$
begin
  update cci_suporte_conversa
     set ultima_mensagem_em = new.created_at,
         atualizada_em      = now(),
         -- quem RECEBE soma 1 (o "outro lado" do autor)
         nao_lidas_cliente  = nao_lidas_cliente
                              + case when new.autor_tipo = 'admin'  then 1 else 0 end,
         nao_lidas_admin    = nao_lidas_admin
                              + case when new.autor_tipo = 'cliente' then 1 else 0 end
   where id = new.conversa_id;
  return new;
end;
$$;

drop trigger if exists trg_suporte_mensagem_inserida on cci_suporte_mensagem;
create trigger trg_suporte_mensagem_inserida
  after insert on cci_suporte_mensagem
  for each row execute function f_suporte_mensagem_inserida();

-- ── Realtime: incluir as 2 tabelas na publicação ─────────────
alter publication supabase_realtime add table cci_suporte_conversa;
alter publication supabase_realtime add table cci_suporte_mensagem;

-- ── RLS (permissivo, padrão do projeto) ──────────────────────
alter table cci_suporte_conversa enable row level security;
alter table cci_suporte_mensagem enable row level security;

drop policy if exists "p_suporte_conversa_all" on cci_suporte_conversa;
create policy "p_suporte_conversa_all"
  on cci_suporte_conversa
  for all using (true) with check (true);

drop policy if exists "p_suporte_mensagem_all" on cci_suporte_mensagem;
create policy "p_suporte_mensagem_all"
  on cci_suporte_mensagem
  for all using (true) with check (true);

-- ── Bucket de anexos (privado, 10 MB) ────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'suporte-anexos', 'suporte-anexos', false, 10485760,
  array[
    'image/png','image/jpeg','image/webp','image/gif',
    'application/pdf',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update set
  file_size_limit    = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "p_suporte_anexo_read"   on storage.objects;
drop policy if exists "p_suporte_anexo_insert" on storage.objects;
drop policy if exists "p_suporte_anexo_update" on storage.objects;
drop policy if exists "p_suporte_anexo_delete" on storage.objects;

create policy "p_suporte_anexo_read"   on storage.objects for select  using (bucket_id = 'suporte-anexos');
create policy "p_suporte_anexo_insert" on storage.objects for insert  with check (bucket_id = 'suporte-anexos');
create policy "p_suporte_anexo_update" on storage.objects for update  using (bucket_id = 'suporte-anexos') with check (bucket_id = 'suporte-anexos');
create policy "p_suporte_anexo_delete" on storage.objects for delete  using (bucket_id = 'suporte-anexos');
