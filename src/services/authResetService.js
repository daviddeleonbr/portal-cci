// Fluxo de "Esqueceu a senha" para usuários (admin e cliente).
//
// Toda a lógica (gerar/validar/consumir token, gravar a nova senha com
// HASH) roda na Edge Function `auth-reset` (service_role) — o navegador
// não lê mais `password_reset_tokens` nem `cci_usuarios_sistema` direto.
// A função é pública (pré-login).

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function chamar(action, payload = {}) {
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/auth-reset`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Falha de conexão. Tente novamente.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data?.error && data?.ok === undefined) throw new Error(data.error);
  return data;
}

// Solicita reset. Retorna `{ ok, link, usuario_email, usuario_tipo, motivo }`.
// A UI deve sempre exibir "se este email existir, enviamos um link".
export async function solicitarReset(email) {
  const data = await chamar('solicitar', { email });
  if (!data.ok) return { ok: false, motivo: data.motivo };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = `${origin}/redefinir-senha?token=${data.token}`;
  return { ok: true, link, usuario_email: data.usuario_email, usuario_tipo: data.usuario_tipo };
}

// Valida o token. Retorna `{ ok, usuario, token_id, motivo }`. Não consome.
export async function validarToken(token) {
  if (!token) return { ok: false, motivo: 'token_vazio' };
  const data = await chamar('validar', { token });
  return data.ok
    ? { ok: true, usuario: data.usuario, token_id: data.token_id }
    : { ok: false, motivo: data.motivo };
}

// Aplica a nova senha (com hash, server-side) e consome o token.
export async function redefinirSenha(token, novaSenha) {
  if (!novaSenha || novaSenha.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
  const data = await chamar('redefinir', { token, novaSenha });
  if (!data.ok) {
    if (data.error) throw new Error(data.error);
    const map = {
      token_vazio:      'Link inválido.',
      nao_encontrado:   'Link inválido.',
      invalido:         'Link inválido ou expirado.',
      ja_usado:         'Este link já foi usado. Solicite uma nova redefinição.',
      expirado:         'Este link expirou. Solicite uma nova redefinição.',
      usuario_invalido: 'Usuário inválido ou inativo.',
    };
    throw new Error(map[data.motivo] || 'Link inválido.');
  }
  return { ok: true, usuario: data.usuario };
}
