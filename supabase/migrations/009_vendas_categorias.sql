-- ============================================================
-- Separar vendas em categorias: combustivel, automotivos, conveniencia
-- + vendas canceladas
-- Classificacao por item:
--   combustivel = produto.tipoProduto = 'C'
--   automotivos = grupo.tipoGrupo = 'Pista' AND produto.tipoProduto != 'C'
--   conveniencia = grupo.tipoGrupo = 'Conveniência'
--   canceladas = venda.cancelada = 'S'
-- ============================================================

alter table mapeamento_vendas_dre drop constraint if exists mapeamento_vendas_dre_tipo_check;
alter table mapeamento_vendas_dre add constraint mapeamento_vendas_dre_tipo_check
  check (tipo in (
    -- Receitas separadas por categoria de produto
    'receita_combustivel',
    'receita_automotivos',
    'receita_conveniencia',
    -- CMV separado por categoria
    'cmv_combustivel',
    'cmv_automotivos',
    'cmv_conveniencia',
    -- Vendas canceladas (separar para conciliacao)
    'vendas_canceladas',
    -- Aplicaveis a todas as vendas
    'impostos',
    'descontos',
    'acrescimos',
    -- Compatibilidade retroativa (apos mudanca, nao gera mais)
    'receita_bruta',
    'cmv'
  ));
