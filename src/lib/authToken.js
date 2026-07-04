// authToken.js
// ============================================================
// Fornece o access token ativo para o client Supabase (via opção
// `accessToken` em lib/supabase.js) e faz refresh silencioso.
//
// Este módulo NÃO importa supabase.js nem auth.js (evita ciclo): lê/escreve
// o localStorage direto e usa `fetch` cru para chamar a Edge Function
// auth-refresh. Escolhe entre a sessão admin e a cliente pela rota atual
// (as duas podem coexistir). Enquanto o RLS for allow-all (até a Fase 3),
// um token trocado por engano não vaza nem bloqueia dados — a seleção por
// rota só passa a importar de fato quando as policies apertarem.
// ============================================================

const ADMIN_KEY = 'cci_session_admin';
const CLIENTE_KEY = 'cci_session_cliente';
const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

function agoraSeg() {
  return Math.floor(Date.now() / 1000);
}

function lerSessao(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function salvarSessao(key, session) {
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch { /* noop */ }
}

// Qual portal está ativo agora, pela URL. Tudo sob /admin usa a sessão
// admin; o resto (inclusive /cliente/*, landing) usa a sessão cliente.
function portalAtivo() {
  try {
    return window.location.pathname.startsWith('/admin') ? 'admin' : 'cliente';
  } catch {
    return 'cliente';
  }
}

// Evita "stampede" de refresh: uma renovação em andamento por portal.
const refreshEmAndamento = { admin: null, cliente: null };

async function renovar(portal, session, key) {
  if (!session?.refresh_token) return null;
  if (refreshEmAndamento[portal]) return refreshEmAndamento[portal];

  refreshEmAndamento[portal] = (async () => {
    try {
      const res = await fetch(`${URL}/functions/v1/auth-refresh`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) return null; // refresh inválido/expirado → deixa o token antigo cair
      const data = await res.json();
      // Relê a sessão (pode ter mudado) e atualiza só os campos de token.
      const atual = lerSessao(key) || session;
      const nova = {
        ...atual,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        access_exp: agoraSeg() + (data.expires_in || 3600),
      };
      salvarSessao(key, nova);
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshEmAndamento[portal] = null;
    }
  })();

  return refreshEmAndamento[portal];
}

async function resolverToken(session, key, portal) {
  const exp = session.access_exp || 0;
  if (exp - agoraSeg() > 60) return session.access_token; // ainda válido (>60s)
  const novo = await renovar(portal, session, key);
  return novo || session.access_token; // se o refresh falhar, tenta o antigo
}

// Chamado pelo client Supabase a cada request. Retorna o bearer a usar.
// Sem sessão → retorna a ANON key (comportamento público/anon de hoje).
export async function getAccessTokenAtivo() {
  const portal = portalAtivo();

  // Modo demo: a sessão cliente é o admin "fingindo" de cliente e não tem
  // token próprio — usa o token do admin (que está de fato autorizado).
  if (portal === 'cliente') {
    const cli = lerSessao(CLIENTE_KEY);
    if (cli?._demo) {
      const adm = lerSessao(ADMIN_KEY);
      if (adm?.access_token) return await resolverToken(adm, ADMIN_KEY, 'admin');
      return ANON;
    }
  }

  const key = portal === 'admin' ? ADMIN_KEY : CLIENTE_KEY;
  const session = lerSessao(key);
  if (!session?.access_token) return ANON; // não logado → anon
  return await resolverToken(session, key, portal);
}
