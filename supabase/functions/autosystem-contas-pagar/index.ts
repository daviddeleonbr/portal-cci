// ============================================================
// Edge Function: autosystem-contas-pagar
//
// Retorna as contas a pagar em aberto da empresa selecionada,
// vindas do servidor Autosystem remoto.
//
// Query base:
//   SELECT empresa, data, motivo, conta_debitar, conta_creditar,
//          pessoa, documento, vencto, valor, obs
//     FROM movto m
//    WHERE conta_creditar LIKE '2.1.1%'
//      AND child = 0
//      AND empresa = $empresa_codigo
//      AND (vencto entre $vencto_de e $vencto_ate, se informados)
//      AND NÃO EXISTE baixa correspondente (ver abaixo)
//
// "Em aberto": uma provisão (débito = despesa, crédito = 2.1.1.x) está
// em aberto enquanto não houver baixa (débito = 2.1.1.x, crédito = caixa)
// para o mesmo título. Mesma heurística usada em autosystem-fluxo-caixa:
//   - match forte: empresa + pessoa + documento (quando documento ≠ vazio)
//   - match fraco: empresa + pessoa + valor (fallback)
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

  // 1) Credenciais
  const { data: credRows, error: credErr } = await supabase.rpc(
    'as_rede_get_credenciais',
    { p_id: redeId },
  );
  if (credErr) {
    return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  }
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

    // 2) Monta os parâmetros e a query base com filtros opcionais
    failedStep = 'select_contas_pagar';
    const params: unknown[] = [empresaCodigo];
    const conds: string[] = [
      "m.conta_creditar like '2.1.1%'",
      'm.child = 0',
      'm.empresa = $1',
      // Em aberto = sem baixa correspondente. A baixa é um movto que
      // DEBITA a mesma conta 2.1.1.x da provisão original.
      `not exists (
         select 1 from movto b
          where b.empresa       = m.empresa
            and b.conta_debitar = m.conta_creditar
            and b.grid         <> m.grid
            and (
              (
                coalesce(nullif(b.documento::text, ''), '') <> ''
                and coalesce(nullif(b.documento::text, ''), '') = coalesce(nullif(m.documento::text, ''), '')
                and b.pessoa is not distinct from m.pessoa
              )
              or (
                b.pessoa is not distinct from m.pessoa
                and b.valor = m.valor
              )
            )
       )`,
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
      order by m.vencto, m.data
    `;

    const result = await pg.queryObject<Record<string, unknown>>({ text: sql, args: params });

    // 3) Decoda colunas de texto (Uint8Array → string windows-1252)
    const decoder = new TextDecoder('windows-1252');
    const linhas = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (TEXT_COLUMNS.has(k) && v instanceof Uint8Array) {
          out[k] = decoder.decode(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    });

    return json({ contas: linhas });
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
