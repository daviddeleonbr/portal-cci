import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════
// Geracao de codigo hierarquico
// Padrao: 1.01.01.001.0001 (segmentos: 1, 2, 2, 3, 4 digitos)
// Root codigo vem do grupo contabil:
//   1=Ativo  2=Passivo  3=Patrimonio  4=Custo  5=Despesa  6=Receita
// ═══════════════════════════════════════════════════════════

export const GRUPO_PREFIX = {
  ativo: '1', passivo: '2', patrimonio: '3',
  custo: '4', despesa: '5', receita: '6',
};

// Formato do codigo: X.XX.XX.XXX.XXXX (sempre 5 segmentos, niveis nao usados = zeros)
const SEGMENT_SIZES = [1, 2, 2, 3, 4];

function zerosSegmento(idx) {
  return '0'.repeat(SEGMENT_SIZES[idx] || 4);
}

function depthDe(contas, conta) {
  let d = 1; // raiz = 1
  let cur = conta;
  while (cur?.parent_id) {
    d += 1;
    cur = contas.find(c => c.id === cur.parent_id);
    if (!cur) break;
  }
  return d;
}

export function proximoCodigoHierarquico(contas, grupo, parentId) {
  // Raiz: prefixo do grupo + zeros nos demais niveis
  if (!parentId) {
    const prefix = GRUPO_PREFIX[grupo];
    if (!prefix) return '';
    return [prefix, zerosSegmento(1), zerosSegmento(2), zerosSegmento(3), zerosSegmento(4)].join('.');
  }

  const parent = contas.find(c => c.id === parentId);
  if (!parent) return '';

  // Nivel do filho = profundidade do pai (0-indexado)
  const childSegIdx = depthDe(contas, parent);
  if (childSegIdx >= SEGMENT_SIZES.length) return ''; // profundidade maxima atingida

  // Parse dos segmentos do pai (normaliza para 5 segmentos)
  const parentSegs = String(parent.codigo || '').split('.');
  while (parentSegs.length < SEGMENT_SIZES.length) {
    parentSegs.push(zerosSegmento(parentSegs.length));
  }

  // Proximo numero entre os irmaos (considera apenas o segmento do nivel do filho)
  const siblings = contas.filter(c => c.parent_id === parentId);
  let max = 0;
  siblings.forEach(s => {
    const segs = String(s.codigo || '').split('.');
    const n = parseInt(segs[childSegIdx], 10);
    if (!isNaN(n) && n > max) max = n;
  });

  const segSize = SEGMENT_SIZES[childSegIdx];
  const novoSeg = String(max + 1).padStart(segSize, '0');

  // Constroi o novo codigo: copia segmentos do pai ate o nivel anterior, insere o novo, preenche com zeros depois
  const novosSegs = [];
  for (let i = 0; i < SEGMENT_SIZES.length; i++) {
    if (i < childSegIdx) novosSegs.push(parentSegs[i]);
    else if (i === childSegIdx) novosSegs.push(novoSeg);
    else novosSegs.push(zerosSegmento(i));
  }
  return novosSegs.join('.');
}

// ═══════════════════════════════════════════════════════════
// PLANO DE CONTAS (CCI)
// ═══════════════════════════════════════════════════════════

