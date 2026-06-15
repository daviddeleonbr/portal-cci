// CRUD de pedidos de compra (cliente).
//
// Fluxo:
//   rascunho → aguardando_liberacao → liberado_parcial / liberado_total
//                                  → recusado
//                                  → concluido (futuro)

import { supabase } from '../lib/supabase';

export const STATUS = [
  { key: 'rascunho',             label: 'Rascunho',             cor: 'gray'    },
  { key: 'aguardando_liberacao', label: 'Aguardando liberação', cor: 'amber'   },
  { key: 'liberado_parcial',     label: 'Liberado parcial',     cor: 'blue'    },
  { key: 'liberado_total',       label: 'Liberado total',       cor: 'emerald' },
  { key: 'recusado',             label: 'Recusado',             cor: 'rose'    },
  { key: 'concluido',            label: 'Concluído',            cor: 'violet'  },
];

export const STATUS_ITEM = [
  { key: 'pendente', label: 'Pendente', cor: 'amber'   },
  { key: 'liberado', label: 'Liberado', cor: 'emerald' },
  { key: 'recusado', label: 'Recusado', cor: 'rose'    },
];

// ─── CRUD PEDIDO ───────────────────────────────────────────────

export async function criarPedido(payload) {
  const { data, error } = await supabase
    .from('cci_pedidos_compra')
    .insert({
      chave_api_id:   payload.chaveApiId || null,
      cliente_id:     payload.clienteId || null,
      empresa_codigo: payload.empresaCodigo || null,
      fornecedor:     payload.fornecedor || null,
      observacoes:    payload.observacoes || null,
      criado_por:     payload.criadoPor || null,
      status:         'rascunho',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarPedido(id, payload) {
  const update = {};
  if (payload.fornecedor   !== undefined) update.fornecedor   = payload.fornecedor;
  if (payload.observacoes  !== undefined) update.observacoes  = payload.observacoes;
  if (payload.empresaCodigo !== undefined) update.empresa_codigo = payload.empresaCodigo;
  if (payload.clienteId    !== undefined) update.cliente_id   = payload.clienteId;
  if (payload.status       !== undefined) update.status       = payload.status;
  const { data, error } = await supabase
    .from('cci_pedidos_compra')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirPedido(id) {
  const { error } = await supabase
    .from('cci_pedidos_compra')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function listarPedidos({ chaveApiId = null, status = null, clienteId = null } = {}) {
  let q = supabase
    .from('cci_pedidos_compra')
    .select('*')
    .order('criado_em', { ascending: false });
  if (chaveApiId) q = q.eq('chave_api_id', chaveApiId);
  if (status)     q = q.eq('status', status);
  if (clienteId)  q = q.eq('cliente_id', clienteId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function obterPedido(id) {
  const [{ data: pedido, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
    supabase.from('cci_pedidos_compra').select('*').eq('id', id).single(),
    supabase.from('cci_pedidos_compra_item').select('*').eq('pedido_id', id).order('produto_nome', { ascending: true }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { ...pedido, itens: itens || [] };
}

// ─── ITENS ─────────────────────────────────────────────────────

export async function adicionarItem(pedidoId, item) {
  const { data, error } = await supabase
    .from('cci_pedidos_compra_item')
    .insert({
      pedido_id:             pedidoId,
      produto_codigo:        String(item.produtoCodigo),
      produto_nome:          item.produtoNome || null,
      grupo:                 item.grupo || null,
      subgrupo:              item.subgrupo || null,
      quantidade_solicitada: Number(item.quantidadeSolicitada) || 0,
      custo_unitario:        Number(item.custoUnitario) || 0,
      preco_unitario:        Number(item.precoUnitario) || 0,
      estoque_atual:         item.estoqueAtual ?? null,
      status_estoque:        item.statusEstoque || null,
      cobertura_dias:        item.coberturaDias ?? null,
      observacao_solicitante: item.observacaoSolicitante || null,
      status:                'pendente',
    })
    .select()
    .single();
  if (error) throw error;
  await recalcularTotais(pedidoId);
  return data;
}

export async function atualizarItem(itemId, payload) {
  const update = {};
  if (payload.quantidadeSolicitada !== undefined) update.quantidade_solicitada = Number(payload.quantidadeSolicitada);
  if (payload.quantidadeLiberada   !== undefined) update.quantidade_liberada   = Number(payload.quantidadeLiberada);
  if (payload.custoUnitario        !== undefined) update.custo_unitario        = Number(payload.custoUnitario);
  if (payload.precoUnitario        !== undefined) update.preco_unitario        = Number(payload.precoUnitario);
  if (payload.status               !== undefined) update.status                = payload.status;
  if (payload.observacaoSolicitante !== undefined) update.observacao_solicitante = payload.observacaoSolicitante;
  if (payload.observacaoLiberador   !== undefined) update.observacao_liberador   = payload.observacaoLiberador;
  const { data, error } = await supabase
    .from('cci_pedidos_compra_item')
    .update(update)
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw error;
  if (data?.pedido_id) await recalcularTotais(data.pedido_id);
  return data;
}

export async function removerItem(itemId) {
  // Pega o pedido pra recalcular após excluir
  const { data: item } = await supabase
    .from('cci_pedidos_compra_item')
    .select('pedido_id')
    .eq('id', itemId)
    .single();
  const { error } = await supabase
    .from('cci_pedidos_compra_item')
    .delete()
    .eq('id', itemId);
  if (error) throw error;
  if (item?.pedido_id) await recalcularTotais(item.pedido_id);
}

// ─── AÇÕES DE FUNIL ────────────────────────────────────────────

export async function enviarParaLiberacao(pedidoId) {
  // Verifica se tem ao menos 1 item
  const { count } = await supabase
    .from('cci_pedidos_compra_item')
    .select('*', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId);
  if (!count) throw new Error('Adicione ao menos 1 item antes de enviar.');
  const { data, error } = await supabase
    .from('cci_pedidos_compra')
    .update({ status: 'aguardando_liberacao', enviado_em: new Date().toISOString() })
    .eq('id', pedidoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Libera os itens marcados (full ou partial). `itensLiberacao` =
// [{ itemId, quantidadeLiberada, status }]
export async function liberarPedido(pedidoId, { itensLiberacao, liberadoPor, observacao }) {
  // Atualiza cada item
  for (const i of itensLiberacao) {
    await supabase.from('cci_pedidos_compra_item')
      .update({
        quantidade_liberada:  Number(i.quantidadeLiberada) || 0,
        status:               i.status || 'pendente',
        observacao_liberador: i.observacao || null,
      })
      .eq('id', i.itemId);
  }
  // Decide status do pedido
  const { data: itens } = await supabase
    .from('cci_pedidos_compra_item')
    .select('status, quantidade_solicitada, quantidade_liberada')
    .eq('pedido_id', pedidoId);
  const todos = itens || [];
  const totalLiberadosCompletos = todos.filter(i =>
    i.status === 'liberado' && Number(i.quantidade_liberada) >= Number(i.quantidade_solicitada)
  ).length;
  const totalRecusados = todos.filter(i => i.status === 'recusado').length;
  let statusPedido = 'liberado_parcial';
  if (totalRecusados === todos.length) statusPedido = 'recusado';
  else if (totalLiberadosCompletos === todos.length) statusPedido = 'liberado_total';

  const { data, error } = await supabase
    .from('cci_pedidos_compra')
    .update({
      status:        statusPedido,
      liberado_em:   new Date().toISOString(),
      liberado_por:  liberadoPor || null,
      observacoes:   observacao || undefined,
    })
    .eq('id', pedidoId)
    .select()
    .single();
  if (error) throw error;
  await recalcularTotais(pedidoId);
  return data;
}

// ─── HELPERS ───────────────────────────────────────────────────

async function recalcularTotais(pedidoId) {
  const { data: itens } = await supabase
    .from('cci_pedidos_compra_item')
    .select('quantidade_solicitada, quantidade_liberada, custo_unitario')
    .eq('pedido_id', pedidoId);
  let totalSolicitado = 0, totalLiberado = 0;
  (itens || []).forEach(i => {
    const custo = Number(i.custo_unitario) || 0;
    totalSolicitado += custo * (Number(i.quantidade_solicitada) || 0);
    totalLiberado   += custo * (Number(i.quantidade_liberada)   || 0);
  });
  await supabase.from('cci_pedidos_compra')
    .update({
      total_solicitado: Math.round(totalSolicitado * 100) / 100,
      total_liberado:   Math.round(totalLiberado * 100) / 100,
    })
    .eq('id', pedidoId);
}
