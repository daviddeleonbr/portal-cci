import { supabase } from '../lib/supabase';

// Verifica se ja existe fechamento para aquele cliente+data
export async function buscarFechamento(clienteId, data) {
  if (!clienteId || !data) return null;
  const { data: row, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('data', data)
    .maybeSingle();
  if (error) throw error;
  return row;
}

// Lista historico de fechamentos de um cliente (ordem desc)
export async function listarHistorico(clienteId, { limite = 60 } = {}) {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .select('id, data, total_apurado, total_apresentado, total_diferenca, confirmado_em, confirmado_por, registros')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

// `retiradas`: [{ descricao, valor, arquivo: File }] — os arquivos sobem antes
// do insert; valor a depositar = total apresentado − retiradas.
export async function salvarFechamento({ cliente_id, empresa_codigo, data, registros, confirmado_por, observacoes, retiradas = [] }) {
  const total_apurado = registros.reduce((s, r) => s + Number(r.dinheiroApurado || 0), 0);
  const total_apresentado = registros.reduce((s, r) => s + Number(r.dinheiroApresentado || 0), 0);
  const total_diferenca = total_apresentado - total_apurado;
  const retiradasSalvas = await enviarArquivosRetiradas(cliente_id, data, retiradas);
  const total_retiradas = retiradasSalvas.reduce((s, r) => s + r.valor, 0);

  const payload = {
    cliente_id,
    empresa_codigo,
    data,
    registros,
    total_apurado,
    total_apresentado,
    total_diferenca,
    confirmado_em: new Date().toISOString(),
    confirmado_por: confirmado_por || null,
    observacoes: observacoes || null,
    retiradas: retiradasSalvas,
    total_retiradas,
    valor_deposito: Number((total_apresentado - total_retiradas).toFixed(2)),
  };

  const { data: row, error } = await supabase
    .from('cliente_sangrias_fechamento')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return row;
}

// ─── Retiradas em dinheiro antes do depósito + tarefa de depósito (migration 198)
const BUCKET_RETIRADAS = 'sangrias-retiradas';

// Sobe os arquivos/fotos das retiradas e devolve o JSON que vai no fechamento.
export async function enviarArquivosRetiradas(clienteId, data, retiradas) {
  const saida = [];
  for (const r of retiradas) {
    let arquivo_path = null, arquivo_nome = null;
    if (r.arquivo) {
      const ext = (r.arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      arquivo_path = `${clienteId}/${data}/${crypto.randomUUID()}.${ext}`;
      arquivo_nome = r.arquivo.name;
      const { error } = await supabase.storage.from(BUCKET_RETIRADAS)
        .upload(arquivo_path, r.arquivo, { contentType: r.arquivo.type || undefined, upsert: false });
      if (error) throw error;
    }
    saida.push({ descricao: r.descricao.trim(), valor: Number(r.valor), arquivo_path, arquivo_nome });
  }
  return saida;
}

export async function urlArquivoRetirada(path) {
  const { data, error } = await supabase.storage.from(BUCKET_RETIRADAS).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

// Funcionários da rede com acesso a Tarefas nesta empresa (possíveis responsáveis).
export async function listarResponsaveisDeposito(clienteId) {
  const { data, error } = await supabase.rpc('cci_sangria_responsaveis', { p_cliente: clienteId });
  if (error) throw error;
  return data || [];
}

export async function criarTarefaDeposito(fechamentoId, responsavelId) {
  const { data, error } = await supabase.rpc('cci_sangria_criar_tarefa_deposito', {
    p_fechamento: fechamentoId, p_responsavel: responsavelId,
  });
  if (error) throw error;
  return data;
}
