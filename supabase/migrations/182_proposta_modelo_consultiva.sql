-- ============================================================
-- 182 — Segundo modelo de proposta: "consultiva"
--
-- A proposta pode ser exibida como:
--   • 'calculadora' (padrão) — menu de serviços interativo (itens);
--   • 'consultiva'           — documento em markdown + um bloco de
--                              Investimento (valor fixo), sem calculadora.
-- ============================================================

alter table cci_propostas
  add column if not exists modelo text not null default 'calculadora',
  add column if not exists conteudo_md text,
  add column if not exists investimento_valor numeric(14,2),
  add column if not exists investimento_periodicidade text default 'mensal';

-- Constraints (idempotentes)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cci_propostas_modelo_chk') then
    alter table cci_propostas add constraint cci_propostas_modelo_chk
      check (modelo in ('calculadora', 'consultiva'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cci_propostas_inv_per_chk') then
    alter table cci_propostas add constraint cci_propostas_inv_per_chk
      check (investimento_periodicidade in ('mensal', 'anual', 'unico'));
  end if;
end $$;

-- ─── RPC pública: inclui o modelo e os campos da consultiva ─────
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
