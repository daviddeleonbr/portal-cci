// ============================================================
// Edge Function: autosystem-produtos-catalogo
//
// Retorna TODOS os produtos cadastrados na tabela `produto` do AS,
// independente de ter estoque ou venda. Útil pra busca em formulários
// (ex: novo pedido de compra).
//
//   SELECT p.grid AS produto,
//          p.nome AS produto_nome,
//          gp.nome AS grupo,
//          sp.nome AS subgrupo
//     FROM produto p
//     LEFT JOIN grupo_produto    gp ON gp.grid = p.grupo
//     LEFT JOIN subgrupo_produto sp ON sp.grid = p.subgrupo
//    ORDER BY p.nome
//
// Encoding LATIN1 → windows-1252 como nas demais edge functions Autosystem.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, executarQuery, decodeRowText } from '../_shared/autosystem-query.ts';

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

  let body: { rede_id?: string; busca?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, busca } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const rede = await obterRede(supabase, redeId, req);

    const params: unknown[] = [];
    // Filtro fixo: ignora produtos inativos (campo `flag` char A/D na tabela `produto`).
    // A = Ativo, D = Inativo/Desativado.
    const conds: string[] = [`p.flag = 'A'`];
    if (busca && String(busca).trim().length > 0) {
      params.push(`%${String(busca).trim().toLowerCase()}%`);
      conds.push(`(LOWER(p.nome) LIKE $${params.length} OR CAST(p.grid AS TEXT) LIKE $${params.length})`);
    }
    const whereClause = `WHERE ${conds.join(' AND ')}`;

    const sql = `
      SELECT
        p.grid         AS produto,         -- grid interno (usado pra join com estoque_produto)
        p.codigo       AS produto_codigo,  -- código humano-readable
        p.codigo_barra AS codigo_barra,    -- EAN / código de barras
        convert_to(coalesce(p.nome,  ''), 'LATIN1') AS produto_nome,
        convert_to(coalesce(gp.nome, ''), 'LATIN1') AS grupo,
        convert_to(coalesce(sp.nome, ''), 'LATIN1') AS subgrupo
      FROM produto p
      LEFT JOIN grupo_produto    gp ON gp.grid = p.grupo
      LEFT JOIN subgrupo_produto sp ON sp.grid = p.subgrupo
      ${whereClause}
      ORDER BY p.nome
      LIMIT 5000
    `;

    const result = await executarQuery(rede, sql, params, { encoding: 'SQL_ASCII' });

    const linhas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ produtos: linhas });
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
