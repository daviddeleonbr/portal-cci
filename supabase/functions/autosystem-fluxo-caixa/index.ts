// ============================================================
// Edge Function: autosystem-fluxo-caixa
//
// Retorna lançamentos do `movto` que envolvem ao menos uma conta
// caixa/banco (em conta_debitar OU conta_creditar). A contraparte
// (a outra conta do mesmo lançamento) é o que o front classifica
// na estrutura da máscara de Fluxo de Caixa.
//
// Body:
//   - rede_id: uuid
//   - empresa_codigos: bigint[]
//   - data_de / data_ate: YYYY-MM-DD
//   - contas_caixa_banco: string[]  (códigos do plano que são caixa/banco)
//
// Cada linha retornada vem com:
//   - lado_caixa: 'debito' | 'credito'  (de qual lado a conta caixa apareceu)
//   - sinal:      +1 | -1               (+1 = entrada, -1 = saída)
//   - contraparte_codigo / contraparte_nome (o outro lado)
//
// Transferências entre duas contas caixa/banco (debit E credit em
// caixa_banco) são EXCLUÍDAS no SQL.
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
  'contraparte_nome', 'contraparte_resolvida_nome',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    contas_caixa_banco?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, contas_caixa_banco } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos deve ser um array não-vazio' }, 400);
  }
  if (!data_de || !data_ate) {
    return json({ error: 'data_de e data_ate são obrigatórios' }, 400);
  }
  if (!Array.isArray(contas_caixa_banco) || contas_caixa_banco.length === 0) {
    // Sem contas caixa/banco marcadas → nada a retornar.
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

    const codigosCaixa = (contas_caixa_banco || []).map(c => String(c));
    const empresasNum = (empresaCodigos || []).map(e => Number(e)).filter(n => Number.isFinite(n));

    // Filtra: (caixa em debit XOR credit). Exclui transferências internas
    // (caixa em ambos os lados). Sinal: +1 quando caixa em debit (caixa
    // recebeu = entrada); -1 quando caixa em credit (caixa pagou = saída).
    //
    // Resolução de provisão: quando a contraparte é uma conta-ponte 2.1.1.x
    // (contas a pagar), o pagamento sozinho não diz a classe da despesa. A
    // classificação real está na PROVISÃO original (lançamento prévio em que
    // débito = conta de despesa, crédito = 2.1.1.x). Ligamos por:
    //   1) mesma empresa + mesmo documento + mesma pessoa
    //   2) (fallback) mesma empresa + mesma pessoa + mesmo valor
    // A coluna `contraparte_resolvida_codigo` traz a despesa real quando a
    // provisão foi encontrada; senão fica null (front mostra "Despesa não
    // classificada (2.1.1)").
    failedStep = 'select_movto_fluxo';
    const sql = `
      with fluxo as (
        select m.*,
          case when m.conta_debitar  = any($4::text[]) then 'debito' else 'credito' end as lado_caixa,
          case when m.conta_debitar  = any($4::text[]) then  1 else -1 end             as sinal,
          case when m.conta_debitar  = any($4::text[]) then m.conta_creditar
                                                       else m.conta_debitar end        as contraparte_codigo
        from movto m
        where m.empresa = any($1::bigint[])
          and m.data between $2 and $3
          and (
            (m.conta_debitar  = any($4::text[]) and not (m.conta_creditar = any($4::text[])))
            or
            (m.conta_creditar = any($4::text[]) and not (m.conta_debitar  = any($4::text[])))
          )
      ),
      -- Provisão match 1: empresa + documento + pessoa
      prov_doc as (
        select distinct on (f.grid)
          f.grid                  as fluxo_grid,
          p.conta_debitar         as despesa_codigo,
          p.data                  as despesa_data
        from fluxo f
        join movto p
          on p.empresa  = f.empresa
         and p.pessoa   is not distinct from f.pessoa
         and p.documento is not distinct from f.documento
         and p.conta_creditar like '2.1.1%'
         and p.conta_debitar  not like '2.1.1%'
         and p.grid <> f.grid
        where f.contraparte_codigo like '2.1.1%'
          and coalesce(nullif(f.documento::text, ''), '') <> ''
        order by f.grid, p.data desc, p.grid desc
      ),
      -- Provisão match 2 (fallback): empresa + pessoa + valor
      prov_val as (
        select distinct on (f.grid)
          f.grid                  as fluxo_grid,
          p.conta_debitar         as despesa_codigo,
          p.data                  as despesa_data
        from fluxo f
        join movto p
          on p.empresa  = f.empresa
         and p.pessoa   is not distinct from f.pessoa
         and p.valor    = f.valor
         and p.conta_creditar like '2.1.1%'
         and p.conta_debitar  not like '2.1.1%'
         and p.grid <> f.grid
        where f.contraparte_codigo like '2.1.1%'
          and not exists (select 1 from prov_doc d where d.fluxo_grid = f.grid)
        order by f.grid, p.data desc, p.grid desc
      ),
      prov as (
        select fluxo_grid, despesa_codigo from prov_doc
        union all
        select fluxo_grid, despesa_codigo from prov_val
      )
      select
        f.empresa,
        f.data,
        f.valor,
        f.conta_debitar                                       as debito_codigo,
        convert_to(coalesce(cd.nome, ''), 'LATIN1')           as debito_nome,
        f.conta_creditar                                      as credito_codigo,
        convert_to(coalesce(cc.nome, ''), 'LATIN1')           as credito_nome,
        f.motivo                                              as motivo_codigo,
        convert_to(coalesce(mm.nome, ''), 'LATIN1')           as motivo_nome,
        f.pessoa                                              as pessoa_codigo,
        convert_to(coalesce(p.nome,  ''), 'LATIN1')           as pessoa_nome,
        convert_to(coalesce(f.documento::text, ''), 'LATIN1') as documento,
        convert_to(coalesce(f.obs::text, ''),       'LATIN1') as obs,
        f.grid                                                as lancamento_id,
        f.lado_caixa,
        f.sinal,
        f.contraparte_codigo,
        case
          when f.lado_caixa = 'debito'
          then convert_to(coalesce(cc.nome, ''), 'LATIN1')
          else convert_to(coalesce(cd.nome, ''), 'LATIN1')
        end                                                   as contraparte_nome,
        pv.despesa_codigo                                     as contraparte_resolvida_codigo,
        convert_to(coalesce(cresolv.nome, ''), 'LATIN1')      as contraparte_resolvida_nome,
        (pv.despesa_codigo is not null)                       as via_provisao
      from fluxo f
      left join conta         cd on cd.codigo = f.conta_debitar
      left join conta         cc on cc.codigo = f.conta_creditar
      left join pessoa        p  on p.grid    = f.pessoa
      left join motivo_movto  mm on mm.grid   = f.motivo
      left join prov          pv on pv.fluxo_grid = f.grid
      left join conta     cresolv on cresolv.codigo = pv.despesa_codigo
      order by f.data, f.grid
    `;

    const result = await pg.queryObject<Record<string, unknown>>({
      text: sql,
      args: [empresasNum, data_de, data_ate, codigosCaixa],
    });

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
