// ============================================================
// Edge Function: autosystem-contas-receber
//
// Retorna as contas a receber em aberto da empresa selecionada.
//
// Query base:
//   SELECT empresa, data, motivo, conta_debitar, conta_creditar,
//          pessoa, documento, vencto, valor, obs
//     FROM movto
//    WHERE (conta_debitar = '1.3' OR conta_debitar LIKE '1.3.%')
//      AND child = 0
//      AND empresa = $empresa_codigo
//      AND (vencto entre $vencto_de e $vencto_ate, se informados)
//
// O filtro `LIKE '1.3.%'` (com ponto) é estrito ao grupo 1.3.x — sem
// o ponto, '1.3%' também pega '1.30', '1.31' indevidamente.
//
// Em partidas dobradas, o direito a receber é o lançamento que DEBITA
// uma conta do grupo 1.3.x (ativo circulante). O `conta_creditar` aparece
// também em baixas, por isso o filtro correto é `conta_debitar`.
//
// Classificação (feita no front a partir de conta_debitar):
//   1.3.01    → Cartões
//   1.3.02    → Cheques
//   1.3.03.1  → Notas a prazo
//   1.3.03.2  → Faturas a receber
//   demais 1.3.* → Outros
//
// Encoding/joins: idêntico ao autosystem-contas-pagar.
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, withConexao, decodeRowText } from '../_shared/autosystem-query.ts';

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
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

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

    const params: unknown[] = [empresaCodigo];
    const conds: string[] = [
      "(m.conta_debitar = '1.3' or m.conta_debitar like '1.3.%')",
      'm.child = 0',
      'm.empresa = $1',
    ];
    if (vencto_de)  { params.push(vencto_de);  conds.push(`m.vencto >= $${params.length}`); }
    if (vencto_ate) { params.push(vencto_ate); conds.push(`m.vencto <= $${params.length}`); }

    const sql = `
      select
        m.empresa,
        m.data,
        m.vencto,
        m.valor,
        m.child                                             as child,
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
      order by m.vencto, m.data
    `;

    // Diagnóstico: contagens em cada etapa do filtro para identificar
    // onde registros estão sendo cortados (usado pelo console do front).
    const baseDateConds: string[] = [];
    const baseDateParams: unknown[] = [empresaCodigo];
    if (vencto_de)  { baseDateParams.push(vencto_de);  baseDateConds.push(`vencto >= $${baseDateParams.length}`); }
    if (vencto_ate) { baseDateParams.push(vencto_ate); baseDateConds.push(`vencto <= $${baseDateParams.length}`); }
    const dateExtra = baseDateConds.length ? ' and ' + baseDateConds.join(' and ') : '';

    const {
      result,
      total_debito_1_3,
      total_debito_1_3_03_2,
      total_debito_1_3_03_2_no_periodo,
      total_debito_1_3_03_2_no_periodo_child0,
      distintos_child_1_3_03_2,
      cartoes_por_conta,
    } = await withConexao(rede, async (run) => {
      const result = await run(sql, params);

      const fazContagem = async (s: string, args: unknown[]) => {
        try {
          const r = await run(s, args) as { n: bigint | number }[];
          const n = r[0]?.n;
          return typeof n === 'bigint' ? Number(n) : Number(n) || 0;
        } catch {
          return -1;
        }
      };

      const total_debito_1_3 = await fazContagem(
        "select count(*)::int as n from movto where (conta_debitar = '1.3' or conta_debitar like '1.3.%') and empresa = $1",
        [empresaCodigo],
      );
      const total_debito_1_3_03_2 = await fazContagem(
        "select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1",
        [empresaCodigo],
      );
      const total_debito_1_3_03_2_no_periodo = await fazContagem(
        `select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1${dateExtra}`,
        baseDateParams,
      );
      const total_debito_1_3_03_2_no_periodo_child0 = await fazContagem(
        `select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1 and child = 0${dateExtra}`,
        baseDateParams,
      );

      let distintos_child_1_3_03_2: { child: unknown; n: number }[] | null = null;
      try {
        const r = await run(
          `select child, count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1${dateExtra} group by child order by child`,
          baseDateParams,
        ) as { child: unknown; n: bigint | number }[];
        distintos_child_1_3_03_2 = r.map(row => ({
          child: typeof row.child === 'bigint' ? Number(row.child) : row.child,
          n: typeof row.n === 'bigint' ? Number(row.n) : Number(row.n) || 0,
        }));
      } catch { distintos_child_1_3_03_2 = null; }

      // Breakdown por conta_debitar dentro de cartões (1.3.01.*) — total
      // e quanto sai com child = 0; ajuda a ver contas tipo ALELO que
      // somem porque os registros têm child ≠ 0.
      let cartoes_por_conta:
        | { conta_debitar: unknown; total: number; com_child_0: number; soma_total: unknown; soma_child_0: unknown }[]
        | null = null;
      try {
        const r = await run(`
              select
                conta_debitar,
                count(*)::int                                 as total,
                sum(case when child = 0 then 1 else 0 end)::int as com_child_0,
                sum(valor)                                    as soma_total,
                sum(case when child = 0 then valor else 0 end) as soma_child_0
              from movto
              where conta_debitar like '1.3.01%' and empresa = $1${dateExtra}
              group by conta_debitar
              order by conta_debitar
            `, baseDateParams) as {
              conta_debitar: unknown; total: bigint | number; com_child_0: bigint | number;
              soma_total: unknown; soma_child_0: unknown;
            }[];
        cartoes_por_conta = r.map(row => ({
          conta_debitar: row.conta_debitar,
          total: typeof row.total === 'bigint' ? Number(row.total) : Number(row.total) || 0,
          com_child_0: typeof row.com_child_0 === 'bigint' ? Number(row.com_child_0) : Number(row.com_child_0) || 0,
          soma_total: typeof row.soma_total === 'bigint' ? Number(row.soma_total) : Number(row.soma_total),
          soma_child_0: typeof row.soma_child_0 === 'bigint' ? Number(row.soma_child_0) : Number(row.soma_child_0),
        }));
      } catch { cartoes_por_conta = null; }

      return {
        result,
        total_debito_1_3,
        total_debito_1_3_03_2,
        total_debito_1_3_03_2_no_periodo,
        total_debito_1_3_03_2_no_periodo_child0,
        distintos_child_1_3_03_2,
        cartoes_por_conta,
      };
    }, { encoding: 'SQL_ASCII' });

    const linhas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    const diag = {
      empresa_codigo: empresaCodigo,
      vencto_de: vencto_de || null,
      vencto_ate: vencto_ate || null,
      total_debito_1_3,
      total_debito_1_3_03_2,
      total_debito_1_3_03_2_no_periodo,
      total_debito_1_3_03_2_no_periodo_child0,
      distintos_child_1_3_03_2,
      cartoes_por_conta,
      retornados: linhas.length,
    };

    return json({ contas: linhas, diag });
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
