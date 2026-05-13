// ============================================================
// Edge Function: autosystem-empresas
// Fluxo:
//  1) Recebe { rede_id } via POST
//  2) Busca credenciais decryptadas no Supabase via RPC
//     `as_rede_get_credenciais(p_id)`
//  3) Abre conexão Postgres ao servidor Autosystem remoto com
//     essas credenciais
//  4) Executa `SELECT * FROM empresa` e devolve as linhas como
//     `{ empresas: [...] }`
// ============================================================
//
// O cliente (browser) não pode abrir socket TCP direto pro banco
// remoto, então a Edge Function atua como proxy. As credenciais
// nunca saem do servidor — só o resultado da query.
//
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
  // BigInt vem de colunas `bigint`/`numeric` do PG. Number perde precisão
  // acima de 2^53; abaixo disso é seguro. Acima viramos string pra preservar.
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  let body: { rede_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const redeId = body.rede_id;
  if (!redeId) {
    return json({ error: 'rede_id é obrigatório' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(
      { error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1) Pega credenciais decryptadas
  const { data: credRows, error: credErr } = await supabase.rpc(
    'as_rede_get_credenciais',
    { p_id: redeId },
  );
  if (credErr) {
    return json(
      { error: 'Falha ao buscar credenciais', detail: credErr.message },
      500,
    );
  }
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) {
    return json({ error: 'Rede não encontrada' }, 404);
  }

  const { conexao_ip, conexao_porta, conexao_banco, conexao_usuario, conexao_senha } = cred;
  if (!conexao_ip || !conexao_banco || !conexao_usuario || !conexao_senha) {
    return json(
      { error: 'Credenciais incompletas para a rede informada' },
      400,
    );
  }

  // 2) Conecta no Postgres remoto.
  // Bancos Autosystem antigos costumam ter encoding UTF-8 declarado, mas
  // armazenam bytes Windows-1252 (legados de inserts sem validação). Isso
  // faz o servidor rejeitar SELECTs textuais com "invalid byte sequence
  // for encoding UTF8". Solução: ler colunas de texto como bytea (bytes
  // crus, sem validação server-side) e decodar como windows-1252 aqui.
  const pg = new PgClient({
    hostname: conexao_ip,
    port: conexao_porta || 5432,
    database: conexao_banco,
    user: conexao_usuario,
    password: conexao_senha,
    tls: { enabled: false },
  });

  const diag: Record<string, unknown> = {};
  let failedStep = 'connect';

  try {
    await pg.connect();
    failedStep = 'show_encoding';

    // Coleta encoding do servidor — útil pra diagnosticar erros de byte
    try {
      const r = await pg.queryObject<{ server_encoding: string }>("show server_encoding");
      diag.server_encoding = r.rows[0]?.server_encoding;
    } catch { /* ignora */ }
    try {
      const r = await pg.queryObject<{ client_encoding: string }>("show client_encoding");
      diag.client_encoding_initial = r.rows[0]?.client_encoding;
    } catch { /* ignora */ }

    // Pede ao servidor que NÃO converta nenhum encoding. Em servidor
    // SQL_ASCII isso passa bytes crus; em servidor UTF-8 isso ainda
    // valida o storage como UTF-8 (e falha se o dado for inválido).
    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    // 2a) Descobre as colunas e tipos da tabela `empresa`
    failedStep = 'information_schema';
    const colsResult = await pg.queryObject<{ column_name: string; data_type: string }>(
      `select column_name, data_type
         from information_schema.columns
        where table_name = 'empresa'
        order by ordinal_position`,
    );
    if (colsResult.rows.length === 0) {
      return json(
        { error: "Tabela 'empresa' não encontrada no banco", diag },
        404,
      );
    }
    diag.colunas_detectadas = colsResult.rows.length;

    // 2b) Tipos textuais → cast para bytea (evita validação UTF-8)
    const TEXT_TYPES = new Set([
      'text',
      'character varying',
      'character',
      'varchar',
      'char',
      'name',
      'citext',
    ]);

    const selectExprs = colsResult.rows.map((c) => {
      const ident = `"${c.column_name.replace(/"/g, '""')}"`;
      if (TEXT_TYPES.has(c.data_type.toLowerCase())) {
        // convert_to é mais robusto que `::bytea` em servidores UTF-8 com
        // dados ruins: força conversão explícita para LATIN1 (que aceita
        // qualquer byte high-bit) antes de empacotar como bytea.
        return `convert_to(coalesce(${ident}, ''), 'LATIN1') as ${ident}`;
      }
      return ident;
    });
    const textColumns = new Set(
      colsResult.rows
        .filter((c) => TEXT_TYPES.has(c.data_type.toLowerCase()))
        .map((c) => c.column_name),
    );

    const query = `select ${selectExprs.join(', ')} from empresa`;

    failedStep = 'select_empresa';
    const result = await pg.queryObject<Record<string, unknown>>(query);

    // 2c) Decoda bytes Windows-1252 → string JS
    const decoder = new TextDecoder('windows-1252');
    const empresas = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (textColumns.has(k) && v instanceof Uint8Array) {
          out[k] = decoder.decode(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    });

    return json({ empresas, diag });
  } catch (err) {
    return json(
      {
        error: 'Falha ao consultar o servidor Autosystem',
        detail: err instanceof Error ? err.message : String(err),
        failed_step: failedStep,
        diag,
      },
      502,
    );
  } finally {
    try {
      await pg.end();
    } catch {
      // ignora erros de fechamento
    }
  }
});
