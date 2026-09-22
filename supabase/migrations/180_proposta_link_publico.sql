-- ============================================================
-- 180 — Link público da proposta (calculadora read-only p/ o cliente)
--
-- O admin gera um `token` (uuid) na proposta e compartilha o link
-- /proposta/<token>. A página pública (sem login) lê a proposta + itens
-- via a RPC `cci_proposta_publica`, que é SECURITY DEFINER e devolve
-- apenas campos NÃO sensíveis (sem cnpj/email do cliente). Assim não
-- precisamos abrir RLS de leitura anon na tabela `cci_propostas`
-- (que continua admin-only).
-- ============================================================

alter table cci_propostas add column if not exists token uuid;

-- Único quando presente (permite várias propostas sem token).
create unique index if not exists idx_propostas_token
  on cci_propostas(token) where token is not null;

-- ─── RPC pública: proposta + itens por token ───────────────────
create or replace function cci_proposta_publica(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id',                  p.id,
    'titulo',              p.titulo,
    'descricao',           p.descricao,
    'observacoes',         p.observacoes,
    'cliente_nome',        p.cliente_nome,
    'data_proposta',       p.data_proposta,
    'valida_ate',          p.valida_ate,
    'desconto_valor',      p.desconto_valor,
    'desconto_percentual', p.desconto_percentual,
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
  from cci_propostas p
  where p.token = p_token
  limit 1;
$$;

-- Trava e libera só p/ os papéis que devem chamar (anon = link público).
revoke all on function cci_proposta_publica(uuid) from public;
grant execute on function cci_proposta_publica(uuid) to anon, authenticated;
