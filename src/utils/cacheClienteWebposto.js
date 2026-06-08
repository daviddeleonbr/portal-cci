// Cache localStorage por sessão pras páginas de cliente do Webposto.
//
// Estratégia stale-while-revalidate:
//   1) Componente monta → lê cache imediato → renderiza com dados antigos
//   2) Em paralelo, busca dados frescos da API (sem modal de carregamento)
//   3) Quando dados frescos chegam, atualiza tela e regrava cache
//
// O modal `ModalCarregando` só aparece se NÃO houver cache pra essa chave
// (primeiro acesso da sessão ou cache expirado).
//
// Key inclui chaveApiId + empresas + período + nome do dataset pra não
// vazar dados entre redes/períodos.

const PREFIX = 'webposto-cache-v1:';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h — sessão típica de uso

function montarChave({ nome, chaveApiId, empresasIds = [], extras = {} }) {
  const emps = [...empresasIds].map(String).sort().join(',');
  const extraStr = Object.keys(extras).sort().map(k => `${k}=${extras[k]}`).join('|');
  return `${PREFIX}${nome}:${chaveApiId || 'no-api'}:${emps}${extraStr ? '|' + extraStr : ''}`;
}

// Lê do cache. Retorna `null` se não houver entrada, ou se estiver
// expirada (e remove a entrada nesse caso).
export function lerCache({ nome, chaveApiId, empresasIds = [], extras = {} } = {}) {
  if (!nome || !chaveApiId) return null;
  try {
    const k = montarChave({ nome, chaveApiId, empresasIds, extras });
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const idadeMs = Date.now() - (obj.salvoEm || 0);
    if (idadeMs > TTL_MS) {
      localStorage.removeItem(k);
      return null;
    }
    return { dados: obj.dados, idadeMs, salvoEm: obj.salvoEm };
  } catch { return null; }
}

// Salva no cache (substitui se já existir). Erros silenciosos (quota cheia).
export function salvarCache({ nome, chaveApiId, empresasIds = [], extras = {}, dados } = {}) {
  if (!nome || !chaveApiId || dados === undefined) return;
  try {
    const k = montarChave({ nome, chaveApiId, empresasIds, extras });
    localStorage.setItem(k, JSON.stringify({ salvoEm: Date.now(), dados }));
  } catch { /* quota — ignora */ }
}

// Remove entrada específica.
export function limparCache({ nome, chaveApiId, empresasIds = [], extras = {} } = {}) {
  try {
    const k = montarChave({ nome, chaveApiId, empresasIds, extras });
    localStorage.removeItem(k);
  } catch { /* noop */ }
}

// Limpa TODAS as entradas do cache (ex: logout). Inclui o prefixo antigo.
export function limparTodoCacheClienteWebposto() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
}

// Retorna o conteúdo da entrada de cache MAIS RECENTE pra essa página,
// independente da chave exata (empresas/período). Útil pra hidratar
// state inicial SÍNCRONO no `useState` lazy initializer — assim os
// dados aparecem no PRIMEIRO render, sem esperar o useEffect rodar.
//
// Retorna `{ dados, salvoEm, idadeMs }` ou `null`.
export function lerCacheMaisRecenteDaPagina(nome) {
  if (!nome) return null;
  try {
    const prefixo = `${PREFIX}${nome}:`;
    let melhor = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefixo)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      const idadeMs = Date.now() - (obj.salvoEm || 0);
      if (idadeMs > TTL_MS) continue;
      if (!melhor || (obj.salvoEm || 0) > (melhor.salvoEm || 0)) {
        melhor = obj;
      }
    }
    if (!melhor) return null;
    return { dados: melhor.dados, salvoEm: melhor.salvoEm, idadeMs: Date.now() - melhor.salvoEm };
  } catch { return null; }
}

// Retorna true se EXISTE QUALQUER entrada de cache pra essa página
// (independente da chave exata bater). Usado pra suprimir modal de
// carregamento quando o usuário já visitou a página nessa sessão —
// mesmo se mudou empresas/período, queremos evitar piscar o modal.
export function temCacheDaPagina(nome) {
  if (!nome) return false;
  try {
    const prefixo = `${PREFIX}${nome}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefixo)) return true;
    }
    return false;
  } catch { return false; }
}

// ─── Marca de visita por página (sessionStorage) ────────────
//
// Independente do cache de DADOS. Serve apenas pra rastrear "essa página
// já foi carregada pelo menos uma vez nessa aba". Usado pra suprimir o
// modal de carregamento mesmo que o cache de dados tenha falhado em
// gravar (quota, serialize) ou que a chave não bata exatamente.
//
// sessionStorage limpa quando a aba fecha — então a 1ª visita em cada
// aba mostra o modal. Em navegações DENTRO da mesma aba (que é o caso
// reportado), o modal não aparece.

const PAGINA_VISITADA_KEY = 'webposto-paginas-visitadas-v1';

export function marcarPaginaVisitada(nome) {
  if (!nome) return;
  try {
    const raw = sessionStorage.getItem(PAGINA_VISITADA_KEY);
    const set = new Set(raw ? JSON.parse(raw) : []);
    set.add(nome);
    sessionStorage.setItem(PAGINA_VISITADA_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

export function paginaJaVisitada(nome) {
  if (!nome) return false;
  try {
    const raw = sessionStorage.getItem(PAGINA_VISITADA_KEY);
    if (!raw) return false;
    const set = new Set(JSON.parse(raw));
    return set.has(nome);
  } catch { return false; }
}
