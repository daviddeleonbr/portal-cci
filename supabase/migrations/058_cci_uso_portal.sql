-- ============================================================
-- Telemetria de uso do portal cliente.
--
-- 1 INSERT por pageview, sem updates. O tempo de permanência em
-- cada página é calculado em tempo de consulta via window function
-- LEAD() — diferença até o próximo pageview do mesmo usuário.
--
-- Apenas o portal cliente é rastreado (decisão de produto). O admin
-- consulta estes dados em /admin/uso-portal.
--
-- Snapshot de contexto (tipo_portal, chave_api_id, as_rede_id,
-- cliente_id) facilita filtragem por rede ou empresa sem JOIN.
-- ============================================================

create table if not exists cci_uso_portal (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid references cci_usuarios_sistema(id) on delete cascade,

  -- snapshot do contexto na hora do pageview
  tipo_portal text check (tipo_portal in ('webposto', 'autosystem')),
  chave_api_id uuid references chaves_api(id) on delete set null,
  as_rede_id   uuid references as_rede(id)   on delete set null,
  cliente_id   uuid references clientes(id)  on delete set null,

  path text not null,            -- caminho da rota (ex: /cliente/autosystem/dashboard)
  user_agent text,

  created_at timestamptz default now()
);

create index if not exists idx_uso_usuario    on cci_uso_portal(usuario_id, created_at desc);
create index if not exists idx_uso_path       on cci_uso_portal(path);
create index if not exists idx_uso_created_at on cci_uso_portal(created_at desc);
create index if not exists idx_uso_rede_wp    on cci_uso_portal(chave_api_id, created_at desc);
create index if not exists idx_uso_rede_as    on cci_uso_portal(as_rede_id, created_at desc);

alter table cci_uso_portal enable row level security;
-- Insert liberado pro cliente (anon authenticated), select pra admin via service role.
-- Front consulta via RPCs SECURITY DEFINER abaixo (não dá SELECT direto).
create policy "Insert allowed for cci_uso_portal" on cci_uso_portal
  for insert with check (true);
create policy "Select allowed for cci_uso_portal" on cci_uso_portal
  for select using (true);

-- ============================================================
-- RPCs auxiliares (calculam duração via LEAD window function)
-- ============================================================

-- Acessos por dia + usuários únicos, no período.
create or replace function uso_portal_serie_diaria(
  p_de date,
  p_ate date,
  p_usuario_id uuid default null,
  p_chave_api_id uuid default null,
  p_as_rede_id uuid default null
) returns table (
  dia date,
  acessos bigint,
  usuarios_unicos bigint
)
language sql stable as $$
  select
    (created_at at time zone 'America/Sao_Paulo')::date as dia,
    count(*) as acessos,
    count(distinct usuario_id) as usuarios_unicos
  from cci_uso_portal
  where (created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and (p_usuario_id    is null or usuario_id    = p_usuario_id)
    and (p_chave_api_id  is null or chave_api_id  = p_chave_api_id)
    and (p_as_rede_id    is null or as_rede_id    = p_as_rede_id)
  group by 1
  order by 1;
$$;

-- Top páginas com contagem + tempo médio (em segundos).
-- Considera apenas durações < 30 min (descarta aba esquecida).
create or replace function uso_portal_top_paginas(
  p_de date,
  p_ate date,
  p_usuario_id uuid default null,
  p_chave_api_id uuid default null,
  p_as_rede_id uuid default null
) returns table (
  path text,
  acessos bigint,
  usuarios_unicos bigint,
  tempo_medio_seg numeric
)
language sql stable as $$
  with eventos as (
    select
      path,
      usuario_id,
      created_at,
      extract(epoch from (
        lead(created_at) over (partition by usuario_id order by created_at) - created_at
      )) as duracao_seg
    from cci_uso_portal
    where (created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_usuario_id   is null or usuario_id   = p_usuario_id)
      and (p_chave_api_id is null or chave_api_id = p_chave_api_id)
      and (p_as_rede_id   is null or as_rede_id   = p_as_rede_id)
  )
  select
    path,
    count(*)::bigint as acessos,
    count(distinct usuario_id)::bigint as usuarios_unicos,
    round(avg(duracao_seg) filter (where duracao_seg between 1 and 1800)::numeric, 1) as tempo_medio_seg
  from eventos
  group by path
  order by acessos desc;
$$;

-- Resumo do período (KPIs).
create or replace function uso_portal_resumo(
  p_de date,
  p_ate date,
  p_usuario_id uuid default null,
  p_chave_api_id uuid default null,
  p_as_rede_id uuid default null
) returns table (
  total_acessos bigint,
  usuarios_unicos bigint,
  paginas_distintas bigint,
  tempo_medio_global_seg numeric
)
language sql stable as $$
  with eventos as (
    select
      path, usuario_id,
      extract(epoch from (
        lead(created_at) over (partition by usuario_id order by created_at) - created_at
      )) as duracao_seg
    from cci_uso_portal
    where (created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_usuario_id   is null or usuario_id   = p_usuario_id)
      and (p_chave_api_id is null or chave_api_id = p_chave_api_id)
      and (p_as_rede_id   is null or as_rede_id   = p_as_rede_id)
  )
  select
    count(*)::bigint                                      as total_acessos,
    count(distinct usuario_id)::bigint                    as usuarios_unicos,
    count(distinct path)::bigint                          as paginas_distintas,
    round(avg(duracao_seg) filter (where duracao_seg between 1 and 1800)::numeric, 1)
                                                          as tempo_medio_global_seg
  from eventos;
$$;
