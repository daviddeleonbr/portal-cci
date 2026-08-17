-- ============================================================
-- Representante legal do CLIENTE (contratante) para contratos
-- ============================================================
--
-- A tabela `clientes` já tinha razão social, CNPJ e endereço completo,
-- mas NÃO tinha o representante legal que assina o contrato. `contato_*`
-- é um contato operacional genérico, não um signatário legal.
--
-- Campos opcionais: a validação de emissão do contrato aponta quando
-- estão vazios — nunca são inventados.

alter table clientes add column if not exists representante_nome  text;
alter table clientes add column if not exists representante_cpf   text;
alter table clientes add column if not exists representante_cargo text;
alter table clientes add column if not exists representante_email text;

comment on column clientes.representante_nome  is 'Representante legal que assina o contrato (contratante)';
comment on column clientes.representante_cpf   is 'CPF do representante legal do contratante';
comment on column clientes.representante_cargo is 'Cargo do representante legal do contratante';
