-- Reformula `cci_orcamento_solicitacoes`:
-- - E-mail obrigatório
-- - Remove `empresa` (cliente pode ter várias)
-- - Remove `estrutura` (passo 2 vira só "desejo")
-- - Substitui os 8 campos numéricos individuais por array `postos` (jsonb)
--   com dados POR POSTO. Cliente pode ter N postos.
-- - Remove os campos de cálculo (não há mais simulador automático)

-- 1. Email obrigatório
update cci_orcamento_solicitacoes set email = '(não informado)' where email is null;
alter table cci_orcamento_solicitacoes alter column email set not null;

-- 2. Remove campos antigos
alter table cci_orcamento_solicitacoes
  drop column if exists empresa,
  drop column if exists estrutura,
  drop column if exists notas_fiscais_mes,
  drop column if exists litros_vendidos_mes,
  drop column if exists caixas_pdv_mes,
  drop column if exists contas_bancarias,
  drop column if exists transacoes_cartao_frota_mes,
  drop column if exists bicos_bombas,
  drop column if exists funcionarios_internos,
  drop column if exists custo_medio_funcionario,
  drop column if exists valor_mensal_estimado,
  drop column if exists custo_interno_atual,
  drop column if exists economia_mensal,
  drop column if exists economia_anual;

-- 3. Novo array `postos`. Cada item:
-- {
--   "nome": "Posto Itapoá",
--   "litrosMes": 300000,
--   "faturamentoMes": 1500000,
--   "contasBancarias": 3,
--   "possuiCartaoFrota": true,
--   "cartoesFrota": "Ticket Log, Sem Parar",
--   "adquirentes": "Cielo, Stone, Getnet",
--   "funcionarios": 2,
--   "custoMedioFuncionario": 3800
-- }
alter table cci_orcamento_solicitacoes
  add column if not exists postos jsonb not null default '[]'::jsonb;
