// push-enviar — manda o Web Push de UMA notificação (tabela `notificacoes`)
// para todos os aparelhos inscritos do usuário (push_inscricoes).
//
// Quem chama: o banco (trigger trg_notificacoes_push, via pg_net) com a
// service_role do Vault. Ninguém mais — a função recusa outros chamadores.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// Aparelho que não existe mais (404/410) tem a inscrição apagada.
//
// Payload p/ o service worker (public/push-sw.js):
//   { title, body, url, tag, tipo }
// O ícone da barra de status (Android) é o badge-cci-96.png — os 3 triângulos.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@cci.app.br';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Só a service_role (o banco) pode chamar.
function ehServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === SERVICE_KEY) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch { return false; }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!ehServiceRole(req)) return json({ error: 'Não autorizado' }, 401);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'VAPID não configurado' }, 500);

  let notificacaoId: string | undefined;
  try { ({ notificacao_id: notificacaoId } = await req.json()); } catch { /* body inválido */ }
  if (!notificacaoId) return json({ error: 'notificacao_id é obrigatório' }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: n, error: errN } = await supabase
    .from('notificacoes')
    .select('id, usuario_id, titulo, mensagem, tipo, link')
    .eq('id', notificacaoId)
    .maybeSingle();
  if (errN) return json({ error: errN.message }, 500);
  if (!n) return json({ enviados: 0, motivo: 'notificação não encontrada' });

  const { data: inscricoes, error: errI } = await supabase
    .from('push_inscricoes')
    .select('id, endpoint, p256dh, auth')
    .eq('usuario_id', n.usuario_id);
  if (errI) return json({ error: errI.message }, 500);
  if (!inscricoes?.length) return json({ enviados: 0 });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const payload = JSON.stringify({
    title: n.titulo || 'CCI',
    body: n.mensagem || '',
    url: n.link || '/',
    tag: `notif-${n.id}`,
    tipo: n.tipo || 'info',
  });

  let enviados = 0;
  const remover: string[] = [];
  await Promise.all(inscricoes.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24, urgency: 'high' },
      );
      enviados += 1;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) remover.push(s.id); // aparelho desinstalou / expirou
      else console.error('push falhou', status, (e as Error)?.message);
    }
  }));
  if (remover.length) await supabase.from('push_inscricoes').delete().in('id', remover);

  return json({ enviados, removidos: remover.length });
});
