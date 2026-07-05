// ============================================================
// Helper compartilhado pra executar queries no Autosystem
// remoto. Abstrai o transporte: TCP direto OU HTTPS via proxy
// (Cloudflare Tunnel).
// ============================================================
//
// Uso:
//
//   import { obterRede, executarQuery } from '../_shared/autosystem-query.ts';
//
//   const rede = await obterRede(supabase, redeId);
//   const rows = await executarQuery(rede, `
//     select codigo, nome from conta order by codigo
//   `);
//
// Se a rede está em modo TCP, abre uma conexão Postgres e roda a
// query. Se está em modo HTTPS, faz POST /query no proxy do cliente.
//
// LIMITAÇÃO conhecida — encoding:
// Algumas queries usam `convert_to(coluna, 'LATIN1')` pra recuperar
// strings em bancos com `client_encoding=SQL_ASCII`. Esse hack só funciona
// em modo TCP (Deno pg retorna Uint8Array, decodificado por TextDecoder
// no chamador). No HTTPS, o proxy serializa pra JSON (UTF-8) — convert_to
// vai retornar bytea hex, não string. Pra que clientes em modo HTTPS
// funcionem, eles precisam ter o banco em UTF-8 ou as SQLs precisam ser
// ajustadas (sem convert_to).

// deno-lint-ignore-file no-explicit-any
import { Client as PgClient } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

export interface RedeCredenciais {
  id: string;
  nome: string;
  slug: string;
  tipo_conexao: 'tcp' | 'https';
  conexao_ip?: string;
  conexao_porta?: number;
  conexao_banco?: string;
  conexao_usuario?: string;
  conexao_senha?: string;
  conexao_https_url?: string;
  conexao_https_token?: string;
}

export interface QueryOpts {
  /** Encoding inicial do client (só TCP). Default: 'UTF8'. */
  encoding?: 'UTF8' | 'SQL_ASCII' | 'LATIN1';
  /** Statements adicionais a rodar logo após a conexão (só TCP). */
  setup?: string[];
}

// ─── Autorização do chamador (fecha IDOR cross-tenant) ──────────────
// As funções rodam com service_role (que decifra credenciais de QUALQUER
// rede). Sem checar o chamador, um cliente autenticado poderia pedir o
// `rede_id` de outra rede. Aqui validamos o JWT do usuário (mandado pelo
// supabase.functions.invoke): admin acessa qualquer rede; cliente só a
// própria (`as_rede_id` do claim). A assinatura já foi validada pelo gateway.
export class RedeNaoAutorizadaError extends Error {
  constructor(msg = 'Rede não autorizada para este usuário.') { super(msg); this.name = 'RedeNaoAutorizadaError'; }
}

