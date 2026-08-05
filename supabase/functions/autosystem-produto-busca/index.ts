// ============================================================
// Edge Function: autosystem-produto-busca
//
// Busca produtos na tabela `produto` do banco remoto Autosystem para o
// COMPLEMENTO da nota de manifestação (portal cliente). É o equivalente ao
// scan de catálogo Quality do Webposto:
//   - por código de barras (leitura de scanner): casa em `produto_codigo_barra`
//     (múltiplos EANs por produto) OU no `produto.codigo_barra` direto;
//   - por termo: LIKE no nome OU no código humano.
//
// Retorna { produtos: [{ grid, codigo, nome, preco_custo, codigo_barra }] }.
// Só CONSULTA (SELECT). flag = 'A' → produto ativo.
//
// Encoding: banco declara UTF8 mas guarda bytes Windows-1252 → convert_to(...,
// 'LATIN1') e decodifica como windows-1252 no client.
//
// Autorização: autorizarAcesso com permissão 'notas_fiscais' (admin passa
// direto; cliente precisa ser da rede e ter a permissão).
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  obterRede, executarQuery, decodeRowText, autorizarAcesso,
  RedeNaoAutorizadaError, PermissaoNegadaError, EmpresaNaoAutorizadaError,
} from '../_shared/autosystem-query.ts';

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
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const TEXT_COLUMNS = new Set(['nome']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  let body: { rede_id?: string; codigo_barra?: string | null; termo?: string | null };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId } = body;
  const codigoBarra = body.codigo_barra != null ? String(body.codigo_barra).trim() : '';
  const termo       = body.termo       != null ? String(body.termo).trim()       : '';
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!codigoBarra && !termo) return json({ produtos: [] });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    await autorizarAcesso(supabase, req, redeId, { permissoes: ['notas_fiscais'] });
    const rede = await obterRede(supabase, redeId);

    let sql: string;
    const params: unknown[] = [];

    if (codigoBarra) {
      // Casa o EAN na tabela de barras (N por produto) OU no campo direto.
      params.push(codigoBarra);
      sql = `
        SELECT DISTINCT
          p.grid,
          p.codigo,
          convert_to(coalesce(p.nome, ''), 'LATIN1') AS nome,
          p.preco_custo,
          coalesce(b.codigo_barra, p.codigo_barra)   AS codigo_barra
        FROM produto p
        LEFT JOIN produto_codigo_barra b ON b.produto = p.grid
        WHERE p.flag = 'A' AND (b.codigo_barra = $1 OR p.codigo_barra = $1)
        LIMIT 20
      `;
    } else {
      // Busca por descrição (nome) OU código humano.
      params.push(`%${termo.toLowerCase()}%`);
      sql = `
        SELECT
          p.grid,
          p.codigo,
          convert_to(coalesce(p.nome, ''), 'LATIN1') AS nome,
          p.preco_custo,
          p.codigo_barra
        FROM produto p
        WHERE p.flag = 'A' AND (LOWER(p.nome) LIKE $1 OR LOWER(CAST(p.codigo AS TEXT)) LIKE $1)
        ORDER BY p.nome
        LIMIT 30
      `;
    }

    const result = await executarQuery(rede, sql, params, { encoding: 'SQL_ASCII' });
    const produtos = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ produtos });
  } catch (err) {
    if (err instanceof RedeNaoAutorizadaError || err instanceof PermissaoNegadaError || err instanceof EmpresaNaoAutorizadaError) {
      return json({ error: err.message }, 403);
    }
    return json(
      { error: 'Falha ao consultar o servidor Autosystem', detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});
