// ============================================================
// Edge Function: autosystem-lancamentos
//
// Retorna lançamentos do `movto` cujo `conta_debitar` OU
// `conta_creditar` esteja em uma lista de contas informada. Usado
// pelo RelatorioDRE Autosystem para popular as contas mapeadas em
// `mapeamento_manual_contas` (receitas e despesas).
//
// Body:
//   - rede_id: uuid
//   - empresa_codigos: bigint[]
//   - data_de / data_ate: YYYY-MM-DD
//   - contas_codigos: string[]  (códigos do plano de contas Autosystem)
//
// Cada linha retornada vem com `lado: 'debito' | 'credito' | 'ambos'`
// indicando em qual dos lados a conta foi encontrada (orienta o sinal
// no front: + p/ credito, − p/ debito).
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    contas_codigos?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, contas_codigos } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos deve ser um array não-vazio' }, 400);
  }
  if (!data_de || !data_ate) {
    return json({ error: 'data_de e data_ate são obrigatórios' }, 400);
  }
  if (!Array.isArray(contas_codigos) || contas_codigos.length === 0) {
    // Nada mapeado → retorna vazio (sem precisar consultar o Autosystem)
    return json({ lancamentos: [] });
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

    // Normaliza códigos como TEXT (campo `conta_debitar`/`conta_creditar` em
    // `movto` é varchar/text com formato "1.1.2.001").
    const codigos = (contas_codigos || []).map(c => String(c));
    const empresasNum = (empresaCodigos || []).map(e => Number(e)).filter(n => Number.isFinite(n));

    failedStep = 'select_movto';
    const sql = `
      select
        m.empresa,
        m.data,
        m.valor,
        m.conta_debitar                                       as debito_codigo,
        convert_to(coalesce(cd.nome, ''), 'LATIN1')           as debito_nome,
        m.conta_creditar                                      as credito_codigo,
        convert_to(coalesce(cc.nome, ''), 'LATIN1')           as credito_nome,
        m.motivo                                              as motivo_codigo,
        convert_to(coalesce(mm.nome, ''), 'LATIN1')           as motivo_nome,
        m.pessoa                                              as pessoa_codigo,
        convert_to(coalesce(p.nome,  ''), 'LATIN1')           as pessoa_nome,
        convert_to(coalesce(m.documento::text, ''), 'LATIN1') as documento,
        convert_to(coalesce(m.obs::text, ''),       'LATIN1') as obs,
        m.grid                                                as lancamento_id
      from movto m
      left join conta         cd on cd.codigo = m.conta_debitar
      left join conta         cc on cc.codigo = m.conta_creditar
      left join pessoa        p  on p.grid    = m.pessoa
      left join motivo_movto  mm on mm.grid   = m.motivo
      where m.empresa = any($1::bigint[])
        and m.data between $2 and $3
        and (m.conta_debitar  = any($4::text[])
          or m.conta_creditar = any($4::text[]))
      order by m.data, m.grid
    `;

    const result = await pg.queryObject<Record<string, unknown>>({
      text: sql,
      args: [empresasNum, data_de, data_ate, codigos],
    });

    const decoder = new TextDecoder('windows-1252');
    const codigoSet = new Set(codigos);
    const linhas = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (TEXT_COLUMNS.has(k) && v instanceof Uint8Array) {
          out[k] = decoder.decode(v);
        } else {
          out[k] = v;
        }
      }
      // Anota o lado em que a conta mapeada aparece
      const isDeb = codigoSet.has(String(out.debito_codigo ?? ''));
      const isCre = codigoSet.has(String(out.credito_codigo ?? ''));
      out.lado = isDeb && isCre ? 'ambos' : isDeb ? 'debito' : 'credito';
      return out;
    });

    return json({ lancamentos: linhas });
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
