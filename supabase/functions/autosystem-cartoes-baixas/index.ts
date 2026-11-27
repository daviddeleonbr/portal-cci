// ============================================================
// Edge Function: autosystem-cartoes-baixas
//
// Consultoria > Análise de cartões. Baixas dos cartões no período (pela data da
// baixa) e, para as vendas que elas liquidaram, quanto foi de cada grupo de
// produto, com custo — para medir quanto da margem (ex.: do combustível) a taxa
// consome.
//
// Como o Autosystem grava (banco modelo `cursoexcel`):
//   - venda no cartão: movto debita a conta do cartão (ex. 1.3.01.x), credita o PDV;
//   - baixa: movto(s) CREDITAM a conta do cartão e debitam
//       · o banco/caixa (conta do ativo, 1.x)        → líquido
//       · a conta de taxa (nome/motivo com "TAXA")     → taxa
//       · outra conta (ex. 3.2.37 AJUSTE CONCILIACAO)  → ajuste (fica à parte)
//   - `movto_map` (parent = venda no cartão, child = linha da baixa) liga a baixa
//     às vendas que ela liquidou; uma baixa pode cobrir várias → rateio pelo valor.
//   - itens da venda: lancto (operacao 'V') pelo `mlid` da venda no cartão; custo =
//     estoque_lancto.custo_medio × quantidade (mesma regra do autosystem-vendas).
//
// Body: { rede_id, empresa_codigos[], data_de, data_ate, contas_cartao[] }
//   contas_cartao = contas classificadas como Cartão/PIX em as_rede_conta_categoria.
// Resposta: { dias: [...], produtos: [...] } (já agregados no servidor).
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { obterRede, executarQuery, decodeRowText } from '../_shared/autosystem-query.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  const replacer = (_k: string, v: unknown) => {
    if (typeof v === 'bigint') {
      return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();
    }
    return v;
  };
  return new Response(JSON.stringify(body, replacer), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const TEXT_COLUMNS = new Set(['conta', 'conta_nome']);

// Linhas de baixa do período, já classificadas (T = taxa, L = líquido, A = ajuste).
// $1 empresas, $2/$3 período, $4 contas de cartão.
const CTE_BAIXAS = `
  with b as (
    select m.grid, m.data, m.empresa, m.conta_creditar::text as conta, m.valor,
           case when cd.nome ilike '%taxa%' or mm.nome ilike '%taxa%' then 'T'
                when m.conta_debitar::text like '1%' then 'L'
                else 'A' end as tipo
    from movto m
    left join conta cd on cd.codigo = m.conta_debitar
    left join motivo_movto mm on mm.grid = m.motivo
    where m.empresa = any($1::bigint[])
      and m.data between $2 and $3
      and m.conta_creditar::text = any($4::text[])
      and exists (select 1 from movto_map mp where mp.child = m.grid)
  )`;

const SQL_DIAS = `${CTE_BAIXAS}
  select b.data, b.conta,
         convert_to(coalesce(c.nome::text, ''), 'LATIN1')              as conta_nome,
         sum(b.valor)                                                   as bruto,
         coalesce(sum(b.valor) filter (where b.tipo = 'T'), 0)          as taxa,
         coalesce(sum(b.valor) filter (where b.tipo = 'L'), 0)          as liquido,
         coalesce(sum(b.valor) filter (where b.tipo = 'A'), 0)          as ajuste,
         count(*) filter (where b.tipo = 'L')                           as baixas
  from b
  left join conta c on c.codigo = b.conta
  group by b.data, b.conta, c.nome
  order by b.data, b.conta`;

// Rateio: cada linha da baixa se divide entre as vendas que liquidou (pelo valor da
// venda no cartão); cada venda se divide entre os grupos de produto pelos itens.
// O custo entra na proporção que o cartão pagou da venda.
const SQL_PRODUTOS = `${CTE_BAIXAS},
  aloc as (
    select o.grid as venda, o.mlid, o.empresa, b.conta, b.tipo,
           b.valor * o.valor / nullif(sum(o.valor) over (partition by b.grid), 0) as parte
    from b
    join movto_map mp on mp.child = b.grid
    join movto o on o.grid = mp.parent
  ),
  venda as (
    select venda, mlid, empresa, conta,
           coalesce(sum(parte) filter (where tipo <> 'A'), 0) as bruto,
           coalesce(sum(parte) filter (where tipo = 'T'), 0)  as taxa
    from aloc
    group by venda, mlid, empresa, conta
  ),
  itens as (
    select l.mlid, l.empresa, prod.grupo, sum(l.valor) as valor,
           sum(coalesce(nullif((select avg(el.custo_medio) from estoque_lancto el where el.lancto = l.grid), 0) * l.quantidade, 0)) as custo,
           count(*) filter (where not exists (select 1 from estoque_lancto el where el.lancto = l.grid and el.custo_medio > 0)) as sem_custo
    from lancto l
    left join produto prod on prod.grid = l.produto
    where l.operacao = 'V'
      and l.mlid in (select mlid from venda)
    group by l.mlid, l.empresa, prod.grupo
  ),
  tot as (select mlid, empresa, sum(valor) as total from itens group by mlid, empresa)
  select v.conta, i.grupo                              as grupo_produto_codigo,
         sum(v.bruto * i.valor / t.total)              as valor,
         sum(v.taxa  * i.valor / t.total)              as taxa,
         sum(i.custo * v.bruto / t.total)              as custo,
         sum(i.sem_custo)                              as itens_sem_custo,
         count(distinct v.venda)                       as vendas
  from venda v
  join itens i on i.mlid = v.mlid and i.empresa = v.empresa
  join tot t on t.mlid = v.mlid and t.empresa = v.empresa and t.total > 0
  group by v.conta, i.grupo`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: { rede_id?: string; empresa_codigos?: (string | number)[]; data_de?: string; data_ate?: string; contas_cartao?: string[] };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, contas_cartao } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) return json({ error: 'empresa_codigos[] é obrigatório' }, 400);
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios (YYYY-MM-DD)' }, 400);
  const contas = Array.isArray(contas_cartao) ? contas_cartao.map(String).filter(Boolean) : [];
  if (!contas.length) return json({ dias: [], produtos: [] });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const rede = await obterRede(supabase, redeId, req);
    const empresasNum = empresaCodigos.map(v => Number(v)).filter(n => Number.isFinite(n));
    const params = [empresasNum, data_de, data_ate, contas];
    const [dias, produtos] = await Promise.all([
      executarQuery(rede, SQL_DIAS, params, { encoding: 'SQL_ASCII' }),
      executarQuery(rede, SQL_PRODUTOS, params, { encoding: 'SQL_ASCII' }),
    ]);
    return json({
      dias: dias.map((row: any) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252')),
      produtos: produtos.map((row: any) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252')),
    });
  } catch (err) {
    return json({ error: 'Falha ao consultar o servidor Autosystem', detail: err instanceof Error ? err.message : String(err) }, 502);
  }
});
