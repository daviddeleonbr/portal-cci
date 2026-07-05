// ============================================================
// Edge Function: autosystem-contas-pagar
//
// Retorna títulos a pagar EM ABERTO da empresa selecionada, vindos do
// servidor Autosystem remoto.
//
// "Em aberto" no Autosystem = título que NÃO está em nenhum borderô
// (tabela `movto_bordero`). Quando o título é quitado, o movto entra
// em `movto_bordero` linkando à operação de pagamento — enquanto não
// estiver lá, está pendente. Mesma heurística usada pelo cliente
// nativo do Autosystem (verificado nos logs do sistema).
//
// Query base:
//   SELECT ... FROM movto m
//    WHERE (m.conta_creditar = '2.1.1' OR m.conta_creditar LIKE '2.1.1.%')
//      AND m.empresa = $empresa_codigo
//      AND m.child = 0
//      AND NOT EXISTS (
//        SELECT 1 FROM movto_bordero mb WHERE mb.movto = m.grid
//      )
//      AND (vencto entre $vencto_de e $vencto_ate, se informados)
//   ORDER BY m.vencto, m.data, m.documento
//
// Joins:
//   - conta cd ON cd.codigo = movto.conta_debitar  → nome do débito
//   - conta cc ON cc.codigo = movto.conta_creditar → nome do crédito
//   - pessoa p ON p.grid    = movto.pessoa         → nome do fornecedor
//   - motivo_movto mm ON mm.grid = movto.motivo    → nome do motivo
//
// Encoding: o banco Autosystem é declarado UTF8 mas armazena bytes
// Windows-1252 corrompidos. Usamos convert_to(text, 'LATIN1') para
// trazer bytes crus e decodificamos como windows-1252 no client.
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

const TEXT_COLUMNS = new Set([
  'motivo_nome', 'debito_nome', 'credito_nome',
  'pessoa_nome', 'documento', 'obs',
]);

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
    vencto_de?: string | null;
    vencto_ate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { rede_id: redeId, empresa_codigo: empresaCodigo, vencto_de, vencto_ate } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (empresaCodigo === undefined || empresaCodigo === null || empresaCodigo === '') {
    return json({ error: 'empresa_codigo é obrigatório' }, 400);
  }

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

    // 2) Em aberto = NÃO está em movto_bordero (mesma heurística do
    //    cliente nativo Autosystem). Conta_creditar exatamente '2.1.1'
    //    ou descendentes diretos '2.1.1.%' (LIKE '2.1.1%' pegaria
    //    indevidamente outras contas como 2.1.10, 2.1.11 etc.).
    const params: unknown[] = [empresaCodigo];
    const conds: string[] = [
      "(m.conta_creditar = '2.1.1' or m.conta_creditar like '2.1.1.%')",
      'm.empresa = $1',
      'm.child = 0',
      'not exists (select 1 from movto_bordero mb where mb.movto = m.grid)',
    ];
    if (vencto_de) {
      params.push(vencto_de);
      conds.push(`m.vencto >= $${params.length}`);
    }
    if (vencto_ate) {
      params.push(vencto_ate);
      conds.push(`m.vencto <= $${params.length}`);
    }

    const sql = `
      select
        m.grid,
        m.empresa,
        m.data,
        m.vencto,
        m.valor,
        m.motivo                                            as motivo_codigo,
        convert_to(coalesce(mm.nome, ''),  'LATIN1')        as motivo_nome,
        m.conta_debitar                                     as debito_codigo,
        convert_to(coalesce(cd.nome, ''),  'LATIN1')        as debito_nome,
        m.conta_creditar                                    as credito_codigo,
        convert_to(coalesce(cc.nome, ''),  'LATIN1')        as credito_nome,
        m.pessoa                                            as pessoa_codigo,
        convert_to(coalesce(p.nome,  ''),  'LATIN1')        as pessoa_nome,
        convert_to(coalesce(m.documento::text, ''), 'LATIN1') as documento,
        convert_to(coalesce(m.obs::text, ''),       'LATIN1') as obs
      from movto m
      left join conta         cd on cd.codigo = m.conta_debitar
      left join conta         cc on cc.codigo = m.conta_creditar
      left join pessoa        p  on p.grid    = m.pessoa
      left join motivo_movto  mm on mm.grid   = m.motivo
      where ${conds.join(' and ')}
      order by m.vencto, m.data, m.documento
    `;

    const result = await executarQuery(rede, sql, params, { encoding: 'SQL_ASCII' });

    // 3) Decoda colunas de texto (bytea → string windows-1252) — funciona em TCP e HTTPS
    const linhas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ contas: linhas });
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
