// PUSH NO CELULAR (Web Push / PWA) — inscrição deste aparelho p/ o usuário logado.
// Tabela push_inscricoes (migração 219). O envio é do servidor: toda
// notificação nova do sino dispara a Edge Function push-enviar.
// Handlers do service worker: public/push-sw.js.
//
// iPhone: só funciona com o app INSTALADO na tela de início (iOS 16.4+).
// Android/desktop: Chrome/Edge/Firefox, inclusive no navegador.
import { supabase } from '../lib/supabase';

// Chave pública VAPID (pública mesmo — a privada fica nos secrets da função).
const VAPID_PUBLIC_KEY = 'BMYq0pF4LXGXPDuUmvMZ2aI61u6lLpIbbswqN2wxMhFNoY3U7yRu2bOW9Jz1IhG8QjbC3JjjWbcHws1co4av2YQ';

function base64UrlParaBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export function suportado() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function ehIOS() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
export function instaladoComoApp() {
  return typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}

// SW pronto (no `npm run dev` ele não existe → não trava: desiste em 4s)
async function registro() {
  if (!suportado()) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(res => setTimeout(() => res(null), 4000)),
  ]);
}

// 'indisponivel' | 'precisa_instalar' (iPhone fora do app) | 'negado' | 'ativo' | 'inativo'
export async function estado(usuarioId) {
  if (ehIOS() && !instaladoComoApp()) return 'precisa_instalar';
  if (!suportado()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'negado';
  const reg = await registro();
  if (!reg) return 'indisponivel';
  const sub = await reg.pushManager.getSubscription();
  if (!sub || !usuarioId) return 'inativo';
  const { data } = await supabase.from('push_inscricoes').select('id')
    .eq('usuario_id', usuarioId).eq('endpoint', sub.endpoint).maybeSingle();
  return data ? 'ativo' : 'inativo';
}

// Pede permissão, inscreve o aparelho e grava p/ o usuário.
export async function ativar(usuarioId) {
  if (!usuarioId) throw new Error('Sessão não encontrada');
  if (!suportado()) throw new Error('Este navegador não recebe notificações.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada. Libere nas configurações do navegador/celular.');
  const reg = await registro();
  if (!reg) throw new Error('App ainda não está pronto para notificações. Recarregue a página e tente de novo.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaBytes(VAPID_PUBLIC_KEY) });
  }
  const j = sub.toJSON();
  const { error } = await supabase.from('push_inscricoes').upsert({
    usuario_id: usuarioId,
    endpoint: j.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 300),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'usuario_id,endpoint' });
  if (error) throw error;
}

// Para de receber NESTE aparelho (para este usuário).
export async function desativar(usuarioId) {
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase.from('push_inscricoes').delete()
    .eq('usuario_id', usuarioId).eq('endpoint', sub.endpoint);
  if (error) throw error;
}

// Ao sair do portal: remove a inscrição deste aparelho p/ esse usuário
// (RPC sem sessão — exige o endpoint, que só o aparelho tem). Fire-and-forget.
export function removerAoSair(usuarioId) {
  if (!usuarioId || !suportado()) return;
  (async () => {
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await supabase.rpc('push_remover_inscricao', { p_endpoint: sub.endpoint, p_usuario_id: usuarioId });
    } catch { /* sem rede: a inscrição morre sozinha quando o envio falhar */ }
  })();
}
