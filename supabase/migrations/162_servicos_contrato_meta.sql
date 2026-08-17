-- ============================================================
-- Metadados contratuais por serviço
-- ============================================================
--
-- Cada serviço do catálogo (cci_servicos_oferecidos) passa a carregar
-- os metadados que ALIMENTAM o motor de cláusulas. É o que garante o
-- princípio "serviço contratado → cláusula aplicável": um serviço só
-- traz suas cláusulas/obrigações/limitações se estiver na contratação.
--
-- Estrutura esperada do JSONB `contrato_meta` (todas as chaves opcionais):
--   {
--     "escopo": "texto do escopo específico do serviço",
--     "limitacoes": ["o que não está incluído", ...],
--     "obrigacoes_contratada": ["...", ...],
--     "obrigacoes_contratante": ["...", ...],
--     "envolve_dados_pessoais": true|false,   // dispara a cláusula LGPD
--     "clausula_chaves": ["servico_lancamento_notas", ...] // cláusulas específicas
--   }
--
-- Nada é semeado com invenção: o admin preenche pela tela do serviço.

alter table cci_servicos_oferecidos
  add column if not exists contrato_meta jsonb default '{}'::jsonb;

comment on column cci_servicos_oferecidos.contrato_meta is
  'Metadados contratuais (escopo, limitações, obrigações, LGPD, cláusulas específicas) que alimentam o motor de cláusulas';
