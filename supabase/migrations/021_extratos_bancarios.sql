-- ============================================================
-- Extratos bancarios enviados pelo cliente (CSV/Excel) para
-- conciliacao bancaria. Os arquivos ficam no bucket de storage
-- 'extratos-bancarios' e esta tabela guarda os metadados + path.
-- ============================================================

create table if not exists extratos_bancarios (
  id uuid default gen_random_uuid() primary key,
  chave_api_id uuid references chaves_api(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  conta_codigo integer,                  -- opcional: conta bancaria especifica
  data_inicial date not null,
  data_final date not null,
  arquivo_nome text not null,            -- nome original do arquivo
  arquivo_path text not null,            -- path no storage bucket
  tamanho_bytes bigint,
  mime_type text,
  enviado_por text,                      -- nome/email do usuario que enviou
  enviado_em timestamptz default now(),
  observacoes text,
  created_at timestamptz default now(),
  check (data_inicial <= data_final)
);

create index if not exists idx_extratos_cliente on extratos_bancarios(cliente_id);
create index if not exists idx_extratos_chave on extratos_bancarios(chave_api_id);
create index if not exists idx_extratos_periodo on extratos_bancarios(data_inicial, data_final);
create index if not exists idx_extratos_conta on extratos_bancarios(conta_codigo);

alter table extratos_bancarios enable row level security;
create policy "Allow all for extratos_bancarios" on extratos_bancarios for all using (true) with check (true);

-- ============================================================
-- Bucket de Storage para os arquivos de extrato
-- Execute via painel Supabase > Storage > New bucket (publico=false)
-- ou via SQL abaixo (o bucket ja deve existir antes de usar a app):
--
--   insert into storage.buckets (id, name, public)
--   values ('extratos-bancarios', 'extratos-bancarios', false)
--   on conflict (id) do nothing;
--
-- Politica para permitir upload/download (simplificada):
--   create policy "auth access" on storage.objects for all
--   using (bucket_id = 'extratos-bancarios') with check (bucket_id = 'extratos-bancarios');
-- ============================================================

insert into storage.buckets (id, name, public)
values ('extratos-bancarios', 'extratos-bancarios', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'extratos_bancarios_all'
  ) then
    create policy "extratos_bancarios_all" on storage.objects for all
      using (bucket_id = 'extratos-bancarios')
      with check (bucket_id = 'extratos-bancarios');
  end if;
end$$;
