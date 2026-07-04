// auth-refresh — Fase 2 do plano de segurança (opção 2)
// ============================================================
// Troca um refresh token válido por um novo access token (~1h) e um novo
// refresh token (ROTAÇÃO: revoga o antigo). Se o refresh token for
// inválido/expirado/revogado, responde 401 e o frontend deve forçar novo
// login.
//
// Body: { refresh_token }
// Resp: { access_token, refresh_token, expires_in }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assinarAccessToken, montarClaims, gerarRefreshToken, sha256Hex,
  ACCESS_TTL_SEG, REFRESH_TTL_MS, CORS, json,
} from "../_shared/auth-jwt.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const { refresh_token: refreshRaw } = await req.json().catch(() => ({}));
    if (!refreshRaw || typeof refreshRaw !== "string") {
      return json({ error: "refresh_token ausente." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Localiza o token pelo hash.
    const hash = await sha256Hex(refreshRaw);
    const { data: rt, error: errRt } = await supabase
      .from("cci_refresh_tokens")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    if (errRt) {
      console.error("[auth-refresh] erro ao buscar refresh token:", errRt.message);
      return json({ error: "Falha ao renovar sessão." }, 500);
    }
    if (!rt) return json({ error: "Sessão inválida. Faça login novamente." }, 401);

    // 2) Valida estado (não revogado, não expirado).
    if (rt.revoked_at) return json({ error: "Sessão encerrada. Faça login novamente." }, 401);
    if (new Date(rt.expires_at).getTime() <= Date.now()) {
      return json({ error: "Sessão expirada. Faça login novamente." }, 401);
    }

    // 3) Recarrega o usuário (claims sempre atuais — permissões podem ter mudado).
    const { data: usuario, error: errU } = await supabase
      .from("cci_usuarios_sistema")
      .select("*, chaves_api(*), as_rede(*)")
      .eq("id", rt.usuario_id)
      .single();
    if (errU || !usuario) return json({ error: "Usuário não encontrado." }, 401);
    if (usuario.status !== "ativo") return json({ error: "Usuário inativo." }, 403);

    // 4) ROTAÇÃO: revoga o refresh atual e emite um novo.
    const novoRaw = gerarRefreshToken();
    const novoHash = await sha256Hex(novoRaw);
    const expiraEm = new Date(Date.now() + REFRESH_TTL_MS).toISOString();

    const { error: errRev } = await supabase.from("cci_refresh_tokens")
      .update({ revoked_at: new Date().toISOString(), last_used_at: new Date().toISOString() })
      .eq("id", rt.id);
    if (errRev) {
      console.error("[auth-refresh] erro ao revogar refresh token:", errRev.message);
      return json({ error: "Falha ao renovar sessão." }, 500);
    }
    const { error: errIns } = await supabase.from("cci_refresh_tokens").insert({
      usuario_id: usuario.id,
      token_hash: novoHash,
      portal: rt.portal,
      expires_at: expiraEm,
      user_agent: req.headers.get("user-agent"),
    });
    if (errIns) {
      console.error("[auth-refresh] erro ao gravar novo refresh token:", errIns.message);
      return json({ error: "Falha ao renovar sessão." }, 500);
    }

    // 5) Novo access token.
    const accessToken = await assinarAccessToken(montarClaims(usuario));

    return json({
      access_token: accessToken,
      refresh_token: novoRaw,
      expires_in: ACCESS_TTL_SEG,
    }, 200);
  } catch (e) {
    console.error("[auth-refresh] erro inesperado:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
