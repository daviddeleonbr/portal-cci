import { createClient } from '@supabase/supabase-js';
import { getAccessTokenAtivo } from './authToken';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

// `accessToken` (supabase-js v2) injeta o JWT da sessão ativa em cada
// request e desliga o GoTrue interno — usamos auth custom (Edge Function
// auth-login + JWT próprio). Sem sessão, getAccessTokenAtivo devolve a ANON
// key, mantendo o comportamento anon de hoje. Ver lib/authToken.js.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    accessToken: async () => {
      try {
        return await getAccessTokenAtivo();
      } catch {
        return supabaseAnonKey || 'placeholder-key';
      }
    },
  }
);
