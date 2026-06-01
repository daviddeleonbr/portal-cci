// ============================================================
// userImportService — utilitários para o fluxo de "primeiro
// acesso" (usuários cadastrados sem senha → criar senha no
// primeiro login).
//
// O auto-detect ocorre em /cliente/login: se o e-mail existe
// e a senha está NULL, o usuário é redirecionado para
// /cliente/criar-senha.
// ============================================================

import { supabase } from '../lib/supabase';
import { loginCliente } from '../lib/auth';

// Verifica se o e-mail pertence a um cliente ativo que ainda
// NÃO definiu senha. Usado em /cliente/login para redirecionar.
export async function verificarPrimeiroAcesso(email) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) return false;
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .select('id, senha, tipo, status')
    .eq('email', emailNorm)
    .maybeSingle();
  if (error || !data) return false;
  return data.tipo === 'cliente'
    && data.status === 'ativo'
    && (data.senha === null || data.senha === '');
}

// Define a senha do primeiro acesso e já autentica.
// Falha se o usuário já tem senha (proteção contra reescrita).
export async function definirSenhaPrimeiroAcesso(email, novaSenha) {
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('Informe o e-mail.');
  if (!novaSenha || novaSenha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');

  // Update condicional: só atualiza se senha estiver NULL.
  // Postgrest devolve 0 linhas se a condição não bater.
  const { data, error } = await supabase
    .from('cci_usuarios_sistema')
    .update({ senha: novaSenha })
    .eq('email', emailNorm)
    .is('senha', null)
    .select('id');
  if (error) throw new Error('Falha ao salvar a senha: ' + error.message);
  if (!data || data.length === 0) {
    throw new Error('Este e-mail já tem senha cadastrada. Use a tela de login.');
  }

  return loginCliente(emailNorm, novaSenha);
}
