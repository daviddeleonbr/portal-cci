// Chave da API Webposto (Quality) da rede, lida do banco (chaves_api, RLS por
// tenant) — NÃO vem mais na sessão: o auth-login deixou de devolvê-la. Cache em
// memória por id (a chave não muda durante o uso). null enquanto carrega.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const cache = new Map(); // chaveApiId → Promise<string|null>

export function buscarChaveApi(chaveApiId) {
  if (!chaveApiId) return Promise.resolve(null);
  if (!cache.has(chaveApiId)) {
    cache.set(chaveApiId, supabase.from('chaves_api').select('chave').eq('id', chaveApiId).maybeSingle()
      .then(({ data, error }) => { if (error) throw error; return data?.chave || null; })
      .catch((e) => { cache.delete(chaveApiId); throw e; }));
  }
  return cache.get(chaveApiId);
}

export function useChaveApi(chaveApiId) {
  // guarda de qual rede é a chave: trocar de rede não mostra a chave antiga
  const [estado, setEstado] = useState({ id: null, chave: null });
  useEffect(() => {
    if (!chaveApiId) return undefined;
    let vivo = true;
    buscarChaveApi(chaveApiId)
      .then(c => { if (vivo) setEstado({ id: chaveApiId, chave: c }); })
      .catch(() => { if (vivo) setEstado({ id: chaveApiId, chave: null }); });
    return () => { vivo = false; };
  }, [chaveApiId]);
  return estado.id === chaveApiId ? estado.chave : null;
}
