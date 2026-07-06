// ============================================================
// Edge Function: autosystem-produtividade-detalhe
//
// Retorna o detalhamento de um vendedor específico:
//   - produtos: linha por produto vendido no período (qtd, valor, custo, grupo)
//   - automotivos_mensal: 12 meses agregados (grupos de automotivos)
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, executarQuery, decodeBytea } from '../_shared/autosystem-query.ts';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigo?: string | number;
    vendedor_codigo?: string | number;
    data_de?: string;
    data_ate?: string;
    automotivos_data_de?: string;
    automotivos_data_ate?: string;
    grupos_automotivos?: (string | number)[];
    grupos_conveniencia?: (string | number)[];
    produtos_aditivada?: (string | number)[];
    produtos_comum?: (string | number)[];
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const {
    rede_id: redeId,
    empresa_codigo,
    vendedor_codigo,
    data_de, data_ate,
    automotivos_data_de, automotivos_data_ate,
    grupos_automotivos, grupos_conveniencia,
    produtos_aditivada, produtos_comum,
  } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (empresa_codigo == null) return json({ error: 'empresa_codigo é obrigatório' }, 400);
  if (vendedor_codigo == null) return json({ error: 'vendedor_codigo é obrigatório' }, 400);
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const empresaNum = Number(empresa_codigo);
  const vendedorNum = Number(vendedor_codigo);
  const toBigArr = (arr?: (string | number)[]) =>
    Array.isArray(arr) ? arr.map(v => Number(v)).filter(n => Number.isFinite(n)) : [];
  const gAuto = toBigArr(grupos_automotivos);
  const gConv = toBigArr(grupos_conveniencia);
  const pAditiv = toBigArr(produtos_aditivada);
  const pComum  = toBigArr(produtos_comum);

  const isBytea = (v: unknown): boolean => {
    if (v instanceof Uint8Array) return true;
    if (typeof v === 'object' && v !== null && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) return true;
    return false;
  };
  const decodeRow = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (isBytea(v)) out[k] = decodeBytea(v, 'windows-1252');
      else out[k] = v;
    }
    return out;
  };

  try {
    const rede = await obterRede(supabase, redeId, req);

    const prodRows = await executarQuery(rede, `
        select
          l.empresa,
          l.produto                                                  as produto_codigo,
          convert_to(coalesce(prod.nome::text, ''), 'LATIN1')        as produto_nome,
          prod.grupo                                                  as grupo_codigo,
          sum(coalesce(l.quantidade, 0))                              as quantidade,
          sum(coalesce(l.valor, 0))                                   as valor,
          sum(
            coalesce(
              (select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid),
              0
            ) * l.quantidade
          )                                                            as valor_custo,
          count(*)                                                     as itens
        from lancto l
        left join produto prod on prod.grid = l.produto
        where l.operacao = 'V'
          and l.empresa  = $1::bigint
          and l.vendedor = $2::bigint
          and l.data between $3 and $4
          and not exists (
            select 1 from lancto d
             where d.mlid = l.mlid
               and d.produto = l.produto
               and d.operacao = 'DC'
          )
        group by l.empresa, l.produto, prod.nome, prod.grupo
        order by sum(l.valor) desc
      `, [empresaNum, vendedorNum, data_de, data_ate], { encoding: 'SQL_ASCII' });
    const produtos = prodRows.map(decodeRow);

    let automotivos_mensal: Record<string, unknown>[] = [];
    if (automotivos_data_de && automotivos_data_ate) {
      const usoRows = await executarQuery(rede, `
          select
            to_char(l.data, 'YYYY-MM')                  as ano_mes,
            sum(coalesce(l.quantidade, 0))              as quantidade,
            sum(coalesce(l.valor, 0))                   as valor
          from lancto l
          left join produto prod on prod.grid = l.produto
          where l.operacao = 'V'
            and l.empresa  = $1::bigint
            and l.vendedor = $2::bigint
            and l.data between $3 and $4
            and (cardinality($5::bigint[]) = 0 or prod.grupo = any($5::bigint[]))
            and not exists (
              select 1 from lancto d
               where d.mlid = l.mlid
                 and d.produto = l.produto
                 and d.operacao = 'DC'
            )
          group by to_char(l.data, 'YYYY-MM')
          order by to_char(l.data, 'YYYY-MM')
        `, [empresaNum, vendedorNum, automotivos_data_de, automotivos_data_ate, gAuto], { encoding: 'SQL_ASCII' });
      automotivos_mensal = usoRows;
    }

    // Mix aditivada mensal (12 meses): litros aditivada vs comum por mês.
    let mix_mensal: Record<string, unknown>[] = [];
    if (automotivos_data_de && automotivos_data_ate && (pAditiv.length > 0 || pComum.length > 0)) {
      mix_mensal = await executarQuery(rede, `
          select
            to_char(l.data, 'YYYY-MM')                                                           as ano_mes,
            sum(case when l.produto = any($5::bigint[]) then coalesce(l.quantidade,0) else 0 end) as litros_aditivada,
            sum(case when l.produto = any($6::bigint[]) then coalesce(l.quantidade,0) else 0 end) as litros_comum
          from lancto l
          where l.operacao = 'V'
            and l.empresa  = $1::bigint
            and l.vendedor = $2::bigint
            and l.data between $3 and $4
            and (l.produto = any($5::bigint[]) or l.produto = any($6::bigint[]))
            and not exists (
              select 1 from lancto d
               where d.mlid = l.mlid and d.produto = l.produto and d.operacao = 'DC'
            )
          group by to_char(l.data, 'YYYY-MM')
          order by to_char(l.data, 'YYYY-MM')
        `, [empresaNum, vendedorNum, automotivos_data_de, automotivos_data_ate, pAditiv, pComum], { encoding: 'SQL_ASCII' });
    }

    // Conveniência mensal (12 meses): faturamento + atendimentos (notas = mlid distintos).
    let conveniencia_mensal: Record<string, unknown>[] = [];
    if (automotivos_data_de && automotivos_data_ate && gConv.length > 0) {
      conveniencia_mensal = await executarQuery(rede, `
          select
            to_char(l.data, 'YYYY-MM')     as ano_mes,
            sum(coalesce(l.valor, 0))      as valor,
            count(distinct l.mlid)         as atendimentos
          from lancto l
          left join produto prod on prod.grid = l.produto
          where l.operacao = 'V'
            and l.empresa  = $1::bigint
            and l.vendedor = $2::bigint
            and l.data between $3 and $4
            and prod.grupo = any($5::bigint[])
            and not exists (
              select 1 from lancto d
               where d.mlid = l.mlid and d.produto = l.produto and d.operacao = 'DC'
            )
          group by to_char(l.data, 'YYYY-MM')
          order by to_char(l.data, 'YYYY-MM')
        `, [empresaNum, vendedorNum, automotivos_data_de, automotivos_data_ate, gConv], { encoding: 'SQL_ASCII' });
    }

    return json({ produtos, automotivos_mensal, mix_mensal, conveniencia_mensal });
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
