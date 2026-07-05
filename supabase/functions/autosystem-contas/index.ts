// ============================================================
// Edge Function: autosystem-contas
//
// Lê o plano de contas do servidor Autosystem remoto.
// Cliente front classifica cada conta como Dinheiro / Cartão+PIX /
// Cheque / A prazo / Outros e persiste em as_rede_conta_categoria.
//
// Query:
//   SELECT codigo, nome FROM conta ORDER BY codigo
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

  let body: { rede_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const rede = await obterRede(supabase, redeId, req);
    const rows = await executarQuery(rede, `
      select
        codigo::text                                          as codigo,
        convert_to(coalesce(nome::text, ''), 'LATIN1')        as nome
      from conta
      order by codigo
    `, [], { encoding: 'SQL_ASCII' });

    const contas = rows.map((row) => ({
      codigo: typeof row.codigo === 'string' ? row.codigo : String(row.codigo ?? ''),
      nome: decodeBytea(row.nome, 'windows-1252'),
    }));

    return json({ contas });
  } catch (err) {
    return json({
      error: 'Falha ao consultar o servidor Autosystem',
      detail: err instanceof Error ? err.message : String(err),
    }, 502);
  }
});
