-- A classificacao "recebimento" (adquirente) foi descontinuada.
-- Contas que estavam nesse tipo sao migradas para "bancaria", que ja entra
-- no fluxo de caixa e na conciliacao bancaria (mesmo comportamento pratico).

update cliente_contas_bancarias
   set tipo = 'bancaria',
       updated_at = now()
 where tipo = 'recebimento';
