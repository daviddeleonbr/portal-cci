// Usa proxy do Vite em dev (/api/quality -> qualityautomacao.com.br/INTEGRACAO)
const DEFAULT_URL_BASE = '/api/quality';
const LIMITE_PADRAO = 1500;

// Concorrencia: HTTP/1.1 limita ~6/host. HTTP/2 multiplexa - subir para 12 e seguro.
const MAX_CONCURRENT = 12;
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
async function fetchPagParalelo(urlBase, endpoint, apiKey, baseParams, ttl = CACHE_TTL_MS) {
  const { dataInicial, dataFinal, ...resto } = baseParams;

  if (!dataInicial || !dataFinal) {
    return fetchPagSequencial(urlBase, endpoint, apiKey, baseParams);
  }

  const chunks = dividirIntervalo(dataInicial, dataFinal);

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

// Endpoints com filtro de data - paralelos + cached em memoria (5 min)
export async function buscarTitulosPagar(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'TITULO_PAGAR', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

export async function buscarTitulosReceber(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'TITULO_RECEBER', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// Duplicatas em aberto (contas a receber de clientes)
export async function buscarDuplicatas(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'DUPLICATA', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// Cartoes em aberto (receber de adquirente)
export async function buscarCartoes(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CARTAO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
    ...(apenasPendente !== undefined ? { apenasPendente } : {}),
  });
}

// Cheques em aberto
export async function buscarCheques(apiKey, { dataInicial, dataFinal, empresaCodigo, apenasPendente } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'CHEQUE', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
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

// Formas de pagamento por venda (dinheiro, cartao, cheque, prazo, etc.)
export async function buscarVendaFormaPagamento(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'VENDA_FORMA_PAGAMENTO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}

// Aferições de bicos/tanques (calibração de bombas) por turno/caixa
export async function buscarAfericoes(apiKey, { dataInicial, dataFinal, empresaCodigo } = {}, urlBase = DEFAULT_URL_BASE) {
  return fetchPagParalelo(urlBase, 'AFERICAO', apiKey, {
    limite: LIMITE_PADRAO, dataInicial, dataFinal, empresaCodigo,
  });
}
