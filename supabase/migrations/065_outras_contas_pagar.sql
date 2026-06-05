-- ============================================================
-- Outras contas a pagar (BPO): contas que o cliente precisa pagar mas
-- que NÃO têm nota fiscal — adiantamentos a fornecedor, empréstimos
-- entre empresas, transferências a PF, taxas avulsas etc.
--
-- Fluxo simples:
--   enviada → cliente registra → admin CCI vê → marca como 'lancada'
--   quando registra no sistema contábil.
-- ============================================================

create table outra_conta_pagar (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,

  -- Classificação (livre no front; default 'outros' pra v1)
  categoria text not null default 'outros'
    check (categoria in (
      'adiantamento_fornecedor',
      'emprestimo',
      'transferencia',
      'taxa_avulsa',
      'reembolso',
      'outros'
    )),

  descricao text not null,
  valor numeric(14,2) not null,
  data_pagamento date,                          -- data efetiva (ou prevista)
  beneficiario_nome text,
  beneficiario_documento text,                  -- CPF ou CNPJ (string)
  beneficiario_tipo text                        -- 'pf' | 'pj'
    check (beneficiario_tipo in ('pf', 'pj') or beneficiario_tipo is null),
  forma_pagamento text,                         -- 'pix' | 'ted' | 'dinheiro' | 'cartao' | 'outros' (livre)
  observacao text,

  status text not null default 'enviada'
    check (status in ('enviada', 'lancada', 'devolvida')),
  motivo_devolucao text,

  enviada_em timestamptz not null default now(),
  lancada_em timestamptz,
  lancada_por uuid,                              -- id do admin que lançou
  devolvida_em timestamptz,
  devolvida_por uuid,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_outra_conta_cliente_status
  on outra_conta_pagar(cliente_id, status);
create index idx_outra_conta_data
  on outra_conta_pagar(data_pagamento desc nulls last);

create trigger trg_outra_conta_updated
  before update on outra_conta_pagar
  for each row execute function update_updated_at();

-- Comprovantes / anexos (foto do comprovante, recibo, contrato etc).
create table outra_conta_arquivo (
  id uuid default gen_random_uuid() primary key,
  outra_conta_id uuid not null references outra_conta_pagar(id) on delete cascade,
  storage_path text not null,
  nome_original text,
  tamanho_bytes int,
  mime_type text,
  uploaded_at timestamptz default now()
);

create index idx_outra_conta_arquivo_conta on outra_conta_arquivo(outra_conta_id);

alter table outra_conta_pagar    enable row level security;
alter table outra_conta_arquivo  enable row level security;

create policy "Allow all for outra_conta_pagar"
  on outra_conta_pagar for all using (true) with check (true);
create policy "Allow all for outra_conta_arquivo"
  on outra_conta_arquivo for all using (true) with check (true);

-- Bucket privado pra anexos.
insert into storage.buckets (id, name, public)
  values ('outras-contas', 'outras-contas', false)
  on conflict (id) do nothing;

create policy "outras-contas read"
  on storage.objects for select
  using (bucket_id = 'outras-contas');
create policy "outras-contas insert"
  on storage.objects for insert
  with check (bucket_id = 'outras-contas');
create policy "outras-contas update"
  on storage.objects for update
  using (bucket_id = 'outras-contas')
  with check (bucket_id = 'outras-contas');
create policy "outras-contas delete"
  on storage.objects for delete
  using (bucket_id = 'outras-contas');
