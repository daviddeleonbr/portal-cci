-- ============================================================
-- 047_configuracoes_ia
--
-- Configurações centralizadas da integração com a Claude API
-- (Anthropic). Singleton — id sempre = 1.
--
-- Substitui o armazenamento atual em localStorage do navegador
-- por uma config compartilhada entre todos os usuários admin.
-- Demais usuários (clientes) também leem para usar a ferramenta
-- de Análise IA do portal cliente.
-- ============================================================

create table if not exists configuracoes_ia (
  id                int primary key default 1,
  api_key           text,                                          -- sk-ant-...
  modelo            text not null default 'claude-opus-4-7',
  max_tokens        int  not null default 20000,
  adaptive_thinking boolean not null default true,
  ativo             boolean not null default true,
  atualizado_em     timestamptz default now(),
  atualizado_por    uuid references cci_usuarios_sistema(id) on delete set null,
  constraint chk_configuracoes_ia_singleton check (id = 1)
);

-- Seed: linha singleton com defaults (sem api_key, será preenchida pela UI)
insert into configuracoes_ia (id) values (1)
on conflict (id) do nothing;
