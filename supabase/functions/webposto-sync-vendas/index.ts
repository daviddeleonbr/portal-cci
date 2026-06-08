// ============================================================
// Edge Function: webposto-sync-vendas
//
// Worker que sincroniza vendas da Quality API pro cache local
// (cci_webposto_venda + cci_webposto_venda_item) pra UMA empresa
// num intervalo [data_de, data_ate].
//
// Idempotente: usa UPSERT (ON CONFLICT) na PK composta.
// Captura cancelamentos: vendas que estavam no DB local mas sumiram
// da Quality no mesmo período → marca cancelada='S'.
//
// Body esperado:
//   {
//     chave_api_id: uuid,
//     empresa_codigo: int,
//     data_de: 'YYYY-MM-DD',
//     data_ate: 'YYYY-MM-DD',
//     tipo: 'backfill_mensal' | 'cron_diario' | 'manual' | 'ad_hoc',
//     job_id?: uuid,            // se já criado pelo orquestrador
//     disparado_por?: uuid
//   }
// ============================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LIMITE_PADRAO = 1500;
const DIAS_POR_CHUNK = 5;
const MAX_CONCURRENT_QUALITY = 12; // mais conservador no servidor

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Semáforo simples (limita concorrência das chamadas à Quality).
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}
  async acquire() {
    if (this.active < this.max) { this.active++; return; }
    await new Promise<void>(resolve => this.queue.push(resolve));
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) { this.active++; next(); }
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await fn(); } finally { this.release(); }
  }
}

