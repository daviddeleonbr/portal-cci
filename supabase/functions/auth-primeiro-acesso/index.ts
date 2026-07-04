// auth-primeiro-acesso — define a senha no primeiro acesso, server-side.
// ============================================================
// Move o "primeiro acesso" (usuário cadastrado sem senha) para o servidor,
// para que `cci_usuarios_sistema` possa ser travada contra a anon key.
// Roda PRÉ-LOGIN → deployar com --no-verify-jwt.
//
// Primeiro acesso = senha_hash IS NULL (usuário importado sem senha).
// Body: { action: 'verificar'|'definir', email, novaSenha? }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { action, email, novaSenha } = await req.json().catch(() => ({}));
    const emailNorm = String(email || "").trim().toLowerCase();

    if (action === "verificar") {
      if (!emailNorm) return json({ primeiroAcesso: false });
      const { data } = await supabase
        .from("cci_usuarios_sistema")
        .select("id, senha_hash, tipo, status")
        .eq("email", emailNorm)
        .maybeSingle();
      const primeiroAcesso = !!data
        && data.tipo === "cliente"
        && data.status === "ativo"
        && (data.senha_hash === null || data.senha_hash === "");
      return json({ primeiroAcesso });
    }

    if (action === "definir") {
      if (!emailNorm) return json({ ok: false, error: "Informe o e-mail." }, 400);
      if (!novaSenha || String(novaSenha).length < 6) {
        return json({ ok: false, error: "A senha precisa ter ao menos 6 caracteres." }, 400);
      }
      const { data: usuario } = await supabase
        .from("cci_usuarios_sistema")
        .select("id, senha_hash, tipo, status")
        .eq("email", emailNorm)
        .maybeSingle();
      if (!usuario || usuario.tipo !== "cliente" || usuario.status !== "ativo") {
        return json({ ok: false, error: "Usuário inválido." }, 400);
      }
      if (usuario.senha_hash !== null && usuario.senha_hash !== "") {
        return json({ ok: false, error: "Este e-mail já tem senha cadastrada. Use a tela de login." }, 400);
      }
      await supabase.rpc("cci_definir_senha", { p_usuario_id: usuario.id, p_senha: novaSenha });
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    console.error("[auth-primeiro-acesso] erro:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
