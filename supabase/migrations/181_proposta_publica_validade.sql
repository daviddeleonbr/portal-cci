-- ============================================================
-- 181 — Proposta pública deixa de ser acessível após a validade
--
-- A RPC pública passa a checar `valida_ate`:
--   • token inexistente          → NULL (link inválido)
--   • token válido, mas EXPIRADO → { expirada: true, valida_ate }  (sem
--     expor serviços/valores — o link deixa de ser "público")
--   • dentro da validade (ou sem validade) → dados completos
-- ============================================================

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
  end
  from cci_propostas p
  where p.token = p_token
  limit 1;
$$;

revoke all on function cci_proposta_publica(uuid) from public;
grant execute on function cci_proposta_publica(uuid) to anon, authenticated;
