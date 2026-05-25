import { supabase } from '../lib/supabase';

// Lista todas as correlações OFX↔Sistema de uma conta bancária.
// Retorna array com cada correlação contendo seus itens dos dois lados.
export async function listarCorrelacoes(clienteId, contaCodigo) {
  if (!clienteId || contaCodigo == null) return [];
  const { data, error } = await supabase.rpc('ofx_correlacoes_listar', {
    p_cliente_id: clienteId,
    p_conta_codigo: Number(contaCodigo),
  });
  if (error) throw new Error('Falha ao listar correlações: ' + error.message);
  return Array.isArray(data) ? data : [];
}

// Cria uma nova correlação atomicamente. Snapshots dos dois lados são salvos
// (valor/data/descrição) para permitir detectar alterações posteriores.
export async function criarCorrelacao({
  chaveApiId, clienteId, contaCodigo, tipo, valorTotal,
  label, observacao, criadoPor,
  itensOfx, itensSistema,
}) {
  if (!chaveApiId)     throw new Error('chave_api_id e obrigatorio');
  if (!clienteId)      throw new Error('cliente_id e obrigatorio');
  if (contaCodigo == null) throw new Error('conta_codigo e obrigatorio');
  if (tipo !== 'credito' && tipo !== 'debito') {
    throw new Error('tipo deve ser credito ou debito');
  }
  if (!Array.isArray(itensOfx) || !Array.isArray(itensSistema)) {
    throw new Error('itens devem ser arrays');
  }
  if (itensOfx.length === 0 && itensSistema.length === 0) {
    throw new Error('Inclua ao menos um item em cada lado');
  }

  const payloadOfx = itensOfx.map(i => ({
    fitid:     i.fitid || null,
    valor:     Number(i.valor || 0),
    data:      i.data,
    tipo:      i.tipo,
    descricao: i.descricao || '',
  }));
  const payloadSis = itensSistema.map(i => ({
    movimento_codigo: i.movimento_codigo != null ? Number(i.movimento_codigo) : null,
    valor:            Number(i.valor || 0),
    data:             i.data,
    tipo:             i.tipo,
    descricao:        i.descricao || '',
    documento:        i.documento || '',
  }));

  const { data, error } = await supabase.rpc('ofx_correlacao_criar', {
    p_chave_api_id:  chaveApiId,
    p_cliente_id:    clienteId,
    p_conta_codigo:  Number(contaCodigo),
    p_tipo:          tipo,
    p_valor_total:   Number(valorTotal || 0),
    p_label:         label || null,
    p_observacao:    observacao || null,
    p_criado_por:    criadoPor || null,
    p_itens_ofx:     payloadOfx,
    p_itens_sistema: payloadSis,
  });
  if (error) throw new Error('Falha ao salvar correlação: ' + error.message);
  return data; // uuid da nova correlação
}

export async function excluirCorrelacao(id) {
  if (!id) throw new Error('id e obrigatorio');
  const { error } = await supabase.rpc('ofx_correlacao_excluir', { p_id: id });
  if (error) throw new Error('Falha ao excluir correlação: ' + error.message);
}
