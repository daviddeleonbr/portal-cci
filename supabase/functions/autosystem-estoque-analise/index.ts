// ============================================================
// Edge Function: autosystem-estoque-analise
//
// Cruza o snapshot de estoque atual com vendas do período (default
// 90 dias) e devolve tudo o que o front precisa para calcular giro,
// cobertura, ABC, capital imobilizado e identificar produtos parados.
//
// Por produto/empresa retorna:
//   - estoque_atual, data_estoque
//   - custo_unit (média do custo_medio dos últimos lançamentos)
//   - venda_qtd, venda_valor (no período), ultima_venda
//   - dias_sem_venda (de hoje até última venda; null se nunca vendeu)
//
// A análise (ABC, status, cobertura etc) é feita no front porque
// depende de parâmetros configuráveis (lead time, meta de cobertura,
// limites ABC, dias para produto morto). A edge function entrega os
// "fatos brutos" agregados.
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

const TEXT_COLUMNS = new Set(['produto_nome', 'grupo', 'subgrupo']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigo?: string | number | null;
    janela_dias?: number;          // default 90
    data_corte?: string | null;    // default = amanhã
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigo: empresaCodigo } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);

  const janela = Math.max(7, Math.min(365, Number(body.janela_dias) || 90));

  // Default data_corte = amanhã (inclui hoje no snapshot).
  let dataCorte = body.data_corte;
  if (!dataCorte) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    dataCorte = d.toISOString().slice(0, 10);
  }
  // data_de = data_corte - janela
  const dDe = new Date(dataCorte + 'T00:00:00');
  dDe.setDate(dDe.getDate() - janela);
  const dataDe = dDe.toISOString().slice(0, 10);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: credRows, error: credErr } = await supabase.rpc(
    'as_rede_get_credenciais', { p_id: redeId },
  );
  if (credErr) return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) return json({ error: 'Rede não encontrada' }, 404);

  const { conexao_ip, conexao_porta, conexao_banco, conexao_usuario, conexao_senha } = cred;
  if (!conexao_ip || !conexao_banco || !conexao_usuario || !conexao_senha) {
    return json({ error: 'Credenciais incompletas para a rede informada' }, 400);
  }

  const pg = new PgClient({
    hostname: conexao_ip, port: conexao_porta || 5432,
    database: conexao_banco, user: conexao_usuario, password: conexao_senha,
    tls: { enabled: false },
  });

  let failedStep = 'connect';
  try {
    await pg.connect();
    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    // ─── Bloco 1: snapshot de estoque atual ──────────────────
    failedStep = 'select_estoque';
    const paramsEst: unknown[] = [dataCorte];
    let condEmpEst = '';
    if (empresaCodigo != null && empresaCodigo !== '') {
      paramsEst.push(empresaCodigo);
      condEmpEst = `AND ep.empresa = $${paramsEst.length}`;
    }
    const sqlEstoque = `
      SELECT
        ep.empresa,
        ep.produto,
        convert_to(coalesce(p.nome,  ''),  'LATIN1') AS produto_nome,
        convert_to(coalesce(gp.nome, ''),  'LATIN1') AS grupo,
        convert_to(coalesce(sp.nome, ''),  'LATIN1') AS subgrupo,
        MAX(ep.data)    AS data_estoque,
        SUM(ep.estoque) AS estoque_atual
      FROM estoque_produto ep
      JOIN produto         p  ON p.grid     = ep.produto
      JOIN grupo_produto   gp ON gp.grid    = p.grupo
      JOIN subgrupo_produto sp ON sp.grid   = p.subgrupo
      WHERE ep.data >= '2000-01-01'
        AND ep.data <  $1
        ${condEmpEst}
      GROUP BY ep.empresa, ep.produto, gp.nome, sp.nome, p.nome
    `;
    const resEstoque = await pg.queryObject<Record<string, unknown>>({ text: sqlEstoque, args: paramsEst });

    // ─── Bloco 2: agregado de vendas no período ──────────────
    // Cruza lancto + estoque_lancto (pra ter custo médio do item vendido).
    // Exclui devoluções (operacao='DC' linkadas via mlid).
    failedStep = 'select_vendas';
    const paramsVnd: unknown[] = [dataDe, dataCorte];
    let condEmpVnd = '';
    if (empresaCodigo != null && empresaCodigo !== '') {
      paramsVnd.push(empresaCodigo);
      condEmpVnd = `AND l.empresa = $${paramsVnd.length}`;
    }
    const sqlVendas = `
      SELECT
        l.empresa,
        l.produto,
        SUM(l.quantidade)                                                  AS venda_qtd,
        SUM(l.valor - coalesce(l.valor_desconto, 0))                       AS venda_valor,
        SUM(l.quantidade *
            coalesce((SELECT avg(el.custo_medio)
                        FROM estoque_lancto el
                       WHERE el.lancto = l.grid), 0))                      AS venda_custo,
        MAX(l.data)                                                        AS ultima_venda,
        COUNT(*)                                                           AS qtd_movimentos
      FROM lancto l
      WHERE l.operacao = 'V'
        AND l.data >= $1
        AND l.data <  $2
        AND NOT EXISTS (
          SELECT 1 FROM lancto d
           WHERE d.mlid = l.grid AND d.operacao = 'DC'
        )
        ${condEmpVnd}
      GROUP BY l.empresa, l.produto
    `;
    const resVendas = await pg.queryObject<Record<string, unknown>>({ text: sqlVendas, args: paramsVnd });

    // ─── Custo unitário "de bolso" ───────────────────────────
    // Para produtos COM venda no período, usamos venda_custo / venda_qtd.
    // Para produtos SEM venda no período (precisam de custo pra valorizar
    // o capital imobilizado), buscamos o último custo médio CONHECIDO no
    // estoque_lancto (qualquer empresa) — fallback razoável.
    failedStep = 'select_custo_fallback';
    const sqlCustoFallback = `
      SELECT
        sub.produto,
        sub.custo_medio
      FROM (
        SELECT
          l.produto,
          el.custo_medio,
          row_number() over (PARTITION BY l.produto ORDER BY l.data DESC) AS rn
        FROM lancto l
        JOIN estoque_lancto el ON el.lancto = l.grid
        WHERE el.custo_medio IS NOT NULL AND el.custo_medio > 0
      ) sub
      WHERE sub.rn = 1
    `;
    const resCusto = await pg.queryObject<Record<string, unknown>>({ text: sqlCustoFallback, args: [] });

    // ─── Junção no Deno ──────────────────────────────────────
    const decoder = new TextDecoder('windows-1252');
    const decodeRow = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (TEXT_COLUMNS.has(k) && v instanceof Uint8Array) out[k] = decoder.decode(v);
        else out[k] = v;
      }
      return out;
    };

    const estoque  = resEstoque.rows.map(decodeRow);
    const vendas   = resVendas.rows;
    const fallback = resCusto.rows;

    // mapa (empresa, produto) → venda
    const mapaVendas = new Map<string, Record<string, unknown>>();
    vendas.forEach((v: any) => {
      mapaVendas.set(`${v.empresa}|${v.produto}`, v);
    });
    // mapa produto → custo fallback (qualquer empresa, último conhecido)
    const mapaCusto = new Map<string, number>();
    fallback.forEach((c: any) => {
      mapaCusto.set(String(c.produto), Number(c.custo_medio));
    });

    const itens = estoque.map((e: any) => {
      const v = mapaVendas.get(`${e.empresa}|${e.produto}`);
      let custoUnit: number | null = null;
      if (v && Number(v.venda_qtd) > 0) {
        custoUnit = Number(v.venda_custo) / Number(v.venda_qtd);
      } else if (mapaCusto.has(String(e.produto))) {
        custoUnit = mapaCusto.get(String(e.produto)) || null;
      }
      let precoUnit: number | null = null;
      if (v && Number(v.venda_qtd) > 0) {
        precoUnit = Number(v.venda_valor) / Number(v.venda_qtd);
      }

      return {
        empresa:        e.empresa,
        produto:        e.produto,
        produto_nome:   e.produto_nome,
        grupo:          e.grupo,
        subgrupo:       e.subgrupo,
        data_estoque:   e.data_estoque,
        estoque_atual:  Number(e.estoque_atual),
        custo_unit:     custoUnit,
        preco_unit:     precoUnit,
        venda_qtd:      v ? Number(v.venda_qtd)     : 0,
        venda_valor:    v ? Number(v.venda_valor)   : 0,
        venda_custo:    v ? Number(v.venda_custo)   : 0,
        ultima_venda:   v ? v.ultima_venda          : null,
        qtd_movimentos: v ? Number(v.qtd_movimentos): 0,
      };
    });

    return json({
      itens,
      janela_dias: janela,
      data_de:     dataDe,
      data_corte:  dataCorte,
    });
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
