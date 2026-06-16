-- Adiciona snapshot de endereço no agendamento.
-- Algumas prefeituras exigem endereço do tomador na NFS-e — guardamos
-- aqui pra a emissão automática pelo cron mandar pra Asaas sem precisar
-- consultar a tabela de clientes (que pode ter mudado).

alter table agendamentos_nf
  add column if not exists cliente_cep      text,
  add column if not exists cliente_endereco text,
  add column if not exists cliente_numero   text,
  add column if not exists cliente_bairro   text,
  add column if not exists cliente_cidade   text,
  add column if not exists cliente_estado   text;
