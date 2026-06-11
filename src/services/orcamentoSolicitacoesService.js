// CRUD de solicitações de orçamento (landing page → admin).
//
// Estrutura por POSTO (cliente pode ter N postos):
//   postos: [{
//     nome, litrosMes, faturamentoMes, contasBancarias,
//     possuiCartaoFrota, cartoesFrota, adquirentes,
//     funcionarios, custoMedioFuncionario
//   }]

import { supabase } from '../lib/supabase';

export const STATUS_OPCOES = [
  { key: 'nova',             label: 'Nova',             cor: 'blue'    },
  { key: 'em_analise',       label: 'Em análise',       cor: 'amber'   },
  { key: 'proposta_enviada', label: 'Proposta enviada', cor: 'violet'  },
  { key: 'aceita',           label: 'Aceita',           cor: 'emerald' },
  { key: 'recusada',         label: 'Recusada',         cor: 'rose'    },
  { key: 'arquivada',        label: 'Arquivada',        cor: 'gray'    },
];

export function empresaNova() {
  return {
    nome: '',
    litrosMes: '',
    faturamentoMes: '',
    contasBancarias: '',
    possuiCartaoFrota: false,
    cartoesFrota: '',
    adquirentes: '',
    funcionarios: '',
    custoMedioFuncionario: '',
    possuiConveniencia: false,
    faturamentoConveniencia: '',
  };
}

// alias legado
export const postoNovo = empresaNova;

// ─── CRUD ──────────────────────────────────────────────────────

export async function criarSolicitacao(payload) {
  const { data, error } = await supabase
    .from('cci_orcamento_solicitacoes')
    .insert({
      nome:       payload.nome,
      whatsapp:   payload.whatsapp,
      email:      payload.email,
      desejo:     payload.desejo || null,
      postos:     payload.postos || [],
      status:     'nova',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarSolicitacoes({ status = null } = {}) {
  let q = supabase
    .from('cci_orcamento_solicitacoes')
    .select('*')
    .order('criada_em', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function obterSolicitacao(id) {
  const { data, error } = await supabase
    .from('cci_orcamento_solicitacoes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarSolicitacao(id, payload) {
  const update = {};
  if (payload.status !== undefined)            update.status = payload.status;
  if (payload.observacoesAdmin !== undefined)  update.observacoes_admin = payload.observacoesAdmin;
  const { data, error } = await supabase
    .from('cci_orcamento_solicitacoes')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirSolicitacao(id) {
  const { error } = await supabase
    .from('cci_orcamento_solicitacoes')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
