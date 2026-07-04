// ia-proxy — Fase 4a do plano de segurança
// ============================================================
// Faz a chamada à Anthropic SERVER-SIDE, injetando a chave lida de
// `configuracoes_ia` via service_role. Substitui o
// `anthropic-dangerous-direct-browser-access` (chave saía no bundle).
//
// Autorização: exige um usuário logado de verdade — o JWT precisa ter o
// claim `cci_tipo` (admin|cliente). O gateway (verify_jwt) já validou a
// ASSINATURA do token; aqui só rejeitamos quem chama com a anon key pura
// (sem cci_tipo), pra não deixar qualquer um queimar a chave paga.
//
// Body: { system, user, maxTokens?, modelo?, adaptiveThinking? }
// Resp: { text, usage, stop_reason }  (o parse de JSON fica no cliente)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL_DEFAULT = "claude-opus-4-7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}

// Decodifica o payload do JWT (assinatura já validada pelo gateway).
function claimsDoToken(req: Request): Record<string, unknown> | null {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  // Exige usuário logado (claim cci_tipo presente).
  const claims = claimsDoToken(req);
  if (!claims?.cci_tipo) return json({ error: "Não autenticado." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const { system, user, maxTokens, modelo, adaptiveThinking } = body;
    if (!user) return json({ error: "Payload sem 'user'." }, 400);

    // Config admin (chave + defaults) via service_role.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: cfg, error: errCfg } = await supabase
      .from("configuracoes_ia").select("*").eq("id", 1).maybeSingle();
    if (errCfg) return json({ error: "Falha ao carregar configuração de IA." }, 500);
    const apiKey = cfg?.api_key;
    if (!apiKey) return json({ error: { message: "Chave de API não configurada" } }, 400);
    if (cfg?.ativo === false) return json({ error: { message: "IA desativada pelo administrador." } }, 403);

    const finalModel = modelo || cfg?.modelo || MODEL_DEFAULT;
    const finalMax = Number(maxTokens) || Number(cfg?.max_tokens) || 20000;
    const finalThink = adaptiveThinking ?? (cfg?.adaptive_thinking !== false);

    // system: string ou array de blocos; cache_control no último bloco.
    let blocks = Array.isArray(system) ? [...system] : [{ type: "text", text: String(system ?? "") }];
    if (blocks.length > 0) {
      blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
    }

    const anthropicBody: Record<string, unknown> = {
      model: finalModel,
      max_tokens: finalMax,
      system: blocks,
      messages: [{ role: "user", content: user }],
    };
    if (finalThink) anthropicBody.thinking = { type: "adaptive" };

    // stream:true → a Anthropic manda SSE contínuo (deltas + ping), o que
    // mantém a conexão viva e evita o idle timeout (150s) da Edge Function
    // em respostas longas (adaptive thinking + max_tokens alto).
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...anthropicBody, stream: true }),
    });

    // Erro (ex.: chave inválida, sem crédito) NÃO vem em stream — repassa
    // o status/corpo pro cliente mapear os códigos.
    if (!res.ok) {
      const errText = await res.text();
      return new Response(errText, {
        status: res.status,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    // Repassa o SSE da Anthropic direto pro navegador.
    return new Response(res.body, {
      headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  } catch (e) {
    console.error("[ia-proxy] erro:", e);
    return json({ error: { message: "Erro interno no proxy de IA." } }, 500);
  }
});
