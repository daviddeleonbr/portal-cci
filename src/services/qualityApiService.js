// Usa proxy do Vite em dev (/api/quality -> qualityautomacao.com.br/INTEGRACAO)
const DEFAULT_URL_BASE = '/api/quality';
const LIMITE_PADRAO = 1500;

// Concorrencia: HTTP/1.1 limita ~6/host. HTTP/2 multiplexa.
// 48 acelera fetch agressivo de Vendas multi-empresa (varias empresas x
// varios periodos). Browsers modernos sustentam 100+ streams via HTTP/2.
const MAX_CONCURRENT = 48;
// Chunks de 5 dias = mais paralelismo (cada chunk geralmente 1 pagina so)
const DIAS_POR_CHUNK = 5;

// TTL do cache em memoria
const CACHE_TTL_MS = 5 * 60 * 1000;       // 5 min para dados transacionais
const CACHE_TTL_CATALOGO_MS = 60 * 60 * 1000;  // 1h para catalogos

// ─── Concurrency Limiter (semaforo) ───────────────────────────
class Semaphore {
  constructor(max) { this.max = max; this.queue = []; this.active = 0; }
  async acquire() {
    if (this.active < this.max) { this.active++; return; }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) { this.active++; next(); }
  }
  async run(fn) {
    await this.acquire();
    try { return await fn(); }
    finally { this.release(); }
  }
}
const semaforo = new Semaphore(MAX_CONCURRENT);

// ─── Cache em memoria + persistente (localStorage para catalogos) ──
const memCache = new Map();  // key → { data, expiresAt, promise }

