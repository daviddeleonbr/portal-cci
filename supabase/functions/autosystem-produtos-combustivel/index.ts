// ============================================================
// Edge Function: autosystem-produtos-combustivel
//
// Retorna lista distinta de produtos (filtrada pelos grupos de combustível
// classificados na rede) com qtd vendida nos últimos 90 dias para contexto.
// Usado pela página de Configurações para o usuário marcar quais produtos
// são gasolina aditivada e quais são comum (cálculo de MIX).
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
        ? Number(v) : v.toString();
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
    grupos_filtro?: (string | number)[];
    dias?: number;
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }
  const { rede_id: redeId, grupos_filtro, dias } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);

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

  const pg = new PgClient({
    hostname: cred.conexao_ip,
    port: cred.conexao_porta || 5432,
    database: cred.conexao_banco,
    user: cred.conexao_usuario,
    password: cred.conexao_senha,
    tls: { enabled: false },
  });

  const gruposNum = Array.isArray(grupos_filtro)
    ? grupos_filtro.map(v => Number(v)).filter(n => Number.isFinite(n))
    : [];
  const janela = Math.max(7, Math.min(365, Number(dias) || 90));
  const decoder = new TextDecoder('windows-1252');

  let failedStep = 'connect';
  try {
    await pg.connect();
    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    failedStep = 'select_produtos';
    // Lista produtos distintos vendidos nos últimos N dias, restritos aos
    // grupos de combustível informados. Inclui litros para ordenar.
    const res = await pg.queryObject<Record<string, unknown>>({
      text: `
        select
          l.produto                                                 as produto_codigo,
          convert_to(coalesce(max(prod.nome::text), ''), 'LATIN1')  as produto_nome,
          max(prod.grupo)                                           as grupo_codigo,
          sum(coalesce(l.quantidade, 0))                            as litros_vendidos
        from lancto l
        left join produto prod on prod.grid = l.produto
        where l.operacao = 'V'
          and l.data >= current_date - ($1 || ' days')::interval
          and (cardinality($2::bigint[]) = 0 or prod.grupo = any($2::bigint[]))
        group by l.produto
        having sum(coalesce(l.quantidade, 0)) > 0
        order by sum(coalesce(l.quantidade, 0)) desc
        limit 200
      `,
      args: [janela, gruposNum],
    });
    const produtos = res.rows.map(row => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v instanceof Uint8Array) out[k] = decoder.decode(v);
        else out[k] = v;
      }
      return out;
    });

    return json({ produtos, dias: janela });
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
