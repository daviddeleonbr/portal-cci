-- Soft delete pra cci_pedidos_compra:
-- Excluir não REMOVE o registro, marca status='excluido' + grava quem/quando.
-- Auditoria de liberador/excluidor agora explícita (criado_por já existia).

alter table cci_pedidos_compra
  add column if not exists excluido_em  timestamptz,
  add column if not exists excluido_por uuid references cci_usuarios_sistema(id) on delete set null;
