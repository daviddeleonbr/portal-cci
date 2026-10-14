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

// Valor (e periodicidade) da proposta conforme o modelo: a CONSULTIVA guarda o
// valor em investimento_valor (valor_total = soma dos itens, que ela não tem).
export function valorDaProposta(proposta) {
  if (proposta?.modelo === 'consultiva') {
    return {
      valor: Number(proposta.investimento_valor) || 0,
      periodicidade: proposta.investimento_periodicidade || 'mensal',
    };
  }
  return { valor: Number(proposta?.valor_total) || 0, periodicidade: 'mensal' };
}

// Cria UM contrato a partir de uma proposta consolidada (sem separação).
export async function criarDeProposta(proposta) {
  const { valor, periodicidade } = valorDaProposta(proposta);
  // Consultiva não tem itens: o investimento vira o item do contrato.
  const itens = proposta.modelo === 'consultiva'
    ? (valor > 0 ? [{
        nome: proposta.titulo || 'Serviços de consultoria',
        descricao: proposta.descricao || null,
        periodicidade, tipo_valor: 'fixo', quantidade: 1,
        valor_unitario: valor, valor_total: valor,
      }] : [])
    : (proposta.itens || []);
  return criarContrato({
    proposta_id:  proposta.id || null,
    cliente_id:   proposta.cliente_id || null,
    cliente_nome: proposta.cliente_nome || proposta.cliente?.nome || 'Cliente',
    cliente_cnpj: proposta.cliente_cnpj || null,
    cliente_email: proposta.cliente_email || null,
    titulo:       String(proposta.titulo || 'Contrato').replace(/^\s*proposta\b/i, 'Contrato'),
    valor_total:  valor,
    observacoes:  proposta.observacoes || null,
    itens,
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

// Atualiza os serviços de um contrato RASCUNHO (quadro da cláusula "Dos
// Serviços Contratados"). Recalcula o valor total e as cláusulas de serviço
// (casadas pelo nome do serviço do catálogo).
export async function atualizarServicosContrato(id, itens) {
  const contrato = await buscarContrato(id);
  if (contrato.status !== 'rascunho') throw new Error('Só é possível alterar os serviços de um contrato em rascunho.');
  const limpos = (itens || []).map(it => {
    const fixo = (it.tipo_valor || 'fixo') === 'fixo';
    const qtd = fixo ? 1 : (Number(it.quantidade) || 1);
    const unit = Number(it.valor_unitario) || 0;
    return { ...it, quantidade: qtd, valor_unitario: unit, valor_total: Math.round(unit * qtd * 100) / 100 };
  });
  const clausulaIds = [];
  limpos.forEach(it => {
    const cid = idClausulaPorNome(it.nome);
    if (cid && !clausulaIds.includes(cid)) clausulaIds.push(cid);
  });
  const valor_total = Math.round(limpos.reduce((s, it) => s + it.valor_total, 0) * 100) / 100;
  const conteudo = { ...(contrato.conteudo || {}), itens: limpos, clausulaIds };
  const { error } = await supabase.from('cci_contratos').update({ conteudo, valor_total }).eq('id', id);
  if (error) throw error;
  return { ...contrato, conteudo, valor_total };
}

// Dados da CONTRATANTE informados no próprio contrato (rascunho): razão social,
// CNPJ, endereço e representante legal. Ficam em conteudo.contratante e têm
// prioridade sobre o cadastro do cliente na montagem do documento.
// `atualizarCliente`: grava também no cadastro do cliente vinculado.
export const CAMPOS_CONTRATANTE = [
  'razao_social', 'cnpj', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep',
  'representante_nome', 'representante_cpf', 'representante_cargo', 'representante_email',
];

export async function atualizarContratante(id, dados, { atualizarCliente = false } = {}) {
  const contrato = await buscarContrato(id);
  if (contrato.status !== 'rascunho') throw new Error('Só é possível alterar os dados de um contrato em rascunho.');
  const limpos = {};
  CAMPOS_CONTRATANTE.forEach(k => {
    const v = dados?.[k];
    limpos[k] = v == null ? null : (String(v).trim() || null);
  });
  if (limpos.estado) limpos.estado = limpos.estado.toUpperCase();

  const conteudo = { ...(contrato.conteudo || {}), contratante: limpos };
  const upd = { conteudo };
  if (limpos.cnpj) upd.cliente_cnpj = limpos.cnpj;
  const { error } = await supabase.from('cci_contratos').update(upd).eq('id', id);
  if (error) throw error;

  if (atualizarCliente && contrato.cliente_id) {
    const { error: e2 } = await supabase.from('clientes').update(limpos).eq('id', contrato.cliente_id);
    if (e2) throw new Error('Contrato salvo, mas falhou ao atualizar o cadastro do cliente: ' + e2.message);
  }
  return { ...contrato, ...upd };
}

// Tipo do contrato (natureza): 'bpo' | 'consultoria' — muda título, preâmbulo
// e a natureza na cláusula do objeto. Só em rascunho.
export async function atualizarTipoContrato(id, tipo) {
  const contrato = await buscarContrato(id);
  if (contrato.status !== 'rascunho') throw new Error('Só é possível alterar o tipo de um contrato em rascunho.');
  const conteudo = { ...(contrato.conteudo || {}), tipo_contrato: tipo || null };
  const { error } = await supabase.from('cci_contratos').update({ conteudo }).eq('id', id);
  if (error) throw error;
  return { ...contrato, conteudo };
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
