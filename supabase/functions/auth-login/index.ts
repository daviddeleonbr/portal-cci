// auth-login — Fase 2 do plano de segurança (opção 2)
// ============================================================
// Verifica email+senha SERVER-SIDE (hash, via RPC cci_verificar_senha) e
// emite um access token JWT curto (~1h) + refresh token (~30d). Substitui
// a comparação de senha em texto puro que hoje roda no navegador
// (src/lib/auth.js). Enquanto a Fase 3 não aperta o RLS, os claims do
// token ainda não gateiam nada — mas o token já é válido e carrega a
// identidade real, preparando o terreno.
//
// Body: { email, senha, portal: 'admin' | 'cliente' }
// Resp: { access_token, refresh_token, expires_in, usuario }
//
// Secrets necessários (supabase secrets set ...):
//   APP_JWT_SECRET   = JWT Secret do dashboard (Settings > API)
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY já vêm do ambiente)
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
    const { email, senha, portal } = await req.json().catch(() => ({}));
    if (!email || !senha || (portal !== "admin" && portal !== "cliente")) {
      return json({ error: "Informe email, senha e portal ('admin'|'cliente')." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Verifica a senha contra o hash (nunca traz o hash pro edge).
    const { data: verif, error: errVerif } = await supabase
      .rpc("cci_verificar_senha", { p_email: email, p_senha: senha })
      .maybeSingle();
    if (errVerif) {
      console.error("[auth-login] erro em cci_verificar_senha:", errVerif.message);
      return json({ error: "Falha ao validar credenciais." }, 500);
    }
    // Mensagem genérica p/ não revelar se o email existe.
    if (!verif || !verif.valido) return json({ error: "E-mail ou senha inválidos." }, 401);

    // 2) Carrega o usuário completo (com vínculo de rede).
    const { data: usuario, error: errU } = await supabase
      .from("cci_usuarios_sistema")
      .select("*, chaves_api(*), as_rede(*)")
      .eq("id", verif.id)
      .single();
    if (errU || !usuario) return json({ error: "Usuário não encontrado." }, 404);
    if (usuario.status !== "ativo") return json({ error: "Usuário inativo. Contate o administrador." }, 403);
    if (usuario.tipo !== portal) {
      return json({
        error: portal === "admin"
          ? "Este acesso é exclusivo para administradores."
          : "Este acesso é exclusivo para clientes.",
      }, 403);
    }

    // 3) Access token com os claims da app.
    const accessToken = await assinarAccessToken(montarClaims(usuario));

    // 4) Refresh token opaco — guardamos só o hash.
    const refreshRaw = gerarRefreshToken();
    const refreshHash = await sha256Hex(refreshRaw);
    const expiraEm = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
    const { error: errRt } = await supabase.from("cci_refresh_tokens").insert({
      usuario_id: usuario.id,
      token_hash: refreshHash,
      portal,
      expires_at: expiraEm,
      user_agent: req.headers.get("user-agent"),
    });
    if (errRt) {
      console.error("[auth-login] erro ao gravar refresh token:", errRt.message);
      return json({ error: "Falha ao iniciar sessão." }, 500);
    }

    // 5) Best-effort: atualiza último acesso (não bloqueia o login).
    supabase.from("cci_usuarios_sistema")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", usuario.id)
      .then(() => {}, () => {});

    // Nunca devolve segredos ao cliente.
    delete (usuario as Record<string, unknown>).senha;
    delete (usuario as Record<string, unknown>).senha_hash;

    return json({
      access_token: accessToken,
      refresh_token: refreshRaw,
      expires_in: ACCESS_TTL_SEG,
      usuario,
    }, 200);
  } catch (e) {
    console.error("[auth-login] erro inesperado:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
