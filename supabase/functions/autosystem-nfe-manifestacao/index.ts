// ============================================================
// Edge Function: autosystem-nfe-manifestacao
//
// Lista as NOTAS A MANIFESTAR (manifestação do destinatário / Distribuição DFe)
// do servidor Autosystem remoto — as notas recebidas que ainda NÃO tiveram
// evento de manifestação registrado.
//
// Modelo no Autosystem (analisado em banco real):
//   - nfe_manifestacao : fila de manifestação. `nfe_evento` = evento já enviado
//        (210200=Confirmação, 210210=Ciência, ...); **0 = ainda a manifestar**.
//        `situacao_nfe` (1=autorizada, 3=denegada). `nfe` (bigint) → nfe.grid.
//   - nfe              : `grid`, `chave_acesso` (44 díg).
//   - nfe_resumo       : resumo do DFe (cobre 100% das notas). `nfe` (FK),
//        `empresa` (GRID da empresa), `emitente_nome`, `emitente_cpf`,
//        `data_emissao`, `data_rec_sefaz`, `valor`.
//   - empresa          : `grid` ↔ `codigo` (o portal filtra por `codigo`).
//
// Escopo por empresa: nfe_resumo.empresa é o GRID, não o código → junta em
// `empresa` e filtra por `e.codigo = any($codigos)`.
//
// Encoding: banco declara UTF8 mas guarda bytes Windows-1252 → convert_to(...,
// 'LATIN1') e decodifica como windows-1252 no client. Só CONSULTA (SELECT).
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

const TEXT_COLUMNS = new Set(['emitente_nome', 'empresa_nome']);

// Decodifica o JWT do header (só pra checar cci_tipo). A assinatura já foi
// validada pelo gateway (verify_jwt on).
function ehAdmin(req: Request): boolean {
  const auth = req.headers.get('Authorization') || '';
  const parts = auth.replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return false;
  try {
    const c = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return c?.cci_tipo === 'admin';
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body: {
    rede_id?: string;
    empresa_codigos?: (string | number)[];
    data_de?: string | null;
    data_ate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { rede_id: redeId, empresa_codigos, data_de, data_ate } = body;
  if (!redeId) return json({ error: 'rede_id é obrigatório' }, 400);
  const codigos = Array.isArray(empresa_codigos)
    ? [...new Set(empresa_codigos.map(Number).filter(Number.isFinite))] : [];
  const temCodigos = codigos.length > 0;
  // Sem empresa_codigos = "toda a rede" (o banco remoto é single-tenant da rede).
  // Só ADMIN pode omitir; cliente precisa passar as empresas dele (senão veria
  // empresas fora do seu escopo).
  if (!temCodigos && !ehAdmin(req)) {
    return json({ error: 'Selecione ao menos uma empresa.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // Autoriza: rede + permissão 'notas_fiscais' + empresas permitidas (quando
    // informadas). Admin passa direto por autorizarAcesso.
    await autorizarAcesso(supabase, req, redeId, {
      permissoes: ['notas_fiscais'],
      empresasCodigos: temCodigos ? codigos : undefined,
    });
    const rede = await obterRede(supabase, redeId);

    // "A manifestar" = ainda NÃO finalizada. Exclui os eventos finais de
    // manifestação (210200 Confirmação, 210220 Desconhecimento, 210240 Operação
    // não realizada). Mantém 0 (Sem operação) e 210210 (Ciência da operação) —
    // esta última ainda precisa de conclusão dentro do prazo.
    // "A manifestar" = apenas SEM OPERAÇÃO (nfe_evento = 0). Ciência (210210) e
    // eventos finais (210200/210220/210240) ficam de fora. Exclui também as
    // NF-e Canceladas (situacao_nfe = 3) e as "Notas não visualizadas"
    // (visualiza = false) — mantém Autorizada/Denegada e visualizadas.
    const params: unknown[] = [];
    const conds: string[] = [
      'm.nfe_evento = 0',
      'm.situacao_nfe is distinct from 3',
      'm.visualiza is distinct from false',
    ];
    if (temCodigos) { params.push(codigos); conds.push(`e.codigo = any($${params.length}::int[])`); }
    // Filtro de data tolerante a resumo ausente (não descarta a nota se não
    // houver data no resumo).
    if (data_de) { params.push(data_de); conds.push(`(r.data_emissao is null or r.data_emissao >= $${params.length})`); }
    if (data_ate) { params.push(data_ate); conds.push(`(r.data_emissao is null or r.data_emissao <= $${params.length})`); }

    // LEFT JOINs: a nota (nfe_manifestacao) aparece mesmo que nfe/nfe_resumo/
    // empresa estejam ausentes nesse install — evita sumir tudo por join.
    const sql = `
      select
        m.grid                                              as manifestacao_grid,
        e.codigo                                            as empresa_codigo,
        convert_to(coalesce(e.nome::text, ''),  'LATIN1')   as empresa_nome,
        n.chave_acesso                                      as chave,
        convert_to(coalesce(r.emitente_nome, ''), 'LATIN1') as emitente_nome,
        r.emitente_cpf                                      as emitente_cnpj,
        r.valor,
        r.data_emissao,
        r.data_rec_sefaz,
        m.situacao_nfe,
        m.nfe_evento,
        m.ts_registro
      from nfe_manifestacao m
      left join nfe        n on n.grid = m.nfe
      left join nfe_resumo r on r.nfe  = m.nfe
      left join empresa    e on e.grid = r.empresa
      where ${conds.join(' and ')}
      order by r.data_emissao desc nulls last, m.ts_registro desc
    `;

    const result = await executarQuery(rede, sql, params, { encoding: 'SQL_ASCII' });
    const notas = result.map((row) => decodeRowText(row, TEXT_COLUMNS, 'windows-1252'));

    return json({ notas });
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
