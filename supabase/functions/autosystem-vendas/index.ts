// ============================================================
// Edge Function: autosystem-vendas
//
// Retorna itens vendidos no período para um conjunto de empresas
// da rede Autosystem. Junta `lancto` com `produto` para trazer
// nome do produto e código do grupo (usado para classificação).
//
// Query base (fornecida pelo cliente):
//   SELECT l.empresa, l.data, l.hora, l.produto, l.quantidade,
//          l.valor, l.vendedor
//   FROM lancto l
//   WHERE l.operacao = 'V'
//     AND NOT EXISTS (
//       SELECT 1 FROM lancto d WHERE d.mlid = l.mlid AND d.operacao = 'DC'
//     )
//
// Acrescentamos:
//   - filtro por l.empresa = ANY($empresa_codigos)
//   - filtro por l.data BETWEEN $data_de AND $data_ate
//   - JOIN com produto pra trazer descrição + grupo_produto (categorização)
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, executarQuery, withConexao, decodeRowText } from '../_shared/autosystem-query.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  const replacer = (_k: string, v: unknown) => {
    if (typeof v === 'bigint') {
      return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(v)
        : v.toString();
    }
    return v;
  };
  return new Response(JSON.stringify(body, replacer), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const TEXT_COLUMNS = new Set(['produto_nome', 'vendedor', 'vendedor_nome']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    // Quando true, retorna uma linha por (empresa, produto, vendedor) com
    // sum(quantidade), sum(valor), count(*) — usado pela tela ComercialVendas
    // (período longo, sem necessidade dos itens individuais). Reduz drasticamente
    // a memória da Edge Function. O BPO continua chamando sem este flag para
    // receber as linhas individuais e calcular acréscimos/descontos.
    agregado?: boolean;
    // Quando true, agrega APENAS por mês (ano-mes). Retorna 1 linha por mês
    // do período com valor/custo/quantidade — usado pelo gráfico de evolução
    // dos últimos 12 meses na tela ComercialVendas. Tem precedência sobre `agregado`.
    por_mes?: boolean;
    // Quando true, agrega por (empresa, data, produto). Inclui acréscimos
    // (valor_desconto>0) e descontos (valor_desconto<0) separados. Tem
    // precedência sobre `agregado` e `por_mes`.
    por_dia?: boolean;
    // Quando true, agrega por (ano_mes, produto) — usado pela evolução
    // mensal por combustível na tela ComercialVendas.
    por_mes_produto?: boolean;
    // Quando true, retorna pares de produtos comprados juntos (mesmo mlid),
    // ordenados pelo número de transações em que apareceram juntos.
    // Usado pela análise de cesta de compras na ComercialVendas.
    pares_carrinho?: boolean;
    // Filtro opcional por `produto.grupo` (lista de grids). Vazio = sem filtro.
    grupos_filtro?: (string | number)[];
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, agregado, por_mes, por_dia, por_mes_produto, pares_carrinho, grupos_filtro } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos[] é obrigatório (ao menos uma empresa)' }, 400);
  }
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios (YYYY-MM-DD)' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const rede = await obterRede(supabase, redeId);

    // `lancto.empresa`, `lancto.produto` e `produto.grid` são numéricos
    // (bigint). Envia o array de empresas como números e compara via bigint[].
    const empresasNum = empresaCodigos
      .map(v => Number(v))
      .filter(n => Number.isFinite(n));

    // Custo da venda: `estoque_lancto.custo_medio` × `lancto.quantidade`.
    // JOIN é por `estoque_lancto.lancto = lancto.grid`. Usamos média via
    // subquery escalar para evitar multiplicação de linhas caso haja mais
    // de um movimento de estoque por lançamento.
    const gruposNum = Array.isArray(grupos_filtro)
      ? grupos_filtro.map(v => Number(v)).filter(n => Number.isFinite(n))
      : [];

    // ─── Modo: análise de cesta (pares de produtos comprados juntos) ───
    // Agrupa por `documento` (nº da nota fiscal, text). Ignora documentos
    // nulos/vazios. Devoluções (DC) ainda são filtradas pelo `mlid` que casa
    // venda original ↔ devolução para o mesmo produto.
    if (pares_carrinho) {
      const { totRows, paresRows } = await withConexao(rede, async (run) => {
        // Total de notas (documentos distintos) no período — base do % support.
        const totRows = await run(`
          select count(distinct documento::text) as total
          from lancto
          where operacao = 'V'
            and empresa = any($1::bigint[])
            and data between $2 and $3
            and documento is not null
            and trim(documento::text) <> ''
        `, [empresasNum, data_de, data_ate]);

        // Pares (a < b) — junta lancto consigo mesmo pelo `documento` (mesma nota),
        // restrita à mesma empresa e à mesma data (notas não compartilham dia entre empresas).
        const paresRows = await run(`
          select
            la.produto                                                as produto_a,
            convert_to(coalesce(pa.nome::text, ''), 'LATIN1')         as produto_a_nome,
            pa.grupo                                                  as grupo_a,
            lb.produto                                                as produto_b,
            convert_to(coalesce(pb.nome::text, ''), 'LATIN1')         as produto_b_nome,
            pb.grupo                                                  as grupo_b,
            count(distinct la.documento::text)                        as transacoes_juntas,
            sum(la.valor + lb.valor)                                  as valor_juntas,
            sum(la.quantidade + lb.quantidade)                        as quantidade_juntas
          from lancto la
          join lancto lb on lb.documento::text = la.documento::text
                        and lb.empresa = la.empresa
                        and lb.data    = la.data
                        and lb.produto > la.produto
                        and lb.operacao = 'V'
          left join produto pa on pa.grid = la.produto
          left join produto pb on pb.grid = lb.produto
          where la.operacao = 'V'
            and la.empresa = any($1::bigint[])
            and la.data between $2 and $3
            and la.documento is not null
            and trim(la.documento::text) <> ''
            and (cardinality($4::bigint[]) = 0
                 or (pa.grupo = any($4::bigint[]) and pb.grupo = any($4::bigint[])))
            and not exists (
              select 1 from lancto d
               where d.mlid = la.mlid and d.produto = la.produto and d.operacao = 'DC'
            )
            and not exists (
              select 1 from lancto d
               where d.mlid = lb.mlid and d.produto = lb.produto and d.operacao = 'DC'
            )
          group by la.produto, pa.nome, pa.grupo, lb.produto, pb.nome, pb.grupo
          order by count(distinct la.documento::text) desc
          limit 500
        `, [empresasNum, data_de, data_ate, gruposNum]);

        return { totRows, paresRows };
      }, { encoding: 'SQL_ASCII' });

      const total_transacoes = Number((totRows[0] as any)?.total) || 0;

      const TEXT_PAIR = new Set(['produto_a_nome', 'produto_b_nome']);
      const pares = paresRows.map((row) => decodeRowText(row, TEXT_PAIR, 'windows-1252'));

      return json({ pares, total_transacoes });
    }

    // ─── CTE de custo via SRs ligadas por seq_cupom ────────────────
    // Replicação fiel da lógica interna do Autosystem. O link correto entre
    // V e suas SRs é via `mlid + seq_cupom`. Para cada SR linkada, o custo
    // unitário da matéria-prima vem da função pública (2-arg)
    // `preco_custo_empresa_f(produto, empresa)` — versão que comprovadamente
    // bateu com R$ 2.232,00 no produto 920 (CAPUCCINO TRADICIONAL UN,
    // período 01-30/04/2026).
    const cteCustoComposto = `
      with custo_composto_v as (
        select v.grid as v_grid,
               coalesce(
                 (select sum(sr.quantidade * preco_custo_empresa_f(sr.produto, v.empresa))
                  from lancto sr
                  where sr.mlid = v.mlid
                    and sr.seq_cupom = v.seq_cupom
                    and sr.operacao = 'SR'),
                 0
               ) as custo
        from lancto v
        where v.operacao = 'V'
          and v.empresa = any($1::bigint[])
          and v.data between $2 and $3
          and exists (select 1 from produto_composicao pc where pc.produto = v.produto)
      )
    `;

    const sql = por_mes_produto
      ? `${cteCustoComposto}
      select
        to_char(l.data, 'YYYY-MM')                                 as ano_mes,
        l.produto                                                  as produto_codigo,
        convert_to(coalesce(prod.nome::text, ''), 'LATIN1')       as produto_nome,
        prod.grupo                                                 as grupo_produto_codigo,
        sum(l.quantidade)                                          as quantidade,
        sum(l.valor)                                                as valor,
        sum(
          coalesce(
            nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade,
            cc.custo,
            0
          )
        )                                                           as valor_custo
      from lancto l
      left join produto prod on prod.grid = l.produto
      left join custo_composto_v cc on cc.v_grid = l.grid
      where l.operacao = 'V'
        and l.empresa = any($1::bigint[])
        and l.data between $2 and $3
        and (cardinality($4::bigint[]) = 0 or prod.grupo = any($4::bigint[]))
        and not exists (
          select 1 from lancto d
           where d.mlid     = l.mlid
             and d.produto  = l.produto
             and d.operacao = 'DC'
        )
      group by to_char(l.data, 'YYYY-MM'), l.produto, prod.nome, prod.grupo
      order by to_char(l.data, 'YYYY-MM'), sum(l.valor) desc
    `
      : por_dia
      ? `${cteCustoComposto}
      select
        l.empresa,
        l.data,
        prod.codigo                                                as produto_codigo,
        convert_to(coalesce(prod.nome::text, ''), 'LATIN1')       as produto_nome,
        prod.grupo                                                 as grupo_produto_codigo,
        sum(l.quantidade)                                          as quantidade,
        sum(l.valor)                                                as valor,
        sum(coalesce(l.valor_desconto, 0))                          as valor_desconto,
        sum(case when l.valor_desconto > 0 then l.valor_desconto else 0 end)              as valor_acrescimo,
        sum(case when l.valor_desconto < 0 then abs(l.valor_desconto) else 0 end)         as valor_descontos,
        sum(
          coalesce(
            nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade,
            cc.custo,
            0
          )
        )                                                           as valor_custo
      from lancto l
      left join produto prod on prod.grid = l.produto
      left join custo_composto_v cc on cc.v_grid = l.grid
      where l.operacao = 'V'
        and l.empresa = any($1::bigint[])
        and l.data between $2 and $3
        and (cardinality($4::bigint[]) = 0 or prod.grupo = any($4::bigint[]))
        and not exists (
          select 1 from lancto d
           where d.mlid     = l.mlid
             and d.produto  = l.produto
             and d.operacao = 'DC'
        )
      group by l.empresa, l.data, prod.codigo, prod.nome, prod.grupo
      order by l.data, sum(l.valor) desc
    `
      : por_mes
      ? `${cteCustoComposto}
      select
        to_char(l.data, 'YYYY-MM')                                 as ano_mes,
        sum(l.quantidade)                                          as quantidade,
        sum(l.valor)                                                as valor,
        sum(
          coalesce(
            nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade,
            cc.custo,
            0
          )
        )                                                           as valor_custo
      from lancto l
      left join custo_composto_v cc on cc.v_grid = l.grid
      where l.operacao = 'V'
        and l.empresa = any($1::bigint[])
        and l.data between $2 and $3
        and not exists (
          select 1 from lancto d
           where d.mlid     = l.mlid
             and d.produto  = l.produto
             and d.operacao = 'DC'
        )
      group by to_char(l.data, 'YYYY-MM')
      order by to_char(l.data, 'YYYY-MM')
    `
      : agregado
      ? `${cteCustoComposto}
      select
        l.empresa,
        l.produto                                                 as produto_codigo,
        convert_to(coalesce(prod.nome::text, ''), 'LATIN1')       as produto_nome,
        prod.grupo                                                 as grupo_produto_codigo,
        sum(l.quantidade)                                         as quantidade,
        sum(l.valor)                                               as valor,
        sum(coalesce(l.valor_desconto, 0))                         as valor_desconto,
        sum(
          coalesce(
            nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade,
            cc.custo,
            0
          )
        )                                                          as valor_custo,
        count(*)                                                   as itens,
        l.vendedor                                                 as vendedor_pessoa_id,
        convert_to(coalesce(pe.nome::text, ''), 'LATIN1')         as vendedor_nome,
        convert_to(coalesce(l.vendedor::text, ''), 'LATIN1')      as vendedor
      from lancto l
      left join produto prod on prod.grid = l.produto
      left join pessoa  pe   on pe.grid   = l.vendedor
      left join custo_composto_v cc on cc.v_grid = l.grid
      where l.operacao = 'V'
        and l.empresa = any($1::bigint[])
        and l.data between $2 and $3
        and not exists (
          select 1 from lancto d
           where d.mlid     = l.mlid
             and d.produto  = l.produto
             and d.operacao = 'DC'
        )
      group by l.empresa, l.produto, prod.nome, prod.grupo, l.vendedor, pe.nome
      order by sum(l.valor) desc
    `
      : `${cteCustoComposto}
      select
        l.empresa,
        l.data,
        l.hora,
        l.produto                                                 as produto_codigo,
        convert_to(coalesce(prod.nome::text, ''), 'LATIN1')       as produto_nome,
        prod.grupo                                                 as grupo_produto_codigo,
        l.quantidade,
        l.valor,
        l.valor_desconto,
        coalesce(
          nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade,
          cc.custo,
          0
        )                                                          as valor_custo,
        l.vendedor                                                 as vendedor_pessoa_id,
        convert_to(coalesce(pe.nome::text, ''), 'LATIN1')         as vendedor_nome,
        convert_to(coalesce(l.vendedor::text, ''), 'LATIN1')      as vendedor
      from lancto l
      left join produto prod on prod.grid = l.produto
      left join pessoa  pe   on pe.grid   = l.vendedor
      left join custo_composto_v cc on cc.v_grid = l.grid
      where l.operacao = 'V'
        and l.empresa = any($1::bigint[])
        and l.data between $2 and $3
        and not exists (
          select 1 from lancto d
           where d.mlid     = l.mlid
             and d.produto  = l.produto
             and d.operacao = 'DC'
        )
      order by l.data, l.hora
    `;

    const result = await executarQuery(rede, sql,
      (por_dia || por_mes_produto)
        ? [empresasNum, data_de, data_ate, gruposNum]
        : [empresasNum, data_de, data_ate],
      { encoding: 'SQL_ASCII' });

    const itens = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    // No modo `por_dia` / `por_mes` / `por_mes_produto` devolvemos em chave
    // separada, já que a forma dos itens é diferente.
    if (por_dia)         return json({ diario: itens });
    if (por_mes_produto) return json({ mensal_produto: itens });
    if (por_mes)         return json({ mensal: itens });
    return json({ vendas: itens });
  } catch (err) {
    return json(
      {
        error: 'Falha ao consultar o servidor Autosystem',
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }
});
