// Cache das análises de IA + notas explicativas do consultor.
// Uma linha por (escopo, aba, ano, mes) na tabela analise_ia_relatorios:
//  - guarda o resultado da IA (insights+dados+usage) pra reabrir sem gastar
//    tokens de novo;
//  - guarda a nota livre do consultor que entra no PDF.
// Ver migration 165. Os upserts sao "parciais": salvarResultadoIa nao toca na
// nota e salvarNota nao toca no resultado (ON CONFLICT DO UPDATE so mexe nas
// colunas enviadas).

import { supabase } from '../lib/supabase';
import { getAdminSession } from '../lib/auth';

const TABELA = 'analise_ia_relatorios';
const CONFLITO = 'escopo,aba,ano,mes';

// Escopo estavel (nunca nulo) — identifica o alvo do relatorio.
export function montarEscopo({ tipo, clienteId, chaveApiId, asRedeId }) {
  if (tipo === 'empresa' && clienteId) return `cli:${clienteId}`;
  if (tipo === 'rede' && chaveApiId) return `wp:${chaveApiId}`;
  if (tipo === 'rede-as' && asRedeId) return `as:${asRedeId}`;
  return null;
}

function usuarioId() {
  return getAdminSession()?.usuario?.id || null;
}

// Carrega todas as abas de um periodo. Retorna { [aba]: linha } — cada linha
// tem { insights, dados, usage, gerado_em, gerado_por, nota, nota_atualizada_em }.
export async function carregarRelatorios({ escopo, ano, mes }) {
  if (!escopo) return {};
  const { data, error } = await supabase
    .from(TABELA)
    .select('aba, insights, dados, usage, gerado_em, gerado_por, nota, nota_atualizada_em, notas_itens')
    .eq('escopo', escopo)
    .eq('ano', ano)
    .eq('mes', mes);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => { map[r.aba] = r; });
  return map;
}

// Salva/atualiza o RESULTADO da IA (preserva a nota existente).
export async function salvarResultadoIa({ escopo, aba, ano, mes, chaveApiId, asRedeId, clienteId, insights, dados, usage }) {
  if (!escopo) return;
  const row = {
    escopo, aba, ano, mes,
    chave_api_id: chaveApiId || null,
    as_rede_id: asRedeId || null,
    cliente_id: clienteId || null,
    insights: insights ?? null,
    dados: dados ?? null,
    usage: usage ?? null,
    gerado_em: new Date().toISOString(),
    gerado_por: usuarioId(),
  };
  const { error } = await supabase.from(TABELA).upsert(row, { onConflict: CONFLITO });
  if (error) throw error;
}

// Salva/atualiza SO a nota geral (preserva o resultado da IA existente).
export async function salvarNota({ escopo, aba, ano, mes, chaveApiId, asRedeId, clienteId, texto }) {
  if (!escopo) return;
  const row = {
    escopo, aba, ano, mes,
    chave_api_id: chaveApiId || null,
    as_rede_id: asRedeId || null,
    cliente_id: clienteId || null,
    nota: texto || '',
    nota_atualizada_em: new Date().toISOString(),
    nota_por: usuarioId(),
  };
  const { error } = await supabase.from(TABELA).upsert(row, { onConflict: CONFLITO });
  if (error) throw error;
}

// Salva/atualiza o MAPA de notas por item ({ chave: texto }) — preserva o
// resultado da IA e a nota geral. Grava o mapa inteiro da aba de uma vez.
export async function salvarNotasItens({ escopo, aba, ano, mes, chaveApiId, asRedeId, clienteId, notasItens }) {
  if (!escopo) return;
  const row = {
    escopo, aba, ano, mes,
    chave_api_id: chaveApiId || null,
    as_rede_id: asRedeId || null,
    cliente_id: clienteId || null,
    notas_itens: notasItens || {},
  };
  const { error } = await supabase.from(TABELA).upsert(row, { onConflict: CONFLITO });
  if (error) throw error;
}
