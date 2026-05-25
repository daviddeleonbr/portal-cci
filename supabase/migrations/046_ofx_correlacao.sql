-- ============================================================
-- 046_ofx_correlacao
--
-- Correlações manuais entre transações de extrato OFX e
-- lançamentos do sistema (movimento de conta da Quality API).
--
-- Cardinalidade N×M: uma correlação pode ter vários itens do
-- lado OFX e vários itens do lado Sistema (ex.: agrupar 10 PIX
-- do OFX em 1 lançamento consolidado no sistema, ou vice-versa).
--
-- Cada item armazena um SNAPSHOT (valor, data, descrição) no
-- momento do vínculo. Isso permite detectar alterações
-- posteriores no sistema (ex.: alguém mudou o valor depois).
-- ============================================================

create table if not exists ofx_correlacao (
  id            uuid primary key default gen_random_uuid(),
  chave_api_id  uuid not null references chaves_api(id) on delete cascade,
  cliente_id    uuid not null references clientes(id)   on delete cascade,
  conta_codigo  bigint not null,                          -- conta bancária na Quality
  tipo          text   not null check (tipo in ('credito', 'debito')),
  valor_total   numeric(14, 2) not null,
  label         text,                                     -- ex.: "PIX agrupado 28/03"
  observacao    text,
  criado_em     timestamptz default now(),
  criado_por    uuid references cci_usuarios_sistema(id) on delete set null
);

create index if not exists ofx_correlacao_conta_idx
  on ofx_correlacao (cliente_id, conta_codigo);

create table if not exists ofx_correlacao_item (
  id                uuid primary key default gen_random_uuid(),
  correlacao_id     uuid not null references ofx_correlacao(id) on delete cascade,
  lado              text not null check (lado in ('ofx', 'sistema')),
  -- Identificadores nativos: FITID para OFX (lado='ofx'), movimentoContaCodigo
  -- da Quality para o sistema (lado='sistema'). Cada um nulo no outro lado.
  fitid             text,
  movimento_codigo  bigint,
  -- Snapshot capturado no momento do vínculo
  valor             numeric(14, 2) not null,
  data              date not null,
  tipo              text not null check (tipo in ('credito', 'debito')),
  descricao         text,
  documento         text,
  criado_em         timestamptz default now()
);

create index if not exists ofx_correlacao_item_correlacao_idx
  on ofx_correlacao_item (correlacao_id);

-- Lookups rápidos por identificador (usado pra detectar correlações
-- existentes ao carregar a tela de validação OFX).
create index if not exists ofx_correlacao_item_movimento_idx
  on ofx_correlacao_item (movimento_codigo) where lado = 'sistema';

create index if not exists ofx_correlacao_item_fitid_idx
  on ofx_correlacao_item (fitid) where lado = 'ofx';

-- ─── RPC: listar correlações de uma conta ──────────────────
-- Retorna cada correlação com seus itens agregados em JSON.
create or replace function ofx_correlacoes_listar(
  p_cliente_id uuid,
  p_conta_codigo bigint
) returns table (
  id           uuid,
  tipo         text,
  valor_total  numeric,
  label        text,
  observacao   text,
  criado_em    timestamptz,
  itens        jsonb
)
language sql security definer stable as $$
  select c.id, c.tipo, c.valor_total, c.label, c.observacao, c.criado_em,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',               i.id,
      'lado',             i.lado,
      'fitid',            i.fitid,
      'movimento_codigo', i.movimento_codigo,
      'valor',            i.valor,
      'data',             to_char(i.data, 'YYYY-MM-DD'),
      'tipo',             i.tipo,
      'descricao',        i.descricao,
      'documento',        i.documento
    ) order by i.data) filter (where i.id is not null), '[]'::jsonb) as itens
  from ofx_correlacao c
  left join ofx_correlacao_item i on i.correlacao_id = c.id
  where c.cliente_id = p_cliente_id
    and c.conta_codigo = p_conta_codigo
  group by c.id
  order by c.criado_em desc
$$;

-- ─── RPC: criar correlação atomicamente ────────────────────
-- p_itens_ofx e p_itens_sistema são arrays JSON com os snapshots.
-- Cada item OFX: { fitid, valor, data, tipo, descricao }
-- Cada item Sistema: { movimento_codigo, valor, data, tipo, descricao, documento }
create or replace function ofx_correlacao_criar(
  p_chave_api_id   uuid,
  p_cliente_id     uuid,
  p_conta_codigo   bigint,
  p_tipo           text,
  p_valor_total    numeric,
  p_label          text,
  p_observacao     text,
  p_criado_por     uuid,
  p_itens_ofx      jsonb,
  p_itens_sistema  jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_id    uuid;
  v_item  jsonb;
begin
  insert into ofx_correlacao (
    chave_api_id, cliente_id, conta_codigo, tipo, valor_total,
    label, observacao, criado_por
  ) values (
    p_chave_api_id, p_cliente_id, p_conta_codigo, p_tipo, p_valor_total,
    p_label, p_observacao, p_criado_por
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens_ofx, '[]'::jsonb))
  loop
    insert into ofx_correlacao_item (
      correlacao_id, lado, fitid, valor, data, tipo, descricao
    ) values (
      v_id, 'ofx',
      v_item->>'fitid',
      (v_item->>'valor')::numeric,
      (v_item->>'data')::date,
      v_item->>'tipo',
      v_item->>'descricao'
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens_sistema, '[]'::jsonb))
  loop
    insert into ofx_correlacao_item (
      correlacao_id, lado, movimento_codigo, valor, data, tipo, descricao, documento
    ) values (
      v_id, 'sistema',
      (v_item->>'movimento_codigo')::bigint,
      (v_item->>'valor')::numeric,
      (v_item->>'data')::date,
      v_item->>'tipo',
      v_item->>'descricao',
      v_item->>'documento'
    );
  end loop;

  return v_id;
end$$;

-- ─── RPC: excluir correlação ───────────────────────────────
create or replace function ofx_correlacao_excluir(p_id uuid)
returns void
language sql security definer as $$
  delete from ofx_correlacao where id = p_id;
$$;
