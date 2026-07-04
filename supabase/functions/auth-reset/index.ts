// auth-reset — fluxo "esqueci a senha" server-side (Lote H / achado #2)
// ============================================================
// Move a geração/validação/consumo do token de reset para o servidor, para
// que `password_reset_tokens` e `cci_usuarios_sistema` possam ser travados
// contra a anon key. Roda PRÉ-LOGIN → deployar com --no-verify-jwt.
//
// Body: { action: 'solicitar'|'validar'|'redefinir', email?, token?, novaSenha? }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const TTL_HORAS = 1;
function gerarToken(): string {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}
function usuarioValido(u: { status?: string; tipo?: string } | null): boolean {
  return !!u && u.status !== "inativo" && (u.tipo === "cliente" || u.tipo === "admin");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { action, email, token, novaSenha } = await req.json().catch(() => ({}));

    if (action === "solicitar") {
      const emailNorm = String(email || "").trim().toLowerCase();
      if (!emailNorm) return json({ ok: false, motivo: "email_vazio" });
      const { data: usuario } = await supabase
        .from("cci_usuarios_sistema")
        .select("id, email, tipo, status")
        .ilike("email", emailNorm)
        .limit(1)
        .maybeSingle();
      if (!usuarioValido(usuario)) return json({ ok: false, motivo: "usuario_invalido" });
      const tok = gerarToken();
      const expiresAt = new Date(Date.now() + TTL_HORAS * 3600 * 1000).toISOString();
      const { error } = await supabase
        .from("password_reset_tokens")
        .insert({ token: tok, usuario_id: usuario!.id, expires_at: expiresAt });
      if (error) return json({ ok: false, motivo: "erro" }, 500);
      // Retorna o token pra o cliente montar o link (comportamento atual: a
      // CCI repassa o link manualmente). Não expõe nada além do próprio token.
      return json({ ok: true, token: tok, usuario_email: usuario!.email, usuario_tipo: usuario!.tipo });
    }

    if (action === "validar") {
      if (!token) return json({ ok: false, motivo: "token_vazio" });
      const { data } = await supabase
        .from("password_reset_tokens")
        .select("id, usuario_id, expires_at, consumed_at, cci_usuarios_sistema(id, nome, email, tipo, status)")
        .eq("token", token)
        .maybeSingle();
      if (!data) return json({ ok: false, motivo: "nao_encontrado" });
      if (data.consumed_at) return json({ ok: false, motivo: "ja_usado" });
      if (new Date(data.expires_at).getTime() < Date.now()) return json({ ok: false, motivo: "expirado" });
      const usuario = data.cci_usuarios_sistema;
      if (!usuarioValido(usuario)) return json({ ok: false, motivo: "usuario_invalido" });
      return json({ ok: true, usuario, token_id: data.id });
    }

    if (action === "redefinir") {
      if (!novaSenha || String(novaSenha).length < 6) {
        return json({ ok: false, error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      }
      const { data } = await supabase
        .from("password_reset_tokens")
        .select("id, expires_at, consumed_at, cci_usuarios_sistema(id, nome, email, tipo, status)")
        .eq("token", token)
        .maybeSingle();
      if (!data || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) {
        return json({ ok: false, motivo: "invalido" }, 400);
      }
      const usuario = data.cci_usuarios_sistema as { id: string; status?: string } | null;
      if (!usuarioValido(usuario)) return json({ ok: false, motivo: "usuario_invalido" }, 400);
      await supabase.rpc("cci_definir_senha", { p_usuario_id: usuario!.id, p_senha: novaSenha });
      await supabase.from("password_reset_tokens").update({ consumed_at: new Date().toISOString() }).eq("id", data.id);
      return json({ ok: true, usuario });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    console.error("[auth-reset] erro:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
