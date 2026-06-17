// ============================================================
// Edge Function: autosystem-pessoas-catalogo
//
// Retorna o catálogo de pessoas (fornecedores/clientes) cadastradas na
// tabela `pessoa` do AS. Usado em buscas de formulários (ex: pedido de
// compra → seleção do fornecedor).
//
//   SELECT p.grid AS pessoa,
//          p.codigo AS pessoa_codigo,
//          p.nome AS pessoa_nome
//     FROM pessoa p
//    WHERE p.ativo = 'S'
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

const TEXT_COLUMNS = new Set(['pessoa_nome', 'nome_reduzido', 'cidade', 'estado']);

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
    const rede = await obterRede(supabase, redeId);

    const params: unknown[] = [];
    // Filtro fixo: somente pessoas ATIVAS (flag = 'A')
    const conds: string[] = [`p.flag = 'A'`];
    if (busca && String(busca).trim().length > 0) {
      params.push(`%${String(busca).trim().toLowerCase()}%`);
      conds.push(`(LOWER(p.nome) LIKE $${params.length} OR LOWER(coalesce(p.nome_reduzido, '')) LIKE $${params.length} OR CAST(p.codigo AS TEXT) LIKE $${params.length} OR CAST(p.cpf AS TEXT) LIKE $${params.length})`);
    }
    const whereClause = `WHERE ${conds.join(' AND ')}`;

    const sql = `
      SELECT
        p.grid    AS pessoa,         -- grid interno
        p.codigo  AS pessoa_codigo,  -- código humano-readable
        convert_to(coalesce(p.nome,          ''), 'LATIN1') AS pessoa_nome,
        convert_to(coalesce(p.nome_reduzido, ''), 'LATIN1') AS nome_reduzido,
        convert_to(coalesce(p.cidade,        ''), 'LATIN1') AS cidade,
        convert_to(coalesce(p.estado,        ''), 'LATIN1') AS estado,
        p.cpf AS cpf
      FROM pessoa p
      ${whereClause}
      ORDER BY p.nome
      LIMIT 5000
    `;

    const result = await executarQuery(rede, sql, params, { encoding: 'SQL_ASCII' });

    const linhas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ pessoas: linhas });
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
