-- ============================================================
-- 191 — Proposta: argumento "custo mensal de um funcionário"
--
-- Parâmetros GERAIS (uma linha) usados para calcular quanto custa, por mês,
-- um empregado do posto (salário + adicionais + encargos + benefícios +
-- provisões) — mesma conta da planilha de referência da CCI. Cada proposta
-- liga/desliga o argumento (mostrar_custo_funcionario); a página pública
-- recebe os parâmetros pela RPC cci_proposta_publica só quando ligado.
-- O cálculo em si é feito no front (src/utils/custoFuncionario.js).
-- ============================================================

create table if not exists cci_custo_funcionario_param (
  id                  smallint primary key default 1 check (id = 1),
  salario_minimo      numeric not null default 1621.00,  -- valor inicial do input (cliente pode trocar)
  pct_periculosidade  numeric not null default 30,       -- % sobre o salário contratual
  pct_assiduidade     numeric not null default 10,       -- % sobre o salário contratual
  pct_inss_empresa    numeric not null default 20,       -- % sobre a remuneração bruta
  pct_fgts            numeric not null default 8,        -- % sobre a remuneração bruta
  pct_rat             numeric not null default 3,        -- % sobre o salário contratual
  pct_terceiros       numeric not null default 5.8,      -- % sobre o salário contratual
  pct_inss_empregado  numeric not null default 8,        -- informativo (descontado do empregado)
  vt_unidades         numeric not null default 52,       -- passagens por mês
  vt_valor_unitario   numeric not null default 4.50,
  pct_desconto_vt     numeric not null default 6,        -- % do contratual descontado do empregado
  valor_alimentacao   numeric not null default 373.41,   -- ticket alimentação mensal
  updated_at          timestamptz not null default now()
);
insert into cci_custo_funcionario_param (id) values (1) on conflict (id) do nothing;

alter table cci_custo_funcionario_param enable row level security;
drop policy if exists cci_custo_func_sel on cci_custo_funcionario_param;
create policy cci_custo_func_sel on cci_custo_funcionario_param
  for select using (cci_is_admin());
drop policy if exists cci_custo_func_upd on cci_custo_funcionario_param;
create policy cci_custo_func_upd on cci_custo_funcionario_param
  for update using (cci_is_admin()) with check (cci_is_admin());
revoke all on cci_custo_funcionario_param from anon;

drop trigger if exists trg_cci_custo_func_updated on cci_custo_funcionario_param;
create trigger trg_cci_custo_func_updated
  before update on cci_custo_funcionario_param
  for each row execute function update_updated_at();

-- Liga/desliga o argumento em cada proposta.
alter table cci_propostas
  add column if not exists mostrar_custo_funcionario boolean not null default false;

-- RPC pública: mesma de antes (183) + 'custo_funcionario' (parâmetros) quando ligado.
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
        'custo_funcionario', case when p.mostrar_custo_funcionario then (
          select to_jsonb(c) - 'id' - 'updated_at' from cci_custo_funcionario_param c where c.id = 1
        ) end,
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