function claimsDoToken(req: Request): Record<string, any> | null {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

export function autorizarRede(req: Request, redeId: string): void {
  const claims = claimsDoToken(req);
  if (claims?.cci_tipo === 'admin') return;             // admin: qualquer rede
  const asRedeId = claims?.as_rede_id;
  if (!asRedeId || String(asRedeId) !== String(redeId)) {
    throw new RedeNaoAutorizadaError();
  }
}

// Busca credenciais decifradas via RPC. Lança erro se a rede não existir.
// Se `req` for passado, valida a POSSE da rede pelo chamador (autorizarRede).
export async function obterRede(supabase: any, redeId: string, req?: Request): Promise<RedeCredenciais> {
  if (req) autorizarRede(req, redeId);
  const { data, error } = await supabase.rpc('as_rede_get_credenciais', { p_id: redeId });
  if (error) throw new Error(`Falha ao buscar credenciais: ${error.message}`);
  const rede = Array.isArray(data) ? data[0] : data;
  if (!rede) throw new Error(`Rede ${redeId} não encontrada`);

  // Default seguro: se tipo_conexao for null/undefined no banco, assume TCP
  if (!rede.tipo_conexao) rede.tipo_conexao = 'tcp';

  // Valida credenciais conforme o modo
  if (rede.tipo_conexao === 'tcp') {
    if (!rede.conexao_ip || !rede.conexao_banco || !rede.conexao_usuario || !rede.conexao_senha) {
      throw new Error('Credenciais TCP incompletas (ip/banco/usuario/senha)');
    }
  } else if (rede.tipo_conexao === 'https') {
    if (!rede.conexao_https_url || !rede.conexao_https_token) {
      throw new Error('Credenciais HTTPS incompletas (url/token)');
    }
  } else {
    throw new Error(`tipo_conexao inválido: ${rede.tipo_conexao}`);
  }
  return rede;
}

// Executa query e devolve `rows[]`. Em ambos os modos a forma do retorno
// é a mesma (lista de objetos chaveados pelos aliases do SQL).
export async function executarQuery(
  rede: RedeCredenciais,
  sql: string,
  params: unknown[] = [],
  opts: QueryOpts = {},
): Promise<Record<string, unknown>[]> {
  if (rede.tipo_conexao === 'https') {
    return executarHttps(rede, sql, params);
  }
  return executarTcp(rede, sql, params, opts);
}

// ─── TCP (modo atual) ───────────────────────────────────────────
async function executarTcp(
  rede: RedeCredenciais,
  sql: string,
  params: unknown[],
  opts: QueryOpts,
): Promise<Record<string, unknown>[]> {
  const pg = new PgClient({
    hostname: rede.conexao_ip!,
    port:     rede.conexao_porta || 5432,
    database: rede.conexao_banco!,
    user:     rede.conexao_usuario!,
    password: rede.conexao_senha!,
    tls:      { enabled: false },
  });
  await pg.connect();
  try {
    const enc = opts.encoding || 'UTF8';
    // queryArray pra evitar parsing de tipos quando só queremos SET
    await pg.queryArray(`set client_encoding to '${enc}'`);
    if (opts.setup) {
      for (const stmt of opts.setup) await pg.queryArray(stmt);
    }
    const result = params.length > 0
      ? await pg.queryObject(sql, params as any[])
      : await pg.queryObject(sql);
    return result.rows as Record<string, unknown>[];
  } finally {
    try { await pg.end(); } catch { /* noop */ }
  }
}

// Executa MÚLTIPLAS queries reusando a mesma conexão TCP. Use isso
// quando a edge function precisa rodar várias SELECTs — economiza
// handshake/auth de N para 1. Em modo HTTPS cada `run()` ainda é uma
// request HTTP separada (não tem como reusar).
//
// Uso:
//   const { bombas, bicos } = await withConexao(rede, async (run) => {
//     const bombas = await run('SELECT ... FROM bomba');
//     const bicos  = await run('SELECT ... FROM bico WHERE id = $1', [bombaId]);
//     return { bombas, bicos };
//   }, { encoding: 'SQL_ASCII' });
export async function withConexao<T>(
  rede: RedeCredenciais,
  callback: (run: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
  opts: QueryOpts = {},
): Promise<T> {
  if (rede.tipo_conexao === 'https') {
    // HTTPS: cada chamada é uma request HTTP. Sem reuso possível.
    const run = (sql: string, params: unknown[] = []) => executarHttps(rede, sql, params);
    return await callback(run);
  }
  const pg = new PgClient({
    hostname: rede.conexao_ip!,
    port:     rede.conexao_porta || 5432,
    database: rede.conexao_banco!,
    user:     rede.conexao_usuario!,
    password: rede.conexao_senha!,
    tls:      { enabled: false },
  });
  await pg.connect();
  try {
    const enc = opts.encoding || 'UTF8';
    await pg.queryArray(`set client_encoding to '${enc}'`);
    if (opts.setup) {
      for (const stmt of opts.setup) await pg.queryArray(stmt);
    }
    const run = async (sql: string, params: unknown[] = []) => {
      const r = params.length > 0
        ? await pg.queryObject(sql, params as any[])
        : await pg.queryObject(sql);
      return r.rows as Record<string, unknown>[];
    };
    return await callback(run);
  } finally {
    try { await pg.end(); } catch { /* noop */ }
  }
}

// ─── Decode universal de bytea (convert_to(coluna, 'LATIN1')) ──────
//
// Em TCP, Deno-pg retorna o bytea como Uint8Array direto.
// Em HTTPS, o proxy Node serializa Buffer pra JSON como
// { type: 'Buffer', data: [byte, byte, ...] }.
// Esta função entende os 2 formatos + string crua (pra colunas
// sem convert_to) e devolve string JS no encoding solicitado.
export function decodeBytea(
  v: unknown,
  encoding: 'windows-1252' | 'latin1' | 'utf-8' = 'windows-1252',
): string {
  if (v == null) return '';
  // TCP (Deno-pg)
  if (v instanceof Uint8Array) return new TextDecoder(encoding).decode(v);
  // HTTPS (Node-pg serializado em JSON)
  if (typeof v === 'object' && (v as any)?.type === 'Buffer' && Array.isArray((v as any).data)) {
    return new TextDecoder(encoding).decode(new Uint8Array((v as any).data));
  }
  // Array de bytes puro
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
    return new TextDecoder(encoding).decode(new Uint8Array(v as number[]));
  }
  // Já é string ou outro primitivo
  return String(v);
}

// Atalho: aplica decodeBytea só nas colunas marcadas como text em
// uma row. Mantém as outras intactas.
export function decodeRowText(
  row: Record<string, unknown>,
  textColumns: Set<string>,
  encoding: 'windows-1252' | 'latin1' | 'utf-8' = 'windows-1252',
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = textColumns.has(k) ? decodeBytea(v, encoding) : v;
  }
  return out;
}

// Normaliza a URL do proxy:
//   - Adiciona `https://` se faltar scheme (UI permite cadastrar
//     `cliente.exemplo.com.br` sem o prefixo).
//   - Remove barras finais.
function normalizarUrlProxy(raw: string): string {
  let url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '');
}

// ─── HTTPS (proxy via Cloudflare Tunnel) ────────────────────────
async function executarHttps(
  rede: RedeCredenciais,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  const base = normalizarUrlProxy(rede.conexao_https_url!);
  const url = `${base}/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rede.conexao_https_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const text = await resp.text();
  const ct = resp.headers.get('content-type') || '';
  const server = resp.headers.get('server') || '';
  const cfRay = resp.headers.get('cf-ray') || '';

  // Diagnóstico detalhado em caso de resposta não-JSON. Inclui headers que
  // ajudam a saber se a request bateu no Cloudflare (server: cloudflare,
  // cf-ray) e nunca chegou no proxy — caso típico: rota não publicada,
  // proxy fora do ar, ou /query servido como HTML.
  if (!text || !ct.includes('json')) {
    const snippet = (text || '').replace(/\s+/g, ' ').slice(0, 300) || '<vazio>';
    throw new Error(
      `Proxy não retornou JSON (HTTP ${resp.status}, content-type="${ct || 'n/a'}", ` +
      `server="${server}", cf-ray="${cfRay}"). URL chamada: ${url}. ` +
      `Corpo: ${snippet}`
    );
  }

  let json: any;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Proxy retornou JSON inválido (HTTP ${resp.status}): ${text.slice(0, 300)}`); }

  if (!resp.ok) {
    throw new Error(json?.error || `Proxy HTTP ${resp.status}`);
  }
  if (!Array.isArray(json?.rows)) {
    throw new Error('Proxy retornou JSON sem campo `rows`');
  }
  return json.rows;
}
