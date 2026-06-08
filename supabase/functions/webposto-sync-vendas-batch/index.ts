// ============================================================
// Edge Function: webposto-sync-vendas-batch
//
// Orquestrador do cron noturno. Itera as empresas com
// cci_webposto_sync_config.ativo = true e dispara webposto-sync-vendas
// pra cada uma com janela = [hoje-7d ... hoje].
//
// Se ultima_data_sync estiver mais que 7 dias atrás, ESTENDE a janela
// pra cobrir o gap inteiro (auto-correção).
//
// Falhas individuais não param as demais (try/catch por empresa).
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

// Janela FIXA do cron noturno: SEMPRE últimos 7 dias. Não estendemos
// automaticamente pra cobrir gaps (mesmo se ultima_data_sync for antiga).
// Histórico maior é responsabilidade do backfill manual (admin marca
// meses específicos no /admin/webposto-sync). Mantendo a janela fixa,
// cada execução do cron é previsível em tempo e volume.
const OVERLAP_DIAS = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isoDateOffset(deltaDias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + deltaDias);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido' }, 405);

  const supaUrl = Deno.env.get('SUPABASE_URL');
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !supaKey) return json({ error: 'SUPABASE_URL/SERVICE_ROLE_KEY não configurados' }, 500);
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  // 1) Pega as REDES ativas
  const { data: redes, error: errRedes } = await supabase
    .from('cci_webposto_sync_config_rede')
    .select('chave_api_id')
    .eq('ativo', true);
  if (errRedes) return json({ error: 'Falha ao listar redes ativas', detail: errRedes.message }, 500);
  const redeIds = (redes || []).map(r => r.chave_api_id);
  if (redeIds.length === 0) return json({ ok: true, total: 0, resultados: [] });

  // 2) Lista todas as empresas das redes ativas
  const { data: empresasAll, error: errEmp } = await supabase
    .from('empresas_api')
    .select('chave_api_id, empresa_codigo')
    .in('chave_api_id', redeIds);
  if (errEmp) return json({ error: 'Falha ao listar empresas das redes', detail: errEmp.message }, 500);
  const empresas = empresasAll || [];

  const dataAte = isoDateOffset(0);
  const dataAteIso = dataAte;

  // ESTRATÉGIA: fire-and-forget. O orquestrador NÃO aguarda resposta dos
  // workers — apenas (1) cria 1 job 'aguardando' por empresa e (2) dispara
  // a edge filha sem await. Cada filha roda independente e atualiza seu
  // próprio job. Retorna em <5s.
  //
  // Por que: aguardar cada worker sequencialmente leva 30-90s por empresa.
  // Pra 20 empresas dá ~30min e estoura o timeout de 150s da própria
  // edge batch — jobs ficavam parcialmente criados ou nem criados.

  // 1) Cria 1 job por empresa com janela FIXA de 7 dias. Não tenta
  // cobrir gaps históricos — admin faz isso via backfill mensal.
  const dataDe = isoDateOffset(-OVERLAP_DIAS);
  const jobsParaCriar = empresas.map(emp => ({
    chave_api_id: emp.chave_api_id,
    empresa_codigo: emp.empresa_codigo,
    tipo: 'cron_diario',
    data_de: dataDe,
    data_ate: dataAteIso,
    status: 'aguardando',
  }));

  const { data: jobsCriados, error: errCria } = await supabase
    .from('cci_webposto_sync_job')
    .insert(jobsParaCriar)
    .select('id, chave_api_id, empresa_codigo, data_de, data_ate');
  if (errCria) return json({ error: 'Falha ao criar jobs', detail: errCria.message }, 500);

  // 2) Marca redes como 'rodando' (UI já reflete imediato)
  for (const redeId of redeIds) {
    await supabase.from('cci_webposto_sync_config_rede').upsert({
      chave_api_id: redeId,
      ultima_sync_em: new Date().toISOString(),
      status: 'rodando',
      erro_mensagem: null,
    }, { onConflict: 'chave_api_id' });
  }

  // 3) Dispara workers via pg_net (RPC `cci_webposto_dispara_worker`).
  //
  // POR QUÊ pg_net e não fetch direto:
  // - Edge Functions matam fetches em background quando retornam response.
  // - EdgeRuntime.waitUntil teoricamente resolve, mas testes mostraram
  //   que workers ainda ficavam órfãos em 'aguardando' eternamente.
  // - pg_net.http_post enfileira a request no Postgres — executa FORA do
  //   ciclo de vida desta edge function, garantindo entrega.
  //
  // As chamadas à RPC são RÁPIDAS (só enfileira) — fazemos em paralelo
  // com Promise.allSettled (não bloqueia se uma falhar).
  const enfileiraResultados = await Promise.allSettled(
    (jobsCriados || []).map(j => supabase.rpc('cci_webposto_dispara_worker', {
      p_supabase_url:   supaUrl,
      p_service_key:    supaKey,
      p_chave_api_id:   j.chave_api_id,
      p_empresa_codigo: j.empresa_codigo,
      p_data_de:        j.data_de,
      p_data_ate:       j.data_ate,
      p_tipo:           'cron_diario',
      p_job_id:         j.id,
    }))
  );
  const enfileirados = enfileiraResultados.filter(r => r.status === 'fulfilled' && !(r.value as any).error).length;
  const falhasEnfileira = enfileiraResultados
    .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).error))
    .map(r => r.status === 'rejected' ? (r as any).reason?.message : ((r as any).value?.error?.message))
    .slice(0, 3);

  // 4) Retorna imediatamente — pg_net cuida do disparo real, workers
  // rodam independente, front acompanha por realtime/polling.
  return json({
    ok: true,
    jobs_criados: jobsCriados?.length || 0,
    workers_enfileirados: enfileirados,
    redes_ativas: redeIds.length,
    empresas_alvo: empresas.length,
    falhas_enfileira: falhasEnfileira,
    mensagem: 'Workers enfileirados via pg_net. Acompanhe pelo histórico.',
  });
});
