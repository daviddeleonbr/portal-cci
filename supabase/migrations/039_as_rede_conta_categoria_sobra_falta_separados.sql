-- ============================================================
-- Separa `sobra_falta_caixa` em duas categorias:
--   sobra_caixa  (sobra de caixa)
--   falta_caixa  (falta de caixa)
--
-- Sobra e falta NÃO entram no total de "formas de recebimento" no
-- BPO Conciliação de Caixas — são exibidas em uma seção separada.
--
-- Registros existentes com `sobra_falta_caixa` são migrados para
-- `sobra_caixa` (padrão). Se algum precisar virar `falta_caixa`,
-- ajustar manualmente depois.
-- ============================================================

alter table as_rede_conta_categoria
  drop constraint if exists as_rede_conta_categoria_categoria_check;

update as_rede_conta_categoria
   set categoria = 'sobra_caixa'
 where categoria = 'sobra_falta_caixa';

alter table as_rede_conta_categoria
  add constraint as_rede_conta_categoria_categoria_check
  check (categoria in (
    'dinheiro',
    'cartao_pix',
    'cheque',
    'a_prazo',
    'sobra_caixa',
    'falta_caixa',
    'outros'
  ));
