// Leitura PÚBLICA de uma proposta pelo token (página /proposta/:token).
// Usa a RPC SECURITY DEFINER `cci_proposta_publica` (migration 180), que
// devolve só campos não sensíveis. Sem login → client cai na ANON key.

import { supabase } from '../lib/supabase';

export async function obterPropostaPublica(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc('cci_proposta_publica', { p_token: token });
  if (error) throw error;
  return data || null; // { titulo, cliente_nome, ..., itens: [...] } ou null
}