export async function listarPlanoContas() {
  const { data, error } = await supabase
    .from('cci_plano_contas')
    .select('*')
    .order('codigo', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listarPlanoContasAnaliticas(grupo) {
  let query = supabase
    .from('cci_plano_contas')
    .select('*')
    .eq('classificacao', 'A')
    .eq('ativo', true);
  if (grupo) query = query.eq('grupo', grupo);
  const { data, error } = await query.order('codigo', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criarContaPlano(conta) {
  const { data, error } = await supabase
    .from('cci_plano_contas')
    .insert({
      codigo: conta.codigo,
      nome: conta.nome,
      classificacao: conta.classificacao || 'A',
      natureza: conta.natureza || 'devedora',
      grupo: conta.grupo || 'despesa',
      parent_id: conta.parent_id || null,
      ativo: conta.ativo !== false,
      observacoes: conta.observacoes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarContaPlano(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  const { data, error } = await supabase
    .from('cci_plano_contas')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirContaPlano(id) {
  const { error } = await supabase.from('cci_plano_contas').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// FORNECEDORES (CCI)
// ═══════════════════════════════════════════════════════════

export async function listarFornecedores() {
  const { data, error } = await supabase
    .from('cci_fornecedores')
    .select('*')
    .order('nome', { ascending: true });
  if (error) throw error;
  return data;
}

export async function criarFornecedor(f) {
  const { data, error } = await supabase
    .from('cci_fornecedores')
    .insert({
      nome: f.nome,
      cpf_cnpj: f.cpf_cnpj || null,
      email: f.email || null,
      telefone: f.telefone || null,
      observacoes: f.observacoes || null,
      ativo: f.ativo !== false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarFornecedor(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  const { data, error } = await supabase
    .from('cci_fornecedores')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirFornecedor(id) {
  const { error } = await supabase.from('cci_fornecedores').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// CONTAS A PAGAR (CCI)
// ═══════════════════════════════════════════════════════════

export async function listarContasPagar({ status, dataInicial, dataFinal } = {}) {
  let query = supabase
    .from('cci_contas_pagar')
    .select('*, cci_fornecedores(id, nome, cpf_cnpj), cci_plano_contas(id, codigo, nome, natureza)')
    .order('vencimento', { ascending: true });
  if (status && status !== 'todos') query = query.eq('status', status);
  if (dataInicial) query = query.gte('vencimento', dataInicial);
  if (dataFinal) query = query.lte('vencimento', dataFinal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function criarContaPagar(conta) {
  const { data, error } = await supabase
    .from('cci_contas_pagar')
    .insert({
      fornecedor_id: conta.fornecedor_id || null,
      plano_conta_id: conta.plano_conta_id || null,
      motivo_lancamento_id: conta.motivo_lancamento_id || null,
      descricao: conta.descricao,
      numero_documento: conta.numero_documento || null,
      data_emissao: conta.data_emissao || null,
      vencimento: conta.vencimento,
      valor: Number(conta.valor),
      parcela: conta.parcela || 1,
      quantidade_parcelas: conta.quantidade_parcelas || 1,
      observacoes: conta.observacoes || null,
      status: 'aberto',
    })
    .select()
    .single();
  if (error) throw error;

  // Se tem motivo_lancamento, gerar partida dobrada da provisao
  if (conta.motivo_lancamento_id) {
    await gerarLancamentoDoMotivo(conta.motivo_lancamento_id, {
      data_competencia: conta.data_emissao || conta.vencimento,
      valor: Number(conta.valor),
      historico: `Provisao: ${conta.descricao}`,
      origem_tipo: 'conta_pagar',
      origem_id: data.id,
    });
  }
  return data;
}

// Helper: busca motivo e gera lancamento contabil com seu par debito/credito
async function gerarLancamentoDoMotivo(motivoId, { data_competencia, valor, historico, origem_tipo, origem_id }) {
  const { data: motivo, error: err } = await supabase
    .from('cci_motivos_movimentacao')
    .select('conta_debito_id, conta_credito_id')
    .eq('id', motivoId)
    .single();
  if (err) throw err;
  if (!motivo?.conta_debito_id || !motivo?.conta_credito_id) {
    throw new Error('Motivo nao tem contas de debito/credito configuradas');
  }
  await criarLancamentoContabil({
    data_competencia,
    motivo_id: motivoId,
    conta_debito_id: motivo.conta_debito_id,
    conta_credito_id: motivo.conta_credito_id,
    valor,
    historico,
    origem_tipo,
    origem_id,
  });
}

// Cria varias parcelas em sequencia mensal + partidas dobradas
export async function criarContasPagarParcelado(base, quantidade) {
  const linhas = [];
  const primeiraData = new Date(base.vencimento + 'T00:00:00');
  for (let i = 0; i < quantidade; i++) {
    const venc = new Date(primeiraData);
    venc.setMonth(venc.getMonth() + i);
    const yyyy = venc.getFullYear();
    const mm = String(venc.getMonth() + 1).padStart(2, '0');
    const dd = String(venc.getDate()).padStart(2, '0');
    linhas.push({
      fornecedor_id: base.fornecedor_id || null,
      plano_conta_id: base.plano_conta_id || null,
      motivo_lancamento_id: base.motivo_lancamento_id || null,
      descricao: base.descricao,
      numero_documento: base.numero_documento || null,
      data_emissao: base.data_emissao || null,
      vencimento: `${yyyy}-${mm}-${dd}`,
      valor: Number(base.valor),
      parcela: i + 1,
      quantidade_parcelas: quantidade,
      observacoes: base.observacoes || null,
      status: 'aberto',
    });
  }
  const { data, error } = await supabase.from('cci_contas_pagar').insert(linhas).select();
  if (error) throw error;

  // Gerar lancamento contabil para cada parcela
  if (base.motivo_lancamento_id && data) {
    for (const conta of data) {
      await gerarLancamentoDoMotivo(base.motivo_lancamento_id, {
        data_competencia: conta.data_emissao || conta.vencimento,
        valor: Number(conta.valor),
        historico: `Provisao: ${conta.descricao} (${conta.parcela}/${conta.quantidade_parcelas})`,
        origem_tipo: 'conta_pagar',
        origem_id: conta.id,
      });
    }
  }
  return data;
}

export async function atualizarContaPagar(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.cci_fornecedores;
  delete payload.cci_plano_contas;
  const { data, error } = await supabase
    .from('cci_contas_pagar')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function marcarComoPaga(id, { data_pagamento, valor_pago, juros, desconto, forma_pagamento, motivo_pagamento_id }) {
  const updateData = {
    status: 'pago',
    data_pagamento: data_pagamento || new Date().toISOString().split('T')[0],
    valor_pago: Number(valor_pago) || null,
    juros: Number(juros) || 0,
    desconto: Number(desconto) || 0,
    forma_pagamento: forma_pagamento || null,
  };
  if (motivo_pagamento_id) updateData.motivo_pagamento_id = motivo_pagamento_id;

  const { data, error } = await supabase
    .from('cci_contas_pagar')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Gerar lancamento contabil do pagamento
  if (motivo_pagamento_id) {
    await gerarLancamentoDoMotivo(motivo_pagamento_id, {
      data_competencia: updateData.data_pagamento,
      valor: Number(valor_pago) || Number(data.valor),
      historico: `Pagamento: ${data.descricao}`,
      origem_tipo: 'pagamento',
      origem_id: data.id,
    });
  }
  return data;
}

export async function cancelarContaPagar(id) {
  const { data, error } = await supabase
    .from('cci_contas_pagar')
    .update({ status: 'cancelado' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirContaPagar(id) {
  const { error } = await supabase.from('cci_contas_pagar').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// MOTIVOS DE MOVIMENTACAO (CCI)
// ═══════════════════════════════════════════════════════════

export async function listarMotivos(tipoOperacao) {
  let query = supabase
    .from('cci_motivos_movimentacao')
    .select('*, conta_debito:conta_debito_id(id, codigo, nome, natureza, grupo), conta_credito:conta_credito_id(id, codigo, nome, natureza, grupo)')
    .order('codigo', { ascending: true });
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function criarMotivo(m) {
  const { data, error } = await supabase
    .from('cci_motivos_movimentacao')
    .insert({
      codigo: m.codigo,
      nome: m.nome,
      descricao: m.descricao || null,
      tipo_operacao: m.tipo_operacao || 'outro',
      conta_debito_id: m.conta_debito_id || null,
      conta_credito_id: m.conta_credito_id || null,
      ativo: m.ativo !== false,
      observacoes: m.observacoes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarMotivo(id, campos) {
  const payload = { ...campos };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.conta_debito;
  delete payload.conta_credito;
  const { data, error } = await supabase
    .from('cci_motivos_movimentacao')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirMotivo(id) {
  const { error } = await supabase.from('cci_motivos_movimentacao').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════
// LANCAMENTOS CONTABEIS (partidas dobradas)
// ═══════════════════════════════════════════════════════════

export async function listarLancamentosContabeis({ dataInicial, dataFinal, origemTipo, origemId } = {}) {
  let query = supabase
    .from('cci_lancamentos_contabeis')
    .select('*, motivo:motivo_id(id, codigo, nome), debito:conta_debito_id(id, codigo, nome), credito:conta_credito_id(id, codigo, nome)')
    .order('data_competencia', { ascending: false });
  if (dataInicial) query = query.gte('data_competencia', dataInicial);
  if (dataFinal) query = query.lte('data_competencia', dataFinal);
  if (origemTipo) query = query.eq('origem_tipo', origemTipo);
  if (origemId) query = query.eq('origem_id', origemId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function criarLancamentoContabil(l) {
  const { data, error } = await supabase
    .from('cci_lancamentos_contabeis')
    .insert({
      data_competencia: l.data_competencia,
      motivo_id: l.motivo_id || null,
      conta_debito_id: l.conta_debito_id,
      conta_credito_id: l.conta_credito_id,
      valor: Number(l.valor),
      historico: l.historico,
      origem_tipo: l.origem_tipo || 'manual',
      origem_id: l.origem_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function excluirLancamentosPorOrigem(origemTipo, origemId) {
  const { error } = await supabase
    .from('cci_lancamentos_contabeis')
    .delete()
    .eq('origem_tipo', origemTipo)
    .eq('origem_id', origemId);
  if (error) throw error;
}
