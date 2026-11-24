-- 226_permissao_rotulo_nome_pagina
-- A notificação "Seus acessos foram atualizados" mostrou a CHAVE
-- ("Liberado: bpo_contas_receber"). Causa: na 225 o rótulo foi recriado e a
-- permissão concedida na MESMA transação, e como a função era `immutable` o
-- gatilho usou a versão antiga (sem a chave nova) → caiu no fallback = chave.
--   1) rótulo = nome da página (Contas a receber / Contas a pagar);
--   2) função passa a `stable` (não fica "congelada" no plano do gatilho);
--   3) fallback nunca mostra a chave crua;
--   4) corrige o texto da notificação já enviada.
-- Idempotente.

create or replace function cci_permissao_rotulo(p_tipo text, p_chave text)
returns text language sql stable as $$
  select coalesce(
    case when p_tipo = 'admin'
      then (select r from (values
    ('dashboard', 'Dashboard'),
    ('clientes', 'Clientes'),
    ('colaboradores', 'Colaboradores'),
    ('usuarios', 'Usuários do Sistema'),
    ('fornecedores', 'Fornecedores'),
    ('plano_contas', 'Plano de Contas'),
    ('motivos', 'Motivos de Movimentação'),
    ('contas_pagar', 'Contas a Pagar'),
    ('contas_receber', 'Contas a Receber'),
    ('banco_inter', 'Banco Inter'),
    ('tarefas', 'Tarefas'),
    ('fiscal', 'Notas Fiscais e Agendamento'),
    ('notas_fiscais', 'Manifestação de Notas'),
    ('bpo_contas_pagar', 'Contas a pagar'),
    ('outras_contas', 'Outras contas a pagar'),
    ('acessos', 'Acessos'),
    ('parametros', 'Parâmetros'),
    ('relatorios_cliente', 'Relatórios por Cliente'),
    ('relatorios_bi', 'Relatórios de BI'),
    ('analise_ia', 'Análise com IA'),
    ('conciliacao_caixas', 'Conciliação de Caixas'),
    ('lmc', 'LMC · Livro de Movimentação de Combustíveis'),
    ('caixa_administrativo', 'Caixa Administrativo'),
    ('notificacoes', 'Notificações'),
    ('mensagens_iniciais', 'Mensagens Iniciais'),
    ('melhorias', 'Melhorias de Sistema'),
    ('uso_portal', 'Uso do Portal'),
    ('suporte_admin', 'Chat de Suporte'),
    ('webposto_sync', 'Webposto · Sincronia de vendas')
      ) as a(k, r) where k = p_chave)
      else (select r from (values
    ('dashboard', 'Visão Geral'),
    ('tarefas', 'Minhas tarefas'),
    ('dre', 'DRE'),
    ('fluxo_caixa', 'Fluxo de Caixa'),
    ('relatorios_bi', 'Relatórios de BI'),
    ('comercial_vendas', 'Comercial · Vendas'),
    ('comercial_operacao', 'Comercial · Operação'),
    ('comercial_produtividade', 'Comercial · Produtividade'),
    ('produtividade_rank', 'Rank'),
    ('produtividade_pista', 'Pista'),
    ('produtividade_conveniencia', 'Conveniência'),
    ('comercial_estoques', 'Comercial · Análise de Estoques'),
    ('estoques_automotivos', 'Automotivos'),
    ('estoques_conveniencia', 'Conveniência'),
    ('estoques_combustivel', 'Combustíveis'),
    ('compras', 'Compras · Criar pedidos'),
    ('compras_liberar', 'Compras · Liberar pedidos'),
    ('sangrias', 'Sangrias'),
    ('sangrias_consultar', 'Consultar sangrias'),
    ('fechamento_caixa', 'Fechamento de caixa'),
    ('sangrias_tarefa_deposito', 'Sangrias · Criar tarefa de depósito em banco'),
    ('bpo', 'Serviços BPO'),
    ('documentos', 'Documentos'),
    ('financeiro', 'Financeiro'),
    ('notas_fiscais', 'Notas Fiscais'),
    ('bpo_contas_pagar', 'Contas a pagar'),
    ('bpo_contas_pagar_autorizar', 'Contas a pagar · marcar como autorizada no banco'),
    ('bpo_contas_receber', 'Contas a receber'),
    ('outras_contas', 'Outras contas a pagar'),
    ('acessos', 'Acessos'),
    ('lmc', 'LMC · Livro de Movimentação de Combustíveis'),
    ('lmc_editar', 'LMC gerencial · lançar o escritural real e o motivo'),
    ('suporte', 'Suporte'),
    ('pendencias', 'Pendências'),
    ('melhorias', 'Melhorias do Sistema'),
    ('trocar_empresa', 'Alternar entre empresas da rede'),
    ('gerenciar_usuarios', 'Gerenciar usuários da rede'),
    ('configuracoes', 'Configurações de rede')
      ) as c(k, r) where k = p_chave)
    end,
    'outra área do portal');  -- nunca a chave crua
$$;

update notificacoes
   set mensagem = replace(mensagem, 'bpo_contas_receber', 'Contas a receber')
 where titulo = 'Seus acessos foram atualizados'
   and mensagem like '%bpo\_contas\_receber%';
