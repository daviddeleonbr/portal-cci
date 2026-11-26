-- 229_descontinuar_suporte_melhorias_mensagens
-- Descontinua Suporte (chat), Melhorias do Sistema e Mensagens Iniciais (admin e
-- portal do cliente) e a página de envio de Notificações do admin (o sino e os
-- avisos automáticos continuam; a tabela notificacoes fica): apaga tabelas, funções, políticas e buckets, e tira as
-- permissões dos usuários. Backup dos dados feito antes (fora do repositório).
-- Os ARQUIVOS dos buckets saem antes, pela API do Storage (o banco não deixa
-- apagar storage.objects direto). Idempotente.

-- Tabelas (gatilhos, políticas e a publicação do Realtime vão junto)
drop table if exists cci_suporte_mensagem cascade;
drop table if exists cci_suporte_conversa cascade;
drop table if exists cci_melhorias_anexos cascade;
drop table if exists cci_melhorias_comentarios cascade;
drop table if exists cci_melhorias cascade;
drop table if exists cci_mensagens_iniciais_views cascade;
drop table if exists cci_mensagens_iniciais cascade;

-- Funções que só serviam a elas
drop function if exists f_suporte_mensagem_inserida();
drop function if exists cci_e_dono_conversa(uuid);
drop function if exists cci_pode_ver_conversa(uuid);
drop function if exists cci_pode_ver_melhoria(uuid);
drop function if exists cci_suporte_marcar_lido(uuid, text);

-- Storage: políticas e buckets (os objetos já foram apagados pela API)
drop policy if exists "p_suporte_anexo_read" on storage.objects;
drop policy if exists "p_suporte_anexo_insert" on storage.objects;
drop policy if exists "p_suporte_anexo_update" on storage.objects;
drop policy if exists "p_suporte_anexo_delete" on storage.objects;
drop policy if exists "Allow all for melhorias bucket" on storage.objects;
do $$
begin
  delete from storage.buckets where id in ('melhorias', 'suporte-anexos');
exception when others then
  raise notice 'buckets não removidos por SQL (%): remova pela API do Storage', sqlerrm;
end $$;

-- Permissões descontinuadas saem dos usuários, sem notificar "acessos atualizados"
alter table cci_usuarios_sistema disable trigger trg_usuario_notificar_acessos;
update cci_usuarios_sistema
   set permissoes = array_remove(array_remove(array_remove(array_remove(array_remove(permissoes,
       'suporte'), 'melhorias'), 'mensagens_iniciais'), 'suporte_admin'), 'notificacoes')
 where permissoes && array['suporte', 'melhorias', 'mensagens_iniciais', 'suporte_admin', 'notificacoes']::text[];
alter table cci_usuarios_sistema enable trigger trg_usuario_notificar_acessos;

-- Catálogo de nomes das permissões, sem as descontinuadas (base: 227)
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
    ('bpo_contas_receber', 'Contas a receber'),
    ('outras_contas', 'Outras contas a pagar'),
    ('acessos', 'Acessos'),
    ('parametros', 'Parâmetros'),
    ('relatorios_cliente', 'Relatórios por Cliente'),
    ('relatorios_bi', 'Relatórios de BI'),
    ('analise_ia', 'Análise com IA'),
    ('conciliacao_caixas', 'Conciliação de Caixas'),
    ('lmc', 'LMC · Livro de Movimentação de Combustíveis'),
    ('caixa_administrativo', 'Caixa Administrativo'),
    ('uso_portal', 'Uso do Portal'),
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
    ('pendencias', 'Pendências'),
    ('trocar_empresa', 'Alternar entre empresas da rede'),
    ('gerenciar_usuarios', 'Gerenciar usuários da rede'),
    ('configuracoes', 'Configurações de rede')
      ) as c(k, r) where k = p_chave)
    end,
    'outra área do portal');  -- nunca a chave crua
$$;
