-- 213_lmc_real_motivos_tanques
-- LMC gerencial: motivo da diferença POR TANQUE (tela "Lançar medições").
-- { "<tanqueCodigo>": "texto do motivo", ... }. O `motivo` da linha continua
-- valendo para combustível sem detalhe por tanque. Idempotente.

alter table lmc_real add column if not exists motivos_tanques jsonb not null default '{}'::jsonb;
