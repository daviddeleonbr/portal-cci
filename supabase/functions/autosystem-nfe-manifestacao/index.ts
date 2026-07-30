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
  if (!Array.isArray(empresa_codigos) || empresa_codigos.length === 0) {
    return json({ error: 'Selecione ao menos uma empresa.' }, 400);
  }
  const codigos = [...new Set(empresa_codigos.map(Number).filter(Number.isFinite))];
  if (codigos.length === 0) return json({ error: 'empresa_codigos inválidos' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // Autoriza: rede + permissão 'notas_fiscais' + empresas permitidas.
    await autorizarAcesso(supabase, req, redeId, {
      permissoes: ['notas_fiscais'],
      empresasCodigos: codigos,
    });
    const rede = await obterRede(supabase, redeId);

    const params: unknown[] = [codigos];
    const conds: string[] = [
      'm.nfe_evento = 0',                 // ainda a manifestar
      'e.codigo = any($1::int[])',
    ];
    if (data_de) { params.push(data_de); conds.push(`r.data_emissao >= $${params.length}`); }
    if (data_ate) { params.push(data_ate); conds.push(`r.data_emissao <= $${params.length}`); }

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
      join nfe        n on n.grid = m.nfe
      join nfe_resumo r on r.nfe  = m.nfe
      join empresa    e on e.grid = r.empresa
      where ${conds.join(' and ')}
      order by r.data_emissao desc, m.ts_registro desc
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
