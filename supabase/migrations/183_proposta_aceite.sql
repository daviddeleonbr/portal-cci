-- ============================================================
-- 183 — Aceite público da proposta (com prova)
--
-- O cliente (anônimo) pode ACEITAR a proposta pelo link. Registramos:
--   • status → 'aceita' + aceita_em;
--   • uma linha em cci_proposta_aceites com IP e user-agent (capturados no
--     SERVIDOR, via request.headers) + `dados` (dispositivo/geolocalização
--     enviados pelo navegador) — prova da aceitação.
-- Tudo via RPC SECURITY DEFINER (a tabela de propostas continua admin-only).
-- ============================================================

create table if not exists cci_proposta_aceites (
  id          uuid default gen_random_uuid() primary key,
  proposta_id uuid not null references cci_propostas(id) on delete cascade,
  aceito_em   timestamptz not null default now(),
  ip          text,
  user_agent  text,
  dados       jsonb,          -- dispositivo, tela, fuso, geolocalização, etc.
  created_at  timestamptz default now()
);
create index if not exists idx_prop_aceites_proposta on cci_proposta_aceites(proposta_id, aceito_em desc);

alter table cci_proposta_aceites enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='cci_proposta_aceites' and policyname='aceites_admin_read') then
    create policy aceites_admin_read on cci_proposta_aceites for select using (cci_is_admin());
  end if;
end $$;
revoke all on cci_proposta_aceites from anon;

-- ─── RPC pública: registrar o aceite ───────────────────────────
create or replace function cci_proposta_aceitar(p_token uuid, p_dados jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop    cci_propostas;
  v_headers json;
  v_ip      text;
  v_ua      text;
begin
  select * into v_prop from cci_propostas where token = p_token limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrada');
  end if;
  if v_prop.valida_ate is not null and v_prop.valida_ate < current_date then
    return jsonb_build_object('ok', false, 'erro', 'expirada');
  end if;
  if v_prop.status in ('aceita', 'convertida') then
    return jsonb_build_object('ok', true, 'ja_aceita', true, 'status', v_prop.status, 'aceito_em', v_prop.aceita_em);
  end if;
  if v_prop.status = 'rejeitada' then
    return jsonb_build_object('ok', false, 'erro', 'rejeitada');
  end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then v_headers := null;
  end;
  v_ip := coalesce(
    nullif(trim(split_part(v_headers->>'x-forwarded-for', ',', 1)), ''),
    v_headers->>'x-real-ip',
    v_headers->>'cf-connecting-ip'
  );
  v_ua := v_headers->>'user-agent';

  update cci_propostas set status = 'aceita', aceita_em = now() where id = v_prop.id;
  insert into cci_proposta_aceites (proposta_id, ip, user_agent, dados)
    values (v_prop.id, v_ip, v_ua, coalesce(p_dados, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'status', 'aceita', 'aceito_em', now());
end;
$$;

revoke all on function cci_proposta_aceitar(uuid, jsonb) from public;
grant execute on function cci_proposta_aceitar(uuid, jsonb) to anon, authenticated;

-- ─── RPC pública de leitura: passa a devolver status/aceito_em ──
create or replace function cci_proposta_publica(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p.valida_ate is not null and p.valida_ate < current_date then
      jsonb_build_object('expirada', true, 'valida_ate', p.valida_ate)
    else
      jsonb_build_object(
        'id',                        p.id,
        'modelo',                    p.modelo,
        'status',                    p.status,
        'aceito_em',                 p.aceita_em,
        'titulo',                    p.titulo,
        'descricao',                 p.descricao,
        'observacoes',               p.observacoes,
        'cliente_nome',              p.cliente_nome,
        'data_proposta',             p.data_proposta,
        'valida_ate',                p.valida_ate,
        'desconto_valor',            p.desconto_valor,
        'desconto_percentual',       p.desconto_percentual,
        'conteudo_md',               p.conteudo_md,
        'investimento_valor',        p.investimento_valor,
        'investimento_periodicidade',p.investimento_periodicidade,
        'itens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',             i.id,
            'nome',           i.nome,
            'descricao',      i.descricao,
            'categoria',      i.categoria,
            'periodicidade',  i.periodicidade,
            'tipo_valor',     i.tipo_valor,
            'unidade',        i.unidade,
            'quantidade',     i.quantidade,
            'valor_unitario', i.valor_unitario,
            'ordem',          i.ordem
          ) order by i.ordem)
          from cci_proposta_itens i
          where i.proposta_id = p.id
        ), '[]'::jsonb)
      )
  end
  from cci_propostas p
  where p.token = p_token
  limit 1;
$$;

revoke all on function cci_proposta_publica(uuid) from public;
grant execute on function cci_proposta_publica(uuid) to anon, authenticated;
