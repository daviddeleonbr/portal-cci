// ============================================================
// Edge Function: autosystem-sangrias-dia
//
// Retorna as sangrias registradas em um dia para uma empresa.
// A "chave" do motivo identifica a operação como SANGRIA via
// `motivo_config.chave = 'SANGRIA'`.
//
// Query base (fornecida pelo cliente):
//   select data, m.usuario, p.nome, m.documento, m.valor
//     from movto m
//     left join motivo_config mc on mc.motivo = m.motivo
//     left join pessoa        p  on p.grid    = m.pessoa
//    where mc.chave = 'SANGRIA'
//      and m.empresa = $empresa_codigo
//      and m.data = $data
//
// O front agrega por funcionário (pessoa) somando o valor das
// sangrias para obter o "dinheiro apurado" do dia.
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

const TEXT_COLUMNS = new Set(['pessoa_nome', 'usuario', 'documento']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  let body: {
    rede_id?: string;
    empresa_codigo?: string | number;
    data?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigo: empresaCodigo, data: dataParam } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (empresaCodigo === undefined || empresaCodigo === null || empresaCodigo === '') {
    return json({ error: 'empresa_codigo é obrigatório' }, 400);
  }
  if (!dataParam) return json({ error: 'data é obrigatório (YYYY-MM-DD)' }, 400);

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

    const sql = `
      select
        m.data,
        convert_to(coalesce(m.usuario::text, ''),   'LATIN1') as usuario,
        p.grid                                                 as pessoa_codigo,
        convert_to(coalesce(p.nome, ''),            'LATIN1') as pessoa_nome,
        convert_to(coalesce(m.documento::text, ''), 'LATIN1') as documento,
        m.valor
      from movto m
      left join motivo_config mc on mc.motivo = m.motivo
      left join pessoa        p  on p.grid    = m.pessoa
      where mc.chave = 'SANGRIA'
        and m.empresa = $1
        and m.data    = $2
      order by p.nome, m.data
    `;
    const rows = await executarQuery(rede, sql, [empresaCodigo, dataParam], { encoding: 'SQL_ASCII' });

    const linhas = rows.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ sangrias: linhas });
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
