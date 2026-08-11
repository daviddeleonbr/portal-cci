// ============================================================
// Edge Function: autosystem-movto-export
//
// Busca as linhas da `movto` de um período/empresa para a Exportação Contábil.
// Cada linha vem enriquecida com:
//   - nome das contas gerenciais (débito/crédito)
//   - nome da pessoa (join movto.pessoa = pessoa.grid)
//   - `origem_debito`: débito da PROVISÃO que originou o pagamento
//     (rastreado por movto.child = m.grid, ou m.parent). Base do de/para de
//     contas de passagem (ex.: 2.1.1 → conta contábil pela despesa de origem).
//
// Body: { rede_id, empresa_codigos: bigint[], data_de, data_ate }
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
      return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(v) : v.toString();
    }
    return v;
  };
  return new Response(JSON.stringify(body, replacer), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const TEXT_COLUMNS = new Set([
  'debito_nome', 'credito_nome', 'pessoa_nome', 'documento', 'obs',
  'origem_debito_nome', 'origem_documento', 'origem_pessoa',
]);

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

    // distinct on (m.grid): uma provisão pode ter MUITOS filhos apontando pro
    // mesmo lançamento (ex.: FATURAMENTO DE NOTAS = baixa de N notas a prazo, todas
    // com child = grid do faturamento). Sem o distinct, o join prov.child = m.grid
    // duplicaria o lançamento N vezes. Mantém só 1 provisão de origem por linha.
    const sql = `
      select
        t.grid, t.data, t.valor, t.conta_debitar, t.debito_nome, t.conta_creditar,
        t.credito_nome, t.pessoa_nome, t.documento, t.obs, t.vencto,
        t.origem_debito, t.origem_debito_nome, t.origem_documento, t.origem_pessoa
      from (
        select distinct on (m.grid)
          m.grid                                                as grid,
          m.data                                                as data,
          m.valor                                               as valor,
          m.conta_debitar                                       as conta_debitar,
          convert_to(coalesce(cd.nome, ''), 'LATIN1')           as debito_nome,
          m.conta_creditar                                      as conta_creditar,
          convert_to(coalesce(cc.nome, ''), 'LATIN1')           as credito_nome,
          convert_to(coalesce(p.nome, ''), 'LATIN1')            as pessoa_nome,
          convert_to(coalesce(m.documento::text, ''), 'LATIN1') as documento,
          convert_to(coalesce(m.obs::text, ''), 'LATIN1')       as obs,
          m.vencto                                              as vencto,
          coalesce(prov.conta_debitar, provp.conta_debitar)     as origem_debito,
          convert_to(coalesce(co.nome, ''), 'LATIN1')           as origem_debito_nome,
          convert_to(coalesce(prov.documento::text, provp.documento::text, ''), 'LATIN1') as origem_documento,
          convert_to(coalesce(pp.nome, ''), 'LATIN1')           as origem_pessoa
        from movto m
        left join conta  cd    on cd.codigo   = m.conta_debitar
        left join conta  cc    on cc.codigo   = m.conta_creditar
        left join pessoa p     on p.grid      = m.pessoa
        left join movto  prov  on prov.child  = m.grid
        left join movto  provp on (m.parent > 0 and provp.grid = m.parent)
        left join conta  co    on co.codigo   = coalesce(prov.conta_debitar, provp.conta_debitar)
        left join pessoa pp    on pp.grid     = coalesce(prov.pessoa, provp.pessoa)
        where m.empresa = any($1::bigint[])
          and m.data between $2 and $3
        order by m.grid, prov.grid
      ) t
      order by t.data, t.grid
    `;

    const rows = await executarQuery(rede, sql, [empresasNum, data_de, data_ate], { encoding: 'SQL_ASCII' });
    const linhas = rows.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));
    return json({ linhas });
  } catch (err) {
    return json({ error: 'Falha ao consultar o servidor Autosystem', detail: err instanceof Error ? err.message : String(err) }, 502);
  }
});
