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

  const { data: credRows, error: credErr } = await supabase.rpc(
    'as_rede_get_credenciais',
    { p_id: redeId },
  );
  if (credErr) return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) return json({ error: 'Rede não encontrada' }, 404);

  const { conexao_ip, conexao_porta, conexao_banco, conexao_usuario, conexao_senha } = cred;
  if (!conexao_ip || !conexao_banco || !conexao_usuario || !conexao_senha) {
    return json({ error: 'Credenciais incompletas para a rede informada' }, 400);
  }

  const pg = new PgClient({
    hostname: conexao_ip,
    port: conexao_porta || 5432,
    database: conexao_banco,
    user: conexao_usuario,
    password: conexao_senha,
    tls: { enabled: false },
  });

  let failedStep = 'connect';
  try {
    await pg.connect();

    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    failedStep = 'select_contas_receber';
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

    // Diagnóstico: contagens em cada etapa do filtro para identificar
    // onde registros estão sendo cortados (usado pelo console do front).
    failedStep = 'diag_counts';
    const baseDateConds: string[] = [];
    const baseDateParams: unknown[] = [empresaCodigo];
    if (vencto_de)  { baseDateParams.push(vencto_de);  baseDateConds.push(`vencto >= $${baseDateParams.length}`); }
    if (vencto_ate) { baseDateParams.push(vencto_ate); baseDateConds.push(`vencto <= $${baseDateParams.length}`); }
    const dateExtra = baseDateConds.length ? ' and ' + baseDateConds.join(' and ') : '';

    const fazContagem = async (sql: string, args: unknown[]) => {
      try {
        const r = await pg.queryObject<{ n: bigint | number }>({ text: sql, args });
        const n = r.rows[0]?.n;
        return typeof n === 'bigint' ? Number(n) : Number(n) || 0;
      } catch {
        return -1;
      }
    };
    const diag = {
      empresa_codigo: empresaCodigo,
      vencto_de: vencto_de || null,
      vencto_ate: vencto_ate || null,
      total_debito_1_3: await fazContagem(
        "select count(*)::int as n from movto where (conta_debitar = '1.3' or conta_debitar like '1.3.%') and empresa = $1",
        [empresaCodigo],
      ),
      total_debito_1_3_03_2: await fazContagem(
        "select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1",
        [empresaCodigo],
      ),
      total_debito_1_3_03_2_no_periodo: await fazContagem(
        `select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1${dateExtra}`,
        baseDateParams,
      ),
      total_debito_1_3_03_2_no_periodo_child0: await fazContagem(
        `select count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1 and child = 0${dateExtra}`,
        baseDateParams,
      ),
      distintos_child_1_3_03_2: await (async () => {
        try {
          const r = await pg.queryObject<{ child: unknown; n: bigint | number }>({
            text: `select child, count(*)::int as n from movto where conta_debitar like '1.3.03.2%' and empresa = $1${dateExtra} group by child order by child`,
            args: baseDateParams,
          });
          return r.rows.map(row => ({
            child: typeof row.child === 'bigint' ? Number(row.child) : row.child,
            n: typeof row.n === 'bigint' ? Number(row.n) : Number(row.n) || 0,
          }));
        } catch { return null; }
      })(),
      // Breakdown por conta_debitar dentro de cartões (1.3.01.*) — total
      // e quanto sai com child = 0; ajuda a ver contas tipo ALELO que
      // somem porque os registros têm child ≠ 0.
      cartoes_por_conta: await (async () => {
        try {
          const r = await pg.queryObject<{
            conta_debitar: unknown; total: bigint | number; com_child_0: bigint | number;
            soma_total: unknown; soma_child_0: unknown;
          }>({
            text: `
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
            `,
            args: baseDateParams,
          });
          return r.rows.map(row => ({
            conta_debitar: row.conta_debitar,
            total: typeof row.total === 'bigint' ? Number(row.total) : Number(row.total) || 0,
            com_child_0: typeof row.com_child_0 === 'bigint' ? Number(row.com_child_0) : Number(row.com_child_0) || 0,
            soma_total: typeof row.soma_total === 'bigint' ? Number(row.soma_total) : Number(row.soma_total),
            soma_child_0: typeof row.soma_child_0 === 'bigint' ? Number(row.soma_child_0) : Number(row.soma_child_0),
          }));
        } catch { return null; }
      })(),
      retornados: linhas.length,
    };

    return json({ contas: linhas, diag });
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
