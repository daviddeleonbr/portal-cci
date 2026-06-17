// ============================================================
// Edge Function: autosystem-bombas
//
// Retorna as bombas das empresas selecionadas + os bicos vinculados.
//
// Bomba ↔ Pessoa (fabricante):  bomba.fabricante = pessoa.grid
// Bico  ↔ Bomba:                bico.bomba       = bomba.grid
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, withConexao, decodeBytea } from '../_shared/autosystem-query.ts';

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

// Colunas que vêm convertidas para LATIN1 e precisam ser decodificadas no servidor.
const BOMBA_TEXT_COLS = new Set(['nr_serie', 'modelo', 'fabricante_nome']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;   // janela para agregação de uso de bicos (opcional)
    data_ate?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos[] é obrigatório' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const empresasNum = empresaCodigos.map(v => Number(v)).filter(n => Number.isFinite(n));

  // Decoda toda coluna que veio como bytea (Uint8Array em TCP, {type:'Buffer',...} em HTTPS).
  // Outras colunas são preservadas como estão.
  function isBytea(v: unknown): boolean {
    if (v instanceof Uint8Array) return true;
    if (typeof v === 'object' && v !== null && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) return true;
    return false;
  }
  function decodeRow(row: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (isBytea(v)) out[k] = decodeBytea(v, 'windows-1252');
      else out[k] = v;
    }
    return out;
  }

  try {
    const rede = await obterRede(supabase, redeId);

    const { bombas, bicos, uso_bicos, litros_dia_semana, afericoes } = await withConexao(rede, async (run) => {
      const bombasRows = await run(`
        select
          b.grid,
          b.codigo,
          b.empresa,
          convert_to(coalesce(b.nr_serie::text, ''), 'LATIN1')  as nr_serie,
          b.fabricante,
          b.tipo,
          convert_to(coalesce(b.modelo::text, ''), 'LATIN1')    as modelo,
          convert_to(coalesce(pe.nome::text, ''), 'LATIN1')     as fabricante_nome
        from bomba b
        left join pessoa pe on pe.grid = b.fabricante
        where b.empresa = any($1::bigint[])
        order by b.empresa, b.codigo
      `, [empresasNum]);
      const bombas = bombasRows.map(decodeRow);
      const bombasGrids = bombas
        .map(b => (b.grid != null ? Number(b.grid) : null))
        .filter(n => Number.isFinite(n)) as number[];

      let bicos: Record<string, unknown>[] = [];
      if (bombasGrids.length > 0) {
        const bicosRows = await run(`
          select
            b.*,
            convert_to(coalesce(d.nome::text, ''), 'LATIN1') as deposito_nome,
            d.codigo                                          as deposito_codigo,
            d.capacidade                                      as deposito_capacidade
          from bico b
          left join deposito d on d.grid = b.deposito
          where b.bomba = any($1::bigint[])
          order by b.bomba, b.grid
        `, [bombasGrids]);
        bicos = bicosRows.map(decodeRow);
      }

      // Uso dos bicos: agrega lancto por (empresa, bico) na janela informada.
      // `lancto.bico` é TEXT no banco — com `SQL_ASCII` vem como bytea, então
      // forçamos `convert_to(..., 'LATIN1')` e decodificamos windows-1252 abaixo.
      // Combina vendas (operacao='V') e aferições (operacao='A') em uma única
      // query usando agregados com `FILTER (WHERE ...)`.
      let uso_bicos: Record<string, unknown>[] = [];
      if (data_de && data_ate && empresasNum.length > 0) {
        const usoRows = await run(`
          select
            empresa,
            convert_to(coalesce(bico::text, ''), 'LATIN1') as bico,
            count(*) filter (where operacao = 'V')                                          as vendas_count,
            sum(case when operacao = 'V' then coalesce(quantidade, 0) else 0 end)           as quantidade_total,
            sum(case when operacao = 'V' then coalesce(valor, 0)      else 0 end)           as valor_total,
            count(*) filter (where operacao = 'A')                                          as afericoes_count
          from lancto
          where operacao in ('V', 'A')
            and empresa = any($1::bigint[])
            and bico is not null
            and trim(bico::text) <> ''
            and data between $2 and $3
          group by empresa, bico::text
        `, [empresasNum, data_de, data_ate]);
        uso_bicos = usoRows.map(decodeRow);
      }

      // Vendas em litros por (empresa, bico, dia_da_semana) — base do heatmap.
      // `extract(dow ...)` retorna 0=Domingo .. 6=Sábado.
      let litros_dia_semana: Record<string, unknown>[] = [];
      if (data_de && data_ate && empresasNum.length > 0) {
        const res = await run(`
          select
            empresa,
            convert_to(coalesce(bico::text, ''), 'LATIN1') as bico,
            extract(dow from data)::int                    as dia_semana,
            sum(coalesce(quantidade, 0))                   as litros
          from lancto
          where operacao = 'V'
            and empresa = any($1::bigint[])
            and bico is not null
            and trim(bico::text) <> ''
            and data between $2 and $3
          group by empresa, bico::text, extract(dow from data)
        `, [empresasNum, data_de, data_ate]);
        litros_dia_semana = res.map(decodeRow);
      }

      // Detalhamento das aferições realizadas no período.
      // operacao='A' identifica aferição. Inclui hora, produto/produto_nome,
      // bico, quantidade e pessoa/pessoa_nome.
      let afericoes: Record<string, unknown>[] = [];
      if (data_de && data_ate && empresasNum.length > 0) {
        const res = await run(`
          select
            l.empresa,
            l.data,
            l.hora,
            l.produto                                                  as produto_codigo,
            convert_to(coalesce(prod.nome::text, ''), 'LATIN1')        as produto_nome,
            convert_to(coalesce(l.bico::text, ''),  'LATIN1')          as bico,
            l.quantidade,
            l.pessoa                                                    as pessoa_codigo,
            convert_to(coalesce(pe.nome::text, ''), 'LATIN1')          as pessoa_nome
          from lancto l
          left join produto prod on prod.grid = l.produto
          left join pessoa  pe   on pe.grid    = l.pessoa
          where l.operacao = 'A'
            and l.empresa = any($1::bigint[])
            and l.data between $2 and $3
          order by l.data desc, l.hora desc
          limit 2000
        `, [empresasNum, data_de, data_ate]);
        afericoes = res.map(decodeRow);
      }

      return { bombas, bicos, uso_bicos, litros_dia_semana, afericoes };
    }, { encoding: 'SQL_ASCII' });

    return json({ bombas, bicos, uso_bicos, litros_dia_semana, afericoes });
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
