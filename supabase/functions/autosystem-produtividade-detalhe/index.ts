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
import { Client as PgClient } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

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
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const {
    rede_id: redeId,
    empresa_codigo,
    vendedor_codigo,
    data_de, data_ate,
    automotivos_data_de, automotivos_data_ate,
    grupos_automotivos,
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

  const { data: credRows, error: credErr } = await supabase.rpc('as_rede_get_credenciais', { p_id: redeId });
  if (credErr) return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) return json({ error: 'Rede não encontrada' }, 404);

  const { conexao_ip, conexao_porta, conexao_banco, conexao_usuario, conexao_senha } = cred;
  if (!conexao_ip || !conexao_banco || !conexao_usuario || !conexao_senha) {
    return json({ error: 'Credenciais incompletas para a rede informada' }, 400);
  }

  const pg = new PgClient({
    hostname: conexao_ip,
    port: conexao_porta || 5432,
    database: conexao_banco,
    user: conexao_usuario,
    password: conexao_senha,
    tls: { enabled: false },
  });

  const empresaNum = Number(empresa_codigo);
  const vendedorNum = Number(vendedor_codigo);
  const toBigArr = (arr?: (string | number)[]) =>
    Array.isArray(arr) ? arr.map(v => Number(v)).filter(n => Number.isFinite(n)) : [];
  const gAuto = toBigArr(grupos_automotivos);

  const decoder = new TextDecoder('windows-1252');
  const decodeRow = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Uint8Array) out[k] = decoder.decode(v);
      else out[k] = v;
    }
    return out;
  };

  let failedStep = 'connect';
  try {
    await pg.connect();

    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    failedStep = 'select_produtos';
    const prodRes = await pg.queryObject<Record<string, unknown>>({
      text: `
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
      `,
      args: [empresaNum, vendedorNum, data_de, data_ate],
    });
    const produtos = prodRes.rows.map(decodeRow);

    failedStep = 'select_automotivos_mensal';
    let automotivos_mensal: Record<string, unknown>[] = [];
    if (automotivos_data_de && automotivos_data_ate) {
      const usoRes = await pg.queryObject<Record<string, unknown>>({
        text: `
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
        `,
        args: [empresaNum, vendedorNum, automotivos_data_de, automotivos_data_ate, gAuto],
      });
      automotivos_mensal = usoRes.rows;
    }

    return json({ produtos, automotivos_mensal });
  } catch (err) {
    return json(
      {
        error: 'Falha ao consultar o servidor Autosystem',
        detail: err instanceof Error ? err.message : String(err),
        failed_step: failedStep,
      },
      502,
    );
  } finally {
    try { await pg.end(); } catch { /* noop */ }
  }
});
