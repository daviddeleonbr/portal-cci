import { supabase } from '../lib/supabase';

// CRUD do singleton `configuracoes_ia`. Compartilhado entre admin (UI de
// edição) e clientes (leitura para usar a Análise IA).

const DEFAULTS = {
  id: 1,
  api_key: '',
  modelo: 'claude-opus-4-7',
  max_tokens: 20000,
  adaptive_thinking: true,
  ativo: true,
};

export async function obterConfiguracaoIa() {
  const { data, error } = await supabase
    .from('configuracoes_ia')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error('Falha ao carregar configurações de IA: ' + error.message);
  return { ...DEFAULTS, ...(data || {}) };
}

export async function salvarConfiguracaoIa(campos, atualizadoPor = null) {
  const payload = {
    id: 1,
    api_key:           campos.api_key ?? null,
    modelo:            campos.modelo || DEFAULTS.modelo,
    max_tokens:        Number.isFinite(Number(campos.max_tokens)) ? Number(campos.max_tokens) : DEFAULTS.max_tokens,
    adaptive_thinking: !!campos.adaptive_thinking,
    ativo:             campos.ativo !== false,
    atualizado_em:     new Date().toISOString(),
    atualizado_por:    atualizadoPor,
  };
  const { data, error } = await supabase
    .from('configuracoes_ia')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error('Falha ao salvar configurações de IA: ' + error.message);
  return { ...DEFAULTS, ...data };
}
