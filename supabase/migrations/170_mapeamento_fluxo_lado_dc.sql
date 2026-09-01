-- Direção (débito/crédito) no mapeamento manual de fluxo (Autosystem).
--
-- O Autosystem é partida dobrada: a MESMA conta pode ser debitada ou creditada.
-- Ex.: conta de aplicação DEBITADA (dinheiro entra na aplicação → sai do caixa)
-- deve cair em "Transferência para Aplicação" (saída); a MESMA conta CREDITADA
-- (resgate → entra no caixa) deve cair em "Resgate de Aplicação" (entrada).
--
-- Antes, o mapeamento roteava só pelo código da conta (1 conta → 1 grupo), e a
-- direção D/C só decidia o sinal. Agora cada vínculo pode fixar a direção:
--   lado = 'D'  → aplica quando a conta é DEBITADA  (saída no fluxo)
--   lado = 'C'  → aplica quando a conta é CREDITADA (entrada no fluxo)
--   lado = NULL → ambos (comportamento atual: valor líquido)
-- Assim a mesma conta_codigo pode ter 2 linhas (uma por direção → grupos
-- diferentes). A tabela não tem unique constraint, então isso já é permitido.

alter table mapeamento_manual_contas_fluxo
  add column if not exists lado text check (lado in ('D', 'C'));

comment on column mapeamento_manual_contas_fluxo.lado is
  'Direção do lançamento p/ roteamento do fluxo (Autosystem): D=conta debitada (saída), C=conta creditada (entrada), NULL=ambos (líquido).';
