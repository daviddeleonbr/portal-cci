// CRUD do catálogo de serviços oferecidos pela CCI.
// Usado em /admin/contratos (aba "Serviços oferecidos") e — depois —
// pra alimentar a seleção de itens em Propostas e Contratos.

import { supabase } from '../lib/supabase';

export const CATEGORIAS = [
  { key: 'consultoria',  label: 'Consultoria',  cor: 'blue'    },
  { key: 'bpo',          label: 'BPO',          cor: 'emerald' },
  { key: 'fiscal',       label: 'Fiscal',       cor: 'amber'   },
  { key: 'tecnologia',   label: 'Tecnologia',   cor: 'violet'  },
  { key: 'treinamento',  label: 'Treinamento',  cor: 'rose'    },
  { key: 'outro',        label: 'Outro',        cor: 'gray'    },
];

export const PERIODICIDADES = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'anual',  label: 'Anual'  },
  { key: 'unico',  label: 'Único'  },
];

// Tipo de cobrança: fixo (valor total no período) vs unitário (valor por X).
// Ex: Consultoria mensal = fixo R$ 2.500/mês.
//     Notas fiscais     = unitário R$ 5/nota.
export const TIPOS_VALOR = [
  { key: 'fixo',     label: 'Valor fixo'  },
  { key: 'unitario', label: 'Por unidade' },
];

export const metaCategoria     = (key) => CATEGORIAS.find(c => c.key === key) || CATEGORIAS[CATEGORIAS.length - 1];
export const metaPeriodicidade = (key) => PERIODICIDADES.find(p => p.key === key) || PERIODICIDADES[0];
export const metaTipoValor     = (key) => TIPOS_VALOR.find(t => t.key === key) || TIPOS_VALOR[0];

// ─── CRUD ───────────────────────────────────────────────────────

export async function listarServicos({ apenasAtivos = false } = {}) {
  let q = supabase
    .from('cci_servicos_oferecidos')
    .select('*')
    .order('categoria')
    .order('nome');
  if (apenasAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function salvarServico(servico) {
  const { id, created_at, updated_at, ...payload } = servico;
  if (id) {
    const { data, error } = await supabase
      .from('cci_servicos_oferecidos')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('cci_servicos_oferecidos')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function alternarAtivo(id, ativo) {
  const { data, error } = await supabase
    .from('cci_servicos_oferecidos')
    .update({ ativo })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirServico(id) {
  const { error } = await supabase.from('cci_servicos_oferecidos').delete().eq('id', id);
  if (error) throw error;
}
