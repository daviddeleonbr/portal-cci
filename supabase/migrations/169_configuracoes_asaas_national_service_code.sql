-- Código nacional (NBS/LC116) e série PADRÃO na configuração do Asaas.
--
-- Contexto: a emissão de NFS-e (Portal Nacional) usa `national_service_code`
-- como o código validado pelo portal (rotulado "NBS"). Esse campo só existia
-- por-agendamento/nota (migração 088, tabela agendamentos_nf); em
-- configuracoes_asaas ele NÃO existia, então o fallback `config.national_service_code`
-- lido pelo código (NotasFiscais.jsx / agendamentos-nf-emitir) era sempre nulo.
--
-- Aqui adicionamos as colunas para que a configuração guarde um PADRÃO, e o novo
-- "consultor de serviços municipais" (tela de Configuração Asaas) possa gravar o
-- código correto retornado pelo Asaas. Colunas nulas/aditivas — sem impacto no
-- que já existe.

alter table configuracoes_asaas
  add column if not exists national_service_code text,
  add column if not exists serie text default '1';

comment on column configuracoes_asaas.national_service_code is
  'Código de Tributação Nacional / NBS padrão (Portal Nacional NFS-e). Ex: 17.03.03. Usado quando a nota/agendamento não informa um específico.';
comment on column configuracoes_asaas.serie is
  'Série padrão da NFS-e no Portal Nacional. Ex: 1.';
