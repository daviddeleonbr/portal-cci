// CRUD de propostas comerciais + itens.

import { supabase } from '../lib/supabase';

export const STATUS = [
  { key: 'rascunho',   label: 'Rascunho',   cor: 'gray'    },
  { key: 'enviada',    label: 'Enviada',    cor: 'blue'    },
  { key: 'aceita',     label: 'Aceita',     cor: 'emerald' },
  { key: 'rejeitada',  label: 'Rejeitada',  cor: 'rose'    },
  { key: 'expirada',   label: 'Expirada',   cor: 'amber'   },
  { key: 'convertida', label: 'Convertida', cor: 'violet'  },
];

export const metaStatus = (key) => STATUS.find(s => s.key === key) || STATUS[0];

// ─── Cálculo de totais (chamado no front antes de salvar) ──────
export function calcularTotais(itens, descontoValor, descontoPercentual) {
  const subtotal = itens.reduce((s, i) =>
    s + (Number(i.quantidade || 0) * Number(i.valor_unitario || 0)), 0);
  const desconto = Number(descontoValor) > 0
    ? Number(descontoValor)
    : (subtotal * (Number(descontoPercentual) || 0) / 100);
  const total = Math.max(0, subtotal - desconto);
  return { subtotal, desconto, total };
}

// ─── Listagem ───────────────────────────────────────────────────
export async function listarPropostas({ status } = {}) {
  let q = supabase
    .from('cci_propostas')
    .select('*, cliente:clientes(id, nome, razao_social, cnpj)')
    .order('data_proposta', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function buscarProposta(id) {
  const { data: proposta, error } = await supabase
    .from('cci_propostas')
    .select('*, cliente:clientes(id, nome, razao_social, cnpj)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { data: itens, error: errItens } = await supabase
    .from('cci_proposta_itens')
    .select('*')
    .eq('proposta_id', id)
    .order('ordem');
  if (errItens) throw errItens;
  return { ...proposta, itens: itens || [] };
}

// ─── Salvar proposta + itens (transação manual em 2 etapas) ────
export async function salvarProposta(proposta, itens) {
  // `itens` e `cliente` vêm anexados quando a proposta é carregada (buscarProposta)
  // — não são colunas de cci_propostas, então precisam ficar fora do header.
  const { id, cliente, itens: _itensAnexados, created_at, updated_at, ...header } = proposta;

  // Recalcula totais a partir dos itens (não confia no que vem do front)
  const t = calcularTotais(itens, header.desconto_valor, header.desconto_percentual);
  header.valor_subtotal = t.subtotal;
  header.valor_total    = t.total;

  let propostaId = id;

  if (id) {
    const { error } = await supabase
      .from('cci_propostas')
      .update(header)
      .eq('id', id);
    if (error) throw error;
    // Estratégia simples pra MVP: apaga itens e recria.
    // Volume baixo, sem chave externa nos itens (futuro contrato pode
    // referenciar item — quando chegarmos lá, mudamos pra diff incremental).
    await supabase.from('cci_proposta_itens').delete().eq('proposta_id', id);
  } else {
    const { data, error } = await supabase
      .from('cci_propostas')
      .insert(header)
      .select('id')
      .single();
    if (error) throw error;
    propostaId = data.id;
  }

  if (itens.length > 0) {
    const linhas = itens.map((it, idx) => ({
      proposta_id:    propostaId,
      servico_id:     it.servico_id    || null,
      nome:           it.nome,
      descricao:      it.descricao     || null,
      categoria:      it.categoria     || null,
      periodicidade:  it.periodicidade || 'mensal',
      tipo_valor:     it.tipo_valor    || 'fixo',
      unidade:        it.unidade       || null,
      quantidade:     Number(it.quantidade)     || 1,
      valor_unitario: Number(it.valor_unitario) || 0,
      valor_total:    (Number(it.quantidade) || 1) * (Number(it.valor_unitario) || 0),
      ordem:          idx,
    }));
    const { error } = await supabase.from('cci_proposta_itens').insert(linhas);
    if (error) throw error;
  }

  return { id: propostaId };
}

export async function excluirProposta(id) {
  // Itens caem em cascade (FK on delete cascade)
  const { error } = await supabase.from('cci_propostas').delete().eq('id', id);
  if (error) throw error;
}

// ─── Transições de status ──────────────────────────────────────
export async function alterarStatus(id, novoStatus) {
  const update = { status: novoStatus };
  const agora = new Date().toISOString();
  if (novoStatus === 'enviada')    update.enviada_em    = agora;
  if (novoStatus === 'aceita')     update.aceita_em     = agora;
  if (novoStatus === 'rejeitada')  update.rejeitada_em  = agora;

  const { data, error } = await supabase
    .from('cci_propostas')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
