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

function htmlEmailReset(link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <tr><td style="background:#0f766e;padding:20px 24px;color:#fff;font-size:16px;font-weight:700">Portal CCI · Redefinição de senha</td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6">Recebemos um pedido para redefinir a senha da sua conta no Portal CCI.</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6">Clique no botão abaixo para escolher uma nova senha. O link é válido por <strong>1 hora</strong>.</p>
        <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600">Redefinir senha</a></p>
        <p style="margin:0 0 6px;font-size:12px;color:#64748b">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
        <p style="margin:0 0 20px;font-size:12px;color:#0f766e;word-break:break-all">${link}</p>
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">Se você não solicitou esta redefinição, ignore este e-mail — sua senha continua a mesma.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Envia o link de redefinição por e-mail (Resend). Retorna true só se enviou.
// Sem RESEND_API_KEY (ou falha) => false, e o chamador cai no fallback (devolve
// o token pra CCI repassar o link manualmente).
async function enviarEmailReset(email: string, token: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.warn("[auth-reset] RESEND_API_KEY ausente — usando fallback (link on-screen)"); return false; }
  const base = (Deno.env.get("APP_BASE_URL") || "https://www.cci.app.br").replace(/\/+$/, "");
  const from = Deno.env.get("RESET_EMAIL_FROM") || "CCI <nao-responda@cci.app.br>";
  const link = `${base}/redefinir-senha?token=${token}`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Redefinição de senha — Portal CCI",
        html: htmlEmailReset(link),
        text: `Recebemos um pedido para redefinir sua senha no Portal CCI.\n\nAbra o link abaixo (válido por 1 hora):\n${link}\n\nSe você não solicitou, ignore este e-mail.`,
      }),
    });
    if (!r.ok) { console.error("[auth-reset] Resend falhou:", r.status, await r.text().catch(() => "")); return false; }
    return true;
  } catch (e) {
    console.error("[auth-reset] erro ao enviar e-mail:", e);
    return false;
  }
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
      // Tenta enviar por e-mail. Se enviou, NÃO devolve o token (o link some da
      // tela). Se não há provedor / falhou, devolve o token como fallback (a CCI
      // repassa o link manualmente) — assim nada quebra antes do Resend configurado.
      const enviado = await enviarEmailReset(usuario!.email, tok);
      if (enviado) return json({ ok: true, enviado: true });
      return json({ ok: true, enviado: false, token: tok, usuario_email: usuario!.email, usuario_tipo: usuario!.tipo });
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