// Hash determinista (FNV-1a) do apiKey. 12 chars de prefixo causavam colisao
// quando duas redes tinham chaves com mesmo inicio (autobem vs trivela), fazendo
// uma rede ver o cache da outra. Agora o cacheKey cobre a chave inteira.
function hashApiKey(key) {
  if (!key) return 'no-key';
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cacheKey(endpoint, params, apiKey = '') {
  // ordena chaves para garantir consistencia
  const sorted = Object.keys(params).sort().reduce((acc, k) => { acc[k] = params[k]; return acc; }, {});
  return `${hashApiKey(apiKey)}:${endpoint}:${JSON.stringify(sorted)}`;
}

function getFromCache(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (entry.data !== undefined && Date.now() < entry.expiresAt) return entry.data;
  if (entry.promise) return entry.promise; // request em flight - reutiliza
  memCache.delete(key);
  return null;
}

function setCache(key, data, ttl = CACHE_TTL_MS) {
  memCache.set(key, { data, expiresAt: Date.now() + ttl });
}

// localStorage para catalogos (sobrevive reload)
// Prefixo bump (v3) para invalidar caches antigos do formato que usava
// apenas 12 chars de prefixo da apiKey e colidia entre redes diferentes.
const LOCAL_CACHE_PREFIX = 'q3_';

// Limpeza one-shot de entradas antigas (formatos q_* e q2_*) que persistem
// de bugs anteriores envolvendo colisao de chaves de cache.
try {
  Object.keys(localStorage)
    .filter(k => k.startsWith('q_') || k.startsWith('q2_'))
    .forEach(k => localStorage.removeItem(k));
} catch { /* ignore */ }

function getLocalCache(key) {
  try {
    const raw = localStorage.getItem(`${LOCAL_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() < expiresAt) return data;
    localStorage.removeItem(`${LOCAL_CACHE_PREFIX}${key}`);
  } catch (_) { /* ignore */ }
  return null;
}

function setLocalCache(key, data, ttl = CACHE_TTL_CATALOGO_MS) {
  try {
    localStorage.setItem(`${LOCAL_CACHE_PREFIX}${key}`, JSON.stringify({ data, expiresAt: Date.now() + ttl }));
  } catch (_) { /* ignore quota */ }
}

export function limparCache() {
  memCache.clear();
  Object.keys(localStorage)
    .filter(k => k.startsWith(LOCAL_CACHE_PREFIX) || k.startsWith('q_') || k.startsWith('q2_'))
    .forEach(k => localStorage.removeItem(k));
}

// ─── Fetch raw com semaforo ───────────────────────────────────
async function fetchJson(urlBase, endpoint, apiKey, params) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qp.set(k, String(v));
  });
  const url = `${urlBase}/${endpoint}?${qp}`;
  return semaforo.run(async () => {
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    return res.json();
  });
}

// ─── Pagina sequencialmente (cursor-based) ────────────────────
async function fetchPagSequencial(urlBase, endpoint, apiKey, baseParams) {
  const limite = baseParams.limite || LIMITE_PADRAO;
  let ultimoCodigo = 0;
  let all = [];
  let hasMore = true;
  while (hasMore) {
    const params = { ...baseParams, limite };
    if (ultimoCodigo > 0) params.ultimoCodigo = ultimoCodigo;
    const data = await fetchJson(urlBase, endpoint, apiKey, params);
    const resultados = data.resultados || [];
    all = all.concat(resultados);
    if (resultados.length < limite || !data.ultimoCodigo) {
      hasMore = false;
    } else {
      ultimoCodigo = data.ultimoCodigo;
    }
  }
  return all;
}

// ─── Divide intervalo em chunks ───────────────────────────────
function dividirIntervalo(dataInicial, dataFinal, diasPorChunk = DIAS_POR_CHUNK) {
  if (!dataInicial || !dataFinal) return [{ dataInicial, dataFinal }];
  const start = new Date(dataInicial + 'T00:00:00');
  const end = new Date(dataFinal + 'T00:00:00');
  if (start > end) return [{ dataInicial, dataFinal }];

  const chunks = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + diasPorChunk - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      dataInicial: cursor.toISOString().split('T')[0],
      dataFinal: chunkEnd.toISOString().split('T')[0],
    });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

// ─── Pagina paralelamente: divide periodo + cache + dedupe ────
// `chunkDays` opcional em baseParams: quando informado, sobrescreve o tamanho
// padrao (5 dias). Util para endpoints de dados esparsos como TITULO_RECEBER
// com apenasPendente=true, onde 5d gera muitos requests vazios.
async function fetchPagParalelo(urlBase, endpoint, apiKey, baseParams, ttl = CACHE_TTL_MS) {
  const { dataInicial, dataFinal, chunkDays, ...resto } = baseParams;

  if (!dataInicial || !dataFinal) {
    return fetchPagSequencial(urlBase, endpoint, apiKey, baseParams);
  }

  const chunks = dividirIntervalo(dataInicial, dataFinal, chunkDays || DIAS_POR_CHUNK);

  const arrays = await Promise.all(
    chunks.map(async (c) => {
      const params = { ...resto, dataInicial: c.dataInicial, dataFinal: c.dataFinal };
      const key = cacheKey(endpoint, params, apiKey);

      // 1. Cache hit?
      const cached = getFromCache(key);
      if (cached !== null) return Array.isArray(cached) ? cached : await cached;

      // 2. Dedup: se ja tem promise em flight para essa key, reusa
      const existing = memCache.get(key);
      if (existing?.promise) return existing.promise;

      const promise = fetchPagSequencial(urlBase, endpoint, apiKey, params)
        .then(data => {
          setCache(key, data, ttl);
          return data;
        })
        .catch(err => {
          memCache.delete(key);
          throw err;
        });

      memCache.set(key, { promise, expiresAt: Date.now() + ttl });
      return promise;
    })
  );
  return arrays.flat();
}

// ─── Wrapper para catalogos com persistencia em localStorage ──
async function fetchCatalogo(urlBase, endpoint, apiKey, params) {
  const key = cacheKey(endpoint, params, apiKey);

  // 1. Cache em memoria
  const inMem = getFromCache(key);
  if (inMem !== null && Array.isArray(inMem)) return inMem;

  // 2. Cache no localStorage (sobrevive reload)
  const local = getLocalCache(key);
  if (local) {
    setCache(key, local, CACHE_TTL_CATALOGO_MS);
    return local;
  }

  // 3. Fetch + persiste
  const existing = memCache.get(key);
  if (existing?.promise) return existing.promise;

  const promise = fetchPagSequencial(urlBase, endpoint, apiKey, params)
    .then(data => {
      setCache(key, data, CACHE_TTL_CATALOGO_MS);
      setLocalCache(key, data, CACHE_TTL_CATALOGO_MS);
      return data;
    })
    .catch(err => {
      memCache.delete(key);
      throw err;
    });

  memCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_CATALOGO_MS });
  return promise;
}

// ═══════════════════════════════════════════════════════════
// Endpoints publicos
// ═══════════════════════════════════════════════════════════

// Catalogos (cache 1h em localStorage + memoria)
export async function buscarEmpresas(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'EMPRESAS', apiKey, { limite: 500 });
}

export async function buscarPlanoContasGerencial(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'PLANO_CONTA_GERENCIAL', apiKey, { limite: LIMITE_PADRAO });
}

export async function buscarProdutos(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'PRODUTO', apiKey, { limite: LIMITE_PADRAO });
}

// Busca um produto pelo código de barras. O campo `produtoCodigoBarra` no
// retorno do PRODUTO é um ARRAY DE OBJETOS no formato:
//   [{ codigoBarra: "789..." }, ...]
// Cada produto pode ter vários códigos (EAN13 da unidade, DUN14 da caixa).
// Reaproveita o cache de buscarProdutos. Retorna o primeiro produto que
// casar ou null. Tolera também formatos legados (array de strings ou string
// solta) caso a estrutura mude.
export async function buscarProdutoPorCodigoBarras(apiKey, codigoBarras, urlBase = DEFAULT_URL_BASE) {
  if (!codigoBarras) return null;
  const alvo = String(codigoBarras).trim();
  if (!alvo) return null;
  const produtos = await buscarProdutos(apiKey, urlBase);
  if (!Array.isArray(produtos)) return null;

  const normaliza = (c) => {
    if (c == null) return '';
    if (typeof c === 'object') return String(c.codigoBarra ?? c.codigo ?? '').trim();
    return String(c).trim();
  };

  return produtos.find(p => {
    const lista = p?.produtoCodigoBarra;
    if (Array.isArray(lista)) return lista.some(c => normaliza(c) === alvo);
    if (lista != null)        return normaliza(lista) === alvo;
    return false;
  }) || null;
}

export async function buscarGrupos(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'GRUPO', apiKey, { limite: LIMITE_PADRAO });
}

export async function buscarFuncionarios(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'FUNCIONARIO', apiKey, { limite: LIMITE_PADRAO });
}

export async function buscarClientesQuality(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'CLIENTE', apiKey, { limite: LIMITE_PADRAO });
}

// Contas bancarias (CONTA) - referenciadas por MOVIMENTO_CONTA.contaCodigo
export async function buscarContas(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'CONTA', apiKey, { limite: LIMITE_PADRAO });
}

// Fornecedores - referenciados por MOVIMENTO_CONTA quando tipoPessoa='F'
export async function buscarFornecedoresQuality(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'FORNECEDOR', apiKey, { limite: LIMITE_PADRAO });
}

// Administradoras de cartao - referenciadas por CARTAO.administradoraCodigo
export async function buscarAdministradoras(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchCatalogo(urlBase, 'ADMINISTRADORA', apiKey, { limite: LIMITE_PADRAO });
}

// Notas a manifestar — NF-e recebidas pela empresa pendentes de
// manifestação (ciência/confirmação) ao SEFAZ. Cliente sincroniza, preenche
// produtos e envia para CCI lançar.
//
// Parâmetros aceitos pelo endpoint (Quality swagger):
//   - empresaCodigo (int, opcional): filtra por empresa Webposto.
//   - dataInicial / dataFinal (date 'YYYY-MM-DD', opcionais): janela de
//     emissão. Se omitido, o backend aplica seu default.
//   - compraCodigo (int, opcional): filtra por compra específica.
//   - manifestacaoCodigo (int, opcional): busca uma manifestação específica.
//   - limite, ultimoCodigo: paginação (gerenciado pelo fetchPagSequencial).
//
// Flag local:
//   - noCache (default false): ignora cache em memória + localStorage e
//     faz request fresh. Usado quando o cliente clica "Sincronizar".
//
// Nota: NÃO existe filtro por situação de manifestação — todas as situações
// vêm na resposta e o front filtra/categoriza.
export async function buscarNotaManifestacao(
  apiKey,
  { empresaCodigo, dataInicial, dataFinal, compraCodigo, manifestacaoCodigo, noCache = false } = {},
  urlBase = DEFAULT_URL_BASE,
) {
  const params = { limite: LIMITE_PADRAO };
  if (empresaCodigo != null && empresaCodigo !== '')         params.empresaCodigo       = empresaCodigo;
  if (dataInicial)                                            params.dataInicial         = dataInicial;
  if (dataFinal)                                              params.dataFinal           = dataFinal;
  if (compraCodigo != null && compraCodigo !== '')           params.compraCodigo        = compraCodigo;
  if (manifestacaoCodigo != null && manifestacaoCodigo !== '') params.manifestacaoCodigo = manifestacaoCodigo;

  if (noCache) {
    const key = cacheKey('NOTA_MANIFESTACAO', params, apiKey);
    memCache.delete(key);
    try { localStorage.removeItem(`${LOCAL_CACHE_PREFIX}${key}`); } catch { /* ignore */ }
  }
  return fetchCatalogo(urlBase, 'NOTA_MANIFESTACAO', apiKey, params);
}

// Endpoints com filtro de data - paralelos + cached em memoria (5 min)
// Pagar/receber sao tipicamente filtrados por apenasPendente=true (dados
// esparsos), entao usam chunks de 90 dias em vez dos 5 dias padrao —
// reduz drasticamente o numero de requests sem ultrapassar o limite de
// 1500 linhas por pagina (cursor pagination cobre o overflow).
const CHUNK_PENDENTES = 90;

export async function buscarTitulosPagar(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'TITULO_PAGAR', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    chunkDays: CHUNK_PENDENTES,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// IMPORTANTE: TITULO_RECEBER aceita `convertido`:
//   true  → títulos que JÁ FORAM convertidos em Duplicata
//   false → títulos que AINDA NÃO foram convertidos
//   null  → todos
// Sem esse filtro, o front contava DUAS VEZES o mesmo crédito: 1x em
// TITULO_RECEBER (já convertido) + 1x em DUPLICATA (a própria conversão).
// Por padrão filtramos `convertido=false` pra trazer só os títulos
// "originais" ainda não convertidos — o crédito convertido aparece
// integralmente na fonte DUPLICATA.
export async function buscarTitulosReceber(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente, convertido = false } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'TITULO_RECEBER', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    chunkDays: CHUNK_PENDENTES,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
    ...(convertido !== null && convertido !== undefined ? { convertido } : {}),
  });
}

// Duplicatas em aberto (contas a receber de clientes)
export async function buscarDuplicatas(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'DUPLICATA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    chunkDays: CHUNK_PENDENTES,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// Cartoes em aberto (receber de adquirente)
export async function buscarCartoes(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CARTAO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    chunkDays: CHUNK_PENDENTES,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// Cheques em aberto
export async function buscarCheques(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CHEQUE', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    chunkDays: CHUNK_PENDENTES,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

export async function buscarVendas(apiKey, { dataInicial, dataFinal, empresaCodigo, situacao } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'VENDA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo, situacao,
  });
}

export async function buscarVendaItens(apiKey, { dataInicial, dataFinal, empresaCodigo, situacao } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'VENDA_ITEM', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo, situacao,
  });
}

// ─── Híbrido: cache Supabase + Quality ────────────────────────
//
// Estratégia: dias com data > hoje-2d (frescos, podem ter cancelamentos
// retroativos) vêm da Quality em tempo real; dias mais antigos vêm da
// tabela `cci_webposto_venda` / `cci_webposto_venda_item` no Supabase
// (sincronizada pelo cron noturno + backfill manual).
//
// O retorno tem o MESMO shape de buscarVendas/buscarVendaItens — o front
// (e os agregadores) não percebem diferença.
//
// Pra fazer isso funcionar:
//  - chave_api_id: ID em chaves_api (Supabase). Quando ausente, cai pra
//    busca 100% Quality (modo "compatibilidade").

import { supabase } from '../lib/supabase';

const DIAS_FRESCOS = 2; // últimos N dias vêm da Quality

function isoHojeMenos(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function maxIso(a, b) { return a > b ? a : b; }
function minIso(a, b) { return a < b ? a : b; }

// Supabase-js retorna no máximo 1000 rows por default. Estratégia
// usada antes (OFFSET sequencial/paralelo) sofre porque OFFSET grande
// no Postgres exige scan e o servidor retorna 500 quando vários requests
// paralelos batem com offset alto ao mesmo tempo.
//
// Estratégia atual: divide o período em CHUNKS DE DIAS (7 por chunk).
// Cada chunk em geral cabe em 1 página com offset zero. Os chunks
// são consultados em paralelo via Promise.all — ganho de latência sem
// risco de offset alto.
const PAGE = 1000;
const DIAS_POR_CHUNK_CACHE = 7;

function pad2(n) { return String(n).padStart(2, '0'); }
function dataIso(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Divide [dataInicial, dataFinal] em chunks de N dias cada.
function dividirEmChunksDias(dataInicial, dataFinal, diasPorChunk = DIAS_POR_CHUNK_CACHE) {
  const out = [];
  const start = new Date(dataInicial + 'T00:00:00');
  const end   = new Date(dataFinal + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || start > end) return [{ de: dataInicial, ate: dataFinal }];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + diasPorChunk - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    out.push({ de: dataIso(cursor), ate: dataIso(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// Semáforo global pra limitar concorrência de queries no Supabase.
// Sem isso, 4 empresas × 3 períodos × 5 chunks × 2 (itens+vendas) = 120
// queries paralelas — saturam o PostgREST e disparam 500.
const MAX_QUERIES_PARALELAS = 8;
let _emVoo = 0;
const _fila = [];
function _adquirir() {
  return new Promise((resolve) => {
    const tentativa = () => {
      if (_emVoo < MAX_QUERIES_PARALELAS) {
        _emVoo++;
        resolve(() => { _emVoo--; const proximo = _fila.shift(); if (proximo) proximo(); });
      } else {
        _fila.push(tentativa);
      }
    };
    tentativa();
  });
}
async function comSemaforo(fn) {
  const liberar = await _adquirir();
  try { return await fn(); } finally { liberar(); }
}

// Esgota TODAS as páginas de UM chunk pequeno (poucos ofsets). Como o
// chunk é de 7 dias só raríssimo passa de 2-3 páginas — offset baixo
// não causa erro 500.
async function esgotarChunk(queryBuilder, chunk) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await comSemaforo(
      () => queryBuilder(chunk).range(from, from + PAGE - 1),
    );
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    // Safety guard: em 7 dias é IMPOSSÍVEL ter mais que 10k rows
    // (uma empresa Webposto normal). Se atingir, abortamos pra evitar
    // loop em alguma anomalia.
    if (from > 10000) break;
  }
  return all;
}

// Recebe uma função que monta a query Supabase pra um chunk de período,
// divide o período em chunks de 7 dias e roda todos em paralelo.
//
// queryBuilder(chunk) deve retornar a query JÁ COM filtros (eq, gte/lte,
// order, etc.) — esta função só aplica .range() no final.
async function lerComPaginacaoPorChunks(dataInicial, dataFinal, queryBuilder) {
  const chunks = dividirEmChunksDias(dataInicial, dataFinal);
  const resultados = await Promise.all(chunks.map(c => esgotarChunk(queryBuilder, c)));
  return resultados.flat();
}

// Lê do cache Supabase as VENDAs no período, devolvendo objetos com o
// mesmo shape do payload da Quality (campos esperados pelo agregador:
// vendaCodigo, cancelada, dataHora/dataVenda/dataEmissao/dataMovimento).
async function lerCacheVendas({ chaveApiId, empresaCodigo, dataInicial, dataFinal }) {
  if (!chaveApiId || !empresaCodigo || !dataInicial || !dataFinal) return [];
  // Chunks de 7 dias em paralelo; cada chunk usa offset baixo (0-2).
  const data = await lerComPaginacaoPorChunks(dataInicial, dataFinal, (chunk) =>
    supabase
      .from('cci_webposto_venda')
      .select('venda_codigo, data, cancelada, raw')
      .eq('chave_api_id', chaveApiId)
      .eq('empresa_codigo', empresaCodigo)
      .gte('data', chunk.de)
      .lte('data', chunk.ate)
      .order('venda_codigo', { ascending: true }),
  );
  return data.map(row => ({
    ...(row.raw || {}),
    vendaCodigo: Number(row.venda_codigo),
    cancelada: row.cancelada,
    // O agregador olha por `dataHora`/`dataVenda`/`dataEmissao`. Mantemos
    // o que vem do raw e suplementamos com `data` (denormalizada) pra
    // garantir que sempre exista um campo de data válido.
    dataHora:  row.raw?.dataHora  || row.data,
    dataVenda: row.raw?.dataVenda || row.data,
  }));
}

async function lerCacheVendaItens({ chaveApiId, empresaCodigo, dataInicial, dataFinal }) {
  if (!chaveApiId || !empresaCodigo || !dataInicial || !dataFinal) return [];
  const data = await lerComPaginacaoPorChunks(dataInicial, dataFinal, (chunk) =>
    supabase
      .from('cci_webposto_venda_item')
      .select('venda_codigo, item_sequencia, produto_codigo, data, quantidade, total_venda, total_custo, total_desconto, total_acrescimo, icms_valor, valor_pis, valor_cofins, valor_cbs, valor_ibs, raw')
      .eq('chave_api_id', chaveApiId)
      .eq('empresa_codigo', empresaCodigo)
      .gte('data', chunk.de)
      .lte('data', chunk.ate)
      .order('venda_codigo', { ascending: true })
      .order('item_sequencia', { ascending: true }),
  );
  return data.map(row => ({
    ...(row.raw || {}),
    vendaCodigo:    Number(row.venda_codigo),
    itemSequencia:  Number(row.item_sequencia),
    produtoCodigo:  row.produto_codigo,
    quantidade:     row.quantidade,
    totalVenda:     row.total_venda,
    totalCusto:     row.total_custo,
    totalDesconto:  row.total_desconto,
    totalAcrescimo: row.total_acrescimo,
    icmsValor:      row.icms_valor,
    valorPis:       row.valor_pis,
    valorCofins:    row.valor_cofins,
    valorCbs:       row.valor_cbs,
    valorIbs:       row.valor_ibs,
  }));
}

// Calcula janela cache vs janela API a partir do período pedido.
function dividirPeriodoHibrido(dataInicial, dataFinal) {
  const corte = isoHojeMenos(DIAS_FRESCOS); // tudo a partir desta data vem da Quality
  if (dataFinal < corte) {
    // Tudo histórico → só cache
    return { cacheDe: dataInicial, cacheAte: dataFinal, apiDe: null, apiAte: null };
  }
  if (dataInicial >= corte) {
    // Tudo recente → só API
    return { cacheDe: null, cacheAte: null, apiDe: dataInicial, apiAte: dataFinal };
  }
  // Mix: cache até corte-1, API a partir de corte
  const corteMenos1 = (() => {
    const d = new Date(corte + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  return {
    cacheDe: dataInicial,
    cacheAte: minIso(corteMenos1, dataFinal),
    apiDe: maxIso(corte, dataInicial),
    apiAte: dataFinal,
  };
}

// Versão híbrida de buscarVendas. Aceita os mesmos parâmetros + `chaveApiId`
// (UUID em `chaves_api`) e `empresaCodigo`. Se `chaveApiId` for ausente, faz
// fallback pra `buscarVendas` original (modo compatibilidade).
export async function buscarVendasHibrido(apiKey, params = {}, urlBase = DEFAULT_URL_BASE) {
  const { dataInicial, dataFinal, empresaCodigo, situacao, chaveApiId } = params;
  if (!chaveApiId || !empresaCodigo) {
    return buscarVendas(apiKey, { dataInicial, dataFinal, empresaCodigo, situacao }, urlBase);
  }
  const div = dividirPeriodoHibrido(dataInicial, dataFinal);
  const [cache, api] = await Promise.all([
    div.cacheDe ? lerCacheVendas({ chaveApiId, empresaCodigo, dataInicial: div.cacheDe, dataFinal: div.cacheAte }) : [],
    div.apiDe   ? buscarVendas(apiKey, { dataInicial: div.apiDe, dataFinal: div.apiAte, empresaCodigo, situacao }, urlBase) : [],
  ]);
  // eslint-disable-next-line no-console
  console.info('[hibrido vendas]', { empresa: empresaCodigo, periodo: `${dataInicial}→${dataFinal}`, cache: cache.length, api: api.length, total: cache.length + api.length });
  return [...cache, ...api];
}

export async function buscarVendaItensHibrido(apiKey, params = {}, urlBase = DEFAULT_URL_BASE) {
  const { dataInicial, dataFinal, empresaCodigo, situacao, chaveApiId } = params;
  if (!chaveApiId || !empresaCodigo) {
    return buscarVendaItens(apiKey, { dataInicial, dataFinal, empresaCodigo, situacao }, urlBase);
  }
  const div = dividirPeriodoHibrido(dataInicial, dataFinal);
  const [cache, api] = await Promise.all([
    div.cacheDe ? lerCacheVendaItens({ chaveApiId, empresaCodigo, dataInicial: div.cacheDe, dataFinal: div.cacheAte }) : [],
    div.apiDe   ? buscarVendaItens(apiKey, { dataInicial: div.apiDe, dataFinal: div.apiAte, empresaCodigo, situacao }, urlBase) : [],
  ]);
  // eslint-disable-next-line no-console
  console.info('[hibrido itens]', { empresa: empresaCodigo, periodo: `${dataInicial}→${dataFinal}`, cache: cache.length, api: api.length, total: cache.length + api.length });
  return [...cache, ...api];
}

// Movimentacoes das contas bancarias - base do Fluxo de Caixa
export async function buscarMovimentoConta(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'MOVIMENTO_CONTA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Fechamentos de caixa: valores apresentados vs apurados por caixa (turno)
export async function buscarCaixasApresentados(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CAIXA_APRESENTADO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Caixas (turnos) do dia: apurado + diferenca ja calculados, funcionario responsavel
export async function buscarCaixas(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CAIXA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Formas de pagamento por venda (dinheiro, cartao, cheque, prazo, etc.).
// Liga ao turno via VENDA.caixaCodigo (vendaCodigo da forma -> caixaCodigo da venda).
export async function buscarVendaFormaPagamento(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'VENDA_FORMA_PAGAMENTO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Catálogo de formas de pagamento (codigo -> descricao). Usado para resolver
// o nome em VENDA_FORMA_PAGAMENTO, que normalmente traz só o codigo.
export async function buscarFormasPagamento(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'FORMA_PAGAMENTO', apiKey, {
    limite: LIMITE_PADRAO,
  }, CACHE_TTL_CATALOGO_MS);
}

// Catálogo de bicos (codigoBico -> bicoNumero, codigoProduto, etc.). Usado
// para resolver o numero do bico e produto associado nos abastecimentos.
export async function buscarBicos(apiKey, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'BICO', apiKey, {
    limite: LIMITE_PADRAO,
  }, CACHE_TTL_CATALOGO_MS);
}

// Abastecimentos por bico/turno. Aferições estão neste mesmo endpoint —
// são linhas com a flag `afericao = true` (ou 'S'). Para listar somente
// aferições, filtre o resultado por `afericao` truthy.
export async function buscarAbastecimentos(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'ABASTECIMENTO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Sangrias por caixa — retiradas do caixa (por contaCodigo). Usado em
// /cliente/webposto/sangrias com filtro pelas contas que o admin marcou
// em /admin/clientes (flag `usar_em_sangrias` em cliente_contas_bancarias).
//
// Schema do retorno (objeto por sangria):
//   sangriaCodigo, codigo, empresaCodigo, caixaCodigo, contaCodigo,
//   usuarioCodigo, funcionarioCodigo,
//   dinheiro, cheque, cartao, nota, cartaFrete, emprestimo, despesa,
//   chequePre, vale, transferencia,  ← valores por meio (somar todos = total bruto)
//   dataSangria, horaSangria, dataHoraColeta, dataHoraAtualizacao,
//   alterada (bool), coo, numeroDocumento, observacao
export async function buscarSangriasCaixa(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'SANGRIA_CAIXA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}
