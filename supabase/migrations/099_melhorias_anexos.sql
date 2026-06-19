-- ============================================================
-- Anexos das solicitações de melhoria/falha
-- ============================================================
--
-- Cliente envia (e admin pode adicionar) até 3 arquivos por solicitação,
-- até 5MB cada. Aceita qualquer tipo (imagem, PDF, doc, etc) — o limite
-- prático é o tamanho. Os arquivos ficam no bucket `melhorias` do
-- Supabase Storage; esta tabela só guarda o metadata e o path.
--
-- Quem fez o upload é rastreado pelo `autor_tipo` (cliente|admin) e snapshot
-- do nome — preserva quem subiu mesmo se o usuário for deletado depois.

create table if not exists cci_melhorias_anexos (
  id uuid default gen_random_uuid() primary key,
  melhoria_id uuid not null references cci_melhorias(id) on delete cascade,

  -- Storage Supabase
  storage_path text not null,            -- caminho dentro do bucket `melhorias`
  nome_original text not null,           -- nome do arquivo no upload
  tamanho_bytes bigint not null,
  tipo_mime text,

  -- Quem subiu (snapshot)
  autor_id uuid references cci_usuarios_sistema(id) on delete set null,
  autor_nome text,
  autor_tipo text not null check (autor_tipo in ('cliente', 'admin')),

  created_at timestamptz default now()
);

create index if not exists idx_melh_anexos_melhoria on cci_melhorias_anexos(melhoria_id, created_at);

alter table cci_melhorias_anexos enable row level security;
create policy "Allow all for cci_melhorias_anexos"
  on cci_melhorias_anexos for all using (true) with check (true);

-- ─── Bucket de Storage ──────────────────────────────────────────
-- Privado (signed URL pra download). Estrutura interna de paths:
--   melhorias/<melhoria_id>/<uuid>-<nome_sanitizado>
insert into storage.buckets (id, name, public)
values ('melhorias', 'melhorias', false)
on conflict (id) do nothing;

-- Policies do bucket — permitir leitura/escrita pra qualquer um autenticado
-- (mesma postura permissiva das outras tabelas do projeto).
-- O front gera signed URLs (não exige RLS pro download).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Allow all for melhorias bucket'
  ) then
    create policy "Allow all for melhorias bucket"
      on storage.objects for all
      using (bucket_id = 'melhorias')
      with check (bucket_id = 'melhorias');
  end if;
end$$;
