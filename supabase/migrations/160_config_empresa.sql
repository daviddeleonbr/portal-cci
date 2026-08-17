-- ============================================================
-- Configuração da empresa CONTRATADA (CCI) + regras gerais
-- ============================================================
--
-- Fonte de verdade dos dados da CONTRATADA no contrato (razão social,
-- CNPJ, endereço, representante legal) e dos DEFAULTS das regras
-- comerciais/jurídicas gerais (vigência, reajuste, rescisão, foro,
-- pagamento, LGPD). Antes, os dados da CCI estavam hard-coded em
-- AbaRascunhos.jsx (constante CONTRATADA). Agora são editáveis pelo admin.
--
-- IMPORTANTE (regra de segurança jurídica): NENHUM valor é semeado aqui.
-- Enquanto o admin não preencher, a validação de emissão do contrato
-- aponta o que falta — nada é inventado.

create table if not exists cci_config_empresa (
  -- Singleton: sempre a linha id=1.
  id int primary key default 1 check (id = 1),

  -- ── CONTRATADA (dados legais) ──────────────────────────────
  razao_social        text,
  nome_fantasia       text,
  cnpj                text,
  inscricao_estadual  text,
  inscricao_municipal text,
  endereco            text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  estado              text,
  cep                 text,
  email               text,
  telefone            text,

  -- Representante legal que assina pela CONTRATADA
  representante_nome   text,
  representante_cpf    text,
  representante_cargo  text,
  representante_email  text,

  -- ── Regras gerais (defaults parametrizáveis) ───────────────
  -- JSONB para evoluir sem migração. Chaves esperadas (todas opcionais;
  -- a validação exige as aplicáveis antes de emitir):
  --   vigencia:  { tipo: 'determinado'|'indeterminado', meses: int, renovacao_automatica: bool }
  --   reajuste:  { indice: 'IPCA'|'IGPM'|..., periodicidade_meses: int, data_base: 'aniversario'|'jan', negociavel: bool }
  --   rescisao:  { aviso_previo_dias: int, multa_descricao: text }
  --   foro:      { comarca: text, uf: text }
  --   pagamento: { vencimento_dia: int, forma: text, encargos_atraso: text }
  --   lgpd:      { habilitado: bool, papel_contratada: 'operador'|'controlador' }
  regras jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Garante a linha singleton (vazia — preenchida pelo admin na tela de config).
insert into cci_config_empresa (id) values (1)
  on conflict (id) do nothing;

create trigger trg_config_empresa_updated
  before update on cci_config_empresa
  for each row execute function update_updated_at();

-- RLS: admin-only (segue o padrão da migration 115).
alter table cci_config_empresa enable row level security;
revoke all on cci_config_empresa from anon;
create policy "cci_config_empresa_admin"
  on cci_config_empresa for all
  using (cci_is_admin()) with check (cci_is_admin());
