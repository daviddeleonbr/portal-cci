// ============================================================
// Edge Function: autosystem-compras-fornecedor
//
// Retorna as COMPRAS (títulos a pagar) por fornecedor no período — abertas
// E pagas — com data da compra, vencimento e data de pagamento.
//
// Título a pagar (provisão) = movto com conta_creditar '2.1.1' ou '2.1.1.%'.
// Pagamento: o ERP liga a provisão à baixa por `movto.child` (a provisão
// aponta child = grid da baixa). A data da baixa = data de pagamento.
// Enquanto child = 0, o título está EM ABERTO (data_pagamento = null).
//
// Body: rede_id, empresa_codigos: bigint[], data_de/data_ate (por m.data = compra)
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, executarQuery, decodeRowText } from '../_shared/autosystem-query.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  const replacer = (_k: string, v: unknown) => {
    if (typeof v === 'bigint') {
      return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();
    }
    return v;
  };
  return new Response(JSON.stringify(body, replacer), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const TEXT_COLUMNS = new Set(['fornecedor', 'despesa_nome', 'categoria_nome', 'documento', 'obs']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: { rede_id?: string; empresa_codigos?: (string | number)[]; data_de?: string; data_ate?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) return json({ error: 'empresa_codigos deve ser um array não-vazio' }, 400);
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const rede = await obterRede(supabase, redeId, req);
    const empresasNum = (empresaCodigos || []).map(e => Number(e)).filter(n => Number.isFinite(n));

    const sql = `
      select
        m.grid,
        m.empresa,
        m.data                                              as data_compra,
        m.vencto                                            as vencimento,
        m.valor,
        pag.data                                            as data_pagamento,
        convert_to(coalesce(p.nome,  ''),  'LATIN1')        as fornecedor,
        m.conta_debitar                                     as despesa_codigo,
        convert_to(coalesce(cd.nome, ''),  'LATIN1')        as despesa_nome,
        -- Categoria = conta de estoque no nível 1.4.X (3 segmentos).
        (split_part(m.conta_debitar, '.', 1) || '.' || split_part(m.conta_debitar, '.', 2) || '.' || split_part(m.conta_debitar, '.', 3)) as categoria_codigo,
        convert_to(coalesce(cat.nome, ''), 'LATIN1')        as categoria_nome,
        convert_to(coalesce(m.documento::text, ''), 'LATIN1') as documento,
        convert_to(coalesce(m.obs::text, ''),       'LATIN1') as obs
      from movto m
      left join movto  pag on pag.grid = m.child and m.child > 0
      left join conta  cd  on cd.codigo = m.conta_debitar
      left join conta  cat on cat.codigo = (split_part(m.conta_debitar, '.', 1) || '.' || split_part(m.conta_debitar, '.', 2) || '.' || split_part(m.conta_debitar, '.', 3))
      left join pessoa p   on p.grid    = m.pessoa
      where m.empresa = any($1::bigint[])
        and m.data between $2 and $3
        and (m.conta_creditar = '2.1.1' or m.conta_creditar like '2.1.1.%')
        and (m.conta_debitar = '1.4' or m.conta_debitar like '1.4.%')
      order by m.data, m.vencto, m.documento
    `;

    const result = await executarQuery(rede, sql, [empresasNum, data_de, data_ate], { encoding: 'SQL_ASCII' });
    const compras = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));
    return json({ compras });
  } catch (err) {
    return json({ error: 'Falha ao consultar o servidor Autosystem', detail: err instanceof Error ? err.message : String(err) }, 502);
  }
});
