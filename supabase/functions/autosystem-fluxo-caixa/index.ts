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
import { obterRede, executarQuery, decodeRowText } from '../_shared/autosystem-query.ts';

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
    contas_selecionadas?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { rede_id: redeId, empresa_codigos: empresaCodigos, data_de, data_ate, contas_caixa_banco, contas_selecionadas } = body;
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

  try {
    const rede = await obterRede(supabase, redeId, req);

    const codigosCaixa = (contas_caixa_banco || []).map(c => String(c));
    const empresasNum = (empresaCodigos || []).map(e => Number(e)).filter(n => Number.isFinite(n));
    // Conjunto de REFERÊNCIA do fluxo: quando o usuário seleciona um subconjunto
    // de contas, o "caixa" do cálculo passa a ser SÓ essas contas — assim uma
    // transferência de uma conta NÃO selecionada para uma selecionada conta como
    // entrada real (bate com o extrato). Sem seleção → todas as contas caixa/banco
    // (comportamento consolidado idêntico ao anterior).
    const refSet = Array.isArray(contas_selecionadas) && contas_selecionadas.length > 0
      ? contas_selecionadas.map(c => String(c))
      : codigosCaixa;

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
    const sql = `
      with fluxo as (
        select m.*,
          case when m.conta_debitar  = any($5::text[]) then 'debito' else 'credito' end as lado_caixa,
          case when m.conta_debitar  = any($5::text[]) then  1 else -1 end             as sinal,
          case when m.conta_debitar  = any($5::text[]) then m.conta_creditar
                                                       else m.conta_debitar end        as contraparte_codigo
        from movto m
        where m.empresa = any($1::bigint[])
          and m.data between $2 and $3
          and (
            -- coalesce: contrapartida NULL/vazia conta como "fora do caixa" (senão
            -- a comparação vira NULL e o lançamento some do fluxo, mas segue no
            -- extrato → gera diferença invisível na reconciliação).
            (m.conta_debitar  = any($5::text[]) and not coalesce(m.conta_creditar = any($5::text[]), false))
            or
            (m.conta_creditar = any($5::text[]) and not coalesce(m.conta_debitar  = any($5::text[]), false))
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
        (pv.despesa_codigo is not null)                       as via_provisao,
        -- true = a contraparte também é conta caixa/banco → transferência entre
        -- contas (só sobrevive quando a outra ponta está FORA da seleção).
        (f.contraparte_codigo = any($4::text[]))              as contraparte_eh_caixa,
        -- true = a contraparte RESOLVIDA via provisão é conta caixa/banco →
        -- é transferência interna roteada por conta-ponte (2.1.1), não despesa.
        (pv.despesa_codigo is not null and pv.despesa_codigo = any($4::text[])) as contraparte_resolvida_eh_caixa
      from fluxo f
      left join conta         cd on cd.codigo = f.conta_debitar
      left join conta         cc on cc.codigo = f.conta_creditar
      left join pessoa        p  on p.grid    = f.pessoa
      left join motivo_movto  mm on mm.grid   = f.motivo
      left join prov          pv on pv.fluxo_grid = f.grid
      left join conta     cresolv on cresolv.codigo = pv.despesa_codigo
      order by f.data, f.grid
    `;

    const result = await executarQuery(rede, sql, [empresasNum, data_de, data_ate, codigosCaixa, refSet], { encoding: 'SQL_ASCII' });

    const linhas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    // Saldo de caixa/banco por empresa+conta acumulado até uma data de corte.
    // Cada lançamento afeta a(s) conta(s) caixa que aparece(m) nele:
    //   débito  numa conta caixa → +valor  (entra dinheiro na conta)
    //   crédito numa conta caixa → -valor  (sai dinheiro da conta)
    // Como uma transferência entre 2 contas caixa afeta AMBAS, somamos os dois
    // lados (union): a conta debitada recebe +valor e a creditada -valor. Assim
    // o saldo por conta fica correto e a soma por empresa também.
    //   corte '<'  + data_de  → saldo INICIAL (antes do período)
    //   corte '<=' + data_ate → saldo FINAL   (até o fim do período)
    const saldoAte = async (op: '<' | '<=', dataCorte: string) => {
      const sql = `
        select empresa, conta, coalesce(sum(v), 0) as saldo
        from (
          select m.empresa as empresa, m.conta_debitar  as conta,  m.valor as v
          from movto m
          where m.empresa = any($1::bigint[]) and m.data ${op} $2 and m.conta_debitar  = any($3::text[])
          union all
          select m.empresa as empresa, m.conta_creditar as conta, -m.valor as v
          from movto m
          where m.empresa = any($1::bigint[]) and m.data ${op} $2 and m.conta_creditar = any($3::text[])
        ) t
        group by empresa, conta
      `;
      const rows = await executarQuery(rede, sql, [empresasNum, dataCorte, refSet], { encoding: 'SQL_ASCII' });
      const porEmpresa: Record<string, number> = {};
      const porConta: Record<string, Record<string, number>> = {};
      rows.forEach(r => {
        const ec = Number(r.empresa);
        if (!Number.isFinite(ec)) return;
        const conta = String(r.conta ?? '').trim();
        if (!conta) return;
        const v = Number(r.saldo || 0);
        porEmpresa[String(ec)] = (porEmpresa[String(ec)] || 0) + v;
        (porConta[String(ec)] ||= {})[conta] = v;
      });
      return { porEmpresa, porConta };
    };

    // Enriquecimento de saldos/movimentação — resiliente: se qualquer query aqui
    // falhar ou der timeout (redes grandes), retornamos os LANÇAMENTOS mesmo assim
    // (o fluxo/máscara ainda monta; só os saldos por conta ficam vazios).
    let ini: { porEmpresa: Record<string, number>; porConta: Record<string, Record<string, number>> } = { porEmpresa: {}, porConta: {} };
    let fim: { porEmpresa: Record<string, number>; porConta: Record<string, Record<string, number>> } = { porEmpresa: {}, porConta: {} };
    const movimentacaoConta: Record<string, Record<string, { debito: number; credito: number }>> = {};
    try {
    ini = await saldoAte('<', data_de);
    fim = await saldoAte('<=', data_ate);

    // Saldo de ABERTURA da conta (coluna conta.saldo_inicial) — parte do saldo que
    // NÃO está na movto (ex.: lançamento de saldo inicial de uma conta caixa).
    // É um valor-base presente tanto no saldo inicial quanto no final. Introspecta
    // a tabela pra descobrir se a coluna existe e se há dimensão por empresa.
    const abertura: Record<string, Record<string, number>> = {};
    try {
      const colsRes = await executarQuery(rede,
        `select column_name from information_schema.columns where table_name = 'conta'`,
        [], { encoding: 'SQL_ASCII' });
      const cols = new Set(colsRes.map((r: Record<string, unknown>) => String(r.column_name ?? '').toLowerCase()));
      if (cols.has('saldo_inicial')) {
        if (cols.has('empresa')) {
          const rows = await executarQuery(rede,
            `select empresa, codigo, saldo_inicial from conta
             where empresa = any($1::bigint[]) and codigo = any($2::text[]) and coalesce(saldo_inicial, 0) <> 0`,
            [empresasNum, refSet], { encoding: 'SQL_ASCII' });
          rows.forEach((r: Record<string, unknown>) => {
            const ec = Number(r.empresa); const conta = String(r.codigo ?? '').trim();
            if (!Number.isFinite(ec) || !conta) return;
            (abertura[String(ec)] ||= {})[conta] = Number(r.saldo_inicial || 0);
          });
        } else {
          // conta global (sem coluna empresa) — atribui a abertura à empresa DONA
          // da conta (a que tem movimento nela). Assim o saldo de uma empresa fica
          // IGUAL vendo ela sozinha ou dentro da rede (antes só aplicava com 1
          // empresa, então divergia entre a empresa isolada e a rede toda).
          const rows = await executarQuery(rede,
            `select codigo, saldo_inicial from conta
             where codigo = any($1::text[]) and coalesce(saldo_inicial, 0) <> 0`,
            [refSet], { encoding: 'SQL_ASCII' });
          const donoDaConta = (conta: string): string[] => {
            const donos = new Set<string>();
            for (const ec of Object.keys(ini.porConta)) if (conta in ini.porConta[ec]) donos.add(ec);
            for (const ec of Object.keys(fim.porConta)) if (conta in fim.porConta[ec]) donos.add(ec);
            return [...donos];
          };
          rows.forEach((r: Record<string, unknown>) => {
            const conta = String(r.codigo ?? '').trim();
            if (!conta) return;
            const v = Number(r.saldo_inicial || 0);
            const donos = donoDaConta(conta);
            let ec: string | null = null;
            if (donos.length === 1) ec = donos[0];                              // dona única
            else if (donos.length === 0 && empresasNum.length === 1) ec = String(empresasNum[0]); // sem movimento + 1 empresa
            // donos.length > 1 (conta compartilhada) → ambíguo, ignora
            if (ec) (abertura[ec] ||= {})[conta] = v;
          });
        }
      }
    } catch (_) { /* tabela conta sem saldo_inicial → ignora */ }

    // Soma a abertura no saldo inicial E final (por empresa e por conta).
    const aplicarAbertura = (alvo: { porEmpresa: Record<string, number>; porConta: Record<string, Record<string, number>> }) => {
      Object.entries(abertura).forEach(([ec, contas]) => {
        Object.entries(contas).forEach(([conta, v]) => {
          (alvo.porConta[ec] ||= {})[conta] = (alvo.porConta[ec][conta] || 0) + v;
          alvo.porEmpresa[ec] = (alvo.porEmpresa[ec] || 0) + v;
        });
      });
    };
    aplicarAbertura(ini);
    aplicarAbertura(fim);

    // Débito (dinheiro que ENTROU) e crédito (que SAIU) reais por empresa+conta
    // no período — como o "Balancete de verificação". Inclui transferências
    // internas (que o fluxo exclui), pra reconciliar com o extrato de cada conta.
    const sqlMov = `
      select empresa, conta, coalesce(sum(deb), 0) as debito, coalesce(sum(cred), 0) as credito
      from (
        select m.empresa as empresa, m.conta_debitar  as conta, m.valor as deb, 0::numeric as cred
        from movto m
        where m.empresa = any($1::bigint[]) and m.data between $2 and $3 and m.conta_debitar  = any($4::text[])
        union all
        select m.empresa as empresa, m.conta_creditar as conta, 0::numeric as deb, m.valor as cred
        from movto m
        where m.empresa = any($1::bigint[]) and m.data between $2 and $3 and m.conta_creditar = any($4::text[])
      ) t
      group by empresa, conta
    `;
    const movRows = await executarQuery(rede, sqlMov, [empresasNum, data_de, data_ate, refSet], { encoding: 'SQL_ASCII' });
    movRows.forEach(r => {
      const ec = Number(r.empresa);
      if (!Number.isFinite(ec)) return;
      const conta = String(r.conta ?? '').trim();
      if (!conta) return;
      (movimentacaoConta[String(ec)] ||= {})[conta] = {
        debito: Number(r.debito || 0), credito: Number(r.credito || 0),
      };
    });
    } catch (e) {
      console.error('[autosystem-fluxo-caixa] saldos/movimentação falharam — retornando só lançamentos:',
        e instanceof Error ? e.message : String(e));
    }

    return json({
      lancamentos: linhas,
      saldos_iniciais: ini.porEmpresa,
      saldos_iniciais_conta: ini.porConta,
      saldos_finais: fim.porEmpresa,
      saldos_finais_conta: fim.porConta,
      movimentacao_conta: movimentacaoConta,
    });
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
