// CRUD de contratos + conversão de proposta em contrato (rascunho).

import { supabase } from '../lib/supabase';
import { idClausulaPorNome } from '../data/clausulasContrato';

export const STATUS_CONTRATO = [
  { key: 'rascunho',  label: 'Rascunho',              cor: 'gray'    },
  { key: 'enviado',   label: 'Enviado p/ assinatura', cor: 'blue'    },
  { key: 'assinado',  label: 'Assinado',              cor: 'emerald' },
  { key: 'ativo',     label: 'Ativo',                 cor: 'violet'  },
  { key: 'cancelado', label: 'Cancelado',             cor: 'rose'    },
];

export const metaStatusContrato = (key) =>
  STATUS_CONTRATO.find(s => s.key === key) || STATUS_CONTRATO[0];

export async function listarContratos({ status } = {}) {
  let q = supabase.from('cci_contratos').select('*').order('created_at', { ascending: false });
  if (Array.isArray(status)) q = q.in('status', status);
  else if (status)           q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function buscarContrato(id) {
  const { data, error } = await supabase.from('cci_contratos').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Cria um contrato RASCUNHO (baixo nível). Anexa as cláusulas de serviço
// correspondentes aos itens (por nome).
export async function criarContrato({
  proposta_id = null, cliente_id = null, cliente_nome, cliente_cnpj = null,
  cliente_email = null, titulo, valor_total = 0, observacoes = null, itens = [],
}) {
  const clausulaIds = [];
  for (const it of itens) {
    const cid = idClausulaPorNome(it.nome);
    if (cid && !clausulaIds.includes(cid)) clausulaIds.push(cid);
  }
  const payload = {
    proposta_id, cliente_id, cliente_nome: cliente_nome || 'Cliente', cliente_cnpj, cliente_email,
    titulo: titulo || 'Contrato', valor_total, observacoes, status: 'rascunho',
    conteudo: { itens, clausulaIds, geradoEm: new Date().toISOString() },
  };
  const { data, error } = await supabase.from('cci_contratos').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

// Cria UM contrato a partir de uma proposta consolidada (sem separação).
export async function criarDeProposta(proposta) {
  return criarContrato({
    proposta_id:  proposta.id || null,
    cliente_id:   proposta.cliente_id || null,
    cliente_nome: proposta.cliente_nome || proposta.cliente?.nome || 'Cliente',
    cliente_cnpj: proposta.cliente_cnpj || null,
    cliente_email: proposta.cliente_email || null,
    titulo:       String(proposta.titulo || 'Contrato').replace(/^\s*proposta\b/i, 'Contrato'),
    valor_total:  proposta.valor_total || 0,
    observacoes:  proposta.observacoes || null,
    itens:        proposta.itens || [],
  });
}

// Cria UM contrato para uma empresa específica de uma proposta de rede.
export async function criarDeEmpresa(proposta, empresa) {
  const base = String(proposta.titulo || 'Contrato').replace(/^\s*proposta\b/i, 'Contrato').replace(/—\s*rede\b.*/i, '').trim();
  return criarContrato({
    proposta_id:  proposta.id || null,
    cliente_id:   empresa.cliente_id || null,
    cliente_nome: empresa.nome || 'Cliente',
    cliente_cnpj: empresa.cnpj || null,
    titulo:       `${base} — ${empresa.nome}`,
    valor_total:  empresa.total || 0,
    observacoes:  proposta.observacoes || null,
    itens:        empresa.itens || [],
  });
}

export async function alterarStatus(id, novoStatus) {
  const update = { status: novoStatus };
  const agora = new Date().toISOString();
  if (novoStatus === 'enviado')  update.enviado_em  = agora;
  if (novoStatus === 'assinado') update.assinado_em = agora;
  const { data, error } = await supabase
    .from('cci_contratos').update(update).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function excluirContrato(id) {
  const { error } = await supabase.from('cci_contratos').delete().eq('id', id);
  if (error) throw error;
}
