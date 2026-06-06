// ============================================================
// Edge Function: autosystem-estoque-produto
//
// Retorna o estoque ATUAL (snapshot mais recente) de cada produto por
// empresa da rede, com grupo e subgrupo. Equivalente à consulta usada
// no Power BI / relatórios do cliente:
//
//   SELECT MAX(ep.data) AS data,
//          ep.empresa, ep.produto,
//          gp.nome  AS grupo,
//          sp.nome  AS subgrupo,
//          SUM(ep.estoque) AS estoque
//     FROM estoque_produto ep,
//          produto p, grupo_produto gp, subgrupo_produto sp
//    WHERE ep.data >= '2000-01-01'
//      AND ep.data <  $data_corte
//      AND p.grid     = ep.produto
//      AND p.grupo    = gp.grid
//      AND p.subgrupo = sp.grid
//    GROUP BY ep.empresa, ep.produto, gp.nome, sp.nome
//
// Acrescentado: nome do produto, código bomba do produto (quando houver),
// filtro opcional por empresa. Encoding LATIN1 → windows-1252 como nas
// demais edge functions Autosystem.
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

const TEXT_COLUMNS = new Set(['produto_nome', 'grupo', 'subgrupo']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigo?: string | number | null;
    data_corte?: string | null;
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigo: empresaCodigo, data_corte } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);

  // Default: a partir de amanhã (inclusive estoques lançados hoje).
  let dataCorte = data_corte;
  if (!dataCorte) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    dataCorte = d.toISOString().slice(0, 10);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: credRows, error: credErr } = await supabase.rpc(
    'as_rede_get_credenciais', { p_id: redeId },
  );
  if (credErr) return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) return json({ error: 'Rede não encontrada' }, 404);

  const { conexao_ip, conexao_porta, conexao_banco, conexao_usuario, conexao_senha } = cred;
  if (!conexao_ip || !conexao_banco || !conexao_usuario || !conexao_senha) {
    return json({ error: 'Credenciais incompletas para a rede informada' }, 400);
  }

  const pg = new PgClient({
    hostname: conexao_ip, port: conexao_porta || 5432,
    database: conexao_banco, user: conexao_usuario, password: conexao_senha,
    tls: { enabled: false },
  });

  let failedStep = 'connect';
  try {
    await pg.connect();
    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    // Subquery agregada (MAX data + SUM estoque) → join nos nomes.
    failedStep = 'select_estoque_produto';
    const params: unknown[] = [dataCorte];
    const condsEmpresa = empresaCodigo != null && empresaCodigo !== ''
      ? (params.push(empresaCodigo), `AND ep.empresa = $${params.length}`)
      : '';

    const sql = `
      SELECT
        ep.empresa,
        ep.produto,
        convert_to(coalesce(p.nome,  ''),  'LATIN1') AS produto_nome,
        convert_to(coalesce(gp.nome, ''),  'LATIN1') AS grupo,
        convert_to(coalesce(sp.nome, ''),  'LATIN1') AS subgrupo,
        MAX(ep.data)    AS data,
        SUM(ep.estoque) AS estoque
      FROM estoque_produto ep
      JOIN produto         p  ON p.grid     = ep.produto
      JOIN grupo_produto   gp ON gp.grid    = p.grupo
      JOIN subgrupo_produto sp ON sp.grid   = p.subgrupo
      WHERE ep.data >= '2000-01-01'
        AND ep.data <  $1
        ${condsEmpresa}
      GROUP BY ep.empresa, ep.produto, gp.nome, sp.nome, p.nome
      ORDER BY gp.nome, sp.nome, p.nome
    `;

    const result = await pg.queryObject<Record<string, unknown>>({ text: sql, args: params });

    const decoder = new TextDecoder('windows-1252');
    const linhas = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (TEXT_COLUMNS.has(k) && v instanceof Uint8Array) out[k] = decoder.decode(v);
        else out[k] = v;
      }
      return out;
    });

    return json({ itens: linhas, data_corte: dataCorte });
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
