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
import { obterRede, withConexao, decodeRowText } from '../_shared/autosystem-query.ts';

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

  const diag: Record<string, unknown> = {};

  try {
    const rede = await obterRede(supabase, redeId);

    // Tipos textuais → cast para bytea (evita validação UTF-8)
    const TEXT_TYPES = new Set([
      'text',
      'character varying',
      'character',
      'varchar',
      'char',
      'name',
      'citext',
    ]);

    const result = await withConexao(rede, async (run) => {
      // Coleta encoding do servidor — útil pra diagnosticar erros de byte
      try {
        const r = await run("show server_encoding");
        diag.server_encoding = (r[0] as any)?.server_encoding;
      } catch { /* ignora */ }
      try {
        const r = await run("show client_encoding");
        diag.client_encoding_initial = (r[0] as any)?.client_encoding;
      } catch { /* ignora */ }

      // 2a) Descobre as colunas e tipos da tabela `empresa`
      const colsRows = await run(`select column_name, data_type
           from information_schema.columns
          where table_name = 'empresa'
          order by ordinal_position`) as { column_name: string; data_type: string }[];
      if (colsRows.length === 0) {
        return { colsRows, rows: [] as Record<string, unknown>[] };
      }

      const selectExprs = colsRows.map((c) => {
        const ident = `"${c.column_name.replace(/"/g, '""')}"`;
        if (TEXT_TYPES.has(c.data_type.toLowerCase())) {
          // convert_to é mais robusto que `::bytea` em servidores UTF-8 com
          // dados ruins: força conversão explícita para LATIN1 (que aceita
          // qualquer byte high-bit) antes de empacotar como bytea.
          return `convert_to(coalesce(${ident}, ''), 'LATIN1') as ${ident}`;
        }
        return ident;
      });

      const query = `select ${selectExprs.join(', ')} from empresa`;
      const rows = await run(query);
      return { colsRows, rows };
    }, { encoding: 'SQL_ASCII' });

    const { colsRows, rows } = result;
    if (colsRows.length === 0) {
      return json(
        { error: "Tabela 'empresa' não encontrada no banco", diag },
        404,
      );
    }
    diag.colunas_detectadas = colsRows.length;

    const textColumns = new Set(
      colsRows
        .filter((c) => TEXT_TYPES.has(c.data_type.toLowerCase()))
        .map((c) => c.column_name),
    );

    // 2c) Decoda bytes Windows-1252 → string JS. Funciona em TCP
    // (Uint8Array do Deno-pg) e em HTTPS (Buffer JSONificado do Node-pg).
    const empresas = rows.map((row) => decodeRowText(row, textColumns, 'windows-1252'));

    return json({ empresas, diag });
  } catch (err) {
    return json(
      {
        error: 'Falha ao consultar o servidor Autosystem',
        detail: err instanceof Error ? err.message : String(err),
        diag,
      },
      502,
    );
  }
});