function diasEntre(a: string, b: string): { de: string; ate: string }[] {
  const out: { de: string; ate: string }[] = [];
  const start = new Date(a + 'T00:00:00Z');
  const end   = new Date(b + 'T00:00:00Z');
  if (start > end) return [{ de: a, ate: b }];
  let cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + DIAS_POR_CHUNK - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    out.push({
      de:  cur.toISOString().slice(0, 10),
      ate: chunkEnd.toISOString().slice(0, 10),
    });
    cur = new Date(chunkEnd);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function fetchPagSequencial(urlBase: string, endpoint: string, apiKey: string, params: Record<string, any>, sem: Semaphore): Promise<any[]> {
  const limite = params.limite || LIMITE_PADRAO;
  let ultimoCodigo = 0;
  let all: any[] = [];
  while (true) {
    const qp = new URLSearchParams();
    Object.entries({ ...params, limite }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qp.set(k, String(v));
    });
    if (ultimoCodigo > 0) qp.set('ultimoCodigo', String(ultimoCodigo));
    const url = `${urlBase}/${endpoint}?${qp}`;
    const data = await sem.run(async () => {
      const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Quality ${endpoint} ${res.status}: ${t.slice(0, 200)}`);
      }
      return res.json();
    });
    const resultados = (data?.resultados || []) as any[];
    all = all.concat(resultados);
    if (resultados.length < limite || !data?.ultimoCodigo) break;
    ultimoCodigo = data.ultimoCodigo;
  }
  return all;
}

// Busca em paralelo dividindo o período em chunks.
async function fetchPaginado(urlBase: string, endpoint: string, apiKey: string, dataDe: string, dataAte: string, empresaCodigo: number, sem: Semaphore): Promise<any[]> {
  const chunks = diasEntre(dataDe, dataAte);
  const arrays = await Promise.all(chunks.map(c =>
    fetchPagSequencial(urlBase, endpoint, apiKey, {
      limite: LIMITE_PADRAO, dataInicial: c.de, dataFinal: c.ate, empresaCodigo,
    }, sem),
  ));
  return arrays.flat();
}

// Date do payload da Quality (vários campos possíveis).
// O campo CANÔNICO para VENDA é `dataHora`. Os outros vêm como fallback
// caso a Quality mude o nome no futuro ou esteja diferente em algum endpoint.
function extrairData(v: any): string | null {
  const raw = v?.dataHora || v?.dataVenda || v?.dataEmissao || v?.dataMovimento || v?.data;
  if (!raw) return null;
  // 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ss'
  return String(raw).slice(0, 10);
}

function num(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }

  const chaveApiId    = body.chave_api_id;
  const empresaCodigo = Number(body.empresa_codigo);
  const dataDe        = body.data_de;
  const dataAte       = body.data_ate;
  const tipo          = body.tipo || 'ad_hoc';
  const disparadoPor  = body.disparado_por || null;
  let   jobId         = body.job_id || null;

  if (!chaveApiId || !empresaCodigo || !dataDe || !dataAte) {
    return json({ error: 'chave_api_id, empresa_codigo, data_de, data_ate são obrigatórios' }, 400);
  }

  const supaUrl = Deno.env.get('SUPABASE_URL');
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !supaKey) return json({ error: 'SUPABASE_URL/SERVICE_ROLE_KEY não configurados' }, 500);
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  // ── 1) Lê config da chave_api (URL + chave)
  const { data: chave, error: errChave } = await supabase
    .from('chaves_api')
    .select('chave, url_base, ativo')
    .eq('id', chaveApiId)
    .single();
  if (errChave || !chave) return json({ error: 'chave_api não encontrada', detail: errChave?.message }, 404);

  // ── 2) Cria/atualiza job
  if (!jobId) {
    const { data: novoJob, error: errJob } = await supabase
      .from('cci_webposto_sync_job')
      .insert({
        chave_api_id: chaveApiId, empresa_codigo: empresaCodigo,
        tipo, data_de: dataDe, data_ate: dataAte,
        status: 'rodando', iniciado_em: new Date().toISOString(),
        disparado_por: disparadoPor,
      })
      .select('id').single();
    if (errJob) return json({ error: 'Falha ao criar job', detail: errJob.message }, 500);
    jobId = novoJob.id;
  } else {
    await supabase.from('cci_webposto_sync_job')
      .update({ status: 'rodando', iniciado_em: new Date().toISOString() })
      .eq('id', jobId);
  }

  await supabase.from('cci_webposto_sync_config').upsert({
    chave_api_id: chaveApiId, empresa_codigo: empresaCodigo,
    status: 'em_progresso',
  }, { onConflict: 'chave_api_id,empresa_codigo' });

  const sem = new Semaphore(MAX_CONCURRENT_QUALITY);
  let vendasInseridas = 0, itensInseridos = 0, vendasAtualizadas = 0, vendasCanceladasMarcadas = 0;

  try {
    // ── 3) Busca em paralelo VENDA + VENDA_ITEM
    const [vendasRaw, itensRaw] = await Promise.all([
      fetchPaginado(chave.url_base, 'VENDA',      chave.chave, dataDe, dataAte, empresaCodigo, sem),
      fetchPaginado(chave.url_base, 'VENDA_ITEM', chave.chave, dataDe, dataAte, empresaCodigo, sem),
    ]);

    // ── 4) Monta rows pra cci_webposto_venda
    const rowsVenda = vendasRaw
      .map((v: any) => {
        const venda_codigo = Number(v?.vendaCodigo ?? v?.codigo);
        const data = extrairData(v);
        if (!venda_codigo || !data) return null;
        const canc = String(v?.cancelada ?? 'N').toUpperCase().startsWith('S') ? 'S' : 'N';
        return {
          chave_api_id: chaveApiId,
          empresa_codigo: empresaCodigo,
          venda_codigo,
          data,
          cancelada: canc,
          raw: v,
          atualizada_em: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    // ── 5) Upsert em chunks de 500
    const CHUNK = 500;
    for (let i = 0; i < rowsVenda.length; i += CHUNK) {
      const slice = rowsVenda.slice(i, i + CHUNK);
      const { error } = await supabase.from('cci_webposto_venda').upsert(slice, {
        onConflict: 'chave_api_id,empresa_codigo,venda_codigo',
      });
      if (error) throw new Error(`upsert venda chunk ${i}: ${error.message}`);
      vendasInseridas += slice.length;
    }

    // ── 6) Sweep de cancelamentos
    // Vendas que existem no DB local no mesmo período mas NÃO vieram da Quality.
    const setQuality = new Set(rowsVenda.map(r => Number(r.venda_codigo)));
    const { data: localVendas, error: errLocal } = await supabase
      .from('cci_webposto_venda')
      .select('venda_codigo, cancelada')
      .eq('chave_api_id', chaveApiId)
      .eq('empresa_codigo', empresaCodigo)
      .gte('data', dataDe)
      .lte('data', dataAte);
    if (errLocal) throw new Error(`select sweep: ${errLocal.message}`);
    const sumiram = (localVendas || []).filter(
      v => !setQuality.has(Number(v.venda_codigo)) && v.cancelada !== 'S',
    );
    if (sumiram.length > 0) {
      const codigos = sumiram.map(v => v.venda_codigo);
      for (let i = 0; i < codigos.length; i += CHUNK) {
        const slice = codigos.slice(i, i + CHUNK);
        const { error } = await supabase.from('cci_webposto_venda')
          .update({ cancelada: 'S', atualizada_em: new Date().toISOString() })
          .eq('chave_api_id', chaveApiId)
          .eq('empresa_codigo', empresaCodigo)
          .in('venda_codigo', slice);
        if (error) throw new Error(`sweep update: ${error.message}`);
        vendasCanceladasMarcadas += slice.length;
      }
    }

    // ── 7) Monta itens (com item_sequencia fallback por ordem)
    // CUIDADO: o endpoint VENDA_ITEM da Quality às vezes retorna itens
    // cuja venda NÃO está no endpoint VENDA (ex: vendas de períodos
    // limítrofes, vendas com situação fora do filtro). Esses itens
    // violariam o FK — então filtramos antes.
    const setVendasOk = new Set(rowsVenda.map(r => Number(r.venda_codigo)));
    const mapaDataVenda = new Map(rowsVenda.map(r => [Number(r.venda_codigo), r.data]));

    const grouped = new Map<number, any[]>();
    let itensOrfaos = 0;
    for (const it of itensRaw) {
      const vc = Number(it?.vendaCodigo);
      if (!vc) continue;
      if (!setVendasOk.has(vc)) { itensOrfaos++; continue; }
      const arr = grouped.get(vc) || [];
      arr.push(it);
      grouped.set(vc, arr);
    }
    const rowsItens: any[] = [];
    for (const [vc, arr] of grouped) {
      arr.forEach((it, idx) => {
        const seq = Number(it?.itemSequencia ?? it?.sequencia ?? (idx + 1));
        const dataIt = extrairData(it) || mapaDataVenda.get(vc);
        if (!seq || !dataIt) return;
        rowsItens.push({
          chave_api_id: chaveApiId,
          empresa_codigo: empresaCodigo,
          venda_codigo: vc,
          item_sequencia: seq,
          produto_codigo: it?.produtoCodigo ?? null,
          data: dataIt,
          quantidade:      num(it?.quantidade),
          total_venda:     num(it?.totalVenda),
          total_custo:     num(it?.totalCusto),
          total_desconto:  num(it?.totalDesconto),
          total_acrescimo: num(it?.totalAcrescimo),
          icms_valor:      num(it?.icmsValor),
          valor_pis:       num(it?.valorPis),
          valor_cofins:    num(it?.valorCofins),
          valor_cbs:       num(it?.valorCbs),
          valor_ibs:       num(it?.valorIbs),
          raw: it,
          atualizada_em: new Date().toISOString(),
        });
      });
    }

    for (let i = 0; i < rowsItens.length; i += CHUNK) {
      const slice = rowsItens.slice(i, i + CHUNK);
      const { error } = await supabase.from('cci_webposto_venda_item').upsert(slice, {
        onConflict: 'chave_api_id,empresa_codigo,venda_codigo,item_sequencia',
      });
      if (error) throw new Error(`upsert item chunk ${i}: ${error.message}`);
      itensInseridos += slice.length;
    }

    // ── 8) Fecha job e config
    await supabase.from('cci_webposto_sync_job')
      .update({
        status: 'ok',
        concluido_em: new Date().toISOString(),
        vendas_inseridas: vendasInseridas,
        itens_inseridos: itensInseridos,
        vendas_atualizadas: vendasAtualizadas,
        vendas_canceladas_marcadas: vendasCanceladasMarcadas,
      })
      .eq('id', jobId);

    await supabase.from('cci_webposto_sync_config').upsert({
      chave_api_id: chaveApiId,
      empresa_codigo: empresaCodigo,
      ultima_sync_em: new Date().toISOString(),
      ultima_data_sync: dataAte,
      status: 'ok',
      erro_mensagem: null,
    }, { onConflict: 'chave_api_id,empresa_codigo' });

    return json({
      ok: true, job_id: jobId,
      vendas_inseridas: vendasInseridas,
      itens_inseridos: itensInseridos,
      vendas_canceladas_marcadas: vendasCanceladasMarcadas,
      itens_orfaos_descartados: itensOrfaos,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('cci_webposto_sync_job')
      .update({
        status: 'erro',
        concluido_em: new Date().toISOString(),
        erro_mensagem: msg.slice(0, 1000),
        vendas_inseridas: vendasInseridas,
        itens_inseridos: itensInseridos,
        vendas_canceladas_marcadas: vendasCanceladasMarcadas,
      })
      .eq('id', jobId);
    await supabase.from('cci_webposto_sync_config').upsert({
      chave_api_id: chaveApiId, empresa_codigo: empresaCodigo,
      status: 'erro', erro_mensagem: msg.slice(0, 500),
    }, { onConflict: 'chave_api_id,empresa_codigo' });
    return json({ error: 'Falha ao sincronizar', detail: msg, job_id: jobId }, 502);
  }
});
