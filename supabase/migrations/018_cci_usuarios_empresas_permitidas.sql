-- ============================================================
-- Permite limitar quais empresas da rede o usuario cliente
-- enxerga. Array NULL/vazio = acesso total a rede (todas as
-- empresas). Array com ids = subset permitido.
--
-- Novas permissoes para portal do cliente:
--  - trocar_empresa: usuario pode alternar entre empresas
--  - gerenciar_usuarios: admin da rede, pode criar/editar
--    sub-usuarios dentro da sua propria rede
-- ============================================================

alter table cci_usuarios_sistema
  add column if not exists empresas_permitidas uuid[] default null;

comment on column cci_usuarios_sistema.empresas_permitidas is
  'Array de clientes.id. Quando NULL/vazio, usuario tem acesso total as empresas da rede (chave_api_id).';
