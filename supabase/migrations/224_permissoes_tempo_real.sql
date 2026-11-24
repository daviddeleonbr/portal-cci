-- 224_permissoes_tempo_real
-- Permissões em TEMPO REAL: quando o admin muda as permissões (ou empresas
-- liberadas / nível) de um usuário, nasce uma notificação para ele — o sino e
-- o push avisam, e o portal (NotificacoesBell → sincronizarPermissoes) relê o
-- cadastro, renova o token e libera o menu na hora, sem sair e entrar.
--   1) notificacoes entra na publicação do Realtime;
--   2) gatilho em cci_usuarios_sistema monta "Liberado: … · Retirado: …" com
--      os nomes do catálogo do portal (cci_permissao_rotulo).
-- Idempotente.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;

-- Nome legível da permissão (catálogos PERMISSOES_ADMIN / PERMISSOES_CLIENTE
-- de src/services/usuariosSistemaService.js). Chave desconhecida → a própria chave.
create or replace function cci_permissao_rotulo(p_tipo text, p_chave text)
returns text language sql immutable as $$
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
    ('bpo_contas_pagar', 'Contas a pagar · agenda de pagamentos'),
    ('bpo_contas_pagar_autorizar', 'Contas a pagar · marcar como autorizada no banco'),
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
    p_chave);
$$;

create or replace function cci_usuario_notificar_acessos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_add text[];
  v_rem text[];
  v_partes text[] := array[]::text[];
begin
  if new.permissoes is not distinct from old.permissoes
     and new.empresas_permitidas is not distinct from old.empresas_permitidas
     and new.nivel_admin is not distinct from old.nivel_admin then
    return new;
  end if;
  if coalesce(new.status, 'ativo') <> 'ativo' then return new; end if;

  select coalesce(array_agg(cci_permissao_rotulo(new.tipo, p) order by 1), '{}')
    into v_add from unnest(coalesce(new.permissoes, '{}')) p
   where not (p = any(coalesce(old.permissoes, '{}')));
  select coalesce(array_agg(cci_permissao_rotulo(new.tipo, p) order by 1), '{}')
    into v_rem from unnest(coalesce(old.permissoes, '{}')) p
   where not (p = any(coalesce(new.permissoes, '{}')));

  if cardinality(v_add) > 0 then v_partes := v_partes || ('Liberado: ' || array_to_string(v_add, ', ')); end if;
  if cardinality(v_rem) > 0 then v_partes := v_partes || ('Retirado: ' || array_to_string(v_rem, ', ')); end if;
  if new.empresas_permitidas is distinct from old.empresas_permitidas then v_partes := v_partes || 'Empresas liberadas atualizadas'::text; end if;
  if new.nivel_admin is distinct from old.nivel_admin then v_partes := v_partes || 'Nível de acesso atualizado'::text; end if;

  insert into notificacoes (usuario_id, titulo, mensagem, tipo, link)
  values (new.id, 'Seus acessos foram atualizados',
          coalesce(nullif(array_to_string(v_partes, ' · '), '') || '.', 'A CCI atualizou suas permissões.') || ' Já estão valendo.',
          'info', null);
  return new;
exception when others then
  raise warning 'cci_usuario_notificar_acessos: %', sqlerrm; -- nunca bloqueia a edição do usuário
  return new;
end $$;

drop trigger if exists trg_usuario_notificar_acessos on cci_usuarios_sistema;
create trigger trg_usuario_notificar_acessos
  after update of permissoes, empresas_permitidas, nivel_admin on cci_usuarios_sistema
  for each row execute function cci_usuario_notificar_acessos();
