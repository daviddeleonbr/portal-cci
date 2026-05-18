// ============================================================
// Edge Function: autosystem-movto-flow
//
// Retorna o log de auditoria de lançamentos (tabela `movto_flow`) do
// banco remoto Autosystem. Cada linha é um EVENTO sobre um lançamento,
// não o lançamento em si — `movto_flow` guarda um snapshot completo
// do estado em cada `I` (inclusão), `Un` (estado depois da edição),
// `Uo` (estado antes da edição) e `D` (exclusão).
//
// Identificadores principais:
//   - `pgd_gfid`   → PK do evento de log
//   - `parent`/`mlid`/`grid` → identificam o lançamento (iguais em todos eventos)
//   - `pgd_when`   → timestamp do evento
//   - `pgd_optype` → 'I' | 'Un' | 'Uo' | 'D'
//   - `pgd_username` → usuário que originou o evento
//
// O schema varia entre instalações — esta função detecta os nomes reais
// das colunas via `information_schema.columns` antes de montar a query.
// Aliases canônicos (`data`, `hora`, `movto`, `usuario`, `optype`) são
// adicionados ao select pra simplificar o consumo pelo front.
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
        ? Number(v) : v.toString();
    }
    return v;
  };
  return new Response(JSON.stringify(body, replacer), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string;
    data_ate?: string;
    limit?: number;
    mode?: 'eventos' | 'usuarios';
    contas_excluidas?: string[];
  };
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate } = body;
  const mode = body.mode === 'usuarios' ? 'usuarios' : 'eventos';
  const contasExcluidas = (Array.isArray(body.contas_excluidas) ? body.contas_excluidas : [])
    .map(v => String(v ?? '').trim())
    .filter(v => v !== '');
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  if (!Array.isArray(empresaCodigos) || empresaCodigos.length === 0) {
    return json({ error: 'empresa_codigos[] é obrigatório' }, 400);
  }
  if (!data_de || !data_ate) return json({ error: 'data_de e data_ate são obrigatórios' }, 400);
  const limit = Math.max(50, Math.min(10000, Number(body.limit) || 5000));

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: credRows, error: credErr } = await supabase.rpc('as_rede_get_credenciais', { p_id: redeId });
  if (credErr) return json({ error: 'Falha ao buscar credenciais', detail: credErr.message }, 500);
  const cred = Array.isArray(credRows) ? credRows[0] : credRows;
  if (!cred) return json({ error: 'Rede não encontrada' }, 404);

  const pg = new PgClient({
    hostname: cred.conexao_ip,
    port: cred.conexao_porta || 5432,
    database: cred.conexao_banco,
    user: cred.conexao_usuario,
    password: cred.conexao_senha,
    tls: { enabled: false },
  });

  const empresasNum = empresaCodigos.map(v => Number(v)).filter(n => Number.isFinite(n));
  const decoder = new TextDecoder('windows-1252');
  const decodeRow = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Uint8Array) out[k] = decoder.decode(v);
      else out[k] = v;
    }
    return out;
  };

  let failedStep = 'connect';
  try {
    await pg.connect();

    failedStep = 'set_client_encoding';
    await pg.queryArray("set client_encoding to 'SQL_ASCII'");

    // 1) Schema de movto_flow
    failedStep = 'select_schema';
    const schemaRes = await pg.queryObject<Record<string, unknown>>({
      text: `
        select column_name, data_type, ordinal_position
        from information_schema.columns
        where table_name = 'movto_flow'
        order by ordinal_position
      `,
    });
    const schema = schemaRes.rows;
    const colunas = new Set(
      schema.map(r => String((r as any).column_name || '').toLowerCase()),
    );
    const has = (c: string) => colunas.has(c.toLowerCase());

    // Detecta colunas-chave. Prioriza o padrão Autosystem (pgd_*).
    // `colWhen` é o timestamp do evento (pgd_when) — usado pra ordenar o
    // timeline e identificar a sequência cronológica das alterações.
    // `colDataFiltro` é a data do lançamento (mf.data) — usado pro filtro de
    // período. A intenção é "alterações cujo LANÇAMENTO original é do período",
    // não "alterações registradas no período".
    const colWhen        = ['pgd_when', 'datahora'].find(has) || 'pgd_when';
    const colDataFiltro  = ['data', 'data_alteracao', 'data_evento'].find(has) || colWhen;
    const colHora        = ['hora', 'hora_alteracao', 'horario'].find(has);
    const colEmpresa  = ['empresa', 'empresa_id', 'cod_empresa'].find(has) || 'empresa';
    const colUsuario  = ['pgd_username', 'usuario', 'user', 'operador'].find(has);
    const colOptype   = ['pgd_optype', 'operacao', 'tipo', 'acao', 'evento'].find(has);
    const colGfid     = ['pgd_gfid', 'gfid', 'grid'].find(has) || 'grid';

    // Chave estável do lançamento. Prioriza `mlid` (presente em lançamentos
    // com movimentação de ledger), cai para `parent` quando `mlid` é nulo/0
    // (inclusões puras como "CAIXA DIA"). `grid` NÃO é estável — pode mudar
    // numa alteração via D+I.
    const hasMlid = has('mlid');
    const hasParent = has('parent');
    let lancExpr: string;
    if (hasMlid && hasParent) {
      lancExpr = `coalesce(nullif(nullif(mf.mlid::text, ''), '0'), nullif(mf.parent::text, ''))`;
    } else if (hasMlid) {
      lancExpr = `nullif(nullif(mf.mlid::text, ''), '0')`;
    } else if (hasParent) {
      lancExpr = `nullif(mf.parent::text, '')`;
    } else {
      // Fallback p/ schemas sem mlid/parent: usa o próprio gfid (cada evento vira um grupo)
      lancExpr = `mf.${colGfid}::text`;
    }
    // Aliases extras. Usamos nomes únicos com prefixo `_` pra nunca colidir com
    // colunas existentes em movto_flow (que já podem ter `data`, `hora`, `usuario`).
    // O frontend lê esses aliases (`_when`, `_lancamento`) como chaves canônicas.
    const aliases: string[] = [];
    aliases.push(`mf.${colWhen}::text as _when`);
    if (colHora) aliases.push(`mf.${colHora}::text as _hora`);
    aliases.push(`${lancExpr} as _lancamento`);
    const aliasesClause = aliases.length ? `, ${aliases.join(', ')}` : '';

    // JOIN usuario→pessoa pra trazer o nome completo do funcionário
    let usuarioJoin = '';
    if (colUsuario) {
      usuarioJoin = `,
          (select convert_to(coalesce(pe.nome::text,''), 'LATIN1')
             from usuario u
             left join pessoa pe on pe.grid = u.pessoa
            where u.nome::text = mf.${colUsuario}::text
            limit 1) as usuario_nome`;
    }

    // JOIN conta pra trazer o nome das contas contábeis (débito/crédito).
    // Só anexa se a tabela conta existir e movto_flow tiver as colunas.
    let contasJoin = '';
    if (has('conta_debitar') || has('conta_creditar')) {
      const schemaContaRes = await pg.queryObject<Record<string, unknown>>({
        text: `select column_name from information_schema.columns where table_name = 'conta'`,
      });
      const colunasConta = new Set(
        schemaContaRes.rows.map(r => String((r as any).column_name || '').toLowerCase()),
      );
      if (colunasConta.has('codigo') && colunasConta.has('nome')) {
        if (has('conta_debitar')) {
          contasJoin += `,
          (select convert_to(coalesce(c.nome::text,''), 'LATIN1')
             from conta c
            where c.codigo::text = mf.conta_debitar::text
            limit 1) as conta_debitar_nome`;
        }
        if (has('conta_creditar')) {
          contasJoin += `,
          (select convert_to(coalesce(c.nome::text,''), 'LATIN1')
             from conta c
            where c.codigo::text = mf.conta_creditar::text
            limit 1) as conta_creditar_nome`;
        }
      }
    }

    // JOIN motivo_movto pra trazer o nome do motivo (Forma de Pagamento).
    // mf.motivo é uma FK pra motivo_movto.grid.
    let motivoJoin = '';
    if (has('motivo')) {
      const schemaMotivoRes = await pg.queryObject<Record<string, unknown>>({
        text: `select column_name from information_schema.columns where table_name = 'motivo_movto'`,
      });
      const colunasMotivo = new Set(
        schemaMotivoRes.rows.map(r => String((r as any).column_name || '').toLowerCase()),
      );
      if (colunasMotivo.has('grid') && colunasMotivo.has('nome')) {
        motivoJoin = `,
          (select convert_to(coalesce(mm.nome::text,''), 'LATIN1')
             from motivo_movto mm
            where mm.grid = mf.motivo
            limit 1) as motivo_movto_nome`;
      }
    }

    // Filtro de tipo: apenas eventos de inclusão (I), atualização (Un/Uo) ou
    // exclusão (D). Inclui Uo porque ele carrega o "estado antes" — útil pro
    // diff client-side mesmo se a UI esconder a linha em si.
    let filtroTipo = '';
    if (colOptype) {
      filtroTipo = `
        and upper(left(trim(mf.${colOptype}::text), 1)) in ('I', 'U', 'D')`;
    }

    // Filtro de módulo removido — todos os módulos (main, pdv, rep, etc.) são
    // considerados, pra que o evento de inclusão (que pode vir de outro módulo)
    // apareça junto com a alteração feita manualmente.
    const filtroModulo = '';

    // Filtro de usuário: descarta eventos sem `pgd_username` preenchido
    // (gerados por processos automáticos sem identificação humana).
    let filtroUsuario = '';
    if (colUsuario) {
      filtroUsuario = `
        and mf.${colUsuario} is not null
        and trim(mf.${colUsuario}::text) <> ''`;
    }

    // Filtro de contas. movto_flow é um snapshot — as colunas estão direto em mf
    // se elas existirem. Caso contrário, faz fallback via EXISTS em movto.
    let filtroContas = '';
    if (has('conta_debitar') && has('conta_creditar')) {
      filtroContas = `
        and (mf.conta_debitar::text  like '1.1.2%'
          or mf.conta_creditar::text like '1.1.2%')
        and mf.conta_creditar::text <> '4.1'`;
      // Descarta lançamentos onde alguma das contas é classificada como
      // sobra/falta de caixa (cadastradas em as_rede_conta_categoria).
      if (contasExcluidas.length > 0) {
        filtroContas += `
        and mf.conta_debitar::text  <> all($5::text[])
        and mf.conta_creditar::text <> all($5::text[])`;
      }
    } else if (has('movto')) {
      // Fallback: tenta JOIN com movto se o snapshot não trouxer as contas
      const schemaMovtoRes = await pg.queryObject<Record<string, unknown>>({
        text: `select column_name from information_schema.columns where table_name = 'movto'`,
      });
      const colunasMovto = new Set(
        schemaMovtoRes.rows.map(r => String((r as any).column_name || '').toLowerCase()),
      );
      if (colunasMovto.has('conta_debitar') && colunasMovto.has('conta_creditar')) {
        filtroContas = `
          and exists (
            select 1 from movto m
            where m.grid = mf.movto
              and (m.conta_debitar::text  like '1.1.2%'
                or m.conta_creditar::text like '1.1.2%')
              and m.conta_creditar::text <> '4.1'
          )`;
      }
    }

    // Ordenação: timestamp desc, depois agrupador lógico do lançamento (mlid/parent),
    // depois o gfid (PK do evento). Eventos de um par D+I/Uo+Un compartilham
    // pgd_when, então mantemos eles juntos no resultado.
    const orderBy = [
      `mf.${colWhen} desc`,
      `${lancExpr}`,
      `mf.${colGfid}`,
    ].filter(Boolean).join(', ');

    // Modo `usuarios`: retorna lista distinta de pgd_username (com nome via JOIN)
    // pra popular o filtro de usuário na UI sem precisar carregar todos os eventos.
    if (mode === 'usuarios') {
      if (!colUsuario) {
        return json({ usuarios: [] });
      }
      failedStep = 'select_usuarios';
      const usuariosRes = await pg.queryObject<Record<string, unknown>>({
        text: `
          select
            u.usuario,
            (select convert_to(coalesce(pe.nome::text,''), 'LATIN1')
               from usuario us
               left join pessoa pe on pe.grid = us.pessoa
              where us.nome::text = u.usuario
              limit 1) as usuario_nome
          from (
            select distinct mf.${colUsuario}::text as usuario
            from movto_flow mf
            where mf.${colEmpresa} = any($1::bigint[])
              and mf.${colDataFiltro} >= $2::date
              and mf.${colDataFiltro} <  ($3::date + interval '1 day')
              and mf.${colUsuario} is not null
              and trim(mf.${colUsuario}::text) <> ''
          ) u
          order by u.usuario
        `,
        args: [empresasNum, data_de, data_ate],
      });
      const usuarios = usuariosRes.rows.map(decodeRow);
      return json({ usuarios });
    }

    // Filtro direto na movto_flow — sem CTE, sem self-join. O range de data é
    // expresso de forma index-friendly (sem cast no LHS) pra permitir uso de
    // qualquer btree existente em mf.data.
    failedStep = 'select_alteracoes';
    const alterRes = await pg.queryObject<Record<string, unknown>>({
      text: `
        select mf.* ${aliasesClause} ${usuarioJoin} ${contasJoin} ${motivoJoin}
        from movto_flow mf
        where mf.${colEmpresa} = any($1::bigint[])
          and mf.${colDataFiltro} >= $2::date
          and mf.${colDataFiltro} <  ($3::date + interval '1 day')
          ${filtroTipo}
          ${filtroModulo}
          ${filtroUsuario}
          ${filtroContas}
        order by ${orderBy}
        limit $4
      `,
      args: contasExcluidas.length > 0
        ? [empresasNum, data_de, data_ate, limit, contasExcluidas]
        : [empresasNum, data_de, data_ate, limit],
    });
    const alteracoes = alterRes.rows.map(decodeRow);

    // No novo modelo do movto_flow, pares de eventos (D+I para alteração manual,
    // Uo+Un para ajuste automático) compartilham o mesmo `pgd_when`. Se o
    // lançamento atende ao filtro de data, ambos os lados do par vêm juntos —
    // não é necessário lookup adicional. Removido o orphan-fetch que existia
    // no modelo antigo.

    return json({
      schema,
      alteracoes,
      total: alteracoes.length,
      colunas_detectadas: {
        when: colWhen,
        data_filtro: colDataFiltro,
        empresa: colEmpresa,
        lancamento_expr: lancExpr,
        usuario: colUsuario,
        optype: colOptype,
        gfid: colGfid,
      },
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
