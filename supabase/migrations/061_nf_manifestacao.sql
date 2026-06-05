-- ============================================================
-- Notas fiscais a manifestar (origem: API Quality / Webposto)
--
-- Fluxo:
-- 1) Cliente sincroniza com Quality (endpoint NOTA_MANIFESTACAO) → cria
--    registros em `nf_manifestacao` com status_portal='pendente'.
-- 2) Cliente abre a nota, preenche `tipo_destinacao` (estoque | uso_consumo),
--    cadastra produtos e anexa arquivos (NF + boletos).
-- 3) Cliente envia para CCI → status_portal='enviada'.
-- 4) Admin CCI valida, lança no sistema → status_portal='lancada' (ou
--    'devolvida' com motivo).
--
-- "Manifestação" aqui é o evento fiscal de o destinatário declarar
-- ciência da operação ao SEFAZ — a CCI executa esse ato com os dados
-- complementares fornecidos pelo cliente via portal.
-- ============================================================

create table nf_manifestacao (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  empresa_codigo int,                          -- empresa Quality (Webposto)

  -- Dados originais do endpoint NOTA_MANIFESTACAO (Quality)
  manifestacao_codigo int,
  chave_documento text not null,               -- chave NF-e 44 dígitos
  cnpj_fornecedor text,
  razao_social_fornecedor text,
  data_emissao date,
  valor numeric(14,2),
  situacao_manifestacao int,                   -- código numérico Quality
  motivo_manifestacao text,
  compra_codigo int,
  codigo_quality int,                          -- "codigo" do retorno Quality
  protocolo_manifestacao text,

  -- Dados preenchidos pelo cliente
  tipo_destinacao text                         -- NULL até cliente escolher
    check (tipo_destinacao in ('estoque', 'uso_consumo')),

  status_portal text not null default 'pendente'
    check (status_portal in ('pendente', 'em_preenchimento', 'enviada', 'lancada', 'devolvida')),

  observacao_cliente text,
  motivo_devolucao text,

  enviada_em   timestamptz,
  lancada_em   timestamptz,
  lancada_por  uuid,                           -- id do admin que lançou
  devolvida_em timestamptz,
  devolvida_por uuid,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Cada chave de NF-e é única dentro de um cliente (evita duplicar quando
  -- cliente sincroniza várias vezes).
  unique (cliente_id, chave_documento)
);

create index idx_nf_manif_cliente_status
  on nf_manifestacao(cliente_id, status_portal);
create index idx_nf_manif_data
  on nf_manifestacao(data_emissao desc);

create trigger trg_nf_manif_updated
  before update on nf_manifestacao
  for each row execute function update_updated_at();

-- Produtos da nota — cliente digita manualmente (código de barras,
-- código interno do produto Quality, qtd e valor unitário). Subtotal é
-- calculado pelo banco (sempre consistente).
create table nf_manifestacao_produto (
  id uuid default gen_random_uuid() primary key,
  nf_manifestacao_id uuid not null references nf_manifestacao(id) on delete cascade,
  codigo_barras text,
  codigo_interno text,
  descricao text,
  quantidade numeric(14,4) not null default 1,
  valor_unitario numeric(14,4) not null default 0,
  subtotal numeric(14,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  ordem int default 0,
  created_at timestamptz default now()
);

create index idx_nf_manif_produto_nf on nf_manifestacao_produto(nf_manifestacao_id);

-- Arquivos anexados (nota fiscal e boletos) — bucket privado, paths são
-- relativos: <cliente_id>/<nf_id>/<tipo>/<nome-original>
create table nf_manifestacao_arquivo (
  id uuid default gen_random_uuid() primary key,
  nf_manifestacao_id uuid not null references nf_manifestacao(id) on delete cascade,
  tipo text not null check (tipo in ('nota_fiscal', 'boleto')),
  storage_path text not null,
  nome_original text,
  tamanho_bytes int,
  mime_type text,
  uploaded_at timestamptz default now()
);

create index idx_nf_manif_arquivo_nf on nf_manifestacao_arquivo(nf_manifestacao_id);

-- RLS permissiva (segue padrão do projeto — filtragem real fica nas RPCs/queries).
alter table nf_manifestacao         enable row level security;
alter table nf_manifestacao_produto enable row level security;
alter table nf_manifestacao_arquivo enable row level security;

create policy "Allow all for nf_manifestacao"
  on nf_manifestacao for all using (true) with check (true);
create policy "Allow all for nf_manifestacao_produto"
  on nf_manifestacao_produto for all using (true) with check (true);
create policy "Allow all for nf_manifestacao_arquivo"
  on nf_manifestacao_arquivo for all using (true) with check (true);

-- ============================================================
-- Storage bucket privado para os arquivos. URLs assinadas são geradas
-- pelo front quando admin/cliente precisa visualizar/baixar.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('nfs-manifestacao', 'nfs-manifestacao', false)
  on conflict (id) do nothing;

-- Policies do storage seguem o padrão permissivo do projeto.
create policy "nfs-manifestacao read"
  on storage.objects for select
  using (bucket_id = 'nfs-manifestacao');
create policy "nfs-manifestacao insert"
  on storage.objects for insert
  with check (bucket_id = 'nfs-manifestacao');
create policy "nfs-manifestacao update"
  on storage.objects for update
  using (bucket_id = 'nfs-manifestacao')
  with check (bucket_id = 'nfs-manifestacao');
create policy "nfs-manifestacao delete"
  on storage.objects for delete
  using (bucket_id = 'nfs-manifestacao');
