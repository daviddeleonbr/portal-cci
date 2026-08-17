-- ============================================================
-- Catálogo de cláusulas contratuais (motor de cláusulas)
-- ============================================================
--
-- Antes, as cláusulas viviam num arquivo .js (src/data/clausulasContrato.js),
-- resolvidas por substring do nome, com apenas 2 cláusulas e sem
-- condições/obrigatoriedade/variáveis. Agora são registros de banco
-- editáveis pelo admin, com:
--   - condição de aplicabilidade (quando a cláusula entra no contrato);
--   - obrigatoriedade;
--   - ordem/prioridade;
--   - variáveis dinâmicas ({{...}});
--   - marcação "revisar com jurídico".
--
-- O corpo (`corpo`) é um array de "blocos" (subtitulo/paragrafo/lista/tabela),
-- o mesmo formato que o renderizador RelatorioContrato já entende.
--
-- A tabela nasce VAZIA e é semeada pela aplicação (clausulasService.seedSeVazio)
-- a partir de src/data/clausulasSeed.js — mantém o texto extenso fora do SQL
-- e permite "restaurar padrões" pela tela admin.

create table if not exists cci_clausulas (
  id uuid default gen_random_uuid() primary key,

  -- Chave estável (ex.: 'geral_vigencia', 'servico_lancamento_notas').
  -- Usada para semear/atualizar sem duplicar e para referência por serviço.
  chave text not null unique,

  titulo text not null,

  -- Array de blocos: [{ tipo:'subtitulo'|'paragrafo'|'lista'|'tabela', ... }]
  corpo jsonb not null default '[]'::jsonb,

  -- Natureza da cláusula (agrupa e ordena no documento).
  tipo text not null default 'geral'
    check (tipo in ('objeto','servico','geral','pagamento','juridica','lgpd','encerramento')),

  -- Entra sempre (independe dos serviços)?
  obrigatoria boolean not null default false,

  -- Condição de aplicabilidade. Formatos de `modo`:
  --   { "modo": "sempre" }
  --   { "modo": "categoria", "valor": "bpo" }
  --   { "modo": "servico",   "valor": "<uuid ou chave do serviço>" }
  --   { "modo": "flag",      "valor": "envolve_dados_pessoais" }
  condicao jsonb not null default '{"modo":"sempre"}'::jsonb,

  -- Ordem no documento (menor primeiro).
  ordem int not null default 100,

  ativo boolean not null default true,

  -- Variáveis {{...}} que a cláusula usa (para validação de preenchimento).
  variaveis text[] not null default '{}',

  -- Sinaliza que o texto depende de definição jurídica (não emitir sem revisão).
  revisar_juridico boolean not null default false,

  versao int not null default 1,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_clausulas_ativo on cci_clausulas(ativo);
create index if not exists idx_clausulas_tipo  on cci_clausulas(tipo);

create trigger trg_clausulas_updated
  before update on cci_clausulas
  for each row execute function update_updated_at();

-- RLS: admin-only (padrão da migration 115).
alter table cci_clausulas enable row level security;
revoke all on cci_clausulas from anon;
create policy "cci_clausulas_admin"
  on cci_clausulas for all
  using (cci_is_admin()) with check (cci_is_admin());
