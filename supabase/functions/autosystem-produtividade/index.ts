// ============================================================
// Edge Function: autosystem-produtividade
//
// Agrega `lancto` por vendedor, retornando totais (vendas, qtd, faturamento,
// custo, lucro) e quebra por categoria (combustível, automotivos, conveniência).
//
// O vínculo de nome do vendedor é: lancto.vendedor = pessoa.grid.
// As categorias são informadas pelo cliente (Supabase já tem mapeamento).
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
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    grupos_combustivel?:  (string | number)[];
    grupos_automotivos?:  (string | number)[];
    grupos_conveniencia?: (string | number)[];
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const {
    rede_id: redeId,
    empresa_codigos: empresaCodigos,
    data_de, data_ate,
    grupos_combustivel, grupos_automotivos, grupos_conveniencia,
  } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos[] é obrigatório' }, 400);
  }
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

  const empresasNum = empresaCodigos.map(v => Number(v)).filter(n => Number.isFinite(n));
  const toBigArr = (arr?: (string | number)[]) =>
    Array.isArray(arr) ? arr.map(v => Number(v)).filter(n => Number.isFinite(n)) : [];
  const gCombustivel  = toBigArr(grupos_combustivel);
  const gAutomotivos  = toBigArr(grupos_automotivos);
  const gConveniencia = toBigArr(grupos_conveniencia);

  let failedStep = 'connect';
  try {
    await pg.connect();

    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    failedStep = 'select_produtividade';
    // CTE: filtra V (sem DC) e calcula custo (via subquery escalar) e grupo do produto.
    // Em seguida agrupa por vendedor com totais e quebra por categoria.
    const res = await pg.queryObject<Record<string, unknown>>({
      text: `
        with base as (
          select
            l.empresa,
            l.vendedor,
            l.mlid,
            l.quantidade,
            l.valor,
            l.valor_desconto,
            prod.grupo                                                          as produto_grupo,
            coalesce(
              (select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid),
              0
            ) * l.quantidade                                                    as valor_custo
          from lancto l
          left join produto prod on prod.grid = l.produto
          where l.operacao = 'V'
            and l.empresa = any($1::bigint[])
            and l.data between $2 and $3
            and l.vendedor is not null
            and not exists (
              select 1 from lancto d
               where d.mlid = l.mlid
                 and d.produto = l.produto
                 and d.operacao = 'DC'
            )
        )
        select
          b.empresa,
          b.vendedor                                                              as vendedor_codigo,
          convert_to(coalesce(pe.nome::text, ''), 'LATIN1')                       as vendedor_nome,

          count(*)                                                                as vendas_count,
          count(distinct b.mlid)                                                   as transacoes_count,
          sum(coalesce(b.quantidade, 0))                                           as qtd_total,
          sum(coalesce(b.valor, 0))                                                as fat_total,
          sum(coalesce(b.valor_custo, 0))                                          as custo_total,
          sum(case when b.valor_desconto > 0 then b.valor_desconto else 0 end)     as acrescimos_total,
          sum(case when b.valor_desconto < 0 then abs(b.valor_desconto) else 0 end) as descontos_total,

          -- Combustível
          count(*) filter (where b.produto_grupo = any($4::bigint[]))             as vendas_combustivel,
          count(distinct b.mlid) filter (where b.produto_grupo = any($4::bigint[])) as abastecimentos,
          sum(case when b.produto_grupo = any($4::bigint[]) then b.quantidade else 0 end) as qtd_combustivel,
          sum(case when b.produto_grupo = any($4::bigint[]) then b.valor      else 0 end) as fat_combustivel,
          sum(case when b.produto_grupo = any($4::bigint[]) then b.valor_custo else 0 end) as custo_combustivel,

          -- Automotivos
          count(*) filter (where b.produto_grupo = any($5::bigint[]))             as vendas_automotivos,
          sum(case when b.produto_grupo = any($5::bigint[]) then b.quantidade else 0 end) as qtd_automotivos,
          sum(case when b.produto_grupo = any($5::bigint[]) then b.valor      else 0 end) as fat_automotivos,
          sum(case when b.produto_grupo = any($5::bigint[]) then b.valor_custo else 0 end) as custo_automotivos,

          -- Conveniência
          count(*) filter (where b.produto_grupo = any($6::bigint[]))             as vendas_conveniencia,
          sum(case when b.produto_grupo = any($6::bigint[]) then b.quantidade else 0 end) as qtd_conveniencia,
          sum(case when b.produto_grupo = any($6::bigint[]) then b.valor      else 0 end) as fat_conveniencia,
          sum(case when b.produto_grupo = any($6::bigint[]) then b.valor_custo else 0 end) as custo_conveniencia
        from base b
        left join pessoa pe on pe.grid = b.vendedor
        group by b.empresa, b.vendedor, pe.nome
        order by sum(b.valor) desc
      `,
      args: [empresasNum, data_de, data_ate, gCombustivel, gAutomotivos, gConveniencia],
    });

    const decoder = new TextDecoder('windows-1252');
    const vendedores = res.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v instanceof Uint8Array) out[k] = decoder.decode(v);
        else out[k] = v;
      }
      return out;
    });

    return json({ vendedores });
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
