// Sync de vendas Webposto (Quality → Supabase).
//
// Service usado pela tela admin (`/admin/webposto-sync`) pra:
//  - Listar configurações (sync ativo por empresa)
//  - Atualizar configurações
//  - Listar jobs (histórico de sincronizações)
//  - Disparar backfill manual de mês(es)
//  - Escutar em real-time os jobs em andamento
//
// Idempotência: o worker (edge function `webposto-sync-vendas`) usa
// UPSERT na PK composta — disparar o mesmo período N vezes não duplica.

import { supabase } from '../lib/supabase';

// Semáforo client-side pra invocação da edge function `webposto-sync-vendas`.
// Plan Pro do Supabase tem limite de ~10 instâncias paralelas — se
// disparamos 10+ ao mesmo tempo (5 empresas × 2 quinzenas + alguma rede
// concorrente), as últimas ficam na fila do Supabase e timeout-am.
// Limitando aqui em 4, garantimos que cada invocação tem máquina folgada
// pra rodar até o fim. Tempo total é quase igual (worker é I/O bound).
const MAX_INVOKES_PARALELOS = 4;
class SemaforoInvokes {
  constructor() { this.active = 0; this.queue = []; }
  async acquire() {
    if (this.active < MAX_INVOKES_PARALELOS) { this.active++; return; }
    await new Promise(r => this.queue.push(r));
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) { this.active++; next(); }
  }
}
const semInvokes = new SemaforoInvokes();
async function invokeWorkerControlado(body) {
  await semInvokes.acquire();
  try {
    await supabase.functions.invoke('webposto-sync-vendas', { body });
  } finally {
    semInvokes.release();
  }
}

export const STATUS_JOB = [
  { key: 'aguardando',   label: 'Aguardando',  cor: 'gray'    },
  { key: 'rodando',      label: 'Rodando',     cor: 'amber'   },
  { key: 'ok',           label: 'Concluído',   cor: 'emerald' },
  { key: 'erro',         label: 'Erro',        cor: 'rose'    },
];

// ─── Configuração ─────────────────────────────────────────────
// Toggle de sincronia agora é por REDE (chave_api_id). Quando ligado,
// o cron noturno sincroniza TODAS as empresas dessa rede.

export async function listarConfigPorEmpresa() {
  // Status individual de cada empresa (ultima_sync_em, etc) — preenchido
  // pelo worker. A coluna `ativo` aqui é legada e ignorada.
  const { data, error } = await supabase
    .from('cci_webposto_sync_config')
    .select('*');
  if (error) throw error;
  return data || [];
}

export async function listarConfigRede() {
  const { data, error } = await supabase
    .from('cci_webposto_sync_config_rede')
    .select('*');
  if (error) throw error;
  return data || [];
}

export async function alternarAtivoRede(chaveApiId, ativo) {
  const { error } = await supabase
    .from('cci_webposto_sync_config_rede')
    .upsert({
      chave_api_id: chaveApiId,
      ativo,
    }, { onConflict: 'chave_api_id' });
  if (error) throw error;
}

// ─── Jobs ────────────────────────────────────────────────────

