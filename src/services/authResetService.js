// Fluxo de "Esqueceu a senha" para usuários cliente.
//
// Como a autenticação atual usa senha em texto plano em
// cci_usuarios_sistema (não Supabase Auth), implementamos um fluxo
// próprio baseado em tokens UUID com TTL curto.
//
// Envio do email: por enquanto NÃO é feito automaticamente. O service
// gera o token e devolve o link de redefinição — a CCI repassa pro
// usuário pelo canal apropriado (WhatsApp, email manual, etc.).
// Quando uma Edge Function de email (ex.: Resend) for adicionada,
// basta chamá-la dentro de `solicitarReset` antes de retornar.

import { supabase } from '../lib/supabase';

// TTL do token: 1 hora
const TTL_HORAS = 1;

function gerarToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback (improvável de ser usado em browsers modernos)
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('');
}

// Solicita reset pra um e-mail. Retorna `{ ok, link, motivo }`.
// Por segurança, do PONTO DE VISTA DA UI a resposta deve ser sempre
// "se este email existir, enviamos um link" — não revelamos se existe
// ou não. O motivo é só pra log interno.
export async function solicitarReset(email) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) {
    return { ok: false, motivo: 'email_vazio' };
  }

  const { data: usuario, error: errLookup } = await supabase
    .from('cci_usuarios_sistema')
    .select('id, email, tipo, status')
    .ilike('email', emailNorm)
    .limit(1)
    .maybeSingle();
  if (errLookup) throw errLookup;

  if (!usuario || usuario.status === 'inativo') {
    return { ok: false, motivo: 'usuario_invalido' };
  }
  if (usuario.tipo !== 'cliente' && usuario.tipo !== 'admin') {
    return { ok: false, motivo: 'usuario_invalido' };
  }

  const token = gerarToken();
  const expiresAt = new Date(Date.now() + TTL_HORAS * 3600 * 1000).toISOString();

  const { error: errIns } = await supabase
    .from('password_reset_tokens')
    .insert({ token, usuario_id: usuario.id, expires_at: expiresAt });
  if (errIns) throw errIns;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Mesma rota de reset pra admin e cliente — a página redireciona para
  // o login correto após sucesso usando o tipo do usuário.
  const link = `${origin}/redefinir-senha?token=${token}`;
  return { ok: true, link, usuario_email: usuario.email, usuario_tipo: usuario.tipo };
}

// Valida o token. Retorna `{ ok, usuario, motivo }`. Não consome.
export async function validarToken(token) {
  if (!token) return { ok: false, motivo: 'token_vazio' };
  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('id, usuario_id, expires_at, consumed_at, cci_usuarios_sistema(id, nome, email, tipo, status)')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, motivo: 'nao_encontrado' };
  if (data.consumed_at) return { ok: false, motivo: 'ja_usado' };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, motivo: 'expirado' };
  const usuario = data.cci_usuarios_sistema;
  if (!usuario || usuario.status === 'inativo') {
    return { ok: false, motivo: 'usuario_invalido' };
  }
  if (usuario.tipo !== 'cliente' && usuario.tipo !== 'admin') {
    return { ok: false, motivo: 'usuario_invalido' };
  }
  return { ok: true, usuario, token_id: data.id };
}

// Aplica a nova senha. Marca o token como usado.
export async function redefinirSenha(token, novaSenha) {
  if (!novaSenha || novaSenha.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
  const valid = await validarToken(token);
  if (!valid.ok) {
    const map = {
      token_vazio:     'Link inválido.',
      nao_encontrado:  'Link inválido.',
      ja_usado:        'Este link já foi usado. Solicite uma nova redefinição.',
      expirado:        'Este link expirou. Solicite uma nova redefinição.',
      usuario_invalido:'Usuário inválido ou inativo.',
    };
    throw new Error(map[valid.motivo] || 'Link inválido.');
  }

  // Atualiza a senha do usuário
  const { error: errUpd } = await supabase
    .from('cci_usuarios_sistema')
    .update({ senha: novaSenha })
    .eq('id', valid.usuario.id);
  if (errUpd) throw errUpd;

  // Marca o token como consumido
  const { error: errCons } = await supabase
    .from('password_reset_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', valid.token_id);
  if (errCons) throw errCons;

  return { ok: true, usuario: valid.usuario };
}
