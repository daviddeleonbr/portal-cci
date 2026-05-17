// ============================================================
// Edge Function: autosystem-recebimentos
//
// Retorna os recebimentos (entradas de caixa/banco) referentes a
// vendas do dia. Usado pelo painel "Recebido por forma de pagamento"
// no BPO Conciliação de Caixas.
//
// Query base (fornecida pelo cliente):
//   SELECT m.empresa, data, hora, turno,
//          conta_debitar AS modo_recebimento,
//          documento, valor, usuario
//   FROM movto
//   WHERE conta_creditar LIKE '1.1.2%'
//
// Acrescentamos filtros por m.empresa e m.data (sempre 1 dia no BPO).
// O `m.conta_debitar` é a coluna que casa com `as_rede_conta_categoria.codigo`.
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

const TEXT_COLUMNS = new Set(['conta_debitar', 'conta_creditar', 'modo_recebimento', 'documento', 'usuario', 'usuario_nome']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    // Contas extras a incluir no filtro de conta_creditar (ex: contas de
    // sobra de caixa que são receitas fora do padrão 1.1.2.*).
    contas_creditar_extras?: string[];
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, contas_creditar_extras } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos[] é obrigatório' }, 400);
  }
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios (YYYY-MM-DD)' }, 400);

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

    failedStep = 'select_recebimentos';
    const empresasNum = empresaCodigos
      .map(v => Number(v))
      .filter(n => Number.isFinite(n));

    const extras = Array.isArray(contas_creditar_extras) ? contas_creditar_extras.map(String) : [];

    const sql = `
      select
        m.empresa,
        m.data,
        m.hora,
        m.turno,
        m.conta_debitar::text                                        as conta_debitar,
        m.conta_creditar::text                                       as conta_creditar,
        m.conta_debitar::text                                        as modo_recebimento,
        convert_to(coalesce(m.documento::text, ''), 'LATIN1')        as documento,
        m.valor,
        convert_to(coalesce(m.usuario::text, ''), 'LATIN1')          as usuario,
        u.pessoa                                                      as usuario_pessoa_id,
        convert_to(coalesce(pe.nome::text, ''), 'LATIN1')             as usuario_nome
      from movto m
      left join usuario u  on u.nome    = m.usuario
      left join pessoa  pe on pe.grid   = u.pessoa
      where (
            m.conta_creditar::text like '1.1.2%'
         or m.conta_creditar::text = any($4::text[])
      )
        and m.empresa = any($1::bigint[])
        and m.data between $2 and $3
      order by m.hora
    `;

    const result = await pg.queryObject<Record<string, unknown>>({
      text: sql,
      args: [empresasNum, data_de, data_ate, extras],
    });

    const decoder = new TextDecoder('windows-1252');
    const recebimentos = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (TEXT_COLUMNS.has(k) && v instanceof Uint8Array) out[k] = decoder.decode(v);
        else out[k] = v;
      }
      return out;
    });

    return json({ recebimentos });
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