export async function listarJobs({ chaveApiId, empresaCodigo, limit = 50 } = {}) {
  let q = supabase
    .from('cci_webposto_sync_job')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(limit);
  if (chaveApiId)   q = q.eq('chave_api_id', chaveApiId);
  if (empresaCodigo != null) q = q.eq('empresa_codigo', empresaCodigo);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Dispara backfill para uma JANELA arbitrária (sub-bloco de um mês).
// Cria 1 job e invoca o worker. Usado pelo particionador `dispararBackfillMes`
// e também exposto pra redisparar 1 quinzena específica que falhou.
export async function dispararBackfillJanela({ chaveApiId, empresaCodigo, dataDe, dataAte, tipo = 'backfill_mensal', usuarioId }) {
  const { data: job, error: errJob } = await supabase
    .from('cci_webposto_sync_job')
    .insert({
      chave_api_id: chaveApiId,
      empresa_codigo: empresaCodigo,
      tipo,
      data_de: dataDe,
      data_ate: dataAte,
      status: 'aguardando',
      disparado_por: usuarioId || null,
    })
    .select()
    .single();
  if (errJob) throw errJob;

  // Invoca worker via semáforo: garante que nunca rodam mais que
  // MAX_INVOKES_PARALELOS edge functions simultâneas (evita timeout em
  // cascata quando há muitas empresas × meses na fila). O job já está em
  // 'aguardando' no DB — quando o slot do semáforo abrir, o worker vai
  // mudar pra 'rodando'.
  invokeWorkerControlado({
    chave_api_id: chaveApiId,
    empresa_codigo: empresaCodigo,
    data_de: dataDe,
    data_ate: dataAte,
    tipo,
    job_id: job.id,
    disparado_por: usuarioId || null,
  }).catch(() => { /* falha apareceria no job */ });

  return job;
}

// Dispara backfill para um único mês (ano-mês AAAA-MM).
//
// IMPORTANTE: pra contornar o timeout de ~150s das Edge Functions do
// Supabase, dividimos o mês em DUAS QUINZENAS (1-15 e 16-EOM). Cada
// quinzena vira um job independente. Postos de alto volume (ex:
// POSTO DIVINO 30k+ vendas/mês) estouravam o timeout fazendo o mês
// inteiro de uma vez — partindo em 2 jobs, cada um cabe folgado.
//
// Retorna ARRAY de 2 jobs (quinzena 1 + quinzena 2). Os consumidores
// que dependiam de um único job foram atualizados.
export async function dispararBackfillMes({ chaveApiId, empresaCodigo, ano, mes, usuarioId }) {
  if (!chaveApiId || !empresaCodigo || !ano || !mes) {
    throw new Error('Parâmetros inválidos no backfill');
  }
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  // Quinzena 1: 01 → 15
  const q1De  = `${ano}-${mm}-01`;
  const q1Ate = `${ano}-${mm}-15`;
  // Quinzena 2: 16 → ultimo dia
  const q2De  = `${ano}-${mm}-16`;
  const q2Ate = `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`;

  const jobs = [];
  const j1 = await dispararBackfillJanela({
    chaveApiId, empresaCodigo, dataDe: q1De, dataAte: q1Ate, usuarioId,
  });
  jobs.push(j1);
  // 2ª quinzena só se o mês tem dia 16+ (todos têm, mas defesa)
  if (ultimoDia >= 16) {
    const j2 = await dispararBackfillJanela({
      chaveApiId, empresaCodigo, dataDe: q2De, dataAte: q2Ate, usuarioId,
    });
    jobs.push(j2);
  }
  return jobs;
}

// Dispara backfill para vários meses de uma única vez. Cria 2 jobs por
// mês (quinzenas) — retorna array achatado de todos os jobs criados.
export async function dispararBackfillMultiplosMeses({ chaveApiId, empresaCodigo, mesesArray, usuarioId }) {
  const jobs = [];
  for (const { ano, mes } of mesesArray) {
    const js = await dispararBackfillMes({ chaveApiId, empresaCodigo, ano, mes, usuarioId });
    jobs.push(...js);
  }
  return jobs;
}

// Dispara backfill pra rede: lista empresas Webposto da rede (em
// `empresas_api`) e cria 1 job por (empresa × mês). Se `empresasCodigos`
// é passado e não vazio, RESTRINGE a essas empresas — útil pra forçar
// sync parcial (algumas empresas só). Se for null/vazio, dispara pra
// TODAS as empresas da rede.
export async function dispararBackfillRede({ chaveApiId, mesesArray, usuarioId, empresasCodigos = null }) {
  if (!chaveApiId || !mesesArray?.length) throw new Error('Parâmetros inválidos');
  const { data: empresas, error } = await supabase
    .from('empresas_api')
    .select('empresa_codigo')
    .eq('chave_api_id', chaveApiId);
  if (error) throw error;
  // Filtra empresas se uma lista específica foi passada
  const codFilter = (empresasCodigos && empresasCodigos.length > 0)
    ? new Set(empresasCodigos.map(Number))
    : null;
  const empresasAlvo = (empresas || []).filter(e =>
    codFilter ? codFilter.has(Number(e.empresa_codigo)) : true
  );
  const jobs = [];
  for (const emp of empresasAlvo) {
    for (const { ano, mes } of mesesArray) {
      try {
        const js = await dispararBackfillMes({
          chaveApiId, empresaCodigo: emp.empresa_codigo, ano, mes, usuarioId,
        });
        // dispararBackfillMes agora retorna array (2 quinzenas)
        jobs.push(...js);
      } catch (_) { /* falha individual aparece como job em erro */ }
    }
  }
  return jobs;
}

// Retorna detalhe POR EMPRESA dentro de uma rede pra um mês específico:
// quais já têm vendas no cache (= sincronizadas) e quais ainda não.
// Usado pelo modal de detalhe ao dar duplo-clique no mês.
export async function coberturaPorEmpresaMes({ chaveApiId, ano, mes }) {
  if (!chaveApiId || !ano || !mes) return [];
  const dataDe  = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  const dataAte = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  // 1) lista todas as empresas da rede
  const { data: empresas, error: errEmp } = await supabase
    .from('empresas_api')
    .select('empresa_codigo, nome')
    .eq('chave_api_id', chaveApiId)
    .order('nome');
  if (errEmp) throw errEmp;

  // 2) conta vendas por empresa nesse mês
  const { data: vendas, error: errVen } = await supabase
    .from('cci_webposto_venda')
    .select('empresa_codigo, data')
    .eq('chave_api_id', chaveApiId)
    .gte('data', dataDe)
    .lte('data', dataAte);
  if (errVen) throw errVen;
  const qtdPorEmp = new Map();
  (vendas || []).forEach(v => {
    qtdPorEmp.set(Number(v.empresa_codigo), (qtdPorEmp.get(Number(v.empresa_codigo)) || 0) + 1);
  });

  // 3) último status de job por empresa nesse mês
  const { data: jobs, error: errJob } = await supabase
    .from('cci_webposto_sync_job')
    .select('empresa_codigo, status, criado_em, concluido_em')
    .eq('chave_api_id', chaveApiId)
    .gte('data_de', dataDe)
    .lte('data_ate', dataAte)
    .order('criado_em', { ascending: false });
  if (errJob) throw errJob;
  const ultimoJobPorEmp = new Map();
  (jobs || []).forEach(j => {
    const k = Number(j.empresa_codigo);
    if (!ultimoJobPorEmp.has(k)) ultimoJobPorEmp.set(k, j);
  });

  return (empresas || []).map(emp => {
    const k = Number(emp.empresa_codigo);
    const qtdVendas = qtdPorEmp.get(k) || 0;
    const ultimoJob = ultimoJobPorEmp.get(k);
    const sincronizada = qtdVendas > 0;
    return {
      empresa_codigo: emp.empresa_codigo,
      nome: emp.nome,
      sincronizada,
      qtd_vendas: qtdVendas,
      status_job: ultimoJob?.status || null,
      concluido_em: ultimoJob?.concluido_em || null,
    };
  });
}

// ─── Cancelamento / reaper de jobs travados ──────────────────
//
// Edge Functions têm timeout (~150s) e podem ser mortas pelo runtime.
// Quando isso acontece, o catch do worker NÃO roda — o job fica
// eternamente em status='rodando' sem nunca virar 'ok' ou 'erro'.
// Estas funções permitem ao admin:
//   - cancelarJob(): marca UM job como erro (clique manual)
//   - cancelarJobsTravados(): "reaper" — marca todos os jobs em
//     'rodando' há mais de N minutos como erro de uma vez.

export async function cancelarJob(jobId, motivo = 'Cancelado manualmente') {
  if (!jobId) return;
  const { error } = await supabase
    .from('cci_webposto_sync_job')
    .update({
      status: 'erro',
      concluido_em: new Date().toISOString(),
      erro_mensagem: motivo,
    })
    .eq('id', jobId)
    .in('status', ['rodando', 'aguardando']);
  if (error) throw error;
}

// Lista jobs em 'rodando' há mais de `minutos`. Não cancela — só identifica
// (usado pelo auto-cancel da UI pra avisar antes de cancelar).
export async function listarJobsTravados(minutos = 5) {
  const limite = new Date(Date.now() - minutos * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('cci_webposto_sync_job')
    .select('id, chave_api_id, empresa_codigo, data_de, data_ate, iniciado_em')
    .lt('iniciado_em', limite)
    .eq('status', 'rodando');
  if (error) throw error;
  return data || [];
}

// Exclui DEFINITIVAMENTE jobs em status 'erro' do histórico. Filtros
// opcionais (todos AND): tipo, chaveApiId. Útil pra limpar histórico
// durante diagnóstico — admin valida que tudo está funcionando com
// dados frescos antes.
//
// Retorna a contagem de jobs excluídos.
export async function excluirJobsErro({ tipo = null, chaveApiId = null } = {}) {
  let q = supabase
    .from('cci_webposto_sync_job')
    .delete()
    .eq('status', 'erro');
  if (tipo)        q = q.eq('tipo', tipo);
  if (chaveApiId)  q = q.eq('chave_api_id', chaveApiId);
  const { data, error } = await q.select('id');
  if (error) throw error;
  return (data || []).length;
}

// Marca todos os jobs em status 'rodando' há mais de `minutos` como erro.
// Retorna a contagem de jobs marcados.
export async function cancelarJobsTravados(minutos = 30) {
  const limite = new Date(Date.now() - minutos * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('cci_webposto_sync_job')
    .update({
      status: 'erro',
      concluido_em: new Date().toISOString(),
      erro_mensagem: `Job abandonado (sem resposta há mais de ${minutos} min — provavelmente timeout da edge function)`,
    })
    .lt('iniciado_em', limite)
    .eq('status', 'rodando')
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

// ─── Cobertura por mês (agregada por rede) ───────────────────

// Cobertura mensal pra uma REDE inteira. Para cada mês calcula:
//   - qtd de empresas que têm pelo menos uma venda no mês
//   - total de vendas no mês (todas empresas somadas)
//   - status agregado: 'ok' quando todas as empresas têm vendas,
//     'parcial' quando algumas, null quando nenhuma; 'rodando'/'erro'
//     se algum job atual estiver nesse estado.
export async function coberturaPorMesRede({ chaveApiId }) {
  if (!chaveApiId) return {};
  // Conta empresas Webposto da rede
  const { data: emps } = await supabase
    .from('empresas_api')
    .select('empresa_codigo')
    .eq('chave_api_id', chaveApiId);
  const totalEmpresas = (emps || []).length;

  // IMPORTANTE: SELECT bruto em cci_webposto_venda batia no limite default
  // de 1000 rows do PostgREST, retornando cobertura falsa (meses parecendo
  // "erro" ou "parcial" mesmo com todos os jobs OK). RPC agrega no servidor
  // e retorna ~N_empresas × N_meses linhas (centenas, não milhões).
  const { data: linhas, error } = await supabase.rpc('cci_webposto_cobertura_por_mes', {
    p_chave_api_id: chaveApiId,
  });
  if (error) throw error;
  const porMes = new Map(); // 'YYYY-MM' → { qtdVendas, empresasComVendas: Set }
  (linhas || []).forEach(r => {
    const ym = String(r.ano_mes);
    let cur = porMes.get(ym);
    if (!cur) { cur = { qtdVendas: 0, empresasComVendas: new Set() }; porMes.set(ym, cur); }
    cur.qtdVendas += Number(r.qtd_vendas) || 0;
    cur.empresasComVendas.add(Number(r.empresa_codigo));
  });

  // Status agregado por mês. Como cada (empresa × mês) agora gera 2 jobs
  // (quinzenas), pegar "o último" daria leitura errada — se a q1 está
  // rodando e a q2 já terminou, "último" seria a q2 (ok), mascarando o
  // job ainda rodando. Usamos prioridade: rodando > aguardando > erro > ok.
  const { data: jobs } = await supabase
    .from('cci_webposto_sync_job')
    .select('data_de, status, criado_em')
    .eq('chave_api_id', chaveApiId)
    .order('criado_em', { ascending: false });
  const PRIO = { rodando: 4, aguardando: 3, erro: 2, ok: 1 };
  const statusJob = new Map();
  (jobs || []).forEach(j => {
    const ym = String(j.data_de).slice(0, 7);
    const cur = statusJob.get(ym);
    const novoPrio = PRIO[j.status] || 0;
    const curPrio  = PRIO[cur]      || 0;
    if (!cur || novoPrio > curPrio) statusJob.set(ym, j.status);
  });

  const out = {};
  const meses = new Set([...porMes.keys(), ...statusJob.keys()]);
  meses.forEach(ym => {
    const v = porMes.get(ym);
    const empComVendas = v?.empresasComVendas?.size || 0;
    const jobSt = statusJob.get(ym);
    let status = null;
    if (jobSt === 'rodando' || jobSt === 'aguardando') status = jobSt;
    else if (jobSt === 'erro' && empComVendas === 0) status = 'erro';
    else if (totalEmpresas > 0 && empComVendas >= totalEmpresas) status = 'ok';
    else if (empComVendas > 0) status = 'parcial';
    else status = jobSt || null;
    out[ym] = {
      status,
      qtd_vendas: v?.qtdVendas || 0,
      empresas_com_vendas: empComVendas,
      total_empresas: totalEmpresas,
    };
  });
  return out;
}

export async function coberturaPorMes({ chaveApiId, empresaCodigo }) {
  if (!chaveApiId || !empresaCodigo) return {};
  // Idem coberturaPorMesRede: RPC agregada server-side pra evitar o
  // limite default de 1000 rows do PostgREST quando há muitas vendas.
  const { data: linhas, error } = await supabase.rpc('cci_webposto_cobertura_por_mes_empresa', {
    p_chave_api_id:   chaveApiId,
    p_empresa_codigo: Number(empresaCodigo),
  });
  if (error) throw error;
  const mapaVendas = new Map();
  (linhas || []).forEach(r => {
    mapaVendas.set(String(r.ano_mes), Number(r.qtd_vendas) || 0);
  });

  // Status do último job por mês (usa data_de do job pra mapear).
  const { data: jobs, error: errJ } = await supabase
    .from('cci_webposto_sync_job')
    .select('data_de, data_ate, status, criado_em')
    .eq('chave_api_id', chaveApiId)
    .eq('empresa_codigo', empresaCodigo)
    .order('criado_em', { ascending: false });
  if (errJ) throw errJ;
  // Status agregado por mês via prioridade (idem coberturaPorMesRede:
  // como cada mês tem 2 jobs/quinzenas, o "mais severo" vence).
  const PRIO = { rodando: 4, aguardando: 3, erro: 2, ok: 1 };
  const mapaStatus = new Map();
  (jobs || []).forEach(j => {
    const ym = String(j.data_de).slice(0, 7);
    const cur = mapaStatus.get(ym);
    const novoPrio = PRIO[j.status] || 0;
    const curPrio  = PRIO[cur]      || 0;
    if (!cur || novoPrio > curPrio) mapaStatus.set(ym, j.status);
  });

  // Unifica
  const out = {};
  const meses = new Set([...mapaVendas.keys(), ...mapaStatus.keys()]);
  meses.forEach(ym => {
    out[ym] = {
      status: mapaStatus.get(ym) || (mapaVendas.has(ym) ? 'ok' : null),
      qtd_vendas: mapaVendas.get(ym) || 0,
    };
  });
  return out;
}

// ─── Sincronia automática (cron noturno) ─────────────────────
//
// O cron `webposto_sync_diario` roda às 04:00 UTC (01:00 BRT) chamando
// a edge function `webposto-sync-vendas-batch`, que itera as redes com
// `cci_webposto_sync_config_rede.ativo=true` e dispara o worker pra
// cada empresa com janela = últimos 7 dias (overlap).
//
// Estas funções servem pra monitoração na UI admin: status atual de cada
// rede, histórico de execuções e botão pra forçar manualmente.

// Dispara o orquestrador AGORA. A edge function batch SÓ CRIA os jobs
// em 'aguardando' — o disparo dos workers acontece em seguida via
// `processarFilaAguardando` chamado pelo front. Esse padrão é robusto:
// o navegador mantém a conexão TCP aberta pra cada invoke, sem depender
// de comportamento de "background tasks" de edge functions.
// Retorna `{ ok, jobs_criados, redes_ativas, empresas_alvo, mensagem }`.
export async function dispararSincroniaAutomaticaAgora() {
  const { data, error } = await supabase.functions.invoke('webposto-sync-vendas-batch', {
    body: {},
  });
  // eslint-disable-next-line no-console
  console.info('[batch] resposta:', { data, error });
  if (error) {
    let detalhe = error.message || 'Falha ao disparar batch';
    try {
      const ctx = error.context;
      if (ctx) {
        const body = typeof ctx.json === 'function' ? await ctx.json() : null;
        if (body?.error) detalhe = `${detalhe} — ${body.error}${body.detail ? ': ' + body.detail : ''}`;
      }
    } catch { /* ignore */ }
    throw new Error(detalhe);
  }
  if (data?.error) throw new Error(`${data.error}${data.detail ? ': ' + data.detail : ''}`);
  return data || {};
}

// Processa a fila de jobs em 'aguardando' — invoca o worker
// `webposto-sync-vendas` pra cada um, com semáforo de paralelismo. O
// navegador mantém cada conexão aberta até o worker terminar, então NÃO
// há risco de morrer em background como acontece com edge-to-edge.
//
// Filtros opcionais (todos AND): tipo, chaveApiId.
// onProgresso(processados, total) é chamado a cada job finalizado.
//
// Retorna `{ total, ok, erro, ids }`.
export async function processarFilaAguardando({ tipo = null, chaveApiId = null, paralelismo = 4, onProgresso = null } = {}) {
  let q = supabase
    .from('cci_webposto_sync_job')
    .select('id, chave_api_id, empresa_codigo, data_de, data_ate, tipo')
    .eq('status', 'aguardando')
    .order('criado_em', { ascending: true })
    .limit(500);
  if (tipo)       q = q.eq('tipo', tipo);
  if (chaveApiId) q = q.eq('chave_api_id', chaveApiId);
  const { data: jobs, error } = await q;
  if (error) throw error;
  const fila = jobs || [];
  if (fila.length === 0) return { total: 0, ok: 0, erro: 0, ids: [] };

  let okCount = 0, erroCount = 0, processados = 0;
  const idsProcessados = [];

  // Worker-pool: N consumidores paralelos puxam jobs da fila
  const consumidor = async () => {
    while (fila.length > 0) {
      const j = fila.shift();
      if (!j) continue;
      try {
        const { error: errInv } = await supabase.functions.invoke('webposto-sync-vendas', {
          body: {
            chave_api_id: j.chave_api_id,
            empresa_codigo: j.empresa_codigo,
            data_de: j.data_de,
            data_ate: j.data_ate,
            tipo: j.tipo,
            job_id: j.id,
          },
        });
        if (errInv) {
          erroCount++;
          // eslint-disable-next-line no-console
          console.warn('[processar] erro no invoke do worker:', j.id, errInv);
        } else {
          okCount++;
        }
      } catch (err) {
        erroCount++;
        // eslint-disable-next-line no-console
        console.warn('[processar] exceção no invoke:', j.id, err);
      } finally {
        idsProcessados.push(j.id);
        processados++;
        if (onProgresso) onProgresso(processados, jobs.length);
      }
    }
  };

  const consumidoresAtivos = Math.min(paralelismo, jobs.length);
  await Promise.all(Array.from({ length: consumidoresAtivos }, () => consumidor()));
  return { total: jobs.length, ok: okCount, erro: erroCount, ids: idsProcessados };
}

// Lista execuções do CRON nas últimas N horas. Agrupa por "rajada" — o
// orquestrador dispara N empresas seguidas em poucos segundos, então jobs
// criados dentro do mesmo minuto pertencem à mesma execução.
export async function listarExecucoesCron({ horas = 72, limit = 100 } = {}) {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('cci_webposto_sync_job')
    .select('id, chave_api_id, empresa_codigo, data_de, data_ate, status, vendas_inseridas, itens_inseridos, vendas_canceladas_marcadas, iniciado_em, concluido_em, criado_em, erro_mensagem, tipo')
    .eq('tipo', 'cron_diario')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── Realtime ────────────────────────────────────────────────

export function escutarJobs(onChange) {
  const ch = supabase.channel('webposto:sync_jobs')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cci_webposto_sync_job',
    }, payload => onChange(payload))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cci_webposto_sync_config',
    }, payload => onChange(payload))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cci_webposto_sync_config_rede',
    }, payload => onChange(payload))
    .subscribe();
  return ch;
}

export function desescutar(ch) {
  if (ch) supabase.removeChannel(ch);
}
