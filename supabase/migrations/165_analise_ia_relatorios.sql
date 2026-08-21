-- ============================================================
-- Cache das análises de IA + notas explicativas do consultor
-- ============================================================
--
-- Uma linha por (escopo, aba, ano, mes). Guarda DUAS coisas:
--   1. O resultado da IA (insights + dados + usage) — assim, ao reabrir o
--      relatório de um cliente/mês já gerado, mostramos na hora, SEM chamar a
--      Claude de novo (economia de tokens). "Gerar novamente" sobrescreve.
--   2. A nota explicativa que o consultor escreve à mão — texto livre que
--      aparece no PDF entregue ao cliente (problema encontrado + o que fazer /
--      por que aconteceu), logo após o resumo executivo.
--
-- escopo identifica o alvo do relatório de forma estável (nunca nulo), o que
-- evita o problema de UNIQUE com colunas nulas (cliente_id é nulo no consolidado):
--   'cli:<cliente_id>'  → relatório de uma empresa
--   'wp:<chave_api_id>' → consolidado de uma rede Webposto
--   'as:<as_rede_id>'   → consolidado de uma rede Autosystem
-- As colunas chave_api_id / as_rede_id / cliente_id existem só para a RLS por
-- tenant (cci_rede_bate). aba ∈ vendas|dre|fluxo|geral.

create table if not exists analise_ia_relatorios (
  id uuid primary key default gen_random_uuid(),

  escopo text not null,
  aba    text not null check (aba in ('vendas','dre','fluxo','geral')),
  ano    int  not null,
  mes    int  not null check (mes between 1 and 12),

  -- tenant (para RLS) — preenchidos conforme o escopo
  chave_api_id uuid references chaves_api(id) on delete cascade,
  as_rede_id   uuid references as_rede(id)    on delete cascade,
  cliente_id   uuid references clientes(id)   on delete cascade,

  -- resultado da IA (cache) — jsonb pra evoluir sem migração
  insights   jsonb,
  dados      jsonb,
  usage      jsonb,
  gerado_em  timestamptz,
  gerado_por uuid,   -- cci_usuarios_sistema.id de quem disparou a geração

  -- nota explicativa do consultor (aparece no PDF)
  nota                text not null default '',
  nota_atualizada_em  timestamptz,
  nota_por            uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (escopo, aba, ano, mes)
);

create index if not exists idx_analise_ia_rel_periodo
  on analise_ia_relatorios (escopo, ano, mes);

create trigger trg_analise_ia_rel_updated
  before update on analise_ia_relatorios
  for each row execute function update_updated_at();

-- RLS: leitura pra admin OU tenant da rede; escrita só admin (a página é
-- admin-only). Segue o padrão das migrations 111/115.
alter table analise_ia_relatorios enable row level security;
revoke all on analise_ia_relatorios from anon;

create policy "analise_ia_rel_sel"
  on analise_ia_relatorios for select
  using (cci_is_admin() or cci_rede_bate(chave_api_id, as_rede_id));

create policy "analise_ia_rel_ins"
  on analise_ia_relatorios for insert
  with check (cci_is_admin());

create policy "analise_ia_rel_upd"
  on analise_ia_relatorios for update
  using (cci_is_admin()) with check (cci_is_admin());

create policy "analise_ia_rel_del"
  on analise_ia_relatorios for delete
  using (cci_is_admin());
