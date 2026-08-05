-- ============================================================
-- 152_cliente_mascaras
--
-- Muda a forma de restringir máscaras: agora é POR EMPRESA (clientes), não mais
-- por rede. No cadastro do cliente marcam-se as máscaras permitidas àquela
-- empresa. Substitui as tabelas mascara_dre_rede / mascara_fluxo_rede (151).
--
-- Semântica: empresa SEM nenhuma linha = todas as máscaras liberadas
-- (compatível). Com linhas, só as máscaras marcadas ficam disponíveis.
-- ============================================================

drop table if exists mascara_dre_rede;
drop table if exists mascara_fluxo_rede;

create table if not exists cliente_mascara_dre (
  cliente_id uuid not null references clientes(id)      on delete cascade,
  mascara_id uuid not null references mascaras_dre(id)  on delete cascade,
  created_at timestamptz default now(),
  primary key (cliente_id, mascara_id)
);
create index if not exists cliente_mascara_dre_mascara_idx on cliente_mascara_dre(mascara_id);

create table if not exists cliente_mascara_fluxo (
  cliente_id uuid not null references clientes(id)               on delete cascade,
  mascara_id uuid not null references mascaras_fluxo_caixa(id)   on delete cascade,
  created_at timestamptz default now(),
  primary key (cliente_id, mascara_id)
);
create index if not exists cliente_mascara_fluxo_mascara_idx on cliente_mascara_fluxo(mascara_id);

-- RLS permissiva (igual às tabelas de máscara/grupos, lidas pelo portal p/ montar
-- o relatório).
alter table cliente_mascara_dre   enable row level security;
alter table cliente_mascara_fluxo enable row level security;
create policy "Allow all for cliente_mascara_dre"   on cliente_mascara_dre   for all using (true) with check (true);
create policy "Allow all for cliente_mascara_fluxo" on cliente_mascara_fluxo for all using (true) with check (true);
