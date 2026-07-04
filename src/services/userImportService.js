// ============================================================
// userImportService — fluxo de "primeiro acesso" (usuários
// cadastrados sem senha → criar senha no primeiro login).
//
// A verificação e a definição da senha rodam na Edge Function
// `auth-primeiro-acesso` (service_role) — o navegador não lê/escreve
// `cci_usuarios_sistema` direto. Primeiro acesso = senha_hash IS NULL.
// ============================================================

import { loginCliente } from '../lib/auth';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function chamar(action, payload = {}) {
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/auth-primeiro-acesso`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Falha de conexão. Tente novamente.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data?.error) throw new Error(data.error);
  return data;
}

// Verifica se o e-mail pertence a um cliente ativo que ainda NÃO definiu
// senha. Usado em /cliente/login para redirecionar. Best-effort (false em erro).
export async function verificarPrimeiroAcesso(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) return false;
  try {
    const data = await chamar('verificar', { email: emailNorm });
    return !!data.primeiroAcesso;
  } catch {
    return false;
  }
}

// Define a senha do primeiro acesso (hash, server-side) e já autentica.
// Falha se o usuário já tem senha (proteção contra reescrita).
export async function definirSenhaPrimeiroAcesso(email, novaSenha) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('Informe o e-mail.');
  if (!novaSenha || novaSenha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');

  const data = await chamar('definir', { email: emailNorm, novaSenha });
  if (!data.ok) throw new Error(data.error || 'Falha ao salvar a senha.');

  return loginCliente(emailNorm, novaSenha);
}
