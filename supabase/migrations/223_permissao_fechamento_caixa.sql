-- 223_permissao_fechamento_caixa
-- Portal do cliente: o "Resumo de caixa" (conferencia_recebimentos /
-- conferencia_recebimentos_consultar) saiu e entrou o "Fechamento de caixa"
-- (fechamento_caixa). Quem tinha acesso ao resumo passa a ter ao fechamento.
-- As permissões antigas ficam no usuário (inofensivas; a tela do admin e a RLS
-- das tabelas de conferência continuam como estão). Idempotente.

update cci_usuarios_sistema
   set permissoes = array_append(permissoes, 'fechamento_caixa')
 where tipo = 'cliente'
   and permissoes && array['conferencia_recebimentos', 'conferencia_recebimentos_consultar']::text[]
   and not ('fechamento_caixa' = any(permissoes));
