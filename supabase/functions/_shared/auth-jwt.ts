// _shared/auth-jwt.ts
// ============================================================
// Helper de assinatura/verificação do access token (Fase 2).
//
// O access token é um JWT HS256 assinado com o MESMO segredo JWT do
// projeto Supabase (Settings > API > JWT Secret), para que o PostgREST
// aceite o token e as policies de RLS (Fase 3) consigam ler os claims via
// `auth.jwt()`. Configure o segredo como secret da Edge Function
// (o prefixo SUPABASE_ é reservado pelo CLI, por isso APP_JWT_SECRET):
//
//     supabase secrets set APP_JWT_SECRET="<JWT Secret do dashboard>"
//
// Claims relevantes p/ RLS: `sub` (=auth.uid()), `role`=authenticated
// (=auth.role()), e os custom claims cci_tipo / chave_api_id / as_rede_id /
// empresas_permitidas / cci_permissoes (lidos via auth.jwt()->>'...').
// ============================================================
import { create, verify, getNumericDate, type Header } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// O prefixo SUPABASE_ é reservado pelo CLI (não dá pra `secrets set`), então
// usamos APP_JWT_SECRET. Fallback pra SUPABASE_JWT_SECRET caso já esteja no
// ambiente por outro meio (ex.: injetado manualmente).
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET") ?? Deno.env.get("SUPABASE_JWT_SECRET");
if (!JWT_SECRET) {
  console.error("[auth-jwt] APP_JWT_SECRET ausente — tokens não poderão ser assinados/verificados.");
}

export const ACCESS_TTL_SEG = 60 * 60;            // 1 hora
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

let _key: CryptoKey | null = null;
async function chave(): Promise<CryptoKey> {
  if (_key) return _key;
  if (!JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET não configurado.");
  _key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return _key;
}

// Assina um access token de curta duração com os claims da app.
export async function assinarAccessToken(claims: Record<string, unknown>): Promise<string> {
  const key = await chave();
  const header: Header = { alg: "HS256", typ: "JWT" };
  const payload = {
    ...claims,
    role: "authenticated",
    aud: "authenticated",
    iat: getNumericDate(0),
    exp: getNumericDate(ACCESS_TTL_SEG),
  };
  return await create(header, payload, key);
}

export async function verificarAccessToken(token: string): Promise<Record<string, unknown>> {
  const key = await chave();
  return await verify(token, key) as Record<string, unknown>;
}

// SHA-256 hex — usado pra guardar só o hash do refresh token.
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Gera um refresh token opaco (não-adivinhável).
export function gerarRefreshToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

// Monta os claims da app a partir do registro de usuário.
export function montarClaims(usuario: Record<string, any>): Record<string, unknown> {
  const chaveApiId = usuario.chave_api_id || usuario.chaves_api?.id || null;
  const asRedeId = usuario.as_rede_id || usuario.as_rede?.id || null;
  const claims: Record<string, unknown> = {
    sub: usuario.id,
    cci_usuario_id: usuario.id,
    cci_tipo: usuario.tipo,
    cci_permissoes: usuario.permissoes || [],
  };
  if (chaveApiId) claims.chave_api_id = chaveApiId;
  if (asRedeId) claims.as_rede_id = asRedeId;
  if (Array.isArray(usuario.empresas_permitidas)) claims.empresas_permitidas = usuario.empresas_permitidas;
  return claims;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*", // Fase 5 aperta p/ origens conhecidas
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
