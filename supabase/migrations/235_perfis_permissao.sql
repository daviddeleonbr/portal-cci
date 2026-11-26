-- ============================================================
-- 235 — Perfis-modelo de permissões (Gerente, Financeiro, Operacional...)
--
-- Modelos EDITÁVEIS pela CCI que só PRÉ-MARCAM permissões na tela de usuário.
-- Não concedem nada sozinhos: o usuário guarda a lista de chaves como sempre
-- (cci_usuarios_sistema.permissoes) e quem aplica o modelo continua limitado
-- pelo cci_validar_concessao (migration 234) — o gerente do cliente só recebe
-- do modelo o que ele próprio tem.
--
-- Leitura: admin vê todos; cliente vê os modelos de cliente (só nome/chaves,
-- nada sensível). Escrita: admin N2/N3.
-- ============================================================

create table if not exists cci_perfis_permissao (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('admin', 'cliente')),
  nome        text not null check (length(trim(nome)) between 2 and 60),
  descricao   text check (descricao is null or length(descricao) <= 300),
  permissoes  text[] not null default '{}',
  ordem       int not null default 0,
  ativo       boolean not null default true,
  criado_por  uuid references cci_usuarios_sistema(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tipo, nome)
);

alter table cci_perfis_permissao enable row level security;

drop policy if exists perfis_sel on cci_perfis_permissao;
create policy perfis_sel on cci_perfis_permissao for select to authenticated
  using (cci_is_admin() or (tipo = 'cliente' and ativo));

drop policy if exists perfis_ins on cci_perfis_permissao;
create policy perfis_ins on cci_perfis_permissao for insert to authenticated
  with check (cci_is_admin() and coalesce(cci_nivel_admin(), 1) >= 2);

drop policy if exists perfis_upd on cci_perfis_permissao;
create policy perfis_upd on cci_perfis_permissao for update to authenticated
  using (cci_is_admin() and coalesce(cci_nivel_admin(), 1) >= 2)
  with check (cci_is_admin() and coalesce(cci_nivel_admin(), 1) >= 2);

drop policy if exists perfis_del on cci_perfis_permissao;
create policy perfis_del on cci_perfis_permissao for delete to authenticated
  using (cci_is_admin() and coalesce(cci_nivel_admin(), 1) >= 2);

revoke all on cci_perfis_permissao from anon;
grant select, insert, update, delete on cci_perfis_permissao to authenticated;

-- Modelos iniciais (só chaves que existem nos catálogos; a CCI ajusta pela tela).
insert into cci_perfis_permissao (tipo, nome, descricao, permissoes, ordem) values
  ('cliente', 'Gerente', 'Gestão do posto: relatórios, comercial, operação e financeiro, inclusive usuários.',
   array['dashboard','tarefas','pendencias','dre','fluxo_caixa','relatorios_bi','comercial_vendas','comercial_operacao',
         'comercial_produtividade','comercial_estoques','compras','compras_liberar','sangrias','sangrias_tarefa_deposito',
         'fechamento_caixa','financeiro','bpo','documentos','notas_fiscais','bpo_contas_pagar','bpo_contas_pagar_autorizar',
         'bpo_contas_receber','outras_contas','lmc','trocar_empresa','gerenciar_usuarios'], 10),
  ('cliente', 'Financeiro', 'Contas a pagar e receber, DRE e fluxo de caixa.',
   array['dashboard','tarefas','dre','fluxo_caixa','financeiro','bpo_contas_pagar','bpo_contas_pagar_autorizar',
         'bpo_contas_receber','outras_contas','notas_fiscais','documentos','trocar_empresa'], 20),
  ('cliente', 'Operacional', 'Rotina do caixa: sangrias, fechamento de caixa e tarefas.',
   array['tarefas','sangrias','fechamento_caixa','lmc'], 30),
  ('cliente', 'Comercial', 'Vendas, operação, produtividade e estoques.',
   array['dashboard','comercial_vendas','comercial_operacao','comercial_produtividade','comercial_estoques','compras'], 40),
  ('cliente', 'Consulta', 'Só visualização dos relatórios e das sangrias.',
   array['dashboard','dre','fluxo_caixa','relatorios_bi','sangrias_consultar','comercial_vendas'], 50)
on conflict (tipo, nome) do nothing;

-- ROLLBACK: drop table cci_perfis_permissao;
